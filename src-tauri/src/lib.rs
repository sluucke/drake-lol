pub mod deploy;
pub mod paths;
pub mod slot;
pub mod strings;
pub mod supervisor;
pub mod vendored;

use tauri::tray::TrayIconBuilder;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(strings::TRAY_TOOLTIP)
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Drake");
}
