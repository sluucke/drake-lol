#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if drake_lib::elevate::is_activation_invocation(&args) {
        if let Err(e) = drake_lib::elevate::perform_activation() {
            eprintln!("activation failed: {e}");
            std::process::exit(1);
        }
        return;
    }
    drake_lib::run()
}
