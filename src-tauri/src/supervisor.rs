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
pub fn tick<R: RegistryAccess, C: elevate::SlotClaimer>(
    reg: &R,
    claimer: &C,
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

    // A failed claim must NOT skip the deployment below. The two are
    // independent: claiming decides *whether the client loads any loader at
    // all*, deploying decides *what that loader finds when it does*. Bailing
    // out here would mean a machine whose slot claim fails (a missing task, a
    // denied trigger) also ends up with no plugin on disk -- so the moment the
    // claim later succeeds, the client would launch into an empty plugins
    // folder and the next tick would be needed to fix it. Recorded and
    // reported after the deploy instead.
    let claim_error = if plan.take_slot {
        // Fire-and-forget: the elevated task re-verifies the slot itself
        // before writing (see `elevate::activate`), because it may run well
        // after the read above.
        claimer
            .claim()
            .err()
            .map(|e| format!("cannot claim the injection slot: {e}"))
    } else {
        None
    };

    if let Some(loader) = &plan.deploy_to {
        if let Err(e) = deploy::ensure_plugin(loader, index_js) {
            return Mode::Inactive { reason: format!("cannot install the plugin: {e}") };
        }
        if let Err(e) = configd::write_plugin_config(&deploy::plugin_dir(loader), cfg) {
            return Mode::Inactive { reason: format!("cannot write the plugin config: {e}") };
        }
    }

    if let Some(reason) = claim_error {
        return Mode::Inactive { reason };
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

    /// Counts claim attempts so the take-slot branch can be exercised without
    /// a scheduled task existing on the machine running the tests.
    struct FakeClaimer {
        calls: std::cell::Cell<usize>,
        fail: bool,
    }

    impl FakeClaimer {
        fn ok() -> Self { FakeClaimer { calls: std::cell::Cell::new(0), fail: false } }
        fn failing() -> Self { FakeClaimer { calls: std::cell::Cell::new(0), fail: true } }
    }

    impl crate::elevate::SlotClaimer for FakeClaimer {
        fn claim(&self) -> Result<(), crate::elevate::ElevateError> {
            self.calls.set(self.calls.get() + 1);
            if self.fail {
                Err(crate::elevate::ElevateError::TaskMissing)
            } else {
                Ok(())
            }
        }
    }

    fn a_config() -> crate::configd::PluginConfig {
        crate::configd::PluginConfig { token: "t".into(), port: 1, settings: Default::default() }
    }

    #[test]
    fn tick_claims_the_slot_when_it_is_free_and_deploys_to_our_own_loader() {
        let tmp = tempfile::tempdir().unwrap();
        let our_loader = tmp.path().join("Drake").join("loader");
        let reg = FakeReg::holding(None);
        let claimer = FakeClaimer::ok();

        let mode = tick(
            &reg,
            &claimer,
            &our_loader.join("core.dll"),
            &our_loader,
            "console.log(1)",
            &a_config(),
        );

        assert_eq!(mode, Mode::OwnLoader);
        assert_eq!(claimer.calls.get(), 1, "a free slot must trigger the elevated claim");
        // The unelevated tray never writes HKLM itself -- only the task does.
        assert!(reg.writes.borrow().is_empty());
        assert!(crate::deploy::plugin_dir(&our_loader).join("index.js").is_file());
    }

    #[test]
    fn tick_reports_the_reason_when_the_claim_cannot_be_made() {
        let tmp = tempfile::tempdir().unwrap();
        let our_loader = tmp.path().join("Drake").join("loader");
        let reg = FakeReg::holding(None);
        let claimer = FakeClaimer::failing();

        let mode = tick(
            &reg,
            &claimer,
            &our_loader.join("core.dll"),
            &our_loader,
            "console.log(1)",
            &a_config(),
        );

        match mode {
            Mode::Inactive { reason } => {
                assert_eq!(
                    reason,
                    "cannot claim the injection slot: the activation task is not installed"
                );
            }
            other => panic!("expected Inactive, got {other:?}"),
        }
    }

    #[test]
    fn tick_still_deploys_the_plugin_when_the_claim_fails() {
        // Measured on a real install: the installer's scheduled task was not
        // runnable by the unelevated tray, so every claim failed -- and the
        // old early return meant the plugins folder stayed empty too. Claiming
        // and deploying are independent; a machine that cannot claim today
        // must still have the plugin in place for the moment it can.
        let tmp = tempfile::tempdir().unwrap();
        let our_loader = tmp.path().join("Drake").join("loader");
        let reg = FakeReg::holding(None);
        let claimer = FakeClaimer::failing();

        let mode = tick(
            &reg,
            &claimer,
            &our_loader.join("core.dll"),
            &our_loader,
            "console.log(1)",
            &a_config(),
        );

        assert!(
            matches!(mode, Mode::Inactive { .. }),
            "the claim failure must still be reported, got {mode:?}"
        );
        let plugin = crate::deploy::plugin_dir(&our_loader);
        assert_eq!(
            std::fs::read_to_string(plugin.join("index.js")).unwrap(),
            "console.log(1)"
        );
        assert!(plugin.join("config.json").is_file(), "config.json must be written too");
    }

    #[test]
    fn tick_does_not_claim_a_slot_that_belongs_to_someone_else() {
        let tmp = tempfile::tempdir().unwrap();
        let foreign_loader = tmp.path().join("Other").join("Pengu Loader");
        std::fs::create_dir_all(&foreign_loader).unwrap();
        let reg = FakeReg::holding(Some(crate::slot::debugger_value(
            &foreign_loader.join("core.dll"),
        )));
        let claimer = FakeClaimer::ok();

        tick(&reg, &claimer, &ours().join("core.dll"), &ours(), "x", &a_config());

        assert_eq!(claimer.calls.get(), 0, "must never trigger a claim over a foreign slot");
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

        let mode = tick(
            &reg,
            &FakeClaimer::ok(),
            &ours().join("core.dll"),
            &ours(),
            "console.log(1)",
            &cfg,
        );

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
            // Pinned exactly: the reason string is the text the tray shows.
            // It must quote the value verbatim and say nothing about who put
            // it there -- unparsable means we do not know.
            Mode::Inactive { reason } => assert_eq!(
                reason,
                "the injection slot holds a value Drake could not parse: ???"
            ),
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
