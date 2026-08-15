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

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Install the vendored loader into %PROGRAMDATA%\Drake\loader.
            let src = vendored::core_dll_source(app.handle())?;
            std::fs::create_dir_all(paths::our_loader_dir())?;
            std::fs::copy(&src, paths::our_core_dll())?;

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
            // of panicking; if it fails we must surface why in the tray
            // rather than let the tray silently report "not injected"
            // forever with no discoverable cause.
            let configd_error: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
            let err_state = configd_error.clone();
            let serve_state = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = configd::serve(serve_state).await {
                    *err_state.lock().unwrap() = Some(e.to_string());
                }
            });

            let loop_state = state.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Some(err) = configd_error.lock().unwrap().clone() {
                        let text = format!("{}: {err}", strings::MODE_INACTIVE);
                        let _ = tray.set_tooltip(Some(&format!("{}\n{text}", strings::TRAY_TOOLTIP)));
                        // We cannot know whether the plugin is effectively
                        // injected without check-ins, so offering "reload"
                        // here would be a guess -- keep it disabled.
                        let _ = reload.set_enabled(false);
                    } else {
                        let cfg = configd::PluginConfig {
                            token: loop_state.token.clone(),
                            port: loop_state.port,
                            settings: loop_state.settings.lock().unwrap().clone(),
                        };
                        let mode = supervisor::tick(
                            &slot::WindowsRegistry,
                            &paths::our_core_dll(),
                            &paths::our_loader_dir(),
                            INDEX_JS,
                            &cfg,
                        );
                        let text = match &mode {
                            supervisor::Mode::OwnLoader => strings::MODE_OWN_LOADER.to_string(),
                            supervisor::Mode::Guest { host } => format!("{} {host}", strings::MODE_GUEST),
                            supervisor::Mode::Inactive { reason } => {
                                format!("{}: {reason}", strings::MODE_INACTIVE)
                            }
                        };
                        let _ = tray.set_tooltip(Some(&format!("{}\n{text}", strings::TRAY_TOOLTIP)));

                        // "Reload client to apply" only helps when the client is
                        // already running but has not picked up a freshly
                        // deployed plugin: the registry key and plugins/ folder
                        // are both read once at client launch, so changing them
                        // afterwards has no effect until the UI is reloaded.
                        let client_running = lcu::client_running();
                        let effective = loop_state.effective(client_running);
                        let can_reload =
                            client_running && matches!(effective, configd::EffectiveState::NotInjected);
                        let _ = reload.set_enabled(can_reload);
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Drake");
}
