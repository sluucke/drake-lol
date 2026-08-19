

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const RELEASES_LATEST: &str =
    "https://api.github.com/repos/sluucke/drake-lol/releases/latest";
pub const USER_AGENT: &str = "Drake (https://github.com/sluucke/drake-lol)";
pub const CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(6 * 60 * 60);
pub const HANDOFF_START_GRACE: std::time::Duration = std::time::Duration::from_millis(750);
pub const RETRY_ATTEMPT_AFTER: std::time::Duration = std::time::Duration::from_secs(6 * 60 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateTrigger {
    Automatic,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttemptLog {
    pub version: String,
    pub at_unix: u64,
}

pub fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn load_attempt(path: &Path) -> Option<AttemptLog> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn save_attempt(path: &Path, log: &AttemptLog) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let raw = serde_json::to_string(log).map_err(std::io::Error::other)?;
    std::fs::write(path, raw)
}

/// Applying an update exits Drake, so a version that fails to install would be
/// retried on every launch and the tray could never stay open. An automatic
/// check therefore gets one attempt per version until the cooldown passes; the
/// user asking by hand is always honoured.
pub fn may_apply(
    trigger: UpdateTrigger,
    target: &str,
    last: Option<&AttemptLog>,
    now_unix: u64,
) -> bool {
    if trigger == UpdateTrigger::Manual {
        return true;
    }
    let Some(last) = last else { return true };
    if last.version != target {
        return true;
    }
    now_unix
        .checked_sub(last.at_unix)
        .is_some_and(|elapsed| elapsed >= RETRY_ATTEMPT_AFTER.as_secs())
}

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("could not reach GitHub: {0}")]
    Network(#[from] reqwest::Error),
    #[error("GitHub returned {status}")]
    Http { status: reqwest::StatusCode },
    #[error("could not write the installer: {0}")]
    Write(std::io::Error),
    #[error("could not start the installer helper: {0}")]
    Spawn(std::io::Error),
}

#[derive(Debug, Deserialize, Clone)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GithubRelease {
    pub tag_name: String,
    #[serde(default)]
    pub assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdatePlan {
    UpToDate,
    NoInstaller { version: String },
    Newer { version: String, url: String, filename: String },
}

pub fn parse_version(tag: &str) -> Option<(u32, u32, u32)> {
    let t = tag.trim().trim_start_matches('v');
    let mut nums = t.split('.');
    let major = nums.next()?.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
    let minor = nums.next()?.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
    let patch = nums.next()?.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
    Some((major.parse().ok()?, minor.parse().ok()?, patch.parse().ok()?))
}

pub fn is_newer(remote_tag: &str, current: &str) -> bool {
    match (parse_version(remote_tag), parse_version(current)) {
        (Some(remote), Some(local)) => remote > local,
        _ => false,
    }
}

pub fn installer_from_release(rel: &GithubRelease) -> Option<&ReleaseAsset> {
    rel.assets.iter().find(|a| {
        a.name.starts_with("Drake_") && a.name.ends_with("_x64-setup.exe")
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum UpdateStatus {
    Current { current: String },
    Available { current: String, version: String },
    NoInstaller { current: String, version: String },
}

pub fn status_from_plan(current: &str, plan: UpdatePlan) -> UpdateStatus {
    match plan {
        UpdatePlan::UpToDate => UpdateStatus::Current {
            current: current.to_string(),
        },
        UpdatePlan::NoInstaller { version } => UpdateStatus::NoInstaller {
            current: current.to_string(),
            version,
        },
        UpdatePlan::Newer { version, .. } => UpdateStatus::Available {
            current: current.to_string(),
            version,
        },
    }
}

pub async fn check_for_update(current: &str) -> Result<UpdateStatus, UpdateError> {
    let client = http_client()?;
    let release = fetch_latest(&client).await?;
    Ok(status_from_plan(current, plan_update(&release, current)))
}

pub fn plan_update(rel: &GithubRelease, current: &str) -> UpdatePlan {
    if !is_newer(&rel.tag_name, current) {
        return UpdatePlan::UpToDate;
    }
    match installer_from_release(rel) {
        Some(asset) => UpdatePlan::Newer {
            version: rel.tag_name.clone(),
            url: asset.browser_download_url.clone(),
            filename: asset.name.clone(),
        },
        None => UpdatePlan::NoInstaller { version: rel.tag_name.clone() },
    }
}

fn ps_literal(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Drake has already exited by the time this runs, so the relaunch sits outside
/// the try/catch and after it: a declined UAC prompt or a failed install must
/// still leave the user with a tray. Never reintroduce an early exit above it.
pub fn handoff_script(installer: &Path, relaunch: &Path, log: &Path) -> String {
    format!(
        r#"$ErrorActionPreference = 'Stop'
$installer = {installer}
$relaunch = {relaunch}
$log = {log}
function Write-Step($message) {{
  "{{0}} {{1}}" -f (Get-Date -Format o), $message | Out-File -FilePath $log -Append -Encoding utf8
}}
Write-Step 'the handoff started'
$waited = 0
while ((Get-Process -Name Drake -ErrorAction SilentlyContinue) -and $waited -lt 30000) {{
  Start-Sleep -Milliseconds 200
  $waited += 200
}}
Write-Step "Drake took $waited ms to exit"
try {{
  Write-Step 'running the installer'
  $proc = Start-Process -FilePath $installer -ArgumentList '/S' -Verb RunAs -Wait -PassThru
  $code = if ($null -eq $proc) {{ $null }} else {{ $proc.ExitCode }}
  if ($null -ne $code -and $code -ne 0) {{
    Write-Step "the installer exited with $code"
  }} else {{
    Write-Step 'the installer finished'
  }}
}} catch {{
  Write-Step "the installer could not start: $($_.Exception.Message)"
}}
if (Get-Process -Name Drake -ErrorAction SilentlyContinue) {{
  Write-Step 'Drake is already running again'
}} elseif (Test-Path -LiteralPath $relaunch) {{
  Write-Step 'relaunching Drake'
  Start-Process -FilePath $relaunch
}} else {{
  Write-Step 'nothing left to relaunch'
}}
"#,
        installer = ps_literal(&installer.to_string_lossy()),
        relaunch = ps_literal(&relaunch.to_string_lossy()),
        log = ps_literal(&log.to_string_lossy()),
    )
}

pub fn http_client() -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(60))
        .build()
}

pub async fn fetch_latest(client: &reqwest::Client) -> Result<GithubRelease, UpdateError> {
    let res = client.get(RELEASES_LATEST).send().await?;
    let status = res.status();
    if !status.is_success() {
        return Err(UpdateError::Http { status });
    }
    Ok(res.json().await?)
}

pub async fn download_installer(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
) -> Result<(), UpdateError> {
    let res = client.get(url).send().await?;
    let status = res.status();
    if !status.is_success() {
        return Err(UpdateError::Http { status });
    }
    let bytes = res.bytes().await?;
    std::fs::write(dest, bytes).map_err(UpdateError::Write)
}

#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

/// The handoff has to outlive Drake, but powershell.exe still needs a console to
/// run at all, so it gets a hidden one rather than none.
#[cfg(windows)]
pub const fn handoff_creation_flags() -> u32 {
    CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP
}

/// A job object that forbids breakaway rejects the spawn outright, so the second
/// attempt drops the flag and accepts that the handoff may die with the job.
#[cfg(windows)]
pub const fn handoff_creation_flags_without_breakaway() -> u32 {
    CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
}

pub fn spawn_handoff(installer: &Path, relaunch: &Path) -> Result<(), UpdateError> {
    let log: PathBuf = std::env::temp_dir().join("drake-update.log");
    let script = handoff_script(installer, relaunch, &log);
    let ps1: PathBuf = std::env::temp_dir().join("drake-update.ps1");
    std::fs::write(&ps1, script).map_err(UpdateError::Write)?;
    let host_log: PathBuf = std::env::temp_dir().join("drake-update-host.log");

    let build = || {
        let mut cmd = Command::new("powershell.exe");
        cmd.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &ps1.to_string_lossy(),
        ]);
        cmd.stdin(Stdio::null());
        match std::fs::File::create(&host_log) {
            Ok(file) => {
                let dup = file.try_clone().ok();
                cmd.stdout(Stdio::from(file));
                match dup {
                    Some(err) => cmd.stderr(Stdio::from(err)),
                    None => cmd.stderr(Stdio::null()),
                };
            }
            Err(_) => {
                cmd.stdout(Stdio::null()).stderr(Stdio::null());
            }
        }
        cmd
    };

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = build();
        cmd.creation_flags(handoff_creation_flags());
        if cmd.spawn().is_ok() {
            return Ok(());
        }
        let mut retry = build();
        retry.creation_flags(handoff_creation_flags_without_breakaway());
        retry.spawn().map_err(UpdateError::Spawn)?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        build().spawn().map_err(UpdateError::Spawn)?;
        Ok(())
    }
}

pub async fn apply_if_newer(
    current: &str,
    relaunch: &Path,
    trigger: UpdateTrigger,
) -> Result<bool, UpdateError> {
    let client = http_client()?;
    let release = fetch_latest(&client).await?;
    match plan_update(&release, current) {
        UpdatePlan::UpToDate => Ok(false),
        UpdatePlan::NoInstaller { version } => {
            eprintln!("[Drake] GitHub has {version} but no Windows installer asset");
            Ok(false)
        }
        UpdatePlan::Newer { url, filename, version } => {
            let record = crate::paths::update_attempt_file();
            if !may_apply(trigger, &version, load_attempt(&record).as_ref(), now_unix()) {
                eprintln!("[Drake] {version} was already attempted; staying open until the retry window");
                return Ok(false);
            }
            eprintln!("[Drake] downloading {version} ({filename})");
            let dest = std::env::temp_dir().join(&filename);
            download_installer(&client, &url, &dest).await?;
            let log = AttemptLog { version: version.clone(), at_unix: now_unix() };
            if let Err(e) = save_attempt(&record, &log) {
                eprintln!("[Drake] could not record the {version} attempt: {e}");
            }
            spawn_handoff(&dest, relaunch)?;
            Ok(true)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, assets: &[(&str, &str)]) -> GithubRelease {
        GithubRelease {
            tag_name: tag.into(),
            assets: assets
                .iter()
                .map(|(name, url)| ReleaseAsset { name: (*name).into(), browser_download_url: (*url).into() })
                .collect(),
        }
    }

    fn attempt(version: &str, at_unix: u64) -> AttemptLog {
        AttemptLog { version: version.into(), at_unix }
    }

    #[test]
    fn a_version_that_was_never_attempted_is_applied() {
        assert!(may_apply(UpdateTrigger::Automatic, "v0.3.8", None, 1_000));
    }

    #[test]
    fn an_automatic_check_does_not_retry_a_version_it_just_failed_to_install() {
        // Drake exits to hand off, so retrying the same failed version on every
        // launch leaves a tray that cannot stay open. This is the loop.
        let last = attempt("v0.3.8", 1_000);
        assert!(!may_apply(UpdateTrigger::Automatic, "v0.3.8", Some(&last), 1_060));
    }

    #[test]
    fn an_automatic_check_retries_the_same_version_once_the_cooldown_passes() {
        let last = attempt("v0.3.8", 1_000);
        let after = 1_000 + RETRY_ATTEMPT_AFTER.as_secs();
        assert!(may_apply(UpdateTrigger::Automatic, "v0.3.8", Some(&last), after));
    }

    #[test]
    fn a_version_newer_than_the_failed_one_is_applied_immediately() {
        // A release that fixes the failure must not sit behind the cooldown.
        let last = attempt("v0.3.8", 1_000);
        assert!(may_apply(UpdateTrigger::Automatic, "v0.3.9", Some(&last), 1_060));
    }

    #[test]
    fn a_clock_that_moved_backwards_does_not_reopen_the_loop() {
        let last = attempt("v0.3.8", 5_000);
        assert!(!may_apply(UpdateTrigger::Automatic, "v0.3.8", Some(&last), 1_000));
    }

    #[test]
    fn asking_for_an_update_by_hand_ignores_the_cooldown() {
        let last = attempt("v0.3.8", 1_000);
        assert!(may_apply(UpdateTrigger::Manual, "v0.3.8", Some(&last), 1_060));
    }

    #[test]
    fn an_attempt_survives_the_restart_it_is_meant_to_guard() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("nested").join("update-attempt.json");
        save_attempt(&path, &attempt("v0.3.8", 1_000)).unwrap();
        assert_eq!(load_attempt(&path), Some(attempt("v0.3.8", 1_000)));
    }

    #[test]
    fn an_unreadable_attempt_record_is_treated_as_no_attempt() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("update-attempt.json");
        std::fs::write(&path, b"not json").unwrap();
        assert_eq!(load_attempt(&path), None);
        assert_eq!(load_attempt(&tmp.path().join("missing.json")), None);
    }

    #[test]
    fn a_leading_v_does_not_change_the_version() {
        assert_eq!(parse_version("v0.1.0"), Some((0, 1, 0)));
        assert_eq!(parse_version("0.1.0"), Some((0, 1, 0)));
    }

    #[test]
    fn a_higher_tag_is_newer() {
        assert!(is_newer("v0.2.0", "0.1.0"));
        assert!(is_newer("v0.1.1", "0.1.0"));
        assert!(!is_newer("v0.1.0", "0.1.0"));
        assert!(!is_newer("v0.0.9", "0.1.0"));
    }

    #[test]
    fn garbage_is_never_treated_as_newer() {
        assert!(!is_newer("not-a-version", "0.1.0"));
        assert!(!is_newer("v0.2.0", "??"));
    }

    #[test]
    fn the_windows_setup_exe_is_the_installer() {
        let rel = release("v0.2.0", &[
            ("Drake_0.2.0_x64-setup.exe", "https://example/setup.exe"),
            ("source.zip", "https://example/src.zip"),
        ]);
        let plan = plan_update(&rel, "0.1.0");
        assert_eq!(
            plan,
            UpdatePlan::Newer {
                version: "v0.2.0".into(),
                url: "https://example/setup.exe".into(),
                filename: "Drake_0.2.0_x64-setup.exe".into(),
            }
        );
    }

    #[test]
    fn the_same_version_is_left_alone() {
        let rel = release("v0.1.0", &[("Drake_0.1.0_x64-setup.exe", "https://example/setup.exe")]);
        assert_eq!(plan_update(&rel, "0.1.0"), UpdatePlan::UpToDate);
    }

    #[test]
    fn a_newer_tag_without_an_installer_does_not_pretend_we_are_current() {
        let rel = release("v0.2.0", &[("source.zip", "https://example/src.zip")]);
        assert_eq!(
            plan_update(&rel, "0.1.0"),
            UpdatePlan::NoInstaller { version: "v0.2.0".into() }
        );
    }

    #[test]
    fn github_json_with_extra_fields_still_loads() {
        let raw = r#"{
            "url": "https://api.github.com/repos/sluucke/drake-lol/releases/1",
            "tag_name": "v0.2.0",
            "prerelease": false,
            "assets": [{
                "name": "Drake_0.2.0_x64-setup.exe",
                "browser_download_url": "https://github.com/x",
                "size": 12
            }]
        }"#;
        let rel: GithubRelease = serde_json::from_str(raw).unwrap();
        assert!(matches!(plan_update(&rel, "0.1.0"), UpdatePlan::Newer { .. }));
    }

    fn a_handoff() -> String {
        handoff_script(
            Path::new(r"C:\Temp\Drake_0.2.0_x64-setup.exe"),
            Path::new(r"C:\Program Files\Drake\Drake.exe"),
            Path::new(r"C:\Temp\drake-update.log"),
        )
    }

    #[test]
    fn the_handoff_waits_for_drake_then_runs_the_installer_silently() {
        let script = a_handoff();
        assert!(script.contains("Get-Process -Name Drake"));
        assert!(script.contains("-Verb RunAs"));
        assert!(script.contains("/S"));
        assert!(script.contains("-PassThru"));
        assert!(script.contains("ExitCode"));
        assert!(script.contains(r"C:\Temp\Drake_0.2.0_x64-setup.exe"));
        assert!(script.contains(r"C:\Program Files\Drake\Drake.exe"));
    }

    #[test]
    fn the_handoff_relaunches_drake_even_when_the_installer_cannot_start() {
        // Declining the UAC prompt makes Start-Process throw. Leaving the user
        // with no tray at all is never an acceptable outcome of an update.
        let script = a_handoff();

        assert!(script.contains("catch"), "must not die on a throw: {script}");
        assert!(
            !script.contains("exit 1"),
            "an early exit skips the relaunch: {script}"
        );

        let catch_at = script.find("catch").expect("catch block");
        let relaunch_at = script
            .rfind("Start-Process -FilePath $relaunch")
            .expect("relaunch call");
        assert!(
            relaunch_at > catch_at,
            "relaunch must run after the failure is handled: {script}"
        );
    }

    #[test]
    fn an_unknown_exit_code_is_not_reported_as_a_failed_install() {
        // Start-Process -Verb RunAs -PassThru can hand back a null ExitCode even
        // when the install succeeded, and `$null -ne 0` would call that a failure.
        let script = a_handoff();
        assert!(
            script.contains("$null -ne $code"),
            "must only fail on an explicit non-zero code: {script}"
        );
    }

    #[test]
    fn the_handoff_records_each_step_so_a_silent_failure_is_visible() {
        let script = a_handoff();
        assert!(script.contains(r"C:\Temp\drake-update.log"));
        assert!(script.contains("Out-File"));
    }

    #[test]
    fn the_handoff_logs_before_it_waits_for_drake_to_exit() {
        // An empty log has to mean "the script never ran", not "it ran but was
        // still waiting", otherwise a stall and a failed launch look identical.
        let script = a_handoff();
        let first_log_at = script.find("Write-Step '").expect("a logged step");
        let wait_at = script.find("while (").expect("the wait loop");
        assert!(
            first_log_at < wait_at,
            "the first step must be recorded before the wait: {script}"
        );
    }

    #[test]
    fn the_handoff_does_not_wait_for_drake_forever() {
        let script = a_handoff();
        assert!(
            script.contains("$waited -lt"),
            "an unbounded wait can strand the update silently: {script}"
        );
    }

    #[cfg(windows)]
    #[test]
    fn the_handoff_is_given_a_console_and_escapes_the_parent_job() {
        // powershell.exe is a console application. DETACHED_PROCESS denies it a
        // console, so it exits before running a line when the parent is a GUI
        // process with no console of its own.
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

        let flags = handoff_creation_flags();
        assert_eq!(flags & DETACHED_PROCESS, 0, "must not detach the console");
        assert_eq!(flags & CREATE_NO_WINDOW, CREATE_NO_WINDOW);
        assert_eq!(flags & CREATE_BREAKAWAY_FROM_JOB, CREATE_BREAKAWAY_FROM_JOB);
        assert_eq!(flags & CREATE_NEW_PROCESS_GROUP, CREATE_NEW_PROCESS_GROUP);

        // A job that forbids breakaway makes CreateProcess fail outright, so the
        // spawn has to have a second shape to fall back to.
        let fallback = handoff_creation_flags_without_breakaway();
        assert_eq!(fallback & CREATE_BREAKAWAY_FROM_JOB, 0);
        assert_eq!(fallback & CREATE_NO_WINDOW, CREATE_NO_WINDOW);
    }

    #[test]
    fn status_from_plan_describes_an_available_release() {
        let s = status_from_plan(
            "0.1.0",
            UpdatePlan::Newer {
                version: "v0.2.0".into(),
                url: "https://example/setup.exe".into(),
                filename: "Drake_0.2.0_x64-setup.exe".into(),
            },
        );
        assert_eq!(
            s,
            UpdateStatus::Available {
                current: "0.1.0".into(),
                version: "v0.2.0".into(),
            }
        );
    }
}
