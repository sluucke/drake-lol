use axum::http::Method;
use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tower_http::cors::CorsLayer;

pub const CHECKIN_TOLERANCE: Duration = Duration::from_secs(20);

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("could not write {path}: {source}")]
    Write { path: PathBuf, source: std::io::Error },
    #[error("could not serialise config: {0}")]
    Serialise(#[from] serde_json::Error),
    #[error("could not bind 127.0.0.1:{port}: {source}")]
    Bind { port: u16, source: std::io::Error },
    #[error("check-in server failed: {0}")]
    Serve(std::io::Error),
}

/// Every field carries `#[serde(default = ...)]` so a `settings.json` written
/// by an older Drake -- which has only the fields that existed then -- still
/// loads with the user's choices intact. Without it, `load_from` would fail to
/// deserialise and fall back to `Default`, silently discarding settings the
/// user had deliberately turned on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "off")]
    pub auto_accept: bool,
    #[serde(default = "on")]
    pub run_at_startup: bool,
    #[serde(default = "off")]
    pub auto_reload_on_open: bool,
}

fn on() -> bool {
    true
}
fn off() -> bool {
    false
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_accept: off(),
            // Starting with Windows is what keeps the slot claimed and the
            // plugin deployed *before* the client launches, which is the only
            // reason "Reload client to apply" is rare rather than routine.
            run_at_startup: on(),
            // Restarting a client the user did not ask us to touch is
            // intrusive. Opt-in only.
            auto_reload_on_open: off(),
        }
    }
}

pub fn load_from(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn load() -> Settings {
    load_from(&crate::paths::settings_file())
}

pub fn save(s: &Settings) -> Result<(), ConfigError> {
    let path = crate::paths::settings_file();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|source| ConfigError::Write { path: dir.to_path_buf(), source })?;
    }
    let raw = serde_json::to_string_pretty(s)?;
    std::fs::write(&path, raw).map_err(|source| ConfigError::Write { path, source })
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginConfig {
    pub token: String,
    pub port: u16,
    pub settings: Settings,
}

pub fn write_plugin_config(plugin_dir: &Path, cfg: &PluginConfig) -> Result<(), ConfigError> {
    std::fs::create_dir_all(plugin_dir)
        .map_err(|source| ConfigError::Write { path: plugin_dir.to_path_buf(), source })?;
    let path = plugin_dir.join("config.json");
    let raw = serde_json::to_string_pretty(cfg)?;
    // Called every tick (every 2s). Within a run the token and settings are
    // stable, so comparing first avoids rewriting unchanged bytes on every
    // iteration -- which in guest mode would otherwise be a steady stream of
    // needless writes into a third-party product's own directory.
    if let Ok(existing) = std::fs::read_to_string(&path) {
        if existing == raw {
            return Ok(());
        }
    }
    std::fs::write(&path, raw).map_err(|source| ConfigError::Write { path, source })
}

pub fn generate_token() -> String {
    let mut rng = rand::thread_rng();
    (0..40).map(|_| char::from(rng.gen_range(b'a'..=b'z'))).collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EffectiveState {
    Injected { host: String },
    NotInjected,
    Unknown,
}

pub struct ConfigdState {
    pub token: String,
    pub port: u16,
    pub settings: Mutex<Settings>,
    last_checkin: Mutex<Option<(String, Instant)>>,
}

impl ConfigdState {
    pub fn new(port: u16) -> Self {
        Self::new_with_settings(port, load())
    }

    /// Seam for tests: builds state from a given `Settings` instead of reading
    /// `%PROGRAMDATA%\Drake\settings.json` from disk.
    pub fn new_with_settings(port: u16, settings: Settings) -> Self {
        Self {
            token: generate_token(),
            port,
            settings: Mutex::new(settings),
            last_checkin: Mutex::new(None),
        }
    }

    pub fn record_checkin(&self, host: String) {
        *self.last_checkin.lock().unwrap() = Some((host, Instant::now()));
    }

    #[cfg(test)]
    pub fn expire_checkin_for_test(&self) {
        let mut g = self.last_checkin.lock().unwrap();
        if let Some((host, _)) = g.clone() {
            *g = Some((host, Instant::now() - CHECKIN_TOLERANCE - Duration::from_secs(1)));
        }
    }

    pub fn effective(&self, client_running: bool) -> EffectiveState {
        if !client_running {
            return EffectiveState::Unknown;
        }
        match self.last_checkin.lock().unwrap().clone() {
            Some((host, at)) if at.elapsed() <= CHECKIN_TOLERANCE => {
                EffectiveState::Injected { host }
            }
            _ => EffectiveState::NotInjected,
        }
    }
}

#[derive(Deserialize)]
pub struct CheckInBody {
    pub token: String,
    pub host: String,
}

async fn checkin(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<CheckInBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    state.record_checkin(body.host);
    StatusCode::NO_CONTENT
}

fn router(state: Arc<ConfigdState>) -> Router {
    // The client page that calls /checkin is served from a different origin
    // (https://plugins/... via the loader's own scheme), so the browser
    // enforces CORS on the response. Measured from inside the real client:
    // without permissive CORS headers, fetch() reaches this server but the
    // browser blocks the response and the check-in silently fails.
    // This does not weaken security: the listener is 127.0.0.1-only and the
    // shared token still gates the endpoint. CORS only controls which pages
    // may read the response, not who may reach the socket.
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);
    Router::new()
        .route("/checkin", post(checkin))
        .layer(cors)
        .with_state(state)
}

pub async fn serve(state: Arc<ConfigdState>) -> Result<(), ConfigError> {
    let port = state.port;
    let app = router(state);
    // 127.0.0.1 only. Never 0.0.0.0 — this must not be reachable off-machine.
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|source| ConfigError::Bind { port, source })?;
    axum::serve(listener, app).await.map_err(ConfigError::Serve)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_default_to_everything_off() {
        // Nothing automates the user's game until they ask for it.
        assert_eq!(Settings::default().auto_accept, false);
    }

    #[test]
    fn settings_round_trip_through_json() {
        let s = Settings { auto_accept: true, ..Default::default() };
        let back: Settings = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn drake_starts_with_windows_by_default_but_never_reloads_unasked() {
        // Starting at login is what keeps the client injected before it ever
        // launches, so it is on. Restarting somebody's client is intrusive
        // enough that it stays off until they ask for it.
        assert_eq!(Settings::default().run_at_startup, true);
        assert_eq!(Settings::default().auto_reload_on_open, false);
    }

    #[test]
    fn a_settings_file_written_before_these_options_existed_still_loads() {
        // Upgrading must not silently reset auto_accept to false just because
        // the file predates the two newer fields.
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        std::fs::write(&p, r#"{"auto_accept": true}"#).unwrap();

        let s = load_from(&p);

        assert_eq!(s.auto_accept, true, "the setting they had must survive");
        assert_eq!(s.run_at_startup, true);
        assert_eq!(s.auto_reload_on_open, false);
    }

    #[test]
    fn missing_settings_file_yields_defaults_instead_of_failing() {
        let tmp = tempfile::tempdir().unwrap();
        let s = load_from(&tmp.path().join("nope.json"));
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn corrupt_settings_file_yields_defaults_instead_of_failing() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        std::fs::write(&p, "{ this is not json").unwrap();
        assert_eq!(load_from(&p), Settings::default());
    }

    #[test]
    fn plugin_config_is_written_next_to_the_plugin() {
        let tmp = tempfile::tempdir().unwrap();
        let cfg = PluginConfig {
            token: "abc".into(),
            port: 48151,
            settings: Settings { auto_accept: true, ..Default::default() },
        };
        write_plugin_config(tmp.path(), &cfg).unwrap();
        let raw = std::fs::read_to_string(tmp.path().join("config.json")).unwrap();
        assert!(raw.contains("\"token\""));
        assert!(raw.contains("48151"));
    }

    #[test]
    fn plugin_config_is_not_rewritten_when_unchanged() {
        // Regression test: the tick loop calls this every 2 seconds with an
        // unchanged config for the lifetime of a run. Make the file
        // read-only after the first write -- if a second call with
        // identical content attempted to write again, it would fail here.
        let tmp = tempfile::tempdir().unwrap();
        let cfg = PluginConfig { token: "abc".into(), port: 48151, settings: Settings::default() };
        write_plugin_config(tmp.path(), &cfg).unwrap();

        let path = tmp.path().join("config.json");
        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&path, perms).unwrap();

        let result = write_plugin_config(tmp.path(), &cfg);

        // Restore write access so the tempdir can clean itself up regardless
        // of the assertion outcome below.
        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        perms.set_readonly(false);
        std::fs::set_permissions(&path, perms).unwrap();

        result.unwrap();
    }

    #[test]
    fn a_token_is_long_enough_to_not_be_guessable() {
        assert!(generate_token().len() >= 32);
        assert_ne!(generate_token(), generate_token());
    }

    #[test]
    fn effective_state_is_not_injected_once_the_checkin_window_lapses() {
        let st = ConfigdState::new_with_settings(48151, Settings::default());
        st.record_checkin("Drake".into());
        assert!(matches!(st.effective(true), EffectiveState::Injected { .. }));
        st.expire_checkin_for_test();
        assert!(matches!(st.effective(true), EffectiveState::NotInjected));
    }

    #[test]
    fn effective_state_is_unknown_when_the_client_is_closed() {
        let st = ConfigdState::new_with_settings(48151, Settings::default());
        assert!(matches!(st.effective(false), EffectiveState::Unknown));
    }

    // --- HTTP surface: router(), no real socket needed (tower::ServiceExt::oneshot) ---

    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn checkin_with_correct_token_returns_no_content_and_records_it() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        let token = state.token.clone();
        let app = router(state.clone());

        let body = format!(r#"{{"token":"{token}","host":"Drake"}}"#);
        let req = Request::builder()
            .method("POST")
            .uri("/checkin")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert!(matches!(state.effective(true), EffectiveState::Injected { .. }));
    }

    #[tokio::test]
    async fn checkin_with_wrong_token_returns_unauthorized_and_does_not_record_it() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        let app = router(state.clone());

        let body = r#"{"token":"not-the-token","host":"Drake"}"#;
        let req = Request::builder()
            .method("POST")
            .uri("/checkin")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();

        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        assert!(matches!(state.effective(true), EffectiveState::NotInjected));
    }

    #[tokio::test]
    async fn checkin_response_carries_permissive_cors_header() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        let token = state.token.clone();
        let app = router(state.clone());

        let body = format!(r#"{{"token":"{token}","host":"Drake"}}"#);
        let req = Request::builder()
            .method("POST")
            .uri("/checkin")
            .header("content-type", "application/json")
            .header("origin", "https://plugins")
            .body(Body::from(body))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();

        assert!(res.headers().contains_key("access-control-allow-origin"));
    }

    #[tokio::test]
    async fn checkin_preflight_is_answered_with_matching_allow_headers() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        let app = router(state);

        let req = Request::builder()
            .method("OPTIONS")
            .uri("/checkin")
            .header("origin", "https://plugins")
            .header("access-control-request-method", "POST")
            .header("access-control-request-headers", "content-type")
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        assert!(res.headers().contains_key("access-control-allow-origin"));
        let allow_methods = res
            .headers()
            .get("access-control-allow-methods")
            .expect("preflight response must list allowed methods")
            .to_str()
            .unwrap();
        assert!(allow_methods.contains("POST"));
        let allow_headers = res
            .headers()
            .get("access-control-allow-headers")
            .expect("preflight response must list allowed headers")
            .to_str()
            .unwrap()
            .to_ascii_lowercase();
        assert!(allow_headers.contains("content-type"));
    }

    #[tokio::test]
    async fn serve_reports_an_error_instead_of_panicking_when_the_port_is_taken() {
        // A silent panic here would run inside a spawned task in a windows-subsystem
        // binary with no console: the check-in server would vanish with no
        // diagnostic. serve() must hand the failure back instead of unwrapping.
        let blocker = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = blocker.local_addr().unwrap().port();

        let state = Arc::new(ConfigdState::new_with_settings(port, Settings::default()));
        let err = serve(state).await.unwrap_err();

        let message = err.to_string();
        assert!(
            message.contains(&port.to_string()),
            "error message should name the port that failed to bind: {message}"
        );

        drop(blocker);
    }
}
