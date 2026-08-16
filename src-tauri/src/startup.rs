//! "Start with Windows", via the per-user Run key.
//!
//! `HKEY_CURRENT_USER` rather than `HKEY_LOCAL_MACHINE` or a scheduled task,
//! for two reasons that both matter here. It needs no elevation, so the user
//! can toggle it from the tray without a UAC prompt -- an option that costs a
//! UAC prompt to flip is not really an option. And it is per-user: Drake is a
//! tray app that belongs to whoever is logged in, so on a shared machine it
//! must not start for someone who never installed it.
//!
//! Note this is the *only* registry key Drake writes unelevated. The injection
//! slot lives in HKLM and goes through `elevate`; the two must not be confused.

use std::path::Path;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
use winreg::RegKey;

pub const RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const VALUE_NAME: &str = "Drake";

#[derive(Debug, thiserror::Error)]
pub enum StartupError {
    #[error("could not open {RUN_KEY_PATH}: {0}")]
    Open(std::io::Error),
    #[error("could not update the start-with-Windows entry: {0}")]
    Write(std::io::Error),
}

/// Behind a trait so the reconcile logic is testable without writing to the
/// real `HKCU` of whoever is running the test suite.
pub trait RunKeyAccess {
    fn read(&self) -> Result<Option<String>, StartupError>;
    fn write(&self, value: &str) -> Result<(), StartupError>;
    fn delete(&self) -> Result<(), StartupError>;
}

/// Quoted, always. An unquoted `C:\Program Files\Drake\Drake.exe` is read by
/// Windows as the command `C:\Program` with arguments, so Drake would simply
/// never start at login -- with no error anywhere to explain why.
pub fn command_for(exe: &Path) -> String {
    format!("\"{}\"", exe.display())
}

/// The real one. Mirrors `slot::WindowsRegistry`, but on `HKCU` and with no
/// elevation involved.
pub struct WindowsRunKey;

impl RunKeyAccess for WindowsRunKey {
    fn read(&self) -> Result<Option<String>, StartupError> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        match hkcu.open_subkey_with_flags(RUN_KEY_PATH, KEY_READ) {
            Ok(key) => match key.get_value::<String, _>(VALUE_NAME) {
                Ok(v) => Ok(Some(v)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(StartupError::Open(e)),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(StartupError::Open(e)),
        }
    }

    fn write(&self, value: &str) -> Result<(), StartupError> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey_with_flags(RUN_KEY_PATH, KEY_WRITE)
            .map_err(StartupError::Write)?;
        key.set_value(VALUE_NAME, &value.to_string()).map_err(StartupError::Write)
    }

    fn delete(&self) -> Result<(), StartupError> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        match hkcu.open_subkey_with_flags(RUN_KEY_PATH, KEY_WRITE) {
            Ok(key) => match key.delete_value(VALUE_NAME) {
                Ok(()) => Ok(()),
                // Already gone is the outcome we wanted.
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(StartupError::Write(e)),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(StartupError::Open(e)),
        }
    }
}

/// Makes the Run key match `want`, and does nothing when it already does.
///
/// Idempotent because it is called from the supervisor's 2-second tick, in the
/// same "maintain the invariant" style as the slot and the deployed plugin:
/// the desired state is re-asserted continuously rather than only at the
/// moment the user clicks. That is also what repairs a stale entry after Drake
/// is reinstalled somewhere else.
pub fn reconcile(
    key: &impl RunKeyAccess,
    exe: &Path,
    want: bool,
) -> Result<(), StartupError> {
    let current = key.read()?;
    let desired = command_for(exe);
    match (want, current) {
        (true, Some(v)) if v == desired => Ok(()),
        (true, _) => key.write(&desired),
        (false, Some(_)) => key.delete(),
        (false, None) => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::path::PathBuf;

    /// Records every mutation so a test can prove the reconcile did *nothing*,
    /// rather than trusting that it wrote the same value back.
    struct FakeRunKey {
        value: RefCell<Option<String>>,
        writes: RefCell<Vec<String>>,
        deletes: RefCell<usize>,
    }

    impl FakeRunKey {
        fn holding(value: Option<&str>) -> Self {
            FakeRunKey {
                value: RefCell::new(value.map(str::to_string)),
                writes: RefCell::new(Vec::new()),
                deletes: RefCell::new(0),
            }
        }
    }

    impl RunKeyAccess for FakeRunKey {
        fn read(&self) -> Result<Option<String>, StartupError> {
            Ok(self.value.borrow().clone())
        }
        fn write(&self, value: &str) -> Result<(), StartupError> {
            self.writes.borrow_mut().push(value.to_string());
            *self.value.borrow_mut() = Some(value.to_string());
            Ok(())
        }
        fn delete(&self) -> Result<(), StartupError> {
            *self.deletes.borrow_mut() += 1;
            *self.value.borrow_mut() = None;
            Ok(())
        }
    }

    fn exe() -> PathBuf {
        PathBuf::from(r"C:\Program Files\Drake\Drake.exe")
    }

    #[test]
    fn the_command_quotes_the_path_so_program_files_does_not_split_it() {
        // Without quotes Windows would try to run "C:\Program" with the rest
        // as arguments, and Drake would silently never start at login.
        assert_eq!(command_for(&exe()), r#""C:\Program Files\Drake\Drake.exe""#);
    }

    #[test]
    fn enabling_writes_the_run_value_when_it_is_absent() {
        let key = FakeRunKey::holding(None);

        reconcile(&key, &exe(), true).unwrap();

        assert_eq!(key.writes.borrow().as_slice(), &[command_for(&exe())]);
    }

    #[test]
    fn enabling_writes_nothing_when_the_value_is_already_correct() {
        // This runs on every 2s tick, so a needless write every tick would be
        // a steady stream of pointless registry churn.
        let key = FakeRunKey::holding(Some(&command_for(&exe())));

        reconcile(&key, &exe(), true).unwrap();

        assert!(key.writes.borrow().is_empty(), "must not rewrite an identical value");
        assert_eq!(*key.deletes.borrow(), 0);
    }

    #[test]
    fn enabling_repairs_a_value_that_points_somewhere_else() {
        // Drake was reinstalled to a different directory: the stale entry
        // would launch an exe that no longer exists.
        let key = FakeRunKey::holding(Some(r#""C:\Old\Drake.exe""#));

        reconcile(&key, &exe(), true).unwrap();

        assert_eq!(key.writes.borrow().as_slice(), &[command_for(&exe())]);
    }

    #[test]
    fn disabling_removes_the_run_value() {
        let key = FakeRunKey::holding(Some(&command_for(&exe())));

        reconcile(&key, &exe(), false).unwrap();

        assert_eq!(*key.deletes.borrow(), 1);
        assert_eq!(*key.value.borrow(), None);
    }

    #[test]
    fn disabling_does_nothing_when_the_value_is_already_gone() {
        let key = FakeRunKey::holding(None);

        reconcile(&key, &exe(), false).unwrap();

        assert_eq!(*key.deletes.borrow(), 0, "must not delete what is not there");
    }
}
