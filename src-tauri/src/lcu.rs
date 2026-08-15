use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum LcuError {
    #[error("the League client is not running")]
    NotRunning,
    #[error("could not read the lockfile: {0}")]
    Lockfile(#[from] std::io::Error),
    #[error("the lockfile could not be parsed")]
    Malformed,
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
}

/// The running `LeagueClientUx.exe` process's own executable path, or `None`
/// if the client is not running. `exe()` is only populated when explicitly
/// requested via `ProcessRefreshKind` -- the default `nothing()` kind used by
/// `client_running()`'s plain process-name scan never fetches it.
fn client_ux_exe_path() -> Option<PathBuf> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::Always),
    );
    sys.processes()
        .values()
        .find(|p| p.name().to_string_lossy().eq_ignore_ascii_case("LeagueClientUx.exe"))
        .and_then(|p| p.exe())
        .map(|p| p.to_path_buf())
}

pub fn client_running() -> bool {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    // sysinfo 0.33 requires both arguments here; the older no-arg form does
    // not compile.
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes()
        .values()
        .any(|p| p.name().to_string_lossy().eq_ignore_ascii_case("LeagueClientUx.exe"))
}

/// The League install directory, discovered from the running
/// `LeagueClientUx.exe` process's own executable path rather than a
/// hardcoded location. Install paths vary per machine and per Riot region,
/// so guessing a fixed path would only work on the machine it was written on.
pub fn install_dir() -> Option<PathBuf> {
    client_ux_exe_path().and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

fn lockfile_path(install_dir: &Path) -> PathBuf {
    install_dir.join("lockfile")
}

/// Parses the LCU lockfile's `name:pid:port:password:protocol` format,
/// returning `(port, password)`.
fn parse_lockfile(raw: &str) -> Result<(String, String), LcuError> {
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() < 4 {
        return Err(LcuError::Malformed);
    }
    Ok((parts[2].to_string(), parts[3].to_string()))
}

/// Reloads only the client UI so a freshly deployed plugin gets enumerated.
/// Never called automatically by the supervisor loop -- restarting someone's
/// client unasked is hostile; this is always an explicit user action
/// triggered from the tray menu.
pub async fn restart_ux() -> Result<(), LcuError> {
    let install_dir = install_dir().ok_or(LcuError::NotRunning)?;
    let raw = std::fs::read_to_string(lockfile_path(&install_dir))?;
    let (port, password) = parse_lockfile(&raw)?;

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()?;
    client
        .post(format!("https://127.0.0.1:{port}/riotclient/kill-and-restart-ux"))
        .basic_auth("riot", Some(password))
        .send()
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_well_formed_lockfile() {
        let (port, password) =
            parse_lockfile("LeagueClientUx:1234:56789:abcDEF123:https").unwrap();
        assert_eq!(port, "56789");
        assert_eq!(password, "abcDEF123");
    }

    #[test]
    fn parses_a_lockfile_with_trailing_whitespace() {
        let (port, password) =
            parse_lockfile("LeagueClientUx:1234:56789:abcDEF123:https\n").unwrap();
        assert_eq!(port, "56789");
        assert_eq!(password, "abcDEF123");
    }

    #[test]
    fn rejects_a_lockfile_with_too_few_fields() {
        assert!(matches!(parse_lockfile("only:two"), Err(LcuError::Malformed)));
    }

    #[test]
    fn lockfile_path_sits_inside_the_install_dir() {
        let dir = PathBuf::from(r"C:\Riot Games\League of Legends");
        assert_eq!(lockfile_path(&dir), dir.join("lockfile"));
    }
}
