use crate::slot::SlotState;
use crate::{configd, deploy, elevate, slot::{self, RegistryAccess}};
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
                reason: format!("the injection slot holds a value Drake could not parse: {raw}"),
            },
        },
    }
}

/// One iteration of the invariant loop. Idempotent by construction: it reads
/// the world, decides, applies, and never carries partial state forward.
pub fn tick<R: RegistryAccess>(
    reg: &R,
    our_core: &Path,
    our_loader_dir: &Path,
    index_js: &str,
    cfg: &configd::PluginConfig,
) -> Mode {
    let raw = match reg.read_debugger() {
        Ok(v) => v,
        Err(e) => return Mode::Inactive { reason: format!("cannot read the injection slot: {e}") },
    };

    let plan = decide(&slot::classify(raw.as_deref(), our_core), our_loader_dir);

    if plan.take_slot {
        if let Err(e) = elevate::run_task() {
            return Mode::Inactive { reason: format!("cannot claim the injection slot: {e}") };
        }
    }

    if let Some(loader) = &plan.deploy_to {
        if let Err(e) = deploy::ensure_plugin(loader, index_js) {
            return Mode::Inactive { reason: format!("cannot install the plugin: {e}") };
        }
        if let Err(e) = configd::write_plugin_config(&deploy::plugin_dir(loader), cfg) {
            return Mode::Inactive { reason: format!("cannot write the plugin config: {e}") };
        }
    }

    plan.mode
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::slot::SlotState;
    use std::path::PathBuf;

    fn ours() -> PathBuf { PathBuf::from(r"C:\Drake\loader") }

    /// Records every value passed to `write_debugger` (and whether
    /// `delete_debugger` was called) so tests can assert the registry was
    /// never touched, rather than just trusting a no-op stub to have been
    /// a no-op.
    struct FakeReg {
        initial: Option<String>,
        writes: std::cell::RefCell<Vec<String>>,
    }

    impl FakeReg {
        fn holding(v: Option<String>) -> Self {
            FakeReg { initial: v, writes: std::cell::RefCell::new(Vec::new()) }
        }
    }

    impl crate::slot::RegistryAccess for FakeReg {
        fn read_debugger(&self) -> Result<Option<String>, crate::slot::SlotError> {
            Ok(self.initial.clone())
        }
        fn write_debugger(&self, v: &str) -> Result<(), crate::slot::SlotError> {
            self.writes.borrow_mut().push(v.to_string());
            Ok(())
        }
        fn delete_debugger(&self) -> Result<(), crate::slot::SlotError> { Ok(()) }
    }

    #[test]
    fn tick_deploys_into_a_foreign_loader_without_touching_the_registry() {
        let tmp = tempfile::tempdir().unwrap();
        let foreign_loader = tmp.path().join("Other").join("Pengu Loader");
        std::fs::create_dir_all(&foreign_loader).unwrap();
        let core = foreign_loader.join("core.dll");

        let reg = FakeReg::holding(Some(crate::slot::debugger_value(&core)));
        let cfg = crate::configd::PluginConfig {
            token: "t".into(),
            port: 1,
            settings: Default::default(),
        };

        let mode = tick(&reg, &ours().join("core.dll"), &ours(), "console.log(1)", &cfg);

        assert_eq!(mode, Mode::Guest { host: "Other".into() });
        assert!(
            reg.writes.borrow().is_empty(),
            "must never write to a foreign loader's registry slot, but wrote: {:?}",
            reg.writes.borrow()
        );
        assert!(crate::deploy::plugin_dir(&foreign_loader).join("index.js").is_file());
        assert!(crate::deploy::plugin_dir(&foreign_loader).join("config.json").is_file());
    }

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
            Mode::Inactive { reason } => {
                assert!(reason.contains("???"));
                // Unparsable means we don't know what happened; never assert ownership by another program.
                assert!(!reason.contains("another program"), "must not infer causes from unparsable values");
            }
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
        // decide() is stateless: each call is independent.
        // This test documents the intended behavior sequence, not an actual stateful transition.
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
