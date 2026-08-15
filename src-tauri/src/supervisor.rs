use crate::slot::SlotState;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mode {
    OwnLoader,
    Guest { host: String },
    Inactive { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    pub take_slot: bool,
    pub deploy_to: Option<PathBuf>,
    pub mode: Mode,
}

pub fn decide(slot: &SlotState, our_loader_dir: &Path) -> Plan {
    match slot {
        SlotState::Absent => Plan {
            take_slot: true,
            deploy_to: Some(our_loader_dir.to_path_buf()),
            mode: Mode::OwnLoader,
        },
        SlotState::Ours => Plan {
            take_slot: false,
            deploy_to: Some(our_loader_dir.to_path_buf()),
            mode: Mode::OwnLoader,
        },
        SlotState::Foreign { core_dll, host } => match core_dll.parent() {
            Some(dir) if !dir.as_os_str().is_empty() => Plan {
                take_slot: false,
                deploy_to: Some(dir.to_path_buf()),
                mode: Mode::Guest { host: host.clone() },
            },
            _ => Plan {
                take_slot: false,
                deploy_to: None,
                mode: Mode::Inactive {
                    reason: format!("could not locate the plugins folder for {}", core_dll.display()),
                },
            },
        },
        SlotState::Unparsable { raw } => Plan {
            take_slot: false,
            deploy_to: None,
            mode: Mode::Inactive {
                reason: format!("another program owns the injection slot: {raw}"),
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::slot::SlotState;
    use std::path::PathBuf;

    fn ours() -> PathBuf { PathBuf::from(r"C:\Drake\loader") }

    #[test]
    fn absent_slot_is_taken_and_deployed_to_our_loader() {
        let p = decide(&SlotState::Absent, &ours());
        assert!(p.take_slot);
        assert_eq!(p.deploy_to, Some(ours()));
        assert_eq!(p.mode, Mode::OwnLoader);
    }

    #[test]
    fn our_slot_only_redeploys() {
        let p = decide(&SlotState::Ours, &ours());
        assert!(!p.take_slot, "must not rewrite a key that is already correct");
        assert_eq!(p.deploy_to, Some(ours()));
        assert_eq!(p.mode, Mode::OwnLoader);
    }

    #[test]
    fn foreign_slot_is_never_taken_and_we_become_a_guest() {
        let core = PathBuf::from(r"C:\Other\Pengu Loader\core.dll");
        let s = SlotState::Foreign { core_dll: core, host: "Other".into() };
        let p = decide(&s, &ours());
        assert!(!p.take_slot, "taking a foreign slot would break the other product");
        assert_eq!(p.deploy_to, Some(PathBuf::from(r"C:\Other\Pengu Loader")));
        assert_eq!(p.mode, Mode::Guest { host: "Other".into() });
    }

    #[test]
    fn unparsable_slot_is_left_completely_alone() {
        let s = SlotState::Unparsable { raw: "???".into() };
        let p = decide(&s, &ours());
        assert!(!p.take_slot);
        assert_eq!(p.deploy_to, None);
        match p.mode {
            Mode::Inactive { reason } => assert!(reason.contains("???")),
            other => panic!("expected Inactive, got {other:?}"),
        }
    }

    #[test]
    fn a_foreign_core_at_the_filesystem_root_is_inactive_not_a_crash() {
        let s = SlotState::Foreign { core_dll: PathBuf::from("core.dll"), host: "x".into() };
        let p = decide(&s, &ours());
        assert_eq!(p.deploy_to, None);
        assert!(matches!(p.mode, Mode::Inactive { .. }));
    }

    #[test]
    fn handoff_in_both_directions_settles_without_fighting() {
        // Foreign loader starts: we yield.
        let foreign = SlotState::Foreign {
            core_dll: PathBuf::from(r"C:\Other\Pengu Loader\core.dll"),
            host: "Other".into(),
        };
        assert!(!decide(&foreign, &ours()).take_slot);

        // Foreign loader quits: the key disappears and we take over.
        assert!(decide(&SlotState::Absent, &ours()).take_slot);
    }
}
