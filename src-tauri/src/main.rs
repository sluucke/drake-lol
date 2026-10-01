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
    if drake_lib::elevate::is_deactivation_invocation(&args) {
        if let Err(e) = drake_lib::elevate::perform_deactivation() {
            eprintln!("deactivation failed: {e}");
            std::process::exit(1);
        }
        return;
    }
    let acquired = if drake_lib::admin::is_elevated_relaunch(&args) {
        drake_lib::single_instance::acquire_waiting_or_alert(std::time::Duration::from_secs(15))
    } else {
        drake_lib::single_instance::acquire_or_alert()
    };
    if !acquired {
        std::process::exit(0);
    }
    drake_lib::run()
}
