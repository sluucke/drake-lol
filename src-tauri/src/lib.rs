pub mod paths;
pub mod strings;

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
