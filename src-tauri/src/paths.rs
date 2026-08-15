use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    let program_data = std::env::var("PROGRAMDATA").expect("PROGRAMDATA is always set on Windows");
    PathBuf::from(program_data).join("Drake")
}

pub fn our_loader_dir() -> PathBuf { data_dir().join("loader") }
pub fn our_core_dll() -> PathBuf { our_loader_dir().join("core.dll") }

/// The one directory under `%PROGRAMDATA%\Drake` (besides `loader\plugins`)
/// that the *unelevated* tray writes, and therefore the only place mutable
/// runtime state may live. `data_dir()` itself keeps the default ProgramData
/// ACL so that `loader\core.dll` -- executed inside whichever user's session
/// launches League -- cannot be replaced by a standard user.
pub fn state_dir() -> PathBuf { data_dir().join("state") }
pub fn settings_file() -> PathBuf { state_dir().join("settings.json") }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_dll_sits_inside_the_loader_dir() {
        assert_eq!(our_core_dll().parent().unwrap(), our_loader_dir());
    }

    #[test]
    fn loader_dir_sits_inside_the_data_dir() {
        assert_eq!(our_loader_dir().parent().unwrap(), data_dir());
    }

    #[test]
    fn settings_live_in_the_user_writable_state_dir_not_next_to_core_dll() {
        // The tray runs unelevated, so settings.json must sit in the one
        // subtree the installer grants Users write access to. It must NOT sit
        // directly in data_dir(), which is deliberately admin-only so that
        // loader\core.dll cannot be swapped by a standard user.
        assert_eq!(settings_file().parent().unwrap(), state_dir());
        assert_eq!(state_dir().parent().unwrap(), data_dir());
        assert_ne!(settings_file().parent().unwrap(), data_dir());
    }

    #[test]
    fn data_dir_is_named_drake() {
        assert_eq!(data_dir().file_name().unwrap(), "Drake");
    }
}
