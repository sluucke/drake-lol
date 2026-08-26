pub mod browser;
pub mod configd;
pub mod deploy;
pub mod elevate;
pub mod lcu;
pub mod paths;
pub mod single_instance;
pub mod slot;
pub mod startup;
pub mod strings;
pub mod supervisor;
pub mod update;
pub mod vendored;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

const CONFIGD_PORT: u16 = 48151;
const INDEX_JS: &str = include_str!("../../plugin/dist/index.js");
const PLUGIN_BUILD: &str = include_str!("../../plugin/.build-id");

/// Reports whether the installed `core.dll` matches the bundled resource.
///
/// The tray deliberately cannot fix a mismatch: `%PROGRAMDATA%\Drake\loader`
/// keeps an admin-only ACL, because `core.dll` is named by a machine-wide
/// HKLM value and executes inside whichever user's session launches League.
/// Letting the unelevated tray write it would let any standard user plant a
/// DLL that runs in an administrator's session. The elevated installer places
/// the file instead; all this can do is notice and say so.
fn verify_installed_loader(src: &Path, dest: &Path) -> Result<(), String> {
    let expected = std::fs::read(src).map_err(|e| format!("cannot read vendored loader: {e}"))?;
    match std::fs::read(dest) {
        Ok(actual) if actual == expected => Ok(()),
        Ok(_) => Err(format!(
            "{} does not match the version shipped with this build; reinstall Drake",
            dest.display()
        )),
        Err(e) => Err(format!("{} is missing ({e}); reinstall Drake", dest.display())),
    }
}

/// Non-fatal by construction: returns a human-readable reason instead of
/// propagating, so a problem here degrades to an `Inactive` tray reason
/// rather than aborting `setup`.
fn check_vendored_loader(app: &tauri::AppHandle) -> Result<(), String> {
    let src = vendored::core_dll_source(app).map_err(|e| e.to_string())?;
    verify_installed_loader(&src, &paths::our_core_dll())
}

fn tray_version_label(version: &str) -> String {
    format!("Drake - v{version}")
}

fn next_auto_update_delay(first_check: bool) -> std::time::Duration {
    if first_check {
        std::time::Duration::ZERO
    } else {
        update::CHECK_EVERY
    }
}

async fn try_apply_update(
    state: &Arc<configd::ConfigdState>,
    note: Arc<Mutex<Option<String>>>,
    announce_current: bool,
    trigger: update::UpdateTrigger,
) {
    if !state.try_begin_update() {
        return;
    }
    *note.lock().unwrap() = Some("Checking for updates".into());
    let relaunch = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[Drake] cannot resolve own path: {e}");
            *note.lock().unwrap() = Some(format!("Update failed: {e}"));
            state.end_update();
            return;
        }
    };
    match update::apply_if_newer(env!("CARGO_PKG_VERSION"), &relaunch, trigger).await {
        Ok(true) => {
            *note.lock().unwrap() = Some("Installing update".into());
            std::thread::sleep(update::HANDOFF_START_GRACE);
            std::process::exit(0);
        }
        Ok(false) => {
            *note.lock().unwrap() = if announce_current {
                Some("Drake is up to date".into())
            } else {
                None
            };
            state.end_update();
        }
        Err(e) => {
            eprintln!("[Drake] update failed: {e}");
            *note.lock().unwrap() = Some(format!("Update failed: {e}"));
            state.end_update();
        }
    }
}

async fn try_prompt_manual_update(
    state: &Arc<configd::ConfigdState>,
    note: Arc<Mutex<Option<String>>>,
    is_startup: bool,
) {
    let auto_update = state.settings.lock().unwrap().auto_update;
    if auto_update || !is_startup {
        return;
    }
    match update::check_for_update(env!("CARGO_PKG_VERSION")).await {
        Ok(status) => {
            let Some(version) = update::prompt_version_for_manual_update(false, true, &status)
            else {
                return;
            };
            if update::ask_to_install_update(&version) {
                try_apply_update(state, note, false, update::UpdateTrigger::Manual).await;
            }
        }
        Err(e) => {
            eprintln!("[Drake] update check failed: {e}");
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Best-effort: a mismatched or missing core.dll must not crash
            // startup. It is surfaced in the tray tooltip below.
            let install_error = check_vendored_loader(app.handle()).err();

            let state = Arc::new(configd::ConfigdState::new(CONFIGD_PORT, env!("CARGO_PKG_VERSION")));

            let version_label = MenuItem::with_id(
                app,
                "version",
                &tray_version_label(env!("CARGO_PKG_VERSION")),
                false,
                None::<&str>,
            )?;

            // Starts disabled: the first tick (within 2s) enables it once we
            // actually know the client is running without our plugin loaded.
            let reload = MenuItem::with_id(app, "reload", strings::MENU_RELOAD_CLIENT, false, None::<&str>)?;

            // The tray is the settings surface. The in-client settings UI does
            // not exist yet, and the tray is already the source of truth for
            // settings, so these live here rather than waiting for it.
            let initial = state.settings.lock().unwrap().clone();
            let startup_item = CheckMenuItem::with_id(
                app,
                "run_at_startup",
                strings::MENU_RUN_AT_STARTUP,
                true,
                initial.run_at_startup,
                None::<&str>,
            )?;
            let auto_reload_item = CheckMenuItem::with_id(
                app,
                "auto_reload_on_open",
                strings::MENU_AUTO_RELOAD,
                true,
                initial.auto_reload_on_open,
                None::<&str>,
            )?;
            let auto_update_item = CheckMenuItem::with_id(
                app,
                "auto_update",
                strings::MENU_AUTO_UPDATE,
                true,
                initial.auto_update,
                None::<&str>,
            )?;
            let check_updates = MenuItem::with_id(
                app,
                "check_updates",
                strings::MENU_CHECK_UPDATES,
                true,
                None::<&str>,
            )?;

            let quit = MenuItem::with_id(app, "quit", strings::MENU_QUIT, true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &version_label,
                    &startup_item,
                    &auto_reload_item,
                    &auto_update_item,
                    &check_updates,
                    &reload,
                    &quit,
                ],
            )?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(strings::TRAY_TOOLTIP)
                .menu(&menu)
                .build(app)?;

            let menu_state = state.clone();
            let startup_check = startup_item.clone();
            let auto_reload_check = auto_reload_item.clone();
            let auto_update_check = auto_update_item.clone();
            let update_note: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
            let menu_note = update_note.clone();
            let shutting_down = Arc::new(AtomicBool::new(false));
            let menu_shutdown = shutting_down.clone();
            app.on_menu_event(move |_app, event| {
                if event.id() == "quit" {
                    if menu_shutdown.swap(true, Ordering::SeqCst) {
                        return;
                    }
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = elevate::uninstall(
                            &slot::WindowsRegistry,
                            &paths::our_core_dll(),
                            &paths::data_dir(),
                        ) {
                            eprintln!("[Drake] could not deactivate injection on quit: {e}");
                        }
                        if let Err(e) = lcu::restart_ux().await {
                            eprintln!("[Drake] could not reload the client on quit: {e}");
                        }
                        std::process::exit(0);
                    });
                } else if event.id() == "run_at_startup"
                    || event.id() == "auto_reload_on_open"
                    || event.id() == "auto_update"
                {
                    let mut settings = menu_state.settings.lock().unwrap();
                    if event.id() == "run_at_startup" {
                        settings.run_at_startup = startup_check.is_checked().unwrap_or(false);
                    } else if event.id() == "auto_reload_on_open" {
                        settings.auto_reload_on_open =
                            auto_reload_check.is_checked().unwrap_or(false);
                    } else {
                        settings.auto_update = auto_update_check.is_checked().unwrap_or(false);
                    }
                    if let Err(e) = configd::save(&settings) {
                        eprintln!("[Drake] could not save settings: {e}");
                    }
                } else if event.id() == "check_updates" {
                    let tray = menu_state.clone();
                    let note = menu_note.clone();
                    tauri::async_runtime::spawn(async move {
                        try_apply_update(&tray, note, true, update::UpdateTrigger::Manual).await;
                    });
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
            let loop_note = update_note.clone();
            let loop_shutdown = shutting_down.clone();
            tauri::async_runtime::spawn(async move {
                let started = std::time::Instant::now();
                let mut auto_reload_fired = false;
                let exe = std::env::current_exe().ok();

                loop {
                    if loop_shutdown.load(Ordering::SeqCst) {
                        break;
                    }
                    let settings = loop_state.settings.lock().unwrap().clone();

                    // The in-client panel writes settings too, so the tray's
                    // own checkboxes have to follow rather than only lead.
                    // set_checked on an unchanged value is a no-op, so this is
                    // safe to run every tick.
                    let _ = startup_item.set_checked(settings.run_at_startup);
                    let _ = auto_reload_item.set_checked(settings.auto_reload_on_open);
                    let _ = auto_update_item.set_checked(settings.auto_update);

                    let cfg = configd::PluginConfig {
                        token: loop_state.token.clone(),
                        port: loop_state.port,
                        version: env!("CARGO_PKG_VERSION").to_string(),
                        settings: settings.clone(),
                    };

                    // Reconciled here rather than in the click handler so the
                    // Run key has exactly one writer, and so a stale entry
                    // left by a move or reinstall gets repaired even if the
                    // user never opens the menu.
                    if let Some(exe) = &exe {
                        if let Err(e) = startup::reconcile(
                            &startup::WindowsRunKey,
                            exe,
                            settings.run_at_startup,
                        ) {
                            eprintln!("[Drake] start-with-Windows: {e}");
                        }
                    }
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
                        text = format!("{text} ({}: {reason})", strings::MODE_INACTIVE);
                    }
                    if let Some(err) = &configd_err {
                        text = format!("{text} ({}: check-in server: {err})", strings::MODE_INACTIVE);
                    }
                    if let Some(update) = loop_note.lock().unwrap().clone() {
                        text = format!("{text}\n{update}");
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
                    let effective = if configd_err.is_some() {
                        // Without a check-in server we cannot know, and
                        // guessing would mean acting on a guess.
                        None
                    } else {
                        Some(loop_state.effective(lcu::client_running(), PLUGIN_BUILD))
                    };

                    let can_reload = matches!(
                        effective,
                        Some(configd::EffectiveState::NotInjected)
                            | Some(configd::EffectiveState::Stale { .. })
                    );
                    let _ = reload.set_enabled(can_reload);

                    // The user asked Drake to do this for them on open. Fires
                    // once per run, and only after the grace window, so a
                    // healthy client that simply has not checked in yet is
                    // never restarted. See supervisor::should_auto_reload.
                    if let Some(eff) = &effective {
                        if supervisor::should_auto_reload(
                            settings.auto_reload_on_open,
                            eff,
                            started.elapsed(),
                            auto_reload_fired,
                        ) {
                            auto_reload_fired = true;
                            if let Err(e) = lcu::restart_ux().await {
                                eprintln!("[Drake] auto-reload failed: {e}");
                            }
                        }
                    }

                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            });

            let periodic_state = state.clone();
            let periodic_note = update_note.clone();
            let periodic_shutdown = shutting_down.clone();
            tauri::async_runtime::spawn(async move {
                let mut first_check = true;
                loop {
                    if periodic_shutdown.load(Ordering::SeqCst) {
                        break;
                    }
                    tokio::time::sleep(next_auto_update_delay(first_check)).await;
                    let is_startup = first_check;
                    first_check = false;
                    if periodic_shutdown.load(Ordering::SeqCst) {
                        break;
                    }
                    let enabled = periodic_state.settings.lock().unwrap().auto_update;
                    if enabled {
                        try_apply_update(
                            &periodic_state,
                            periodic_note.clone(),
                            false,
                            update::UpdateTrigger::Automatic,
                        )
                        .await;
                    } else {
                        try_prompt_manual_update(
                            &periodic_state,
                            periodic_note.clone(),
                            is_startup,
                        )
                        .await;
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Drake");
}

#[cfg(test)]
mod tests {
    use super::{next_auto_update_delay, tray_version_label, verify_installed_loader};

    #[test]
    fn a_matching_core_dll_is_reported_as_fine() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src.dll");
        let dest = tmp.path().join("dest.dll");
        std::fs::write(&src, b"loader bytes").unwrap();
        std::fs::write(&dest, b"loader bytes").unwrap();
        assert!(verify_installed_loader(&src, &dest).is_ok());
    }

    #[test]
    fn a_missing_core_dll_asks_for_a_reinstall_instead_of_writing_it() {
        // The tray runs unelevated and the loader directory is admin-only by
        // design, so "fix it yourself" is not an option here.
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src.dll");
        let dest = tmp.path().join("dest.dll");
        std::fs::write(&src, b"loader bytes").unwrap();

        let err = verify_installed_loader(&src, &dest).unwrap_err();

        assert!(err.contains("reinstall"), "reason shown in the tray: {err}");
        assert!(!dest.exists(), "must not attempt to place core.dll itself");
    }

    #[test]
    fn a_stale_core_dll_asks_for_a_reinstall_and_leaves_it_alone() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src.dll");
        let dest = tmp.path().join("dest.dll");
        std::fs::write(&src, b"new loader bytes").unwrap();
        std::fs::write(&dest, b"old loader bytes").unwrap();

        let err = verify_installed_loader(&src, &dest).unwrap_err();

        assert!(err.contains("reinstall"), "reason shown in the tray: {err}");
        assert_eq!(std::fs::read(&dest).unwrap(), b"old loader bytes");
    }

    #[test]
    fn auto_update_checks_immediately_on_startup() {
        assert_eq!(next_auto_update_delay(true), std::time::Duration::ZERO);
        assert_eq!(next_auto_update_delay(false), crate::update::CHECK_EVERY);
    }

    #[test]
    fn tray_version_label_formats_as_drake_vx_y_z() {
        assert_eq!(tray_version_label("0.3.4"), "Drake - v0.3.4");
        assert_eq!(tray_version_label("1.0.0"), "Drake - v1.0.0");
    }
}
