use std::path::{Path, PathBuf};
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WRITE};
use winreg::RegKey;

pub const IFEO_KEY: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\LeagueClientUx.exe";
pub const DEBUGGER_VALUE: &str = "Debugger";

/// The folder name upstream Pengu Loader installs into. When a core.dll sits
/// directly inside it, the meaningful product name is one level up.
const GENERIC_LOADER_FOLDER: &str = "pengu loader";

#[derive(Debug, thiserror::Error)]
pub enum SlotError {
    #[error("registry access failed: {0}")]
    Registry(#[from] std::io::Error),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SlotState {
    Absent,
    Ours,
    Foreign { core_dll: PathBuf, host: String },
    Unparsable { raw: String },
}

pub trait RegistryAccess {
    fn read_debugger(&self) -> Result<Option<String>, SlotError>;
    fn write_debugger(&self, value: &str) -> Result<(), SlotError>;
}

pub struct WindowsRegistry;

impl RegistryAccess for WindowsRegistry {
    fn read_debugger(&self) -> Result<Option<String>, SlotError> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        match hklm.open_subkey_with_flags(IFEO_KEY, KEY_READ) {
            Ok(key) => match key.get_value::<String, _>(DEBUGGER_VALUE) {
                Ok(v) => Ok(Some(v)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(SlotError::Registry(e)),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(SlotError::Registry(e)),
        }
    }

    fn write_debugger(&self, value: &str) -> Result<(), SlotError> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let (key, _) = hklm.create_subkey_with_flags(IFEO_KEY, KEY_WRITE)?;
        key.set_value(DEBUGGER_VALUE, &value.to_string())?;
        Ok(())
    }
}

pub fn debugger_value(core_dll: &Path) -> String {
    format!("rundll32 \"{}\", #6000", core_dll.display())
}

pub fn parse_core_path(raw: &str) -> Option<PathBuf> {
    let start = raw.find('"')? + 1;
    let end = raw[start..].find('"')? + start;
    let candidate = &raw[start..end];
    if candidate.is_empty() { None } else { Some(PathBuf::from(candidate)) }
}

pub fn host_label(core_dll: &Path) -> String {
    let parent = core_dll.parent();
    let parent_name = parent
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string());

    match parent_name {
        Some(name) if name.to_lowercase() == GENERIC_LOADER_FOLDER => parent
            .and_then(|p| p.parent())
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or(name),
        Some(name) => name,
        None => "unknown".to_string(),
    }
}

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

pub fn classify(raw: Option<&str>, our_core: &Path) -> SlotState {
    let Some(raw) = raw else { return SlotState::Absent };
    if raw.trim().is_empty() { return SlotState::Absent; }

    match parse_core_path(raw) {
        None => SlotState::Unparsable { raw: raw.to_string() },
        Some(p) if same_path(&p, our_core) => SlotState::Ours,
        Some(p) => SlotState::Foreign { host: host_label(&p), core_dll: p },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn ours() -> PathBuf { PathBuf::from(r"C:\Users\x\AppData\Local\Drake\loader\core.dll") }

    #[test]
    fn parses_a_quoted_path_with_spaces() {
        let raw = r#"rundll32 "C:\Users\x\AppData\Local\Rose\Pengu Loader\core.dll", #6000"#;
        assert_eq!(
            parse_core_path(raw).unwrap(),
            PathBuf::from(r"C:\Users\x\AppData\Local\Rose\Pengu Loader\core.dll")
        );
    }

    #[test]
    fn absent_key_is_absent() {
        assert_eq!(classify(None, &ours()), SlotState::Absent);
    }

    #[test]
    fn our_own_core_is_recognised_case_insensitively() {
        let raw = r#"rundll32 "C:\USERS\X\APPDATA\LOCAL\DRAKE\LOADER\CORE.DLL", #6000"#;
        assert_eq!(classify(Some(raw), &ours()), SlotState::Ours);
    }

    #[test]
    fn another_core_is_foreign_and_labelled_by_its_product_folder() {
        let raw = r#"rundll32 "C:\Users\x\AppData\Local\Rose\Pengu Loader\core.dll", #6000"#;
        match classify(Some(raw), &ours()) {
            // The immediate parent is the generic upstream folder name, so the
            // label climbs one level to the product folder. This keys on Pengu
            // Loader's own convention, never on a specific third-party product.
            SlotState::Foreign { host, .. } => assert_eq!(host, "Rose"),
            other => panic!("expected Foreign, got {other:?}"),
        }
    }

    #[test]
    fn a_loader_not_using_the_generic_folder_name_is_labelled_by_its_own_folder() {
        let raw = r#"rundll32 "C:\Tools\SomeLoader\core.dll", #6000"#;
        match classify(Some(raw), &ours()) {
            SlotState::Foreign { host, .. } => assert_eq!(host, "SomeLoader"),
            other => panic!("expected Foreign, got {other:?}"),
        }
    }

    #[test]
    fn garbage_is_unparsable_and_never_treated_as_free() {
        // Critical: an unrecognised value must never be overwritten.
        match classify(Some("something we do not understand"), &ours()) {
            SlotState::Unparsable { .. } => {}
            other => panic!("expected Unparsable, got {other:?}"),
        }
    }

    #[test]
    fn debugger_value_round_trips_through_the_parser() {
        let v = debugger_value(&ours());
        assert_eq!(parse_core_path(&v).unwrap(), ours());
    }
}
