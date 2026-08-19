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
    /// How long to wait before accepting. Lets the accept look human, and
    /// leaves a window in which the user can still decline by hand.
    #[serde(default = "no_delay")]
    pub auto_accept_delay_ms: u32,
    /// Lifts the 25-character cap on the client's own status-message input.
    #[serde(default = "on")]
    pub unlock_status_message: bool,
    #[serde(default = "off")]
    pub auto_pick: bool,
    /// Champion the pick phase should choose. 0 means none chosen.
    #[serde(default = "no_champion")]
    pub auto_pick_champion_id: u32,
    /// Fallback if the first champion is banned or already taken. 0 means none.
    #[serde(default = "no_champion")]
    pub auto_pick_champion_id_2: u32,
    /// Lock the pick outright instead of only hovering it.
    #[serde(default = "off")]
    pub insta_lock: bool,
    #[serde(default = "off")]
    pub auto_ban: bool,
    #[serde(default = "no_champion")]
    pub auto_ban_champion_id: u32,
    #[serde(default = "on")]
    pub auto_update: bool,
    #[serde(default = "off")]
    pub queue_team_reveal_in_client: bool,
    #[serde(default = "empty_string")]
    pub profile_rank_tier: String,
    #[serde(default = "default_rank_division")]
    pub profile_rank_division: String,
    #[serde(default = "default_rank_queue")]
    pub profile_rank_queue: String,
    #[serde(default = "default_rank_crystal")]
    pub profile_rank_crystal: String,
}

fn no_champion() -> u32 {
    0
}

/// The client's ready check expires on its own, so a delay past that would
/// mean Drake "accepting" a check that no longer exists. Well under the real
/// timeout, which we do not control and Riot may change.
pub const MAX_ACCEPT_DELAY_MS: u32 = 8_000;

fn no_delay() -> u32 {
    0
}

fn on() -> bool {
    true
}
fn off() -> bool {
    false
}

fn empty_string() -> String {
    String::new()
}

fn default_rank_division() -> String {
    "I".into()
}

fn default_rank_queue() -> String {
    "RANKED_SOLO_5x5".into()
}

fn default_rank_crystal() -> String {
    "IRON".into()
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
            auto_accept_delay_ms: no_delay(),
            // Purely permissive: it removes a restriction on a field the user
            // already owns, and changes nothing until they type in it.
            unlock_status_message: on(),
            auto_pick: off(),
            auto_pick_champion_id: no_champion(),
            auto_pick_champion_id_2: no_champion(),
            insta_lock: off(),
            auto_ban: off(),
            auto_ban_champion_id: no_champion(),
            auto_update: on(),
            queue_team_reveal_in_client: off(),
            profile_rank_tier: empty_string(),
            profile_rank_division: default_rank_division(),
            profile_rank_queue: default_rank_queue(),
            profile_rank_crystal: default_rank_crystal(),
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
    pub version: String,
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
    Stale { host: String },
    NotInjected,
    Unknown,
}

/// How settings reach disk. Behind a boxed fn so tests can assert that a
/// rejected write leaves memory untouched, without writing to the real
/// `%PROGRAMDATA%\Drake\state\settings.json` of whoever runs the suite.
type Persist = Box<dyn Fn(&Settings) -> Result<(), ConfigError> + Send + Sync>;

pub struct ConfigdState {
    pub token: String,
    pub port: u16,
    pub settings: Mutex<Settings>,
    last_checkin: Mutex<Option<(String, Instant, Option<String>)>>,
    persist: Mutex<Persist>,
    update_busy: Mutex<bool>,
}

impl ConfigdState {
    pub fn try_begin_update(&self) -> bool {
        let mut busy = self.update_busy.lock().unwrap();
        if *busy {
            return false;
        }
        *busy = true;
        true
    }

    pub fn end_update(&self) {
        *self.update_busy.lock().unwrap() = false;
    }

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
            persist: Mutex::new(Box::new(save)),
            update_busy: Mutex::new(false),
        }
    }

    #[cfg(test)]
    pub fn set_persist(
        &self,
        f: impl Fn(&Settings) -> Result<(), ConfigError> + Send + Sync + 'static,
    ) {
        *self.persist.lock().unwrap() = Box::new(f);
    }

    /// Persists first, applies second.
    ///
    /// The order is the whole point: if the write fails and we had already
    /// applied, the UI would show a setting that silently disappears on the
    /// next tray restart. Reporting the failure is better than drifting.
    pub fn apply_settings(&self, next: Settings) -> Result<(), ConfigError> {
        (self.persist.lock().unwrap())(&next)?;
        *self.settings.lock().unwrap() = next;
        Ok(())
    }

    pub fn record_checkin(&self, host: String, plugin_build: Option<String>) {
        *self.last_checkin.lock().unwrap() = Some((host, Instant::now(), plugin_build));
    }

    #[cfg(test)]
    pub fn record_checkin_for_test(&self, host: &str, plugin_build: Option<&str>) {
        self.record_checkin(
            host.into(),
            plugin_build.map(str::to_string),
        );
    }

    #[cfg(test)]
    pub fn expire_checkin_for_test(&self) {
        let mut g = self.last_checkin.lock().unwrap();
        if let Some((host, _, build)) = g.clone() {
            *g = Some((host, Instant::now() - CHECKIN_TOLERANCE - Duration::from_secs(1), build));
        }
    }

    pub fn effective(&self, client_running: bool, expected_build: &str) -> EffectiveState {
        if !client_running {
            return EffectiveState::Unknown;
        }
        match self.last_checkin.lock().unwrap().clone() {
            Some((host, at, build)) if at.elapsed() <= CHECKIN_TOLERANCE => {
                if expected_build.is_empty() || build.as_deref() == Some(expected_build) {
                    EffectiveState::Injected { host }
                } else {
                    EffectiveState::Stale { host }
                }
            }
            _ => EffectiveState::NotInjected,
        }
    }
}

#[derive(Deserialize)]
pub struct CheckInBody {
    pub token: String,
    pub host: String,
    #[serde(default)]
    pub plugin_build: Option<String>,
}

async fn checkin(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<CheckInBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    state.record_checkin(body.host, body.plugin_build);
    StatusCode::NO_CONTENT
}

/// A partial update. Every field optional so the UI can send only what the
/// user actually changed, and a field nobody mentioned keeps its current value
/// instead of silently snapping back to its default.
#[derive(Deserialize, Default)]
pub struct SettingsPatch {
    pub auto_accept: Option<bool>,
    pub run_at_startup: Option<bool>,
    pub auto_reload_on_open: Option<bool>,
    pub auto_accept_delay_ms: Option<u32>,
    pub unlock_status_message: Option<bool>,
    pub auto_pick: Option<bool>,
    pub auto_pick_champion_id: Option<u32>,
    pub auto_pick_champion_id_2: Option<u32>,
    pub insta_lock: Option<bool>,
    pub auto_ban: Option<bool>,
    pub auto_ban_champion_id: Option<u32>,
    pub auto_update: Option<bool>,
    pub queue_team_reveal_in_client: Option<bool>,
    pub profile_rank_tier: Option<String>,
    pub profile_rank_division: Option<String>,
    pub profile_rank_queue: Option<String>,
    pub profile_rank_crystal: Option<String>,
}

impl SettingsPatch {
    pub fn apply_to(&self, base: &Settings) -> Settings {
        Settings {
            auto_accept: self.auto_accept.unwrap_or(base.auto_accept),
            run_at_startup: self.run_at_startup.unwrap_or(base.run_at_startup),
            auto_reload_on_open: self.auto_reload_on_open.unwrap_or(base.auto_reload_on_open),
            // Clamped here rather than trusted: this arrives over HTTP from a
            // page running inside somebody else's client.
            auto_accept_delay_ms: self
                .auto_accept_delay_ms
                .unwrap_or(base.auto_accept_delay_ms)
                .min(MAX_ACCEPT_DELAY_MS),
            unlock_status_message: self
                .unlock_status_message
                .unwrap_or(base.unlock_status_message),
            auto_pick: self.auto_pick.unwrap_or(base.auto_pick),
            auto_pick_champion_id: self
                .auto_pick_champion_id
                .unwrap_or(base.auto_pick_champion_id),
            auto_pick_champion_id_2: self
                .auto_pick_champion_id_2
                .unwrap_or(base.auto_pick_champion_id_2),
            insta_lock: self.insta_lock.unwrap_or(base.insta_lock),
            auto_ban: self.auto_ban.unwrap_or(base.auto_ban),
            auto_ban_champion_id: self
                .auto_ban_champion_id
                .unwrap_or(base.auto_ban_champion_id),
            auto_update: self.auto_update.unwrap_or(base.auto_update),
            queue_team_reveal_in_client: self
                .queue_team_reveal_in_client
                .unwrap_or(base.queue_team_reveal_in_client),
            profile_rank_tier: self
                .profile_rank_tier
                .clone()
                .unwrap_or_else(|| base.profile_rank_tier.clone()),
            profile_rank_division: self
                .profile_rank_division
                .clone()
                .unwrap_or_else(|| base.profile_rank_division.clone()),
            profile_rank_queue: self
                .profile_rank_queue
                .clone()
                .unwrap_or_else(|| base.profile_rank_queue.clone()),
            profile_rank_crystal: self
                .profile_rank_crystal
                .clone()
                .unwrap_or_else(|| base.profile_rank_crystal.clone()),
        }
    }
}

#[derive(Deserialize)]
pub struct SettingsBody {
    pub token: String,
    pub settings: SettingsPatch,
}

async fn put_settings(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<SettingsBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    let next = {
        let current = state.settings.lock().unwrap();
        body.settings.apply_to(&current)
    };
    match state.apply_settings(next) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(e) => {
            eprintln!("[Drake] could not persist settings from the UI: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

/// Hosts the lobby-reveal feature is allowed to open.
///
/// Deliberately an allow-list, not a scheme check. This endpoint hands a URL
/// to the operating system, and anything running in the client's page can
/// reach it -- so "open any https URL" would turn Drake into a general
/// launcher for whatever ends up executing in there.
const OPENABLE_HOSTS: [&str; 3] = ["porofessor.gg", "www.op.gg", "op.gg"];

pub fn is_openable(raw: &str) -> bool {
    // Parsed rather than pattern-matched: `https://porofessor.gg.evil.com/`
    // and `https://evil.com/?x=https://porofessor.gg/` both contain the
    // allowed text, and neither is the allowed host.
    let Some(rest) = raw.strip_prefix("https://") else {
        return false;
    };
    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .split('@')
        .next_back()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    OPENABLE_HOSTS.contains(&host)
}

#[derive(Deserialize)]
pub struct OpenUrlBody {
    pub token: String,
    pub url: String,
}

async fn open_url(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<OpenUrlBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    if !is_openable(&body.url) {
        eprintln!("[Drake] refused to open {}", body.url);
        return StatusCode::FORBIDDEN;
    }
    match crate::browser::open(&body.url) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(e) => {
            eprintln!("[Drake] could not open the browser: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[derive(Deserialize)]
pub struct TokenBody {
    pub token: String,
}

async fn check_update(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<TokenBody>,
) -> Result<Json<crate::update::UpdateStatus>, StatusCode> {
    if body.token != state.token {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if !state.try_begin_update() {
        return Err(StatusCode::CONFLICT);
    }
    let current = env!("CARGO_PKG_VERSION").to_string();
    let result = crate::update::check_for_update(&current).await;
    state.end_update();
    match result {
        Ok(status) => Ok(Json(status)),
        Err(e) => {
            eprintln!("[Drake] update check failed: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

async fn apply_update(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<TokenBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    if !state.try_begin_update() {
        return StatusCode::CONFLICT;
    }
    let relaunch = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            state.end_update();
            eprintln!("[Drake] cannot resolve own path: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };
    match crate::update::apply_if_newer(
        env!("CARGO_PKG_VERSION"),
        &relaunch,
        crate::update::UpdateTrigger::Manual,
    )
    .await
    {
        Ok(true) => {
            std::thread::sleep(crate::update::HANDOFF_START_GRACE);
            std::process::exit(0);
        }
        Ok(false) => {
            state.end_update();
            StatusCode::NO_CONTENT
        }
        Err(e) => {
            state.end_update();
            eprintln!("[Drake] update apply failed: {e}");
            StatusCode::BAD_GATEWAY
        }
    }
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
        .route("/settings", post(put_settings))
        .route("/open-url", post(open_url))
        .route("/update/check", post(check_update))
        .route("/update/apply", post(apply_update))
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
        assert_eq!(Settings::default().queue_team_reveal_in_client, false);
    }

    #[test]
    fn settings_round_trip_through_json() {
        let s = Settings { auto_accept: true, ..Default::default() };
        let back: Settings = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn the_accept_delay_starts_at_zero_and_survives_a_round_trip() {
        assert_eq!(Settings::default().auto_accept_delay_ms, 0);
        let s = Settings { auto_accept_delay_ms: 2500, ..Settings::default() };
        let back: Settings = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back.auto_accept_delay_ms, 2500);
    }

    #[test]
    fn an_absurd_accept_delay_is_clamped_rather_than_trusted() {
        // The ready check itself expires; a delay longer than that would mean
        // Drake "accepting" a check that is already gone.
        let patch = SettingsPatch { auto_accept_delay_ms: Some(999_999), ..Default::default() };
        assert_eq!(patch.apply_to(&Settings::default()).auto_accept_delay_ms, MAX_ACCEPT_DELAY_MS);
    }

    #[test]
    fn drake_starts_with_windows_by_default_but_never_reloads_unasked() {
        // Starting at login is what keeps the client injected before it ever
        // launches, so it is on. Restarting somebody's client is intrusive
        // enough that it stays off until they ask for it.
        assert_eq!(Settings::default().run_at_startup, true);
        assert_eq!(Settings::default().auto_reload_on_open, false);
        assert_eq!(Settings::default().auto_update, true);
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
        assert_eq!(s.auto_pick_champion_id_2, 0);
        assert_eq!(s.auto_update, true);
        assert_eq!(s.queue_team_reveal_in_client, false);
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
            version: "0.1.0".into(),
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
        let cfg = PluginConfig {
            token: "abc".into(),
            port: 48151,
            version: "0.1.0".into(),
            settings: Settings::default(),
        };
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
        st.record_checkin_for_test("Drake", Some("build-a"));
        assert!(matches!(st.effective(true, "build-a"), EffectiveState::Injected { .. }));
        st.expire_checkin_for_test();
        assert!(matches!(st.effective(true, "build-a"), EffectiveState::NotInjected));
    }

    #[test]
    fn effective_state_is_stale_when_the_plugin_build_does_not_match() {
        let st = ConfigdState::new_with_settings(48151, Settings::default());
        st.record_checkin_for_test("Drake", Some("old-build"));
        assert!(matches!(st.effective(true, "new-build"), EffectiveState::Stale { .. }));
    }

    #[test]
    fn effective_state_is_unknown_when_the_client_is_closed() {
        let st = ConfigdState::new_with_settings(48151, Settings::default());
        assert!(matches!(st.effective(false, "build-a"), EffectiveState::Unknown));
    }

    // --- HTTP surface: router(), no real socket needed (tower::ServiceExt::oneshot) ---

    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    // --- POST /open-url: strictly limited to the scouting sites ---

    #[test]
    fn only_the_scouting_sites_can_be_opened() {
        // This endpoint hands a URL to the OS. Anything running in the client's
        // page could call it, so it is an allow-list of two hosts rather than a
        // general "open whatever" service.
        assert!(is_openable("https://porofessor.gg/pregame/br/x/soloqueue/season"));
        assert!(is_openable("https://www.op.gg/multisearch/br?summoners=x"));
    }

    #[test]
    fn anything_outside_the_allow_list_is_refused() {
        assert!(!is_openable("https://example.com/"));
        assert!(!is_openable("http://porofessor.gg/x"), "plain http must be refused");
        assert!(!is_openable("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_openable("javascript:alert(1)"));
        assert!(!is_openable(""));
    }

    #[test]
    fn a_lookalike_host_does_not_pass() {
        // Substring matching would accept both of these. The check is on the
        // host component, not on the URL text.
        assert!(!is_openable("https://porofessor.gg.evil.com/x"));
        assert!(!is_openable("https://evil.com/?x=https://porofessor.gg/"));
    }

    // --- POST /settings: the UI's only write path ---

    fn settings_request(token: &str, body_settings: &str) -> Request<Body> {
        let body = format!(r#"{{"token":"{token}","settings":{body_settings}}}"#);
        Request::builder()
            .method("POST")
            .uri("/settings")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap()
    }

    #[tokio::test]
    async fn posting_settings_applies_and_persists_them() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        let saved: Arc<Mutex<Vec<Settings>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = saved.clone();
        state.set_persist(move |s| {
            sink.lock().unwrap().push(s.clone());
            Ok(())
        });
        let token = state.token.clone();

        let res = router(state.clone())
            .oneshot(settings_request(&token, r#"{"auto_accept":true}"#))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert_eq!(state.settings.lock().unwrap().auto_accept, true);
        assert_eq!(saved.lock().unwrap().len(), 1, "must persist, not just apply in memory");
        assert_eq!(saved.lock().unwrap()[0].auto_accept, true);
    }

    #[tokio::test]
    async fn posting_settings_with_a_bad_token_changes_nothing() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        let saved: Arc<Mutex<Vec<Settings>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = saved.clone();
        state.set_persist(move |s| {
            sink.lock().unwrap().push(s.clone());
            Ok(())
        });

        let res = router(state.clone())
            .oneshot(settings_request("not-the-token", r#"{"auto_accept":true}"#))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(state.settings.lock().unwrap().auto_accept, false);
        assert!(saved.lock().unwrap().is_empty(), "must not persist on a rejected token");
    }

    fn token_request(path: &str, token: &str) -> Request<Body> {
        let body = format!(r#"{{"token":"{token}"}}"#);
        Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap()
    }

    #[tokio::test]
    async fn update_check_with_a_bad_token_is_rejected() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));

        let res = router(state)
            .oneshot(token_request("/update/check", "not-the-token"))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn settings_that_cannot_be_persisted_are_not_applied_in_memory() {
        // Otherwise the UI would show a setting that silently vanishes on the
        // next tray restart -- worse than reporting the failure.
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        state.set_persist(|_| {
            Err(ConfigError::Write {
                path: PathBuf::from("nope"),
                source: std::io::Error::other("disk on fire"),
            })
        });
        let token = state.token.clone();

        let res = router(state.clone())
            .oneshot(settings_request(&token, r#"{"auto_accept":true}"#))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(
            state.settings.lock().unwrap().auto_accept,
            false,
            "memory must not drift from disk"
        );
    }

    #[tokio::test]
    async fn posting_partial_settings_keeps_the_fields_not_mentioned() {
        // The UI sends whole objects today, but a partial body must not silently
        // reset run_at_startup to its default.
        let state = Arc::new(ConfigdState::new_with_settings(
            48151,
            Settings { run_at_startup: false, ..Settings::default() },
        ));
        state.set_persist(|_| Ok(()));
        let token = state.token.clone();

        let res = router(state.clone())
            .oneshot(settings_request(&token, r#"{"auto_accept":true}"#))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        let s = state.settings.lock().unwrap();
        assert_eq!(s.auto_accept, true);
        assert_eq!(s.run_at_startup, false, "an unmentioned field must not be reset");
        assert_eq!(s.queue_team_reveal_in_client, false, "an unmentioned field must not be reset");
    }

    #[tokio::test]
    async fn posting_queue_team_reveal_setting_persists_it() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        state.set_persist(|_| Ok(()));
        let token = state.token.clone();

        let res = router(state.clone())
            .oneshot(settings_request(
                &token,
                r#"{"queue_team_reveal_in_client":true}"#,
            ))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        let s = state.settings.lock().unwrap();
        assert_eq!(s.queue_team_reveal_in_client, true);
    }

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
        assert!(matches!(state.effective(true, ""), EffectiveState::Injected { .. }));
    }

    #[tokio::test]
    async fn checkin_with_a_matching_plugin_build_is_injected() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        let token = state.token.clone();
        let app = router(state.clone());

        let body = format!(r#"{{"token":"{token}","host":"Drake","plugin_build":"build-a"}}"#);
        let req = Request::builder()
            .method("POST")
            .uri("/checkin")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert!(matches!(state.effective(true, "build-a"), EffectiveState::Injected { .. }));
    }

    #[tokio::test]
    async fn checkin_with_a_stale_plugin_build_is_not_treated_as_current() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default()));
        let token = state.token.clone();
        let app = router(state.clone());

        let body = format!(r#"{{"token":"{token}","host":"Drake","plugin_build":"old-build"}}"#);
        let req = Request::builder()
            .method("POST")
            .uri("/checkin")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert!(matches!(state.effective(true, "new-build"), EffectiveState::Stale { .. }));
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
        assert!(matches!(state.effective(true, "build-a"), EffectiveState::NotInjected));
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
