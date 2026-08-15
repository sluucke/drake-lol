use std::process::Command;

pub const TASK_NAME: &str = "Drake Slot Activation";
pub const ACTIVATION_FLAG: &str = "--activate-slot";

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

/// Runs elevated, from the scheduled task only. Writes the fixed value.
pub fn perform_activation() -> Result<(), Box<dyn std::error::Error>> {
    use crate::{paths, slot, slot::RegistryAccess};
    let value = slot::debugger_value(&paths::our_core_dll());
    slot::WindowsRegistry.write_debugger(&value)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
