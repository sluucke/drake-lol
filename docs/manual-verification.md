# Manual verification checklist

The state machine (`supervisor::decide`, `supervisor::tick`) and the check-in
server (`configd`) are unit-tested in isolation, but nothing in the automated
suite proves the plugin actually loads inside a real League client, that the
elevated scheduled task can write the registry, or that the tray reacts to a
live client the way a person watching it would expect. This checklist covers
what cannot be simulated. Run it in full before any release, on Windows with
League of Legends installed.

Record the date and the result (pass/fail, with notes on failure) of each
step below.

Two things worth keeping in mind while running this:

- **Runtime data lives under `%PROGRAMDATA%\Drake\`, not `%LOCALAPPDATA%`.**
  The slot-activation step (writing the IFEO `Debugger` value) runs elevated,
  as SYSTEM, via the scheduled task (`elevate::run_task` / `perform_activation`).
  `%LOCALAPPDATA%` for the SYSTEM account resolves to the systemprofile's
  own profile, not the interactively logged-in user's -- so anything keyed
  off `%LOCALAPPDATA%` would silently point at the wrong place when written
  from the elevated task. `%PROGRAMDATA%` is machine-wide and resolves the
  same way regardless of which account touches it, which is why `paths.rs`
  uses it for everything Drake writes at runtime (`loader\core.dll`,
  `settings.json`).
- **"Reload client to apply" is only enabled when it can do something.**
  Changing the registry key or dropping a plugin file into `plugins\` has no
  effect on an *already running* client: the Debugger key is read once at
  client launch, and the loader enumerates `plugins\` once at its own
  startup. The menu item is enabled only when `lcu::client_running()` is
  true AND `configd::EffectiveState` is `NotInjected` (the client is up but
  no check-in arrived within the 20-second tolerance window). Clicking it
  calls `lcu::restart_ux()`, which reloads only the client's UI -- not the
  whole client, not the game -- so the freshly deployed plugin gets
  enumerated. The supervisor loop itself never calls `restart_ux`; it is
  always an explicit click.

## A. Taking a free slot

1. Ensure no loader is active: the IFEO key
   (`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution
   Options\LeagueClientUx.exe`, value `Debugger`) must be absent.
2. Install and start Drake. Tray tooltip must read "Own loader active".
3. Verify the key now points at `%PROGRAMDATA%\Drake\loader\core.dll`.
4. Start the League client. Open devtools and confirm `[Drake] check-in ok`
   (or the plugin's equivalent check-in log line) appears.
5. Confirm the tray's "Reload client to apply" item is disabled once the
   check-in has landed (client running + `Injected`).

## B. Guest mode

1. With Drake running, activate any other Pengu-based loader (so its
   `core.dll` claims the IFEO key instead).
2. Within one tick (2 seconds), the tray tooltip must read "Running as a
   guest in <name>".
3. Verify the IFEO key still points at the OTHER loader -- we must not have
   overwritten it. This is the single most important assertion here.
4. Verify `<other loader>\plugins\Drake\index.js` and
   `<other loader>\plugins\Drake\config.json` exist.
5. Restart the client UX (via the other loader, or manually) and confirm the
   check-in still arrives, i.e. our plugin runs fine as a guest inside
   another loader.

## C. Handoff in both directions

1. From state B, quit the other loader. The key should disappear and Drake
   should retake it within one tick, tray back to "Own loader active".
2. Start the other loader again. Drake must yield without fighting it.
   Watch for several ticks (at least 30 seconds) and confirm the key is not
   flapping between the two values.

## D. Host deletes our plugin

1. In guest mode, delete `<other loader>\plugins\Drake\` manually.
2. Within one tick it must reappear. This simulates the host loader's own
   updater clearing out plugin folders it doesn't recognise.

## E. Configd port conflict

1. Before starting Drake, bind port 48151 with something else (e.g.
   `netstat`-visible listener, or a second instance of Drake already
   running).
2. Start Drake. The tray tooltip must read an `Inactive` mode whose reason
   names port 48151 -- not silently show "not injected" with no
   explanation, and not crash the process.
3. Free the port and confirm a fresh Drake start recovers normally.

## F. Auto Accept end to end

1. Enable `auto_accept` in `%PROGRAMDATA%\Drake\settings.json`, restart
   Drake.
2. If the client was already running, click "Reload client to apply" from
   the tray menu once the item is enabled.
3. Queue up. The ready check must be accepted automatically.

## G. Uninstall

1. Uninstall Drake. Confirm the scheduled task (`Drake Slot Activation`) is
   gone.
2. Confirm the IFEO `Debugger` value is removed IF it pointed at us, and
   left completely untouched if another loader owned it at uninstall time.
