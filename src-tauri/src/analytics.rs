use rand::RngCore;
use serde::Serialize;
use crate::reports::{ErrorQueue, ErrorReport};
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

pub const ENDPOINT: &str = match option_env!("DRAKE_ANALYTICS_URL") {
    Some(url) => url,
    None => "https://drake.sluuckejoohn.workers.dev/v1/events",
};
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15 * 60);
pub const SEND_TIMEOUT: Duration = Duration::from_secs(15);
pub const CLOSE_TIMEOUT: Duration = Duration::from_secs(2);

pub fn errors_endpoint() -> String {
    ENDPOINT.replace("/v1/events", "/v1/errors")
}

#[derive(Debug, Serialize)]
pub struct ErrorPayload<'a> {
    pub install_id: &'a str,
    pub app_version: &'a str,
    #[serde(flatten)]
    pub report: &'a ErrorReport,
}

static REPORTER: OnceLock<Arc<Tracker>> = OnceLock::new();

pub fn install_reporter(tracker: Arc<Tracker>) {
    let _ = REPORTER.set(tracker);
}

pub fn report_error(source: &str, kind: &str, message: &str, stack: Option<&str>) -> bool {
    let Some(report) = ErrorReport::new(source, kind, message, stack) else {
        return false;
    };
    REPORTER.get().is_some_and(|tracker| tracker.report(report))
}

pub fn log_error(kind: &str, message: impl std::fmt::Display) {
    let message = message.to_string();
    eprintln!("[Drake] {kind}: {message}");
    report_error("tray", kind, &message, None);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Event {
    Startup,
    Heartbeat,
    Close,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Ping {
    pub install_id: String,
    pub session_id: String,
    pub app_version: String,
    pub event: Event,
    pub lol_region: Option<String>,
    pub locale: Option<String>,
    pub mode: String,
    pub loader: Option<String>,
    pub streaming: String,
    pub os_build: Option<String>,
}

pub fn new_uuid() -> String {
    let mut b = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h: String = b.iter().map(|x| format!("{x:02x}")).collect();
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

pub fn is_uuid(value: &str) -> bool {
    let parts: Vec<&str> = value.split('-').collect();
    parts.len() == 5
        && parts.iter().map(|p| p.len()).eq([8, 4, 4, 4, 12])
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_hexdigit()))
}

pub fn load_or_create_install_id(path: &Path) -> String {
    if let Ok(raw) = std::fs::read_to_string(path) {
        let id = raw.trim().to_ascii_lowercase();
        if is_uuid(&id) {
            return id;
        }
    }
    let id = new_uuid();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Err(e) = std::fs::write(path, &id) {
        eprintln!("[Drake] could not persist the install id: {e}");
    }
    id
}

pub fn parse_region_locale(value: &serde_json::Value) -> (Option<String>, Option<String>) {
    let field = |key: &str| {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty() && s.len() <= 16)
            .map(str::to_string)
    };
    (field("region").map(|r| r.to_ascii_uppercase()), field("locale"))
}

pub fn loader_label(mode: &crate::supervisor::Mode) -> Option<String> {
    match mode {
        crate::supervisor::Mode::OwnLoader => Some("Drake".into()),
        crate::supervisor::Mode::Guest { loader, .. } => Some(loader.clone()),
        crate::supervisor::Mode::Inactive { .. } => None,
    }
}

pub fn mode_label(mode: &crate::supervisor::Mode) -> &'static str {
    match mode {
        crate::supervisor::Mode::OwnLoader => "own",
        crate::supervisor::Mode::Guest { .. } => "guest",
        crate::supervisor::Mode::Inactive { .. } => "inactive",
    }
}

#[cfg(windows)]
fn os_build() -> Option<String> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    let key = winreg::RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion", KEY_READ)
        .ok()?;
    key.get_value::<String, _>("CurrentBuild").ok()
}

#[cfg(not(windows))]
fn os_build() -> Option<String> {
    None
}

#[derive(Debug, Clone, Default)]
struct Context {
    lol_region: Option<String>,
    locale: Option<String>,
    mode: String,
    loader: Option<String>,
    streaming: String,
    started: bool,
}

pub struct Tracker {
    install_id: String,
    session_id: String,
    app_version: String,
    os_build: Option<String>,
    context: Mutex<Context>,
    errors: Mutex<ErrorQueue>,
}

impl Tracker {
    pub fn new(install_id: String, app_version: &str) -> Self {
        Tracker {
            install_id,
            session_id: new_uuid(),
            app_version: app_version.to_string(),
            os_build: os_build(),
            context: Mutex::new(Context::default()),
            errors: Mutex::new(ErrorQueue::default()),
        }
    }

    pub fn set_mode(&self, mode: &str, loader: Option<String>, streaming: &str) {
        let mut ctx = self.context.lock().unwrap_or_else(|e| e.into_inner());
        ctx.mode = mode.to_string();
        ctx.loader = loader;
        ctx.streaming = streaming.to_string();
    }

    pub fn use_client_info(&self, region: Option<String>, locale: Option<String>) {
        let mut ctx = self.context.lock().unwrap_or_else(|e| e.into_inner());
        if region.is_some() {
            ctx.lol_region = region;
        }
        if locale.is_some() {
            ctx.locale = locale;
        }
    }

    pub fn ping(&self, event: Event) -> Ping {
        let ctx = self.context.lock().unwrap_or_else(|e| e.into_inner()).clone();
        Ping {
            install_id: self.install_id.clone(),
            session_id: self.session_id.clone(),
            app_version: self.app_version.clone(),
            event,
            lol_region: ctx.lol_region,
            locale: ctx.locale,
            mode: ctx.mode,
            loader: ctx.loader,
            streaming: ctx.streaming,
            os_build: self.os_build.clone(),
        }
    }

    pub fn report(&self, report: ErrorReport) -> bool {
        self.errors.lock().unwrap_or_else(|e| e.into_inner()).push(report)
    }

    pub fn discard_errors(&self) {
        self.errors.lock().unwrap_or_else(|e| e.into_inner()).clear_pending();
    }

    pub fn error_payloads(&self, reports: &[ErrorReport]) -> Vec<serde_json::Value> {
        reports
            .iter()
            .filter_map(|report| {
                serde_json::to_value(ErrorPayload {
                    install_id: &self.install_id,
                    app_version: &self.app_version,
                    report,
                })
                .ok()
            })
            .collect()
    }

    pub async fn flush_errors(&self, timeout: Duration) {
        let pending = self.errors.lock().unwrap_or_else(|e| e.into_inner()).drain();
        if pending.is_empty() || ENDPOINT.is_empty() {
            return;
        }
        let Ok(client) = reqwest::Client::builder()
            .timeout(timeout)
            .user_agent(format!("Drake/{}", self.app_version))
            .build()
        else {
            self.errors.lock().unwrap_or_else(|e| e.into_inner()).requeue(pending);
            return;
        };
        let url = errors_endpoint();
        let mut failed = Vec::new();
        for (report, payload) in pending.iter().zip(self.error_payloads(&pending)) {
            let ok = matches!(client.post(&url).json(&payload).send().await, Ok(res) if res.status().is_success());
            if !ok {
                failed.push(report.clone());
            }
        }
        if !failed.is_empty() {
            self.errors.lock().unwrap_or_else(|e| e.into_inner()).requeue(failed);
        }
    }

    pub fn started(&self) -> bool {
        self.context.lock().unwrap_or_else(|e| e.into_inner()).started
    }

    pub async fn refresh_region(&self) {
        if let Ok((200, value)) = crate::lcu::request("GET", "/riotclient/region-locale", None).await {
            let (region, locale) = parse_region_locale(&value);
            let mut ctx = self.context.lock().unwrap_or_else(|e| e.into_inner());
            if region.is_some() {
                ctx.lol_region = region;
            }
            if locale.is_some() {
                ctx.locale = locale;
            }
        }
    }

    pub async fn send(&self, event: Event, timeout: Duration) -> bool {
        if ENDPOINT.is_empty() {
            return false;
        }
        let ping = self.ping(event);
        let client = match reqwest::Client::builder()
            .timeout(timeout)
            .user_agent(format!("Drake/{}", self.app_version))
            .build()
        {
            Ok(c) => c,
            Err(_) => return false,
        };
        let ok = match client.post(ENDPOINT).json(&ping).send().await {
            Ok(res) => res.status().is_success(),
            Err(e) => {
                eprintln!("[Drake] analytics {event:?} failed: {e}");
                false
            }
        };
        if ok && event == Event::Startup {
            self.context.lock().unwrap_or_else(|e| e.into_inner()).started = true;
        }
        ok
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_ids_are_v4_uuids() {
        let id = new_uuid();
        assert!(is_uuid(&id), "{id}");
        assert_eq!(&id[14..15], "4");
        assert!(matches!(&id[19..20], "8" | "9" | "a" | "b"));
        assert_ne!(new_uuid(), new_uuid());
    }

    #[test]
    fn rejects_malformed_ids() {
        assert!(!is_uuid(""));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz"));
    }

    #[test]
    fn install_id_persists_and_is_replaced_when_corrupt() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("state").join("install-id");
        let first = load_or_create_install_id(&file);
        assert_eq!(load_or_create_install_id(&file), first);
        std::fs::write(&file, "garbage").unwrap();
        let replaced = load_or_create_install_id(&file);
        assert!(is_uuid(&replaced));
        assert_ne!(replaced, first);
    }

    #[test]
    fn region_and_locale_come_from_the_client() {
        let v = serde_json::json!({"region": "br", "locale": "pt_BR", "webRegion": "br"});
        assert_eq!(parse_region_locale(&v), (Some("BR".into()), Some("pt_BR".into())));
        assert_eq!(parse_region_locale(&serde_json::json!({})), (None, None));
    }

    #[test]
    fn the_payload_carries_no_account_data() {
        let tracker = Tracker::new(new_uuid(), "1.2.3");
        tracker.set_mode("own", Some("Drake".into()), "overlay");
        let json = serde_json::to_value(tracker.ping(Event::Heartbeat)).unwrap();
        let mut keys: Vec<_> = json.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(
            keys,
            ["app_version", "event", "install_id", "loader", "locale", "lol_region", "mode", "os_build", "session_id", "streaming"]
        );
        assert_eq!(json["event"], "heartbeat");
        assert_eq!(json["mode"], "own");
        assert_eq!(json["loader"], "Drake");
    }

    #[test]
    fn the_plugin_fills_in_the_region_when_the_client_is_out_of_reach() {
        let tracker = Tracker::new(new_uuid(), "1.2.3");
        assert_eq!(tracker.ping(Event::Heartbeat).lol_region, None);
        tracker.use_client_info(Some("LA2".into()), Some("es_MX".into()));
        tracker.use_client_info(None, None);
        let ping = tracker.ping(Event::Heartbeat);
        assert_eq!(ping.lol_region.as_deref(), Some("LA2"));
        assert_eq!(ping.locale.as_deref(), Some("es_MX"));
    }

    #[test]
    fn error_reports_carry_the_install_and_nothing_else() {
        let tracker = Tracker::new(new_uuid(), "1.2.3");
        let report = ErrorReport::new("plugin", "TypeError", "x is undefined", Some("at a (Drake/index.js:1:2)")).unwrap();
        assert!(tracker.report(report.clone()));
        assert!(!tracker.report(report.clone()));
        let json = &tracker.error_payloads(&[report])[0];
        let mut keys: Vec<_> = json.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["app_version", "install_id", "kind", "message", "source", "stack"]);
        assert_eq!(json["kind"], "typeerror");
    }

    #[test]
    fn errors_go_next_to_the_events_endpoint() {
        assert!(errors_endpoint().ends_with("/v1/errors"));
    }

    #[test]
    fn guests_report_the_loader_they_run_inside() {
        let guest = crate::supervisor::Mode::Guest { host: "Rose".into(), loader: "Rose".into() };
        assert_eq!(loader_label(&guest).as_deref(), Some("Rose"));
        assert_eq!(loader_label(&crate::supervisor::Mode::OwnLoader).as_deref(), Some("Drake"));
        assert_eq!(loader_label(&crate::supervisor::Mode::Inactive { reason: "x".into() }), None);
    }
}
