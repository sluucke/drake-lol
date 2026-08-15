use std::path::Path;
use std::process::Command;

pub const TASK_NAME: &str = "Drake Slot Activation";
pub const ACTIVATION_FLAG: &str = "--activate-slot";
pub const DEACTIVATION_FLAG: &str = "--deactivate-slot";

#[derive(Debug, thiserror::Error)]
pub enum ElevateError {
    #[error("could not run schtasks: {0}")]
    Spawn(#[from] std::io::Error),
    #[error("the activation task is not installed")]
    TaskMissing,
    #[error("the activation task failed with status {0}")]
    TaskFailed(i32),
}

pub fn is_activation_invocation(args: &[String]) -> bool {
    args.iter().any(|a| a == ACTIVATION_FLAG)
}

pub fn task_exists() -> bool {
    Command::new("schtasks")
        .args(["/Query", "/TN", TASK_NAME])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn run_task() -> Result<(), ElevateError> {
    if !task_exists() {
        return Err(ElevateError::TaskMissing);
    }
    let status = Command::new("schtasks")
        .args(["/Run", "/TN", TASK_NAME])
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(ElevateError::TaskFailed(status.code().unwrap_or(-1)))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActivationOutcome {
    /// The slot was free (or already ours) and now names our core.dll.
    Wrote,
    /// Somebody else's value was in the slot. Left exactly as it was.
    Declined,
}

/// Claims the injection slot, but *only* when it is free or already ours.
///
/// This runs as SYSTEM, so it is the last line of defence for the product's
/// central invariant: never take a slot that belongs to someone else. Two
/// concrete reasons it cannot simply write:
///
/// - `schtasks /Run` is fire-and-forget. The supervisor observed `Absent`
///   hundreds of milliseconds (or seconds) before this code runs; a competing
///   loader may have claimed the slot in between.
/// - The design deliberately lets an unelevated process trigger the task, so
///   *any* local process can pull this trigger at any moment.
///
/// Re-reading here costs nothing (we are elevated) and closes both.
pub fn activate(
    registry: &impl crate::slot::RegistryAccess,
    our_core: &Path,
) -> Result<ActivationOutcome, crate::slot::SlotError> {
    use crate::slot::SlotState;
    let raw = registry.read_debugger()?;
    match crate::slot::classify(raw.as_deref(), our_core) {
        SlotState::Absent | SlotState::Ours => {
            registry.write_debugger(&crate::slot::debugger_value(our_core))?;
            Ok(ActivationOutcome::Wrote)
        }
        // Foreign: someone else owns the mechanism. Unparsable: we do not
        // understand the value, so we cannot know it is free. Both are
        // no-ops that succeed -- declining is the correct outcome, not a
        // failure to report.
        SlotState::Foreign { .. } | SlotState::Unparsable { .. } => Ok(ActivationOutcome::Declined),
    }
}

/// The one thing the supervisor asks of the elevated path: claim the slot.
/// Behind a trait so `supervisor::tick`'s take-slot branch can be tested
/// without a scheduled task existing on the machine running the tests.
pub trait SlotClaimer {
    fn claim(&self) -> Result<(), ElevateError>;
}

/// The real one: triggers the scheduled task created by the installer.
pub struct ScheduledTaskClaimer;

impl SlotClaimer for ScheduledTaskClaimer {
    fn claim(&self) -> Result<(), ElevateError> {
        run_task()
    }
}

/// Runs elevated, from the scheduled task only. Writes the fixed value.
pub fn perform_activation() -> Result<(), Box<dyn std::error::Error>> {
    use crate::{paths, slot};
    activate(&slot::WindowsRegistry, &paths::our_core_dll())?;
    Ok(())
}

pub fn is_deactivation_invocation(args: &[String]) -> bool {
    args.iter().any(|a| a == DEACTIVATION_FLAG)
}

/// Clears the Debugger value only if it still points at our own core.dll.
/// Absent, Foreign, and Unparsable values are left untouched -- deleting
/// another product's value on our way out would be exactly the harm this
/// design exists to avoid.
pub fn deactivate(
    registry: &impl crate::slot::RegistryAccess,
    our_core: &Path,
) -> Result<(), crate::slot::SlotError> {
    let raw = registry.read_debugger()?;
    if crate::slot::classify(raw.as_deref(), our_core) == crate::slot::SlotState::Ours {
        registry.delete_debugger()?;
    }
    Ok(())
}

/// Runs elevated, from the uninstaller only.
pub fn perform_deactivation() -> Result<(), Box<dyn std::error::Error>> {
    use crate::{paths, slot};
    deactivate(&slot::WindowsRegistry, &paths::our_core_dll())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::slot::{RegistryAccess, SlotError};
    use std::cell::{Cell, RefCell};
    use std::path::PathBuf;

    #[test]
    fn activation_flag_is_recognised() {
        assert!(is_activation_invocation(&["Drake.exe".into(), "--activate-slot".into()]));
    }

    #[test]
    fn normal_launch_is_not_an_activation() {
        assert!(!is_activation_invocation(&["Drake.exe".into()]));
    }

    #[test]
    fn task_name_is_stable() {
        // The installer hook and the runtime must agree on this exact string.
        assert_eq!(TASK_NAME, "Drake Slot Activation");
    }

    #[test]
    fn deactivation_flag_is_recognised() {
        assert!(is_deactivation_invocation(&["Drake.exe".into(), "--deactivate-slot".into()]));
    }

    #[test]
    fn normal_launch_is_not_a_deactivation() {
        assert!(!is_deactivation_invocation(&["Drake.exe".into()]));
    }

    /// An in-memory stand-in for the registry, so the deactivation decision
    /// can be tested without touching HKLM.
    struct FakeRegistry {
        value: RefCell<Option<String>>,
        deleted: Cell<bool>,
        writes: RefCell<Vec<String>>,
    }

    impl FakeRegistry {
        fn holding(value: &str) -> Self {
            FakeRegistry {
                value: RefCell::new(Some(value.to_string())),
                deleted: Cell::new(false),
                writes: RefCell::new(Vec::new()),
            }
        }
        fn empty() -> Self {
            FakeRegistry {
                value: RefCell::new(None),
                deleted: Cell::new(false),
                writes: RefCell::new(Vec::new()),
            }
        }
    }

    impl RegistryAccess for FakeRegistry {
        fn read_debugger(&self) -> Result<Option<String>, SlotError> {
            Ok(self.value.borrow().clone())
        }
        fn write_debugger(&self, value: &str) -> Result<(), SlotError> {
            self.writes.borrow_mut().push(value.to_string());
            *self.value.borrow_mut() = Some(value.to_string());
            Ok(())
        }
        fn delete_debugger(&self) -> Result<(), SlotError> {
            self.deleted.set(true);
            *self.value.borrow_mut() = None;
            Ok(())
        }
    }

    fn ours() -> PathBuf { PathBuf::from(r"C:\ProgramData\Drake\loader\core.dll") }

    // --- activate(): the elevated writer must honour the same invariant ---

    #[test]
    fn activate_writes_when_the_slot_is_absent() {
        let registry = FakeRegistry::empty();
        assert_eq!(activate(&registry, &ours()).unwrap(), ActivationOutcome::Wrote);
        assert_eq!(
            registry.writes.borrow().as_slice(),
            &[crate::slot::debugger_value(&ours())]
        );
    }

    #[test]
    fn activate_rewrites_when_the_slot_is_already_ours() {
        // Idempotent: writing the identical value we already hold is harmless
        // and keeps the elevated path a single, unconditional code path for
        // the two states where writing is legitimate.
        let registry = FakeRegistry::holding(&crate::slot::debugger_value(&ours()));
        assert_eq!(activate(&registry, &ours()).unwrap(), ActivationOutcome::Wrote);
        assert_eq!(
            registry.writes.borrow().as_slice(),
            &[crate::slot::debugger_value(&ours())]
        );
    }

    #[test]
    fn activate_never_overwrites_a_foreign_slot() {
        // The TOCTOU case: `tick` saw Absent, fired the task, and a competing
        // loader claimed the slot before this ran. Overwriting here would
        // silently break a stranger's software.
        let theirs = crate::slot::debugger_value(&PathBuf::from(r"C:\Other\Pengu Loader\core.dll"));
        let registry = FakeRegistry::holding(&theirs);
        assert_eq!(activate(&registry, &ours()).unwrap(), ActivationOutcome::Declined);
        assert!(
            registry.writes.borrow().is_empty(),
            "must never take a slot that belongs to someone else, but wrote: {:?}",
            registry.writes.borrow()
        );
        assert_eq!(registry.value.borrow().as_deref(), Some(theirs.as_str()));
        assert!(!registry.deleted.get());
    }

    #[test]
    fn activate_leaves_an_unparsable_slot_alone() {
        let registry = FakeRegistry::holding("something we do not understand");
        assert_eq!(activate(&registry, &ours()).unwrap(), ActivationOutcome::Declined);
        assert!(registry.writes.borrow().is_empty());
        assert_eq!(
            registry.value.borrow().as_deref(),
            Some("something we do not understand")
        );
    }

    #[test]
    fn deactivate_deletes_when_the_slot_is_ours() {
        let raw = crate::slot::debugger_value(&ours());
        let registry = FakeRegistry::holding(&raw);
        deactivate(&registry, &ours()).unwrap();
        assert!(registry.deleted.get(), "must clear our own value on the way out");
    }

    #[test]
    fn deactivate_leaves_a_foreign_value_untouched() {
        let raw = crate::slot::debugger_value(&PathBuf::from(r"C:\Other\Pengu Loader\core.dll"));
        let registry = FakeRegistry::holding(&raw);
        deactivate(&registry, &ours()).unwrap();
        assert!(!registry.deleted.get(), "must never delete another product's value");
    }

    #[test]
    fn deactivate_leaves_an_absent_value_untouched() {
        let registry = FakeRegistry::empty();
        deactivate(&registry, &ours()).unwrap();
        assert!(!registry.deleted.get());
    }

    #[test]
    fn deactivate_leaves_an_unparsable_value_untouched() {
        let registry = FakeRegistry::holding("something we do not understand");
        deactivate(&registry, &ours()).unwrap();
        assert!(!registry.deleted.get());
    }
}
