use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::sync::OnceLock;

pub const MAX_PER_SESSION: usize = 20;
const MAX_MESSAGE: usize = 300;
const MAX_STACK: usize = 2000;
const MAX_KIND: usize = 40;
const SOURCES: [&str; 3] = ["tray", "plugin", "overlay"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorReport {
    pub source: String,
    pub kind: String,
    pub message: String,
    pub stack: Option<String>,
}

fn patterns() -> &'static [(Regex, &'static str)] {
    static PATTERNS: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        [
            (r#"(?i)([a-z]:[\\/]+users[\\/]+)[^\\/'"\r\n]+"#, "${1}<user>"),
            (r#"(?i)([?&](?:token|password|key|auth|access_token)=)[^&\s'"]+"#, "${1}<redacted>"),
            (r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", "<id>"),
            (r"\b[\p{L}\p{N}_.][\p{L}\p{N}_. ]{0,15}#[\p{L}\p{N}]{2,5}\b", "<riot-id>"),
        ]
        .into_iter()
        .map(|(p, r)| (Regex::new(p).expect("static pattern"), r))
        .collect()
    })
}

pub fn scrub(text: &str, max_chars: usize) -> String {
    let mut out = text.to_string();
    for (pattern, replacement) in patterns() {
        out = pattern.replace_all(&out, *replacement).into_owned();
    }
    out.trim().chars().take(max_chars).collect()
}

fn clean_kind(kind: &str) -> String {
    let kind: String = kind
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .take(MAX_KIND)
        .collect();
    if kind.is_empty() { "error".into() } else { kind }
}

impl ErrorReport {
    pub fn new(source: &str, kind: &str, message: &str, stack: Option<&str>) -> Option<Self> {
        if !SOURCES.contains(&source) {
            return None;
        }
        let message = scrub(message, MAX_MESSAGE);
        if message.is_empty() {
            return None;
        }
        Some(ErrorReport {
            source: source.to_string(),
            kind: clean_kind(kind),
            message,
            stack: stack.map(|s| scrub(s, MAX_STACK)).filter(|s| !s.is_empty()),
        })
    }

    fn key(&self) -> String {
        format!("{}|{}|{}", self.source, self.kind, self.message)
    }
}

#[derive(Debug, Default)]
pub struct ErrorQueue {
    seen: HashSet<String>,
    pending: Vec<ErrorReport>,
}

impl ErrorQueue {
    pub fn push(&mut self, report: ErrorReport) -> bool {
        if self.seen.len() >= MAX_PER_SESSION || !self.seen.insert(report.key()) {
            return false;
        }
        self.pending.push(report);
        true
    }

    pub fn requeue(&mut self, reports: Vec<ErrorReport>) {
        self.pending.extend(reports);
    }

    pub fn drain(&mut self) -> Vec<ErrorReport> {
        std::mem::take(&mut self.pending)
    }

    pub fn clear_pending(&mut self) {
        self.pending.clear();
    }
}

pub fn record_crash(path: &Path, message: &str, backtrace: &str) {
    let Some(report) = ErrorReport::new("tray", "panic", message, Some(backtrace)) else {
        return;
    };
    if let Ok(json) = serde_json::to_string(&report) {
        let _ = std::fs::write(path, json);
    }
}

pub fn take_crash(path: &Path) -> Option<ErrorReport> {
    let raw = std::fs::read_to_string(path).ok()?;
    let _ = std::fs::remove_file(path);
    let report: ErrorReport = serde_json::from_str(&raw).ok()?;
    ErrorReport::new(&report.source, &report.kind, &report.message, report.stack.as_deref())
}

pub fn install_panic_hook(crash_file: std::path::PathBuf) {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        let message = match info.location() {
            Some(at) => format!("{payload} at {}:{}", at.file(), at.line()),
            None => payload,
        };
        let backtrace = std::backtrace::Backtrace::force_capture().to_string();
        record_crash(&crash_file, &message, &backtrace);
        default(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn personal_details_are_scrubbed() {
        let text = r"failed to read C:\Users\John Smith\AppData\Local\Riot Games\x.yaml";
        assert_eq!(scrub(text, 300), r"failed to read C:\Users\<user>\AppData\Local\Riot Games\x.yaml");
        assert_eq!(
            scrub("GET http://127.0.0.1:48151/overlay/asset?token=abc123&path=/x", 300),
            "GET http://127.0.0.1:48151/overlay/asset?token=<redacted>&path=/x"
        );
        assert_eq!(scrub("no history for Faker#KR1 yet", 300), "no history <riot-id> yet");
        assert_eq!(scrub("lookup John Smith#BR1", 300), "lookup <riot-id>");
        assert_eq!(scrub("puuid 3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b missing", 300), "puuid <id> missing");
    }

    #[test]
    fn the_rundll32_ordinal_is_not_mistaken_for_a_riot_id() {
        let text = r#"slot holds rundll32 "C:\Other\core.dll", #6000"#;
        assert_eq!(scrub(text, 300), text);
    }

    #[test]
    fn reports_are_trimmed_and_validated() {
        assert!(ErrorReport::new("browser", "x", "boom", None).is_none());
        assert!(ErrorReport::new("tray", "x", "   ", None).is_none());
        let r = ErrorReport::new("plugin", "Type Error!", &"x".repeat(1000), Some(&"y".repeat(5000))).unwrap();
        assert_eq!(r.kind, "type_error_");
        assert_eq!(r.message.len(), MAX_MESSAGE);
        assert_eq!(r.stack.unwrap().len(), MAX_STACK);
    }

    #[test]
    fn the_same_error_is_sent_once_and_a_session_is_capped() {
        let mut q = ErrorQueue::default();
        let r = |m: &str| ErrorReport::new("tray", "k", m, None).unwrap();
        assert!(q.push(r("a")));
        assert!(!q.push(r("a")));
        for i in 0..40 {
            q.push(r(&format!("e{i}")));
        }
        assert_eq!(q.drain().len(), MAX_PER_SESSION);
        assert!(!q.push(r("late")));
    }

    #[test]
    fn a_crash_survives_until_the_next_start_and_is_read_once() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("crash.json");
        record_crash(&file, r"index out of bounds at src\C:\Users\Ana\x.rs:3", "frame 0\nframe 1");
        let report = take_crash(&file).unwrap();
        assert_eq!(report.kind, "panic");
        assert_eq!(report.source, "tray");
        assert!(report.message.contains(r"C:\Users\<user>"));
        assert_eq!(report.stack.as_deref(), Some("frame 0\nframe 1"));
        assert!(take_crash(&file).is_none());
    }
}
