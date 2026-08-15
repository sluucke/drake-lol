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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    pub auto_accept: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { auto_accept: false }
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
        Self {
            token: generate_token(),
            port,
            settings: Mutex::new(load()),
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

pub async fn serve(state: Arc<ConfigdState>) {
    let port = state.port;
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
    let app = Router::new()
        .route("/checkin", post(checkin))
        .layer(cors)
        .with_state(state);
    // 127.0.0.1 only. Never 0.0.0.0 — this must not be reachable off-machine.
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.unwrap();
    axum::serve(listener, app).await.unwrap();
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
        let s = Settings { auto_accept: true };
        let back: Settings = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back, s);
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
            settings: Settings { auto_accept: true },
        };
        write_plugin_config(tmp.path(), &cfg).unwrap();
        let raw = std::fs::read_to_string(tmp.path().join("config.json")).unwrap();
        assert!(raw.contains("\"token\""));
        assert!(raw.contains("48151"));
    }

    #[test]
    fn a_token_is_long_enough_to_not_be_guessable() {
        assert!(generate_token().len() >= 32);
        assert_ne!(generate_token(), generate_token());
    }

    #[test]
    fn effective_state_is_not_injected_once_the_checkin_window_lapses() {
        let st = ConfigdState::new(48151);
        st.record_checkin("Drake".into());
        assert!(matches!(st.effective(true), EffectiveState::Injected { .. }));
        st.expire_checkin_for_test();
        assert!(matches!(st.effective(true), EffectiveState::NotInjected));
    }

    #[test]
    fn effective_state_is_unknown_when_the_client_is_closed() {
        let st = ConfigdState::new(48151);
        assert!(matches!(st.effective(false), EffectiveState::Unknown));
    }
}
