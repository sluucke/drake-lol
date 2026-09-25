#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EffectiveStreaming {
    InClient,
    Overlay,
}

pub const DEFAULT_STREAMING_PROCESSES: &[&str] = &[
    "obs64",
    "obs32",
    "obs",
    "streamlabs obs",
    "streamlabs desktop",
    "streamlabs",
    "xsplit.core",
    "xsplit",
];

pub fn normalize_process_name(name: &str) -> String {
    let mut n = name.trim().to_ascii_lowercase();
    if let Some(stripped) = n.strip_suffix(".exe") {
        n = stripped.to_string();
    }
    n
}

fn process_matches_tool(name: &str, pattern: &str) -> bool {
    if name == pattern {
        return true;
    }
    if pattern.len() <= 4 {
        return false;
    }
    name.starts_with(pattern) || name.contains(pattern)
}

pub fn streaming_tool_running<I, S>(processes: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    processes.into_iter().any(|name| {
        let n = normalize_process_name(name.as_ref());
        DEFAULT_STREAMING_PROCESSES
            .iter()
            .any(|p| process_matches_tool(&n, p))
    })
}

pub fn resolve_effective_mode(setting: &str, streaming_tool_running: bool) -> EffectiveStreaming {
    match setting.trim().to_ascii_lowercase().as_str() {
        "on" => EffectiveStreaming::Overlay,
        "auto" if streaming_tool_running => EffectiveStreaming::Overlay,
        _ => EffectiveStreaming::InClient,
    }
}

pub fn normalize_streaming_mode(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "on" => "on".into(),
        "auto" => "auto".into(),
        _ => "off".into(),
    }
}

pub fn scan_streaming_tools() -> bool {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    streaming_tool_running(
        sys.processes()
            .values()
            .map(|p| p.name().to_string_lossy().to_string()),
    )
}

pub fn effective_label(effective: EffectiveStreaming) -> &'static str {
    match effective {
        EffectiveStreaming::InClient => "in-client",
        EffectiveStreaming::Overlay => "overlay",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_off_always_in_client() {
        assert_eq!(
            resolve_effective_mode("off", true),
            EffectiveStreaming::InClient
        );
    }

    #[test]
    fn resolve_on_always_overlay() {
        assert_eq!(
            resolve_effective_mode("on", false),
            EffectiveStreaming::Overlay
        );
    }

    #[test]
    fn resolve_auto_follows_process_scan() {
        assert_eq!(
            resolve_effective_mode("auto", true),
            EffectiveStreaming::Overlay
        );
        assert_eq!(
            resolve_effective_mode("auto", false),
            EffectiveStreaming::InClient
        );
    }

    #[test]
    fn detects_obs64_process_name() {
        assert!(streaming_tool_running(["chrome.exe", "obs64.exe"]));
        assert!(streaming_tool_running(["OBS.exe"]));
        assert!(!streaming_tool_running(["chrome.exe", "leagueclient.exe"]));
    }

    #[test]
    fn short_obs_pattern_does_not_substring_match() {
        assert!(!streaming_tool_running(["roboobshelper.exe"]));
        assert!(!streaming_tool_running(["someobsoutil.exe"]));
    }

    #[test]
    fn normalize_streaming_mode_values() {
        assert_eq!(normalize_streaming_mode("ON"), "on");
        assert_eq!(normalize_streaming_mode("auto"), "auto");
        assert_eq!(normalize_streaming_mode("nope"), "off");
    }
}
