pub mod configd;
pub mod deploy;
pub mod elevate;
pub mod lcu;
pub mod paths;
pub mod slot;
pub mod strings;
pub mod supervisor;
pub mod vendored;

use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

const CONFIGD_PORT: u16 = 48151;
const INDEX_JS: &str = include_str!("../../plugin/dist/index.js");

/// Installs the vendored `core.dll` into `%PROGRAMDATA%\Drake\loader`,
/// skipping the write entirely when the destination already holds identical
/// bytes. This matters for more than efficiency: while a League client is
/// running under our loader, `core.dll` is mapped as a live image and
/// cannot be opened for write, so an unconditional copy on every Drake
/// restart would fail exactly when Drake is relaunched with the client
/// still up -- not an edge case. Returns a human-readable error instead of
/// propagating one, so a failure here degrades to an `Inactive` tray
/// reason rather than aborting startup.
fn ensure_vendored_loader_installed(app: &tauri::AppHandle) -> Result<(), String> {
    let src = vendored::core_dll_source(app).map_err(|e| e.to_string())?;
    let dest = paths::our_core_dll();
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    }
    let new_bytes = std::fs::read(&src).map_err(|e| format!("cannot read vendored loader: {e}"))?;
    if let Ok(existing) = std::fs::read(&dest) {
        if existing == new_bytes {
            return Ok(());
        }
    }
    std::fs::write(&dest, &new_bytes)
        .map_err(|e| format!("cannot write {}: {e}", dest.display()))
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Best-effort: a failure here (most commonly core.dll being
            // locked by a running client under our own loader) must not
            // crash startup. It is surfaced in the tray tooltip below.
            let install_error = ensure_vendored_loader_installed(app.handle()).err();

            let state = Arc::new(configd::ConfigdState::new(CONFIGD_PORT));

            // Starts disabled: the first tick (within 2s) enables it once we
            // actually know the client is running without our plugin loaded.
            let reload = MenuItem::with_id(app, "reload", strings::MENU_RELOAD_CLIENT, false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", strings::MENU_QUIT, true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&reload, &quit])?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(strings::TRAY_TOOLTIP)
                .menu(&menu)
                .build(app)?;

            app.on_menu_event(move |_app, event| {
                if event.id() == "quit" {
                    std::process::exit(0);
                } else if event.id() == "reload" {
                    // Reload is only ever triggered by an explicit click here.
                    // The supervisor loop must never call this on its own --
                    // restarting someone's client unasked is hostile.
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = lcu::restart_ux().await {
                            eprintln!("[Drake] could not reload the client: {e}");
                        }
                    });
                }
            });

            // configd's check-in server. serve() reports bind failure instead
            // of panicking. A bind failure only kills *effective-state
            // detection* (check-ins can never arrive) -- it must not stop
            // deployment, which is otherwise fully independent of this
            // server. So we retry the bind in the background and merely
            // surface the current failure (if any) in the tray tooltip; the
            // tick loop below keeps running regardless.
            let configd_error: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
            let err_state = configd_error.clone();
            let serve_state = state.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    // Clear optimistically: if the bind below succeeds,
                    // serve() blocks here indefinitely and the error stays
                    // cleared for as long as the server is actually up.
                    *err_state.lock().unwrap() = None;
                    match configd::serve(serve_state.clone()).await {
                        Ok(()) => break,
                        Err(e) => {
                            *err_state.lock().unwrap() = Some(e.to_string());
                            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                        }
                    }
                }
            });

            let loop_state = state.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let cfg = configd::PluginConfig {
                        token: loop_state.token.clone(),
                        port: loop_state.port,
                        settings: loop_state.settings.lock().unwrap().clone(),
                    };
                    // Always runs: claiming the slot and deploying the
                    // plugin + config.json has nothing to do with whether
                    // the check-in server could bind its port. The plugin
                    // reads config.json from disk directly -- the check-in
                    // POST is a separate, failure-tolerant path whose only
                    // consumer is this tray's own status display.
                    let mode = supervisor::tick(
                        &slot::WindowsRegistry,
                        &elevate::ScheduledTaskClaimer,
                        &paths::our_core_dll(),
                        &paths::our_loader_dir(),
                        INDEX_JS,
                        &cfg,
                    );
                    let mode_text = match &mode {
                        supervisor::Mode::OwnLoader => strings::MODE_OWN_LOADER.to_string(),
                        supervisor::Mode::Guest { host } => format!("{} {host}", strings::MODE_GUEST),
                        supervisor::Mode::Inactive { reason } => {
                            format!("{}: {reason}", strings::MODE_INACTIVE)
                        }
                    };

                    let configd_err = configd_error.lock().unwrap().clone();
                    let mut text = mode_text;
                    if let Some(reason) = &install_error {
                        text = format!("{text} ({}: cannot install the loader: {reason})", strings::MODE_INACTIVE);
                    }
                    if let Some(err) = &configd_err {
                        text = format!("{text} ({}: check-in server: {err})", strings::MODE_INACTIVE);
                    }
                    let _ = tray.set_tooltip(Some(&format!("{}\n{text}", strings::TRAY_TOOLTIP)));

                    // "Reload client to apply" only helps when the client is
                    // already running but has not picked up a freshly
                    // deployed plugin: the registry key and plugins/ folder
                    // are both read once at client launch, so changing them
                    // afterwards has no effect until the UI is reloaded.
                    // Without a working check-in server we cannot know
                    // whether the plugin is effectively injected, so offering
                    // "reload" in that case would be a guess -- keep it off.
                    let can_reload = if configd_err.is_some() {
                        false
                    } else {
                        let client_running = lcu::client_running();
                        client_running
                            && matches!(
                                loop_state.effective(client_running),
                                configd::EffectiveState::NotInjected
                            )
                    };
                    let _ = reload.set_enabled(can_reload);

                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Drake");
}
