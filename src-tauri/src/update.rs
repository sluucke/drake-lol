

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

pub const RELEASES_LATEST: &str =
    "https://api.github.com/repos/sluucke/drake-lol/releases/latest";
pub const USER_AGENT: &str = "Drake (https://github.com/sluucke/drake-lol)";
pub const CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(6 * 60 * 60);
pub const HANDOFF_START_GRACE: std::time::Duration = std::time::Duration::from_millis(750);

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

pub fn handoff_script(installer: &Path, relaunch: &Path) -> String {
    format!(
        r#"$ErrorActionPreference = 'Stop'
$installer = {installer}
$relaunch = {relaunch}
while (Get-Process -Name Drake -ErrorAction SilentlyContinue) {{
  Start-Sleep -Milliseconds 200
}}
$proc = Start-Process -FilePath $installer -ArgumentList '/S' -Verb RunAs -Wait -PassThru
if ($null -eq $proc -or $proc.ExitCode -ne 0) {{
  exit 1
}}
if (Test-Path -LiteralPath $relaunch) {{
  Start-Process -FilePath $relaunch
}}
"#,
        installer = ps_literal(&installer.to_string_lossy()),
        relaunch = ps_literal(&relaunch.to_string_lossy()),
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

pub fn spawn_handoff(installer: &Path, relaunch: &Path) -> Result<(), UpdateError> {
    let script = handoff_script(installer, relaunch);
    let ps1: PathBuf = std::env::temp_dir().join("drake-update.ps1");
    std::fs::write(&ps1, script).map_err(UpdateError::Write)?;

    let mut cmd = Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &ps1.to_string_lossy(),
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    cmd.spawn().map_err(UpdateError::Spawn)?;
    Ok(())
}

pub async fn apply_if_newer(current: &str, relaunch: &Path) -> Result<bool, UpdateError> {
    let client = http_client()?;
    let release = fetch_latest(&client).await?;
    match plan_update(&release, current) {
        UpdatePlan::UpToDate => Ok(false),
        UpdatePlan::NoInstaller { version } => {
            eprintln!("[Drake] GitHub has {version} but no Windows installer asset");
            Ok(false)
        }
        UpdatePlan::Newer { url, filename, version } => {
            eprintln!("[Drake] downloading {version} ({filename})");
            let dest = std::env::temp_dir().join(&filename);
            download_installer(&client, &url, &dest).await?;
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

    #[test]
    fn the_handoff_waits_for_drake_then_runs_the_installer_silently() {
        let script = handoff_script(
            Path::new(r"C:\Temp\Drake_0.2.0_x64-setup.exe"),
            Path::new(r"C:\Program Files\Drake\Drake.exe"),
        );
        assert!(script.contains("Get-Process -Name Drake"));
        assert!(script.contains("-Verb RunAs"));
        assert!(script.contains("/S"));
        assert!(script.contains("-PassThru"));
        assert!(script.contains("ExitCode"));
        assert!(script.contains(r"C:\Temp\Drake_0.2.0_x64-setup.exe"));
        assert!(script.contains(r"C:\Program Files\Drake\Drake.exe"));
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
