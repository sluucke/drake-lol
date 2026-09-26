use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tower_http::cors::CorsLayer;

use crate::overlay::{ClientBounds, OverlayBridge};

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
    #[serde(default = "empty_string")]
    pub presence_availability: String,
    #[serde(default = "off")]
    pub auto_pick: bool,
    /// Up to two champion ids per assigned role (TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY).
    #[serde(default = "empty_auto_pick_by_role")]
    pub auto_pick_by_role: HashMap<String, Vec<u32>>,
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
    #[serde(default = "on")]
    pub queue_dodge_in_client: bool,
    #[serde(default = "on")]
    pub queue_show_map_side: bool,
    #[serde(default = "off")]
    pub queue_mute_all_in_client: bool,
    #[serde(default = "empty_string")]
    pub queue_auto_message: String,
    #[serde(default = "default_team_reveal_sample_size")]
    pub queue_team_reveal_sample_size: u32,
    #[serde(default = "default_team_reveal_recent_pool")]
    pub queue_team_reveal_recent_pool: String,
    #[serde(default = "default_team_reveal_last5_pool")]
    pub queue_team_reveal_last5_pool: String,
    #[serde(default = "default_team_reveal_fetch_concurrency")]
    pub queue_team_reveal_fetch_concurrency: u32,
    #[serde(default = "empty_string")]
    pub profile_rank_tier: String,
    #[serde(default = "default_rank_division")]
    pub profile_rank_division: String,
    #[serde(default = "default_rank_queue")]
    pub profile_rank_queue: String,
    #[serde(default = "default_rank_crystal")]
    pub profile_rank_crystal: String,
    #[serde(default = "off")]
    pub onboarding_done: bool,
    #[serde(default = "empty_string")]
    pub whats_new_seen_version: String,
    #[serde(default = "default_build_tier")]
    pub build_tier: String,
    #[serde(default = "default_build_region")]
    pub build_region: String,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default)]
    pub overlay_positions: crate::overlay::OverlayPositions,
    #[serde(default = "off")]
    pub overlay_hint_seen: bool,
    #[serde(default = "default_streaming_mode")]
    pub streaming_mode: String,
}

fn no_champion() -> u32 {
    0
}

fn empty_auto_pick_by_role() -> HashMap<String, Vec<u32>> {
    HashMap::new()
}

const AUTO_PICK_ROLES: [&str; 5] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

fn normalize_auto_pick_by_role(raw: HashMap<String, Vec<u32>>) -> HashMap<String, Vec<u32>> {
    let mut out = HashMap::new();
    for role in AUTO_PICK_ROLES {
        let Some(list) = raw.get(role) else { continue };
        let mut cleaned = Vec::new();
        for id in list {
            let id = *id;
            if id == 0 || cleaned.contains(&id) {
                continue;
            }
            cleaned.push(id);
            if cleaned.len() == 2 {
                break;
            }
        }
        if !cleaned.is_empty() {
            out.insert(role.to_string(), cleaned);
        }
    }
    out
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

fn default_streaming_mode() -> String {
    "off".into()
}

fn normalize_presence_availability(value: String) -> String {
    match value.as_str() {
        "chat" | "offline" | "mobile" | "dnd" => value,
        _ => String::new(),
    }
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

fn default_team_reveal_sample_size() -> u32 {
    50
}

fn default_team_reveal_recent_pool() -> String {
    "ranked_both".into()
}

fn default_team_reveal_last5_pool() -> String {
    "current_queue".into()
}

fn default_team_reveal_fetch_concurrency() -> u32 {
    1
}

fn default_build_tier() -> String {
    "emerald_plus".into()
}

fn default_build_region() -> String {
    "global".into()
}

fn default_ui_language() -> String {
    "auto".into()
}

fn normalize_ui_language(value: String) -> String {
    let valid = (2..=12).contains(&value.len())
        && value.chars().all(|c| c.is_ascii_alphabetic() || c == '_');
    if valid {
        value
    } else {
        default_ui_language()
    }
}

fn normalize_team_reveal_sample_size(value: u32) -> u32 {
    match value {
        20 | 50 | 100 => value,
        _ => default_team_reveal_sample_size(),
    }
}

fn normalize_team_reveal_pool(value: String, fallback: &str) -> String {
    match value.as_str() {
        "ranked_both" | "current_queue" | "any" => value,
        _ => fallback.into(),
    }
}

fn normalize_team_reveal_fetch_concurrency(value: u32) -> u32 {
    match value {
        1 | 2 | 3 | 5 => value,
        _ => default_team_reveal_fetch_concurrency(),
    }
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
            presence_availability: empty_string(),
            auto_pick: off(),
            auto_pick_by_role: empty_auto_pick_by_role(),
            insta_lock: off(),
            auto_ban: off(),
            auto_ban_champion_id: no_champion(),
            auto_update: on(),
            queue_team_reveal_in_client: off(),
            queue_dodge_in_client: on(),
            queue_show_map_side: on(),
            queue_mute_all_in_client: off(),
            queue_auto_message: empty_string(),
            queue_team_reveal_sample_size: default_team_reveal_sample_size(),
            queue_team_reveal_recent_pool: default_team_reveal_recent_pool(),
            queue_team_reveal_last5_pool: default_team_reveal_last5_pool(),
            queue_team_reveal_fetch_concurrency: default_team_reveal_fetch_concurrency(),
            profile_rank_tier: empty_string(),
            profile_rank_division: default_rank_division(),
            profile_rank_queue: default_rank_queue(),
            profile_rank_crystal: default_rank_crystal(),
            onboarding_done: off(),
            whats_new_seen_version: empty_string(),
            build_tier: default_build_tier(),
            build_region: default_build_region(),
            ui_language: default_ui_language(),
            overlay_positions: crate::overlay::OverlayPositions::default(),
            overlay_hint_seen: off(),
            streaming_mode: default_streaming_mode(),
        }
    }
}

pub fn load_from(path: &Path) -> Settings {
    let mut s: Settings = std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    s.streaming_mode = crate::streaming::normalize_streaming_mode(&s.streaming_mode);
    s
}

pub fn load() -> Settings {
    load_from(&crate::paths::settings_file())
}

pub fn load_from_migrating(path: &Path, current_version: &str) -> Settings {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Settings::default();
    };
    let mut s: Settings = serde_json::from_str(&raw).unwrap_or_default();
    let pre_onboarding = serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .map(|v| {
            v.get("onboarding_done").is_none() && v.get("whats_new_seen_version").is_none()
        })
        .unwrap_or(false);
    if pre_onboarding {
        s.onboarding_done = true;
        s.whats_new_seen_version = current_version.to_string();
        let _ = save_to(path, &s);
    }
    s
}

pub fn load_migrating(current_version: &str) -> Settings {
    load_from_migrating(&crate::paths::settings_file(), current_version)
}

pub fn save(s: &Settings) -> Result<(), ConfigError> {
    save_to(&crate::paths::settings_file(), s)
}

pub fn save_to(path: &Path, s: &Settings) -> Result<(), ConfigError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|source| ConfigError::Write { path: dir.to_path_buf(), source })?;
    }
    let raw = serde_json::to_string_pretty(s)?;
    std::fs::write(path, raw).map_err(|source| ConfigError::Write {
        path: path.to_path_buf(),
        source,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginConfig {
    pub token: String,
    pub port: u16,
    pub version: String,
    pub settings: Settings,
    pub streaming_effective: String,
    pub streaming_tool_running: bool,
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
    pub version: String,
    pub settings: Mutex<Settings>,
    pub http_client: reqwest::Client,
    last_checkin: Mutex<Option<(String, Instant, Option<String>)>>,
    persist: Mutex<Persist>,
    update_busy: Mutex<bool>,
    pub overlay: Mutex<OverlayBridge>,
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

    pub fn new(port: u16, current_version: &str) -> Self {
        Self::new_with_settings(port, load_migrating(current_version), current_version)
    }

    /// Seam for tests: builds state from a given `Settings` instead of reading
    /// `%PROGRAMDATA%\Drake\settings.json` from disk.
    pub fn new_with_settings(port: u16, settings: Settings, current_version: &str) -> Self {
        let http_client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        Self {
            token: generate_token(),
            port,
            version: current_version.to_string(),
            settings: Mutex::new(settings),
            http_client,
            last_checkin: Mutex::new(None),
            persist: Mutex::new(Box::new(save)),
            update_busy: Mutex::new(false),
            overlay: Mutex::new(OverlayBridge::default()),
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
    pub presence_availability: Option<String>,
    pub auto_pick: Option<bool>,
    pub auto_pick_by_role: Option<HashMap<String, Vec<u32>>>,
    pub insta_lock: Option<bool>,
    pub auto_ban: Option<bool>,
    pub auto_ban_champion_id: Option<u32>,
    pub auto_update: Option<bool>,
    pub queue_team_reveal_in_client: Option<bool>,
    pub queue_dodge_in_client: Option<bool>,
    pub queue_show_map_side: Option<bool>,
    pub queue_mute_all_in_client: Option<bool>,
    pub queue_auto_message: Option<String>,
    pub queue_team_reveal_sample_size: Option<u32>,
    pub queue_team_reveal_recent_pool: Option<String>,
    pub queue_team_reveal_last5_pool: Option<String>,
    pub queue_team_reveal_fetch_concurrency: Option<u32>,
    pub profile_rank_tier: Option<String>,
    pub profile_rank_division: Option<String>,
    pub profile_rank_queue: Option<String>,
    pub profile_rank_crystal: Option<String>,
    pub onboarding_done: Option<bool>,
    pub whats_new_seen_version: Option<String>,
    pub build_tier: Option<String>,
    pub build_region: Option<String>,
    pub ui_language: Option<String>,
    pub overlay_positions: Option<crate::overlay::OverlayPositions>,
    pub overlay_hint_seen: Option<bool>,
    pub streaming_mode: Option<String>,
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
            presence_availability: normalize_presence_availability(
                self.presence_availability
                    .clone()
                    .unwrap_or_else(|| base.presence_availability.clone()),
            ),
            auto_pick: self.auto_pick.unwrap_or(base.auto_pick),
            auto_pick_by_role: normalize_auto_pick_by_role(
                self.auto_pick_by_role
                    .clone()
                    .unwrap_or_else(|| base.auto_pick_by_role.clone()),
            ),
            insta_lock: self.insta_lock.unwrap_or(base.insta_lock),
            auto_ban: self.auto_ban.unwrap_or(base.auto_ban),
            auto_ban_champion_id: self
                .auto_ban_champion_id
                .unwrap_or(base.auto_ban_champion_id),
            auto_update: self.auto_update.unwrap_or(base.auto_update),
            queue_team_reveal_in_client: self
                .queue_team_reveal_in_client
                .unwrap_or(base.queue_team_reveal_in_client),
            queue_dodge_in_client: self
                .queue_dodge_in_client
                .unwrap_or(base.queue_dodge_in_client),
            queue_show_map_side: self
                .queue_show_map_side
                .unwrap_or(base.queue_show_map_side),
            queue_mute_all_in_client: self
                .queue_mute_all_in_client
                .unwrap_or(base.queue_mute_all_in_client),
            queue_auto_message: self
                .queue_auto_message
                .clone()
                .unwrap_or_else(|| base.queue_auto_message.clone()),
            queue_team_reveal_sample_size: normalize_team_reveal_sample_size(
                self.queue_team_reveal_sample_size
                    .unwrap_or(base.queue_team_reveal_sample_size),
            ),
            queue_team_reveal_recent_pool: normalize_team_reveal_pool(
                self.queue_team_reveal_recent_pool
                    .clone()
                    .unwrap_or_else(|| base.queue_team_reveal_recent_pool.clone()),
                "ranked_both",
            ),
            queue_team_reveal_last5_pool: normalize_team_reveal_pool(
                self.queue_team_reveal_last5_pool
                    .clone()
                    .unwrap_or_else(|| base.queue_team_reveal_last5_pool.clone()),
                "current_queue",
            ),
            queue_team_reveal_fetch_concurrency: normalize_team_reveal_fetch_concurrency(
                self.queue_team_reveal_fetch_concurrency
                    .unwrap_or(base.queue_team_reveal_fetch_concurrency),
            ),
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
            onboarding_done: self.onboarding_done.unwrap_or(base.onboarding_done),
            whats_new_seen_version: self
                .whats_new_seen_version
                .clone()
                .unwrap_or_else(|| base.whats_new_seen_version.clone()),
            build_tier: self.build_tier.clone().unwrap_or_else(|| base.build_tier.clone()),
            build_region: self
                .build_region
                .clone()
                .unwrap_or_else(|| base.build_region.clone()),
            ui_language: self
                .ui_language
                .clone()
                .map(normalize_ui_language)
                .unwrap_or_else(|| base.ui_language.clone()),
            overlay_positions: self
                .overlay_positions
                .clone()
                .map(crate::overlay::normalize_positions)
                .unwrap_or_else(|| base.overlay_positions.clone()),
            overlay_hint_seen: self.overlay_hint_seen.unwrap_or(base.overlay_hint_seen),
            streaming_mode: crate::streaming::normalize_streaming_mode(
                &self
                    .streaming_mode
                    .clone()
                    .unwrap_or_else(|| base.streaming_mode.clone()),
            ),
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

const PROXYABLE_HOSTS: [&str; 10] = [
    "mcp-api.op.gg",
    "op.gg",
    "www.op.gg",
    "lol-web-api.op.gg",
    "leagueofgraphs.com",
    "www.leagueofgraphs.com",
    "lolalytics.com",
    "www.lolalytics.com",
    "raw.communitydragon.org",
    "ddragon.leagueoflegends.com",
];

pub fn is_proxyable(raw: &str) -> bool {
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
    if PROXYABLE_HOSTS.contains(&host) {
        return true;
    }
    let host_lc = host.to_ascii_lowercase();
    if host_lc.ends_with(".sgp.pvp.net") {
        return true;
    }
    host_lc.ends_with(".lol.qq.com") && host_lc.contains("sgp")
}

#[derive(Deserialize)]
pub struct ProxyBody {
    pub token: String,
    pub url: String,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
    #[serde(default)]
    pub headers: Option<std::collections::HashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct ProxyResponse {
    pub status: u16,
    pub text: String,
}

async fn proxy_request(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<ProxyBody>,
) -> Result<Json<ProxyResponse>, StatusCode> {
    if body.token != state.token {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if !is_proxyable(&body.url) {
        eprintln!("[Drake] refused to proxy {}", body.url);
        return Err(StatusCode::FORBIDDEN);
    }
    let method = body.method.unwrap_or_else(|| "GET".to_string()).to_uppercase();
    let mut req = match method.as_str() {
        "POST" => state.http_client.post(&body.url),
        "PUT" => state.http_client.put(&body.url),
        "DELETE" => state.http_client.delete(&body.url),
        _ => state.http_client.get(&body.url),
    };

    if let Some(headers) = body.headers {
        for (k, v) in headers {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(&v),
            ) {
                req = req.header(name, val);
            }
        }
    }

    if let Some(json_body) = body.body {
        req = req.json(&json_body);
    }

    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let text = res.text().await.unwrap_or_default();
            Ok(Json(ProxyResponse { status, text }))
        }
        Err(e) => {
            eprintln!("[Drake] proxy fetch error for {}: {e}", body.url);
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

fn router(state: Arc<ConfigdState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);
    let overlay_pages = Router::new()
        .route(
            "/overlay",
            get(|| async { Html(include_str!("../overlay/index.html")) }),
        )
        .route(
            "/overlay/",
            get(|| async { Html(include_str!("../overlay/index.html")) }),
        )
        .route(
            "/overlay/app.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, HeaderValue::from_static("text/css; charset=utf-8"))],
                    include_str!("../overlay/app.css"),
                )
            }),
        )
        .route(
            "/overlay/drake.js",
            get(|| async {
                (
                    [(
                        header::CONTENT_TYPE,
                        HeaderValue::from_static("application/javascript; charset=utf-8"),
                    )],
                    include_str!("../../plugin/dist/overlay.js"),
                )
            }),
        )
        .route("/overlay/fonts/{name}", get(overlay_font));
    Router::new()
        .merge(overlay_pages)
        .route("/checkin", post(checkin))
        .route("/settings", post(put_settings))
        .route("/open-url", post(open_url))
        .route("/proxy", post(proxy_request))
        .route("/update/check", post(check_update))
        .route("/update/apply", post(apply_update))
        .route("/overlay/snapshot", post(overlay_snapshot))
        .route("/overlay/ui", post(overlay_ui))
        .route("/overlay/action", post(overlay_action))
        .route("/overlay/plugin", post(overlay_plugin))
        .route("/overlay/drain", post(overlay_drain))
        .route("/overlay/lcu", post(overlay_lcu))
        .route("/overlay/asset", get(overlay_asset))
        .layer(cors)
        .with_state(state)
}

#[derive(Serialize)]
struct OverlaySnapshot {
    version: String,
    settings: Settings,
    panel_open: bool,
    ready_check: bool,
    dodge: bool,
    client: Option<crate::overlay::ClientBounds>,
    chrome: Option<crate::overlay::ClientBounds>,
    views: Vec<String>,
    effective: bool,
}

async fn overlay_snapshot(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<TokenBody>,
) -> Result<Json<OverlaySnapshot>, StatusCode> {
    if body.token != state.token {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let settings = state.settings.lock().unwrap().clone();
    let (mut ui, views, effective) = {
        let mut bridge = state.overlay.lock().unwrap();
        (bridge.ui.clone(), bridge.drain_views(), bridge.effective_overlay)
    };
    ui.positions = settings.overlay_positions.clone();
    ui.show_hint = !settings.overlay_hint_seen;
    let chrome = ui
        .bounds
        .as_ref()
        .map(|client| crate::overlay::chrome_bounds(client, &ui));
    Ok(Json(OverlaySnapshot {
        version: state.version.clone(),
        settings,
        panel_open: ui.panel_open,
        ready_check: ui.ready_check,
        dodge: ui.dodge,
        client: ui.bounds,
        chrome,
        views,
        effective,
    }))
}

#[derive(Deserialize)]
struct OverlayUiBody {
    token: String,
    panel_open: Option<bool>,
    modal_open: Option<bool>,
    dragging: Option<bool>,
}

async fn overlay_ui(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<OverlayUiBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    {
        let mut bridge = state.overlay.lock().unwrap();
        if let Some(open) = body.panel_open {
            bridge.ui.panel_open = open;
        }
        if let Some(open) = body.modal_open {
            bridge.ui.modal_open = open;
        }
        if let Some(dragging) = body.dragging {
            bridge.ui.dragging = dragging;
        }
        bridge.mark_dirty();
    }
    StatusCode::NO_CONTENT
}

#[derive(Deserialize)]
struct OverlayActionBody {
    token: String,
    action: String,
}

async fn overlay_action(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<OverlayActionBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    let action = body.action.trim().to_ascii_lowercase();
    match action.as_str() {
        "cancel" | "dodge" | "toggle_panel" => {
            state.overlay.lock().unwrap().push_action(action);
            StatusCode::NO_CONTENT
        }
        _ => StatusCode::BAD_REQUEST,
    }
}

#[derive(Deserialize)]
struct OverlayPluginBody {
    token: String,
    ready_check: Option<bool>,
    dodge: Option<bool>,
    bounds: Option<ClientBounds>,
    toggle_panel: Option<bool>,
    open_view: Option<String>,
}

async fn overlay_plugin(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<OverlayPluginBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    let mut bridge = state.overlay.lock().unwrap();
    if let Some(v) = body.ready_check {
        bridge.ui.ready_check = v;
    }
    if let Some(v) = body.dodge {
        bridge.ui.dodge = v;
    }
    if let Some(b) = body.bounds {
        if bridge.ui.bounds.is_none() {
            bridge.ui.bounds = Some(b);
        }
    }
    if body.toggle_panel == Some(true) {
        bridge.ui.panel_open = !bridge.ui.panel_open;
        bridge.mark_dirty();
    }
    if let Some(view) = body.open_view.as_deref() {
        bridge.push_view(view);
    }
    bridge.mark_dirty();
    StatusCode::NO_CONTENT
}

#[derive(Serialize)]
struct OverlayDrainResponse {
    actions: Vec<String>,
    panel_open: bool,
}

async fn overlay_drain(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<TokenBody>,
) -> Result<Json<OverlayDrainResponse>, StatusCode> {
    if body.token != state.token {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut bridge = state.overlay.lock().unwrap();
    let actions = bridge.drain_actions();
    let panel_open = bridge.ui.panel_open;
    Ok(Json(OverlayDrainResponse {
        actions,
        panel_open,
    }))
}

fn lcu_route_allowed(route: &str) -> bool {
    let path = route.split('?').next().unwrap_or(route);
    path.starts_with("/lol-")
        || path.starts_with("/lol-game-data/")
        || path.starts_with("/riotclient/")
        || path.starts_with("/chat/")
        || path.starts_with("/riot-messaging-service/")
        || path.starts_with("/product-session/")
        || path.starts_with("/entitlements/")
        || path.starts_with("/lol/")
}

#[derive(Deserialize)]
struct OverlayLcuBody {
    token: String,
    method: String,
    route: String,
    body: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct OverlayLcuResponse {
    ok: bool,
    status: u16,
    body: serde_json::Value,
}

async fn overlay_lcu(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<OverlayLcuBody>,
) -> Result<Json<OverlayLcuResponse>, StatusCode> {
    if body.token != state.token {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if !lcu_route_allowed(&body.route) {
        return Err(StatusCode::FORBIDDEN);
    }
    match crate::lcu::request(&body.method, &body.route, body.body).await {
        Ok((status, value)) => Ok(Json(OverlayLcuResponse {
            ok: (200..300).contains(&status),
            status,
            body: value,
        })),
        Err(crate::lcu::LcuError::NotRunning) => Ok(Json(OverlayLcuResponse {
            ok: false,
            status: 503,
            body: serde_json::json!({ "error": "client not running" }),
        })),
        Err(e) => {
            eprintln!("[Drake] overlay lcu: {e}");
            Ok(Json(OverlayLcuResponse {
                ok: false,
                status: 502,
                body: serde_json::json!({ "error": e.to_string() }),
            }))
        }
    }
}

#[derive(Deserialize)]
struct OverlayAssetQuery {
    token: String,
    path: String,
}

const OVERLAY_FONTS: &[(&str, &[u8])] = &[
    ("cinzel-400.woff2", include_bytes!("../overlay/fonts/cinzel-400.woff2")),
    ("cinzel-600.woff2", include_bytes!("../overlay/fonts/cinzel-600.woff2")),
    ("cinzel-700.woff2", include_bytes!("../overlay/fonts/cinzel-700.woff2")),
    ("source-sans-3-400.woff2", include_bytes!("../overlay/fonts/source-sans-3-400.woff2")),
    ("source-sans-3-600.woff2", include_bytes!("../overlay/fonts/source-sans-3-600.woff2")),
    ("source-sans-3-700.woff2", include_bytes!("../overlay/fonts/source-sans-3-700.woff2")),
];

async fn overlay_font(axum::extract::Path(name): axum::extract::Path<String>) -> Response {
    match OVERLAY_FONTS.iter().find(|(file, _)| *file == name) {
        Some((_, bytes)) => (
            [
                (header::CONTENT_TYPE, HeaderValue::from_static("font/woff2")),
                (header::CACHE_CONTROL, HeaderValue::from_static("max-age=31536000, immutable")),
            ],
            *bytes,
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn overlay_asset(
    State(state): State<Arc<ConfigdState>>,
    Query(query): Query<OverlayAssetQuery>,
) -> Response {
    use axum::body::Body;
    use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};

    if query.token != state.token {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !lcu_route_allowed(&query.path) {
        return StatusCode::FORBIDDEN.into_response();
    }
    match crate::lcu::request_raw("GET", &query.path, None).await {
        Ok((status, bytes, ctype)) => {
            let mut res = Response::new(Body::from(bytes));
            *res.status_mut() =
                StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
            if let Ok(v) = HeaderValue::from_str(&ctype) {
                res.headers_mut().insert(CONTENT_TYPE, v);
            }
            res.headers_mut().insert(
                CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=86400"),
            );
            res
        }
        Err(_) => StatusCode::BAD_GATEWAY.into_response(),
    }
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

    fn unique_scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "drake-onboard-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn settings_default_to_everything_off() {
        // Nothing automates the user's game until they ask for it.
        assert_eq!(Settings::default().auto_accept, false);
        assert_eq!(Settings::default().queue_team_reveal_in_client, false);
        assert_eq!(Settings::default().queue_dodge_in_client, true);
        assert_eq!(Settings::default().queue_show_map_side, true);
        assert_eq!(Settings::default().queue_mute_all_in_client, false);
        assert_eq!(Settings::default().queue_auto_message, "");
    }

    #[test]
    fn build_panel_settings_default_to_emerald_plus_global() {
        assert_eq!(Settings::default().build_tier, "emerald_plus");
        assert_eq!(Settings::default().build_region, "global");
        assert_eq!(Settings::default().ui_language, "auto");
    }

    #[test]
    fn settings_include_onboarding_defaults() {
        let s = Settings::default();
        assert_eq!(s.onboarding_done, false);
        assert_eq!(s.whats_new_seen_version, "");
    }

    #[test]
    fn settings_include_streaming_mode_default() {
        assert_eq!(Settings::default().streaming_mode, "off");
    }

    #[test]
    fn streaming_mode_patch_normalizes_values() {
        let patch = SettingsPatch {
            streaming_mode: Some("AUTO".into()),
            ..Default::default()
        };
        assert_eq!(patch.apply_to(&Settings::default()).streaming_mode, "auto");
        let bad = SettingsPatch {
            streaming_mode: Some("nope".into()),
            ..Default::default()
        };
        assert_eq!(bad.apply_to(&Settings::default()).streaming_mode, "off");
    }

    #[test]
    fn migrating_load_marks_existing_installs_caught_up() {
        let dir = unique_scratch("exist");
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"auto_accept":true}"#).unwrap();
        let s = load_from_migrating(&path, "0.3.16");
        assert!(s.onboarding_done);
        assert_eq!(s.whats_new_seen_version, "0.3.16");
        assert!(s.auto_accept);
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(raw.contains("whats_new_seen_version"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrating_load_leaves_fresh_defaults_when_file_missing() {
        let dir = unique_scratch("fresh");
        let path = dir.join("settings.json");
        let s = load_from_migrating(&path, "0.3.16");
        assert_eq!(s.onboarding_done, false);
        assert_eq!(s.whats_new_seen_version, "");
        assert!(!path.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrating_load_preserves_explicit_incomplete_onboarding() {
        let dir = unique_scratch("incomplete");
        let path = dir.join("settings.json");
        std::fs::write(
            &path,
            r#"{"onboarding_done":false,"whats_new_seen_version":""}"#,
        )
        .unwrap();
        let s = load_from_migrating(&path, "0.3.16");
        assert_eq!(s.onboarding_done, false);
        assert_eq!(s.whats_new_seen_version, "");
        let _ = std::fs::remove_dir_all(&dir);
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
        assert_eq!(s.auto_pick_by_role.is_empty(), true);
        assert_eq!(s.auto_update, true);
        assert_eq!(s.queue_team_reveal_in_client, false);
        assert_eq!(s.queue_show_map_side, true);
        assert_eq!(s.queue_mute_all_in_client, false);
        assert_eq!(s.queue_auto_message, "");
        assert_eq!(s.onboarding_done, false);
        assert_eq!(s.whats_new_seen_version, "");
        assert_eq!(s.build_tier, "emerald_plus");
        assert_eq!(s.build_region, "global");
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
            streaming_effective: "in-client".into(),
            streaming_tool_running: false,
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
            streaming_effective: "in-client".into(),
            streaming_tool_running: false,
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
        let st = ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0");
        st.record_checkin_for_test("Drake", Some("build-a"));
        assert!(matches!(st.effective(true, "build-a"), EffectiveState::Injected { .. }));
        st.expire_checkin_for_test();
        assert!(matches!(st.effective(true, "build-a"), EffectiveState::NotInjected));
    }

    #[test]
    fn effective_state_is_stale_when_the_plugin_build_does_not_match() {
        let st = ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0");
        st.record_checkin_for_test("Drake", Some("old-build"));
        assert!(matches!(st.effective(true, "new-build"), EffectiveState::Stale { .. }));
    }

    #[test]
    fn effective_state_is_unknown_when_the_client_is_closed() {
        let st = ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0");
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
        assert!(is_openable("https://op.gg/lol/multisearch/br?summoners=x"));
        assert!(is_openable("https://www.op.gg/lol/multisearch/las?summoners=x"));
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

    #[tokio::test]
    async fn overlay_fonts_are_served_from_the_binary() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        let get = |uri: &str| Request::builder().uri(uri).body(Body::empty()).unwrap();
        let res = router(state.clone())
            .oneshot(get("/overlay/fonts/cinzel-700.woff2"))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.headers()[header::CONTENT_TYPE], "font/woff2");
        let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&body[..4], b"wOF2");
        let res = router(state).oneshot(get("/overlay/fonts/..%2Fapp.css")).await.unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
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
    async fn overlay_hint_is_remembered_once_seen() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        state.set_persist(|_| Ok(()));
        let token = state.token.clone();
        assert!(!state.settings.lock().unwrap().overlay_hint_seen);
        let res = router(state.clone())
            .oneshot(settings_request(&token, r#"{"overlay_hint_seen":true}"#))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert!(state.settings.lock().unwrap().overlay_hint_seen);
    }

    #[tokio::test]
    async fn overlay_positions_persist_and_reset() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        state.set_persist(|_| Ok(()));
        let token = state.token.clone();
        assert_eq!(state.settings.lock().unwrap().overlay_positions, crate::overlay::OverlayPositions::default());

        let res = router(state.clone())
            .oneshot(settings_request(&token, r#"{"overlay_positions":{"fab":{"x":2500,"y":90000},"dodge":null}}"#))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            state.settings.lock().unwrap().overlay_positions.fab,
            Some(crate::overlay::RelPos { x: 2500, y: 10000 })
        );

        let res = router(state.clone())
            .oneshot(settings_request(&token, r#"{"overlay_positions":{"fab":null,"dodge":null}}"#))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert_eq!(state.settings.lock().unwrap().overlay_positions, crate::overlay::OverlayPositions::default());
    }

    fn json_post(uri: &str, body: String) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri(uri)
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap()
    }

    #[tokio::test]
    async fn plugin_view_requests_reach_the_overlay_once() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        let token = state.token.clone();
        for view in ["scouting", "bogus", "build"] {
            let res = router(state.clone())
                .oneshot(json_post("/overlay/plugin", format!(r#"{{"token":"{token}","open_view":"{view}"}}"#)))
                .await
                .unwrap();
            assert_eq!(res.status(), StatusCode::NO_CONTENT);
        }
        state.overlay.lock().unwrap().effective_overlay = true;

        let res = router(state.clone())
            .oneshot(json_post("/overlay/snapshot", format!(r#"{{"token":"{token}"}}"#)))
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let snap: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(snap["views"], serde_json::json!(["scouting", "build"]));
        assert_eq!(snap["effective"], serde_json::json!(true));

        let res = router(state.clone())
            .oneshot(json_post("/overlay/snapshot", format!(r#"{{"token":"{token}"}}"#)))
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let snap: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(snap["views"], serde_json::json!([]));
    }

    #[tokio::test]
    async fn overlay_ui_tracks_the_open_modal() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        let token = state.token.clone();
        let res = router(state.clone())
            .oneshot(json_post("/overlay/ui", format!(r#"{{"token":"{token}","modal_open":true}}"#)))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert!(state.overlay.lock().unwrap().ui.modal_open);
    }

    #[tokio::test]
    async fn overlay_ui_tracks_dragging() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        let token = state.token.clone();
        let req = |body: String| {
            Request::builder()
                .method("POST")
                .uri("/overlay/ui")
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap()
        };
        let res = router(state.clone())
            .oneshot(req(format!(r#"{{"token":"{token}","dragging":true}}"#)))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        let ui = state.overlay.lock().unwrap().ui.clone();
        assert!(ui.dragging);
        assert!(!ui.panel_open, "an omitted panel_open keeps its value");
    }

    #[tokio::test]
    async fn plugin_bounds_do_not_override_the_detected_league_window() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        let token = state.token.clone();
        let post = |x: i32| {
            Request::builder()
                .method("POST")
                .uri("/overlay/plugin")
                .header("content-type", "application/json")
                .body(Body::from(format!(
                    r#"{{"token":"{token}","bounds":{{"x":{x},"y":0,"width":1024,"height":576}}}}"#
                )))
                .unwrap()
        };

        let res = router(state.clone()).oneshot(post(5)).await.unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert_eq!(state.overlay.lock().unwrap().ui.bounds.as_ref().unwrap().x, 5, "plugin bounds are the fallback");

        state.overlay.lock().unwrap().ui.bounds = Some(crate::overlay::ClientBounds { x: 100, y: 50, width: 1280, height: 720 });
        let res = router(state.clone()).oneshot(post(7)).await.unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert_eq!(state.overlay.lock().unwrap().ui.bounds.as_ref().unwrap().x, 100, "detected bounds win");
    }

    #[tokio::test]
    async fn posting_settings_applies_and_persists_them() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));

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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
            "0.0.0",
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
        assert_eq!(s.queue_show_map_side, true, "an unmentioned field must not be reset");
        assert_eq!(s.queue_mute_all_in_client, false, "an unmentioned field must not be reset");
        assert_eq!(s.queue_auto_message, "", "an unmentioned field must not be reset");
        assert_eq!(s.build_tier, "emerald_plus", "an unmentioned field must not be reset");
        assert_eq!(s.build_region, "global", "an unmentioned field must not be reset");
    }

    #[tokio::test]
    async fn posting_build_panel_settings_persists_them() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        state.set_persist(|_| Ok(()));
        let token = state.token.clone();

        let res = router(state.clone())
            .oneshot(settings_request(
                &token,
                r#"{"build_tier":"diamond_plus","build_region":"na"}"#,
            ))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        let s = state.settings.lock().unwrap();
        assert_eq!(s.build_tier, "diamond_plus");
        assert_eq!(s.build_region, "na");
    }

    #[tokio::test]
    async fn posting_ui_language_persists_it() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        state.set_persist(|_| Ok(()));
        let token = state.token.clone();

        let res = router(state.clone())
            .oneshot(settings_request(&token, r#"{"ui_language":"pt_BR"}"#))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        assert_eq!(state.settings.lock().unwrap().ui_language, "pt_BR");
    }

    #[test]
    fn ui_language_falls_back_to_auto_when_malformed() {
        let base = Settings::default();
        for bad in ["", "pt-BR<script>", "a_very_long_language_code", "../etc"] {
            let patch = SettingsPatch {
                ui_language: Some(bad.to_string()),
                ..Default::default()
            };
            assert_eq!(patch.apply_to(&base).ui_language, "auto", "{bad:?} must not be stored");
        }
        let keep = SettingsPatch::default().apply_to(&Settings {
            ui_language: "en_US".into(),
            ..Settings::default()
        });
        assert_eq!(keep.ui_language, "en_US", "an unmentioned field must not be reset");
    }

    #[tokio::test]
    async fn posting_queue_settings_persists_them() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        state.set_persist(|_| Ok(()));
        let token = state.token.clone();

        let res = router(state.clone())
            .oneshot(settings_request(
                &token,
                r#"{"queue_show_map_side":false,"queue_mute_all_in_client":true,"queue_auto_message":"gl hf"}"#,
            ))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::NO_CONTENT);
        let s = state.settings.lock().unwrap();
        assert_eq!(s.queue_show_map_side, false);
        assert_eq!(s.queue_mute_all_in_client, true);
        assert_eq!(s.queue_auto_message, "gl hf");
    }

    #[tokio::test]
    async fn posting_queue_team_reveal_setting_persists_it() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
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

        let state = Arc::new(ConfigdState::new_with_settings(port, Settings::default(), "0.0.0"));
        let err = serve(state).await.unwrap_err();

        let message = err.to_string();
        assert!(
            message.contains(&port.to_string()),
            "error message should name the port that failed to bind: {message}"
        );

        drop(blocker);
    }

    #[test]
    fn proxyable_allows_opgg_and_leagueofgraphs_domains() {
        assert!(is_proxyable("https://mcp-api.op.gg/mcp"));
        assert!(is_proxyable("https://op.gg/champions"));
        assert!(is_proxyable("https://www.leagueofgraphs.com/champions/builds/ahri/middle"));
        assert!(is_proxyable("https://lolalytics.com/lol/ahri/build/"));
        assert!(!is_proxyable("http://mcp-api.op.gg/mcp"));
        assert!(!is_proxyable("https://evil.com/"));
        assert!(!is_proxyable("https://mcp-api.op.gg.evil.com/"));
    }

    #[test]
    fn proxyable_allows_sgp_match_history_hosts() {
        assert!(is_proxyable(
            "https://usw2-red.pp.sgp.pvp.net/match-history-query/v1/products/lol/player/x/SUMMARY"
        ));
        assert!(is_proxyable(
            "https://euc1-red.pp.sgp.pvp.net/match-history-query/v1/products/lol/player/x/SUMMARY"
        ));
        assert!(is_proxyable(
            "https://apse1-red.pp.sgp.pvp.net/match-history-query/v1/products/lol/player/x/SUMMARY"
        ));
        assert!(is_proxyable(
            "https://hn1-k8s-sgp.lol.qq.com:21019/match-history-query/v1/products/lol/player/x/SUMMARY"
        ));
        assert!(is_proxyable("https://tj100-sgp.lol.qq.com:21019/match-history-query/v1/x"));
        assert!(!is_proxyable("https://not-sgp.pvp.net/steal"));
        assert!(!is_proxyable("https://sgp.pvp.net.evil.com/steal"));
        assert!(!is_proxyable("https://www.lol.qq.com/steal"));
    }

    #[tokio::test]
    async fn proxy_request_checks_token_and_rejects_unauthorized() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        let app = router(state);

        let body = r#"{"token":"wrong-token","url":"https://mcp-api.op.gg/mcp"}"#;
        let req = Request::builder()
            .method("POST")
            .uri("/proxy")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn proxy_request_rejects_forbidden_host() {
        let state = Arc::new(ConfigdState::new_with_settings(48151, Settings::default(), "0.0.0"));
        let token = state.token.clone();
        let app = router(state);

        let body = format!(r#"{{"token":"{token}","url":"https://evil.com/steal"}}"#);
        let req = Request::builder()
            .method("POST")
            .uri("/proxy")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }
}
