# Drake — Fundação parte 1 (infraestrutura de injeção) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a tray-only Windows app that keeps a Pengu Loader plugin injected into the League client — taking the IFEO slot when it is free, living as a guest inside a third-party loader when it is not — and prove the whole path end to end with Auto Accept.

**Architecture:** A 2-second idempotent loop (`supervisor`) maintains invariants rather than reacting to events, because the only moment that matters — the launch of `LeagueClientUx.exe` — is already too late to react to. `slot` and `deploy` are pure mechanism with no policy; `supervisor` holds all policy in a pure `decide()` function. The tray never elevates: a no-argument scheduled task created by the installer performs the single privileged write.

**Tech Stack:** Rust 1.97.1, Tauri 2 (tray-only, no windows), axum 0.8, winreg 0.52, tokio 1, Node 24.13 with esbuild + vitest for the plugin, NSIS bundler.

**Spec:** `docs/superpowers/specs/2026-08-15-drake-fundacao-infra-design.md`

## Global Constraints

- Windows only. macOS activation uses a different mechanism and is explicitly out of scope.
- Product name **Drake**. Identifier `com.drake.app`. Binary `Drake`.
- App installs **per-machine** (elevated once, so the installer can create the scheduled task). Runtime data lives in `%LOCALAPPDATA%\Drake\`.
- Vendored loader path: `%LOCALAPPDATA%\Drake\loader\` containing `core.dll` and `plugins\` as siblings — the convention the spike confirmed every loader follows.
- Our plugin folder is always named `Drake`, deployed as `<loader>\plugins\Drake\`.
- IFEO key: `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\LeagueClientUx.exe`, value `Debugger`, format `rundll32 "<path to core.dll>", #6000`.
- **The scheduled task takes no arguments.** Its action is fixed. Passing the registry value as a parameter would be a local privilege-escalation hole.
- **Never write the IFEO key when it points at a loader that is not ours.** No code may reference "Rose" or any specific third-party product by name.
- Code, comments, and commit messages in English. Tray strings in English, isolated in one module.
- Loop interval: 2 seconds. Check-in tolerance window: 20 seconds.

---

### Task 1: Validate the plugin→tray write transport (spike)

The spec's one unvalidated assumption. The plugin runs on an `https://` page inside the client; Chromium treats `127.0.0.1` as potentially trustworthy so it should not count as mixed content, but that has not been measured against the CEF 108 embedded in the League client. Everything in Task 8 and Task 9 depends on the answer. Output is a decision recorded in the spec, not code we keep.

**Files:**
- Throwaway: `<active loader>\plugins\ZZ-TransportProbe\index.js` (deleted at the end, never committed)
- Modify: `docs/superpowers/specs/2026-08-15-drake-fundacao-infra-design.md` (record the outcome)

**Interfaces:**
- Consumes: nothing.
- Produces: a decision — `TRANSPORT = localhost` or `TRANSPORT = datastore` — which Task 8 and Task 9 read from the spec.

- [ ] **Step 1: Start a throwaway listener that mimics `configd`**

Save as `probe-server.js`, run with `node probe-server.js`. It must send permissive CORS headers, since the client page is a different origin.

```js
const http = require('http');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  console.log('HIT', req.method, req.url);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}).listen(48151, '127.0.0.1', () => console.log('probe listening on 48151'));
```

- [ ] **Step 2: Find the loader that currently owns the slot**

```powershell
$k='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\LeagueClientUx.exe'
if (Test-Path $k) { (Get-ItemProperty $k).Debugger } else { 'absent' }
```

The `plugins` folder is the sibling of the `core.dll` in that value. If the key is absent, activate any Pengu-based loader first — this probe needs a live injection to run inside.

- [ ] **Step 3: Write the throwaway probe plugin**

Create `<loader>\plugins\ZZ-TransportProbe\index.js`:

```js
const TAG = '[ZZ-TransportProbe]';

async function probe() {
  // Path A: the assumption under test.
  try {
    const r = await fetch('http://127.0.0.1:48151/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: 'probe' }),
    });
    console.log(TAG, 'RESULT localhost: OK, status', r.status);
  } catch (e) {
    console.log(TAG, 'RESULT localhost: BLOCKED —', e && e.message);
  }

  // Path B: the fallback, so we learn both answers in one run.
  try {
    if (typeof DataStore === 'undefined') throw new Error('DataStore missing');
    DataStore.set('drake_probe', String(Date.now()));
    console.log(TAG, 'RESULT datastore: OK, read back',
      DataStore.get('drake_probe'));
  } catch (e) {
    console.log(TAG, 'RESULT datastore: FAILED —', e && e.message);
  }
}

if (document.readyState === 'complete') probe();
else window.addEventListener('load', probe);
```

- [ ] **Step 4: Force the client to re-enumerate plugins**

Plugins are enumerated once, when the client UX starts. Adding a folder to a running client does nothing until:

```powershell
$p = (Get-Content 'D:\Riot Games\League of Legends\lockfile' -Raw).Split(':')
& curl.exe -sk -u "riot:$($p[3])" -X POST "https://127.0.0.1:$($p[2])/riotclient/kill-and-restart-ux" -w "`nHTTP=%{http_code}`n"
```

Expected: `HTTP=204`.

- [ ] **Step 5: Read the result**

Open devtools in the client and read the two `RESULT` lines. Cross-check the `probe-server.js` terminal for a `HIT POST /checkin` line — a logged `OK` with no server hit would mean something intercepted the request.

- [ ] **Step 6: Record the decision in the spec**

In the "Contrato tray ↔ plugin" section, replace the "a validar" wording with the measured outcome, the date, and the exact console output. If localhost was blocked, state that `TRANSPORT = datastore` and that Task 8 serves config by file only while Task 9 implements the DataStore-polling writer.

- [ ] **Step 7: Delete the throwaway plugin and stop the server**

```powershell
Remove-Item '<loader>\plugins\ZZ-TransportProbe' -Recurse -Force
```

- [ ] **Step 8: Commit the spec update**

```bash
git add docs/superpowers/specs/2026-08-15-drake-fundacao-infra-design.md
git commit -m "docs: record measured plugin-to-tray transport decision"
```

---

### Task 2: Tray-only Tauri skeleton that builds and runs

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/strings.rs`, `src-tauri/src/paths.rs`
- Create: `src-tauri/icons/` (generated from `quack.png`)
- Create: `.gitignore`
- Test: `src-tauri/src/paths.rs` (inline `#[cfg(test)]` module)

**Interfaces:**
- Produces:
  - `paths::data_dir() -> PathBuf` — `%LOCALAPPDATA%\Drake`
  - `paths::our_loader_dir() -> PathBuf` — `<data_dir>\loader`
  - `paths::our_core_dll() -> PathBuf` — `<our_loader_dir>\core.dll`
  - `paths::settings_file() -> PathBuf` — `<data_dir>\settings.json`
  - `strings::*` — `&'static str` tray labels

- [ ] **Step 1: Write `.gitignore`**

```gitignore
/target
/src-tauri/target
node_modules
/plugin/dist
```

- [ ] **Step 2: Generate the icon set from `quack.png`**

```bash
npm exec -y @tauri-apps/cli@2 -- icon quack.png -o src-tauri/icons
```

Expected: `src-tauri/icons/icon.ico`, `32x32.png`, `128x128.png`, and the Square* set.

- [ ] **Step 3: Write `src-tauri/Cargo.toml`**

```toml
[package]
name = "drake"
version = "0.1.0"
description = "Keeps the Drake plugin injected into the League of Legends client."
authors = ["David William"]
license = "MIT"
edition = "2021"

[lib]
name = "drake_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
axum = "0.8"
thiserror = "2"
winreg = "0.52"
sha2 = "0.10"
rand = "0.8"
sysinfo = "0.33"
reqwest = { version = "0.12", features = ["json", "native-tls"] }

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 4: Write `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5: Write `src-tauri/tauri.conf.json`**

No `windows` array — this app never opens one. `installMode` is `perMachine` so the installer runs elevated and can create the scheduled task in Task 7.

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Drake",
  "version": "0.1.0",
  "identifier": "com.drake.app",
  "mainBinaryName": "Drake",
  "build": {},
  "app": {
    "windows": [],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "publisher": "David William",
    "shortDescription": "Keeps the Drake plugin injected into the League client.",
    "copyright": "Copyright © 2026 David William",
    "category": "Utility",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"],
    "windows": {
      "nsis": { "installerIcon": "icons/icon.ico", "installMode": "perMachine" }
    }
  }
}
```

- [ ] **Step 6: Write the failing test for `paths.rs`**

Create `src-tauri/src/paths.rs`:

```rust
use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").expect("LOCALAPPDATA is always set on Windows");
    PathBuf::from(local).join("Drake")
}

pub fn our_loader_dir() -> PathBuf { data_dir().join("loader") }
pub fn our_core_dll() -> PathBuf { our_loader_dir().join("core.dll") }
pub fn settings_file() -> PathBuf { data_dir().join("settings.json") }

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
    fn data_dir_is_named_drake() {
        assert_eq!(data_dir().file_name().unwrap(), "Drake");
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml paths`
Expected: 3 passed.

- [ ] **Step 8: Write `src-tauri/src/strings.rs`**

```rust
pub const TRAY_TOOLTIP: &str = "Drake";
pub const MODE_OWN_LOADER: &str = "Own loader active";
pub const MODE_GUEST: &str = "Running as a guest in";
pub const MODE_INACTIVE: &str = "Inactive";
pub const MENU_RELOAD_CLIENT: &str = "Reload client to apply";
pub const MENU_QUIT: &str = "Quit";
```

- [ ] **Step 9: Write `src-tauri/src/main.rs` and `lib.rs` with a bare tray**

`main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    drake_lib::run()
}
```

`lib.rs`:

```rust
pub mod paths;
pub mod strings;

use tauri::tray::TrayIconBuilder;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(strings::TRAY_TOOLTIP)
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Drake");
}
```

- [ ] **Step 10: Verify it builds and shows a tray icon**

Run: `cargo run --manifest-path src-tauri/Cargo.toml`
Expected: no window opens, the duck icon appears in the system tray. Stop with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add .gitignore src-tauri
git commit -m "feat: tray-only Tauri skeleton with Drake paths"
```

---

### Task 3: Vendor the prebuilt Pengu Loader core

We embed the official release binary rather than compiling the C++/CEF core. Building CEF from source would cost weeks and buy nothing — the upstream project already ships a signed artifact under MIT.

**Files:**
- Create: `vendor/pengu-loader/core.dll` (binary, committed)
- Create: `vendor/pengu-loader/VERSION` (pinned version + SHA256 + source URL)
- Create: `vendor/pengu-loader/LICENSE` (upstream MIT license text)
- Modify: `src-tauri/tauri.conf.json` (bundle the vendored files as a resource)
- Test: `src-tauri/src/vendored.rs`

**Interfaces:**
- Produces: `vendored::core_dll_source(app: &tauri::AppHandle) -> Result<PathBuf, VendorError>` — absolute path to the bundled `core.dll` inside the installed app.

- [ ] **Step 1: Download the pinned release and record its hash**

```powershell
New-Item -ItemType Directory -Force vendor\pengu-loader | Out-Null
# Pin an explicit release tag; never track "latest".
$tag = 'v2.0.0'
Invoke-WebRequest "https://github.com/PenguLoader/PenguLoader/releases/download/$tag/core.dll" -OutFile vendor\pengu-loader\core.dll
(Get-FileHash vendor\pengu-loader\core.dll -Algorithm SHA256).Hash
```

If the release layout differs, download the release zip and extract `core.dll` from it. Record whatever path you actually used in `VERSION`.

- [ ] **Step 2: Write `vendor/pengu-loader/VERSION`**

Fill in the real tag, hash, and date from Step 1.

```
project: PenguLoader/PenguLoader
version: v2.0.0
sha256:  <hash from step 1>
source:  https://github.com/PenguLoader/PenguLoader/releases/download/v2.0.0/core.dll
pinned:  2026-08-15
license: MIT (see LICENSE in this folder)

Upgrade procedure: replace core.dll, update version and sha256 here, then
re-run the manual verification checklist in Task 11. The client's embedded
Chromium changes with Riot patches, so this pin will need periodic bumps.
```

- [ ] **Step 3: Copy the upstream MIT license text into `vendor/pengu-loader/LICENSE`**

Take it verbatim from the PenguLoader repository. Vendoring MIT code requires shipping its license.

- [ ] **Step 4: Add the vendored folder to the bundle**

In `src-tauri/tauri.conf.json`, inside `bundle`, add:

```json
"resources": { "../vendor/pengu-loader": "vendor/pengu-loader" }
```

- [ ] **Step 5: Write the failing test**

Create `src-tauri/src/vendored.rs`:

```rust
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, thiserror::Error)]
pub enum VendorError {
    #[error("could not resolve bundled resources: {0}")]
    Resolve(#[from] tauri::Error),
    #[error("vendored core.dll missing at {0}")]
    Missing(PathBuf),
}

pub fn core_dll_source(app: &tauri::AppHandle) -> Result<PathBuf, VendorError> {
    let p = app
        .path()
        .resolve("vendor/pengu-loader/core.dll", tauri::path::BaseDirectory::Resource)?;
    if !p.is_file() {
        return Err(VendorError::Missing(p));
    }
    Ok(p)
}

#[cfg(test)]
mod tests {
    #[test]
    fn vendored_core_is_committed_and_non_empty() {
        // Guards against the classic "LFS pointer or empty placeholder" mistake.
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../vendor/pengu-loader/core.dll");
        let meta = std::fs::metadata(&p)
            .unwrap_or_else(|e| panic!("vendored core.dll missing at {p:?}: {e}"));
        assert!(meta.len() > 100_000, "core.dll suspiciously small: {} bytes", meta.len());
    }
}
```

- [ ] **Step 6: Register the module and run the test**

Add `pub mod vendored;` to `lib.rs`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml vendored`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add vendor src-tauri
git commit -m "feat: vendor the pinned Pengu Loader core binary"
```

---

### Task 4: `slot` — read, parse and classify the IFEO key

**Files:**
- Create: `src-tauri/src/slot.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod slot;`)

**Interfaces:**
- Consumes: `paths::our_core_dll()`
- Produces:
  - `slot::SlotState` — `Absent | Ours | Foreign { core_dll: PathBuf, host: String } | Unparsable { raw: String }`
  - `slot::RegistryAccess` trait with `read_debugger(&self) -> Result<Option<String>, SlotError>` and `write_debugger(&self, value: &str) -> Result<(), SlotError>`
  - `slot::WindowsRegistry` — the real implementation
  - `slot::parse_core_path(raw: &str) -> Option<PathBuf>`
  - `slot::host_label(core_dll: &Path) -> String`
  - `slot::classify(raw: Option<&str>, our_core: &Path) -> SlotState`
  - `slot::debugger_value(core_dll: &Path) -> String`

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/slot.rs` with only the test module plus stub signatures, so the tests compile and fail on behavior rather than on missing symbols.

```rust
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml slot`
Expected: compile errors for the missing items, or assertion failures.

- [ ] **Step 3: Implement `slot.rs`**

```rust
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml slot`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/slot.rs src-tauri/src/lib.rs
git commit -m "feat: classify the IFEO slot as absent, ours, foreign or unparsable"
```

---

### Task 5: `deploy` — keep the plugin present in a loader's plugins folder

**Files:**
- Create: `src-tauri/src/deploy.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod deploy;`)

**Interfaces:**
- Produces:
  - `deploy::PLUGIN_FOLDER_NAME: &str` — `"Drake"`
  - `deploy::plugin_dir(loader_dir: &Path) -> PathBuf` — `<loader_dir>/plugins/Drake`
  - `deploy::DeployOutcome` — `AlreadyCurrent | Written`
  - `deploy::ensure_plugin(loader_dir: &Path, index_js: &str) -> Result<DeployOutcome, DeployError>`

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/deploy.rs` with the test module first.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_the_plugin_when_absent() {
        let tmp = tempfile::tempdir().unwrap();
        let outcome = ensure_plugin(tmp.path(), "console.log(1)").unwrap();
        assert_eq!(outcome, DeployOutcome::Written);
        let written = std::fs::read_to_string(plugin_dir(tmp.path()).join("index.js")).unwrap();
        assert_eq!(written, "console.log(1)");
    }

    #[test]
    fn is_idempotent_when_already_current() {
        let tmp = tempfile::tempdir().unwrap();
        ensure_plugin(tmp.path(), "console.log(1)").unwrap();
        let outcome = ensure_plugin(tmp.path(), "console.log(1)").unwrap();
        assert_eq!(outcome, DeployOutcome::AlreadyCurrent);
    }

    #[test]
    fn rewrites_when_contents_differ() {
        let tmp = tempfile::tempdir().unwrap();
        ensure_plugin(tmp.path(), "old").unwrap();
        let outcome = ensure_plugin(tmp.path(), "new").unwrap();
        assert_eq!(outcome, DeployOutcome::Written);
        let written = std::fs::read_to_string(plugin_dir(tmp.path()).join("index.js")).unwrap();
        assert_eq!(written, "new");
    }

    #[test]
    fn restores_the_plugin_after_the_host_deletes_it() {
        // This is the measured behaviour of real loaders managing their own
        // plugins folder, so it gets an explicit test rather than a comment.
        let tmp = tempfile::tempdir().unwrap();
        ensure_plugin(tmp.path(), "x").unwrap();
        std::fs::remove_dir_all(plugin_dir(tmp.path())).unwrap();
        let outcome = ensure_plugin(tmp.path(), "x").unwrap();
        assert_eq!(outcome, DeployOutcome::Written);
        assert!(plugin_dir(tmp.path()).join("index.js").is_file());
    }

    #[test]
    fn plugin_dir_follows_the_loader_convention() {
        let d = plugin_dir(std::path::Path::new(r"C:\loader"));
        assert!(d.ends_with(r"plugins\Drake") || d.ends_with("plugins/Drake"));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml deploy`
Expected: compile errors for missing items.

- [ ] **Step 3: Implement `deploy.rs`**

```rust
use std::path::{Path, PathBuf};

pub const PLUGIN_FOLDER_NAME: &str = "Drake";

#[derive(Debug, thiserror::Error)]
pub enum DeployError {
    #[error("could not write the plugin to {path}: {source}")]
    Write { path: PathBuf, source: std::io::Error },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeployOutcome {
    AlreadyCurrent,
    Written,
}

pub fn plugin_dir(loader_dir: &Path) -> PathBuf {
    loader_dir.join("plugins").join(PLUGIN_FOLDER_NAME)
}

pub fn ensure_plugin(loader_dir: &Path, index_js: &str) -> Result<DeployOutcome, DeployError> {
    let dir = plugin_dir(loader_dir);
    let target = dir.join("index.js");

    if let Ok(existing) = std::fs::read_to_string(&target) {
        if existing == index_js {
            return Ok(DeployOutcome::AlreadyCurrent);
        }
    }

    std::fs::create_dir_all(&dir)
        .map_err(|source| DeployError::Write { path: dir.clone(), source })?;
    std::fs::write(&target, index_js)
        .map_err(|source| DeployError::Write { path: target.clone(), source })?;

    Ok(DeployOutcome::Written)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml deploy`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deploy.rs src-tauri/src/lib.rs
git commit -m "feat: idempotently keep the Drake plugin present in a loader"
```

---

### Task 6: `supervisor::decide` — the pure policy function

This is where the risk of the whole system lives, and it is 100% testable without touching Windows.

**Files:**
- Create: `src-tauri/src/supervisor.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod supervisor;`)

**Interfaces:**
- Consumes: `slot::SlotState`
- Produces:
  - `supervisor::Mode` — `OwnLoader | Guest { host: String } | Inactive { reason: String }`
  - `supervisor::Plan { take_slot: bool, deploy_to: Option<PathBuf>, mode: Mode }`
  - `supervisor::decide(slot: &SlotState, our_loader_dir: &Path) -> Plan`

- [ ] **Step 1: Write the failing tests covering the whole table**

```rust
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml supervisor`
Expected: compile errors for missing items.

- [ ] **Step 3: Implement `decide`**

```rust
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml supervisor`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/supervisor.rs src-tauri/src/lib.rs
git commit -m "feat: pure slot policy covering handoff in both directions"
```

---

### Task 7: Elevation via a no-argument scheduled task

**Files:**
- Create: `src-tauri/src/elevate.rs`
- Create: `src-tauri/nsis/hooks.nsh`
- Modify: `src-tauri/tauri.conf.json` (register the NSIS hook)
- Modify: `src-tauri/src/lib.rs` (add `pub mod elevate;`)

**Interfaces:**
- Consumes: `paths::our_core_dll()`, `slot::debugger_value()`
- Produces:
  - `elevate::TASK_NAME: &str` — `"Drake Slot Activation"`
  - `elevate::task_exists() -> bool`
  - `elevate::run_task() -> Result<(), ElevateError>`

- [ ] **Step 1: Write the NSIS hook that creates and removes the task**

Create `src-tauri/nsis/hooks.nsh`. The action is hardcoded — it accepts nothing from the caller.

```nsis
!macro NSIS_HOOK_POSTINSTALL
  ; The task's action is fixed. Never accept the registry value as a
  ; parameter: any unprivileged process could then trigger this task and have
  ; Windows run an arbitrary elevated command at the next client launch.
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Create /F /TN "Drake Slot Activation" /SC ONCE /ST 00:00 /RL HIGHEST /RU "SYSTEM" /TR "\"$INSTDIR\Drake.exe\" --activate-slot"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /F /TN "Drake Slot Activation"'
!macroend
```

- [ ] **Step 2: Register the hook in `tauri.conf.json`**

Inside `bundle.windows.nsis`, add:

```json
"installerHooks": "./nsis/hooks.nsh"
```

- [ ] **Step 3: Write the failing test for the CLI entry point**

Create `src-tauri/src/elevate.rs`:

```rust
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml elevate`
Expected: compile errors for missing items.

- [ ] **Step 5: Implement `elevate.rs`**

```rust
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
```

- [ ] **Step 6: Wire the activation flag into `main.rs`**

Replace the body of `main`:

```rust
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if drake_lib::elevate::is_activation_invocation(&args) {
        if let Err(e) = drake_lib::elevate::perform_activation() {
            eprintln!("activation failed: {e}");
            std::process::exit(1);
        }
        return;
    }
    drake_lib::run()
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml elevate`
Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/elevate.rs src-tauri/src/main.rs src-tauri/nsis src-tauri/tauri.conf.json
git commit -m "feat: elevate the slot write through a no-argument scheduled task"
```

---

### Task 8: `configd` — settings, token, and the config file the plugin reads

**Files:**
- Create: `src-tauri/src/configd.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod configd;`)

**Interfaces:**
- Consumes: `paths::settings_file()`, `deploy::plugin_dir()`, and the Task 1 transport decision.
- Produces:
  - `configd::Settings { auto_accept: bool }` with `Default`
  - `configd::load() -> Settings`, `configd::save(&Settings) -> Result<(), ConfigError>`
  - `configd::PluginConfig { token: String, port: u16, settings: Settings }`
  - `configd::write_plugin_config(plugin_dir: &Path, cfg: &PluginConfig) -> Result<(), ConfigError>`
  - `configd::CheckIn { host: String, at: std::time::Instant }`
  - `configd::EffectiveState::{Injected { host: String }, NotInjected, Unknown}`
  - `configd::serve(state: Arc<ConfigdState>, port: u16)` — async, binds `127.0.0.1` only

- [ ] **Step 1: Write the failing tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_default_to_everything_off() {
        // Nothing automates the user's game until they ask for it.
        assert_eq!(Settings::default().auto_accept, false);
    }

    #[test]
    fn settings_round_trip_through_json() {
        let s = Settings { auto_accept: true };
        let back: Settings = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn missing_settings_file_yields_defaults_instead_of_failing() {
        let tmp = tempfile::tempdir().unwrap();
        let s = load_from(&tmp.path().join("nope.json"));
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn corrupt_settings_file_yields_defaults_instead_of_failing() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("settings.json");
        std::fs::write(&p, "{ this is not json").unwrap();
        assert_eq!(load_from(&p), Settings::default());
    }

    #[test]
    fn plugin_config_is_written_next_to_the_plugin() {
        let tmp = tempfile::tempdir().unwrap();
        let cfg = PluginConfig {
            token: "abc".into(),
            port: 48151,
            settings: Settings { auto_accept: true },
        };
        write_plugin_config(tmp.path(), &cfg).unwrap();
        let raw = std::fs::read_to_string(tmp.path().join("config.json")).unwrap();
        assert!(raw.contains("\"token\""));
        assert!(raw.contains("48151"));
    }

    #[test]
    fn a_token_is_long_enough_to_not_be_guessable() {
        assert!(generate_token().len() >= 32);
        assert_ne!(generate_token(), generate_token());
    }

    #[test]
    fn effective_state_is_not_injected_once_the_checkin_window_lapses() {
        let st = ConfigdState::new(48151);
        st.record_checkin("Drake".into());
        assert!(matches!(st.effective(true), EffectiveState::Injected { .. }));
        st.expire_checkin_for_test();
        assert!(matches!(st.effective(true), EffectiveState::NotInjected));
    }

    #[test]
    fn effective_state_is_unknown_when_the_client_is_closed() {
        let st = ConfigdState::new(48151);
        assert!(matches!(st.effective(false), EffectiveState::Unknown));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml configd`
Expected: compile errors for missing items.

- [ ] **Step 3: Implement `configd.rs`**

```rust
use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const CHECKIN_TOLERANCE: Duration = Duration::from_secs(20);

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("could not write {path}: {source}")]
    Write { path: PathBuf, source: std::io::Error },
    #[error("could not serialise config: {0}")]
    Serialise(#[from] serde_json::Error),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    pub auto_accept: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { auto_accept: false }
    }
}

pub fn load_from(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn load() -> Settings {
    load_from(&crate::paths::settings_file())
}

pub fn save(s: &Settings) -> Result<(), ConfigError> {
    let path = crate::paths::settings_file();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|source| ConfigError::Write { path: dir.to_path_buf(), source })?;
    }
    let raw = serde_json::to_string_pretty(s)?;
    std::fs::write(&path, raw).map_err(|source| ConfigError::Write { path, source })
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginConfig {
    pub token: String,
    pub port: u16,
    pub settings: Settings,
}

pub fn write_plugin_config(plugin_dir: &Path, cfg: &PluginConfig) -> Result<(), ConfigError> {
    std::fs::create_dir_all(plugin_dir)
        .map_err(|source| ConfigError::Write { path: plugin_dir.to_path_buf(), source })?;
    let path = plugin_dir.join("config.json");
    let raw = serde_json::to_string_pretty(cfg)?;
    std::fs::write(&path, raw).map_err(|source| ConfigError::Write { path, source })
}

pub fn generate_token() -> String {
    let mut rng = rand::thread_rng();
    (0..40).map(|_| char::from(rng.gen_range(b'a'..=b'z'))).collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EffectiveState {
    Injected { host: String },
    NotInjected,
    Unknown,
}

pub struct ConfigdState {
    pub token: String,
    pub port: u16,
    pub settings: Mutex<Settings>,
    last_checkin: Mutex<Option<(String, Instant)>>,
}

impl ConfigdState {
    pub fn new(port: u16) -> Self {
        Self {
            token: generate_token(),
            port,
            settings: Mutex::new(load()),
            last_checkin: Mutex::new(None),
        }
    }

    pub fn record_checkin(&self, host: String) {
        *self.last_checkin.lock().unwrap() = Some((host, Instant::now()));
    }

    #[cfg(test)]
    pub fn expire_checkin_for_test(&self) {
        let mut g = self.last_checkin.lock().unwrap();
        if let Some((host, _)) = g.clone() {
            *g = Some((host, Instant::now() - CHECKIN_TOLERANCE - Duration::from_secs(1)));
        }
    }

    pub fn effective(&self, client_running: bool) -> EffectiveState {
        if !client_running {
            return EffectiveState::Unknown;
        }
        match self.last_checkin.lock().unwrap().clone() {
            Some((host, at)) if at.elapsed() <= CHECKIN_TOLERANCE => {
                EffectiveState::Injected { host }
            }
            _ => EffectiveState::NotInjected,
        }
    }
}

#[derive(Deserialize)]
pub struct CheckInBody {
    pub token: String,
    pub host: String,
}

async fn checkin(
    State(state): State<Arc<ConfigdState>>,
    Json(body): Json<CheckInBody>,
) -> StatusCode {
    if body.token != state.token {
        return StatusCode::UNAUTHORIZED;
    }
    state.record_checkin(body.host);
    StatusCode::NO_CONTENT
}

pub async fn serve(state: Arc<ConfigdState>) {
    let port = state.port;
    let app = Router::new().route("/checkin", post(checkin)).with_state(state);
    // 127.0.0.1 only. Never 0.0.0.0 — this must not be reachable off-machine.
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml configd`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/configd.rs src-tauri/src/lib.rs
git commit -m "feat: settings persistence, plugin config file and check-in endpoint"
```

---

### Task 9: The plugin — check-in, config read, and the transport interface

**Files:**
- Create: `plugin/package.json`, `plugin/build.mjs`, `plugin/vitest.config.js`
- Create: `plugin/src/index.js`, `plugin/src/config.js`, `plugin/src/transport.js`
- Test: `plugin/test/config.test.js`, `plugin/test/transport.test.js`

**Interfaces:**
- Consumes: the `config.json` shape from Task 8 (`{ token, port, settings }`) and the Task 1 transport decision.
- Produces:
  - `loadConfig(fetchImpl) -> Promise<{token, port, settings}>`
  - `makeTransport({ port, token, fetchImpl, dataStore }) -> { checkIn(host): Promise<boolean> }`
  - `plugin/dist/index.js` — the bundle Task 10 and Task 11 deploy

- [ ] **Step 1: Write `plugin/package.json`**

```json
{
  "name": "drake-plugin",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "vitest run"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write `plugin/build.mjs`**

```js
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  target: 'chrome108',
  outfile: 'dist/index.js',
});
console.log('built dist/index.js');
```

- [ ] **Step 3: Install dependencies**

Run: `cd plugin && npm install`

- [ ] **Step 4: Write the failing tests**

`plugin/test/config.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('reads config.json relative to the plugin and busts the cache', async () => {
    let seen;
    const fakeFetch = async (url) => {
      seen = url;
      return { ok: true, json: async () => ({ token: 't', port: 1, settings: {} }) };
    };
    const cfg = await loadConfig(fakeFetch);
    expect(cfg.token).toBe('t');
    expect(seen).toMatch(/config\.json\?/);
  });

  it('returns null instead of throwing when the file is missing', async () => {
    const fakeFetch = async () => ({ ok: false, status: 404 });
    expect(await loadConfig(fakeFetch)).toBeNull();
  });
});
```

`plugin/test/transport.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { makeTransport } from '../src/transport.js';

describe('transport', () => {
  it('posts a check-in carrying the token', async () => {
    let body;
    const fakeFetch = async (url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 204 };
    };
    const t = makeTransport({ port: 48151, token: 'sekret', fetchImpl: fakeFetch });
    expect(await t.checkIn('Drake')).toBe(true);
    expect(body).toEqual({ token: 'sekret', host: 'Drake' });
  });

  it('falls back to DataStore when localhost is unreachable', async () => {
    const store = {};
    const t = makeTransport({
      port: 48151,
      token: 'sekret',
      fetchImpl: async () => { throw new Error('blocked'); },
      dataStore: { set: (k, v) => { store[k] = v; } },
    });
    expect(await t.checkIn('Drake')).toBe(true);
    expect(JSON.parse(store['drake_checkin']).host).toBe('Drake');
  });

  it('reports failure when both paths are unavailable', async () => {
    const t = makeTransport({
      port: 48151,
      token: 'sekret',
      fetchImpl: async () => { throw new Error('blocked'); },
    });
    expect(await t.checkIn('Drake')).toBe(false);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd plugin && npm test`
Expected: FAIL — modules not found.

- [ ] **Step 6: Implement `plugin/src/config.js`**

```js
// Served by the loader's own https://plugins/ scheme, so this path has no
// mixed-content or CORS question. The cache-buster stops CEF serving a stale
// copy after the tray rewrites the file.
export async function loadConfig(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`config.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Implement `plugin/src/transport.js`**

```js
// Two write paths behind one interface, so the choice never leaks into
// feature code. Which one is primary was measured in Task 1.
export function makeTransport({ port, token, fetchImpl = fetch, dataStore = null }) {
  async function viaLocalhost(host) {
    const res = await fetchImpl(`http://127.0.0.1:${port}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, host }),
    });
    return res.ok;
  }

  function viaDataStore(host) {
    if (!dataStore) return false;
    dataStore.set('drake_checkin', JSON.stringify({ host, at: Date.now() }));
    return true;
  }

  return {
    async checkIn(host) {
      try {
        if (await viaLocalhost(host)) return true;
      } catch {
        // fall through to the fallback
      }
      return viaDataStore(host);
    },
  };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd plugin && npm test`
Expected: 5 passed.

- [ ] **Step 9: Write `plugin/src/index.js`**

```js
import { loadConfig } from './config.js';
import { makeTransport } from './transport.js';

const TAG = '[Drake]';

async function start() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.log(TAG, 'no config.json found; the tray app may not be running');
    return;
  }

  const transport = makeTransport({
    port: cfg.port,
    token: cfg.token,
    dataStore: typeof DataStore !== 'undefined' ? DataStore : null,
  });

  // The tray derives "effective state" from this, so it must happen before
  // anything that can throw.
  const host = (typeof Pengu !== 'undefined' && Pengu.version) ? `pengu ${Pengu.version}` : 'unknown';
  const ok = await transport.checkIn(host);
  console.log(TAG, 'check-in', ok ? 'ok' : 'failed', '| settings', JSON.stringify(cfg.settings));
}

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);
```

- [ ] **Step 10: Build the bundle**

Run: `cd plugin && npm run build`
Expected: `plugin/dist/index.js` exists.

- [ ] **Step 11: Commit**

```bash
git add plugin
git commit -m "feat: plugin check-in over a transport with a measured fallback"
```

---

### Task 10: Auto Accept as the vertical slice

Proves the whole path: tray writes a setting, plugin reads it, plugin acts on the LCU from inside the client.

**Files:**
- Create: `plugin/src/autoAccept.js`
- Modify: `plugin/src/index.js`
- Test: `plugin/test/autoAccept.test.js`

**Interfaces:**
- Consumes: `cfg.settings.auto_accept` from Task 9.
- Produces: `startAutoAccept({ enabled, lcu, subscribe }) -> stop()`

- [ ] **Step 1: Write the failing tests**

`plugin/test/autoAccept.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { shouldAccept, startAutoAccept } from '../src/autoAccept.js';

describe('shouldAccept', () => {
  it('accepts while the ready check is still pending', () => {
    expect(shouldAccept({ state: 'InProgress', playerResponse: 'None' })).toBe(true);
  });

  it('does not accept twice after the player already responded', () => {
    expect(shouldAccept({ state: 'InProgress', playerResponse: 'Accepted' })).toBe(false);
  });

  it('does not accept when the player declined', () => {
    expect(shouldAccept({ state: 'InProgress', playerResponse: 'Declined' })).toBe(false);
  });

  it('ignores a finished ready check', () => {
    expect(shouldAccept({ state: 'Invalid', playerResponse: 'None' })).toBe(false);
  });

  it('is safe on a null payload', () => {
    expect(shouldAccept(null)).toBe(false);
  });
});

describe('startAutoAccept', () => {
  it('posts accept when enabled and the check is pending', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    let handler;
    const subscribe = (_route, fn) => { handler = fn; return () => {}; };
    startAutoAccept({ enabled: true, lcu, subscribe });
    await handler({ state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });

  it('does nothing at all when disabled', async () => {
    const lcu = { post: vi.fn() };
    let handler;
    const subscribe = (_route, fn) => { handler = fn; return () => {}; };
    startAutoAccept({ enabled: false, lcu, subscribe });
    await handler({ state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd plugin && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `plugin/src/autoAccept.js`**

```js
export function shouldAccept(payload) {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'None';
}

export function startAutoAccept({ enabled, lcu, subscribe }) {
  if (!enabled) return () => {};
  return subscribe('/lol-matchmaking/v1/ready-check', async (payload) => {
    if (!shouldAccept(payload)) return;
    await lcu.post('/lol-matchmaking/v1/ready-check/accept');
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd plugin && npm test`
Expected: 12 passed in total.

- [ ] **Step 5: Add the LCU helper and event subscription to `index.js`**

Append to `plugin/src/index.js`, and call `wireFeatures(cfg)` at the end of `start()`:

```js
import { startAutoAccept } from './autoAccept.js';

// Same-origin inside the client: no lockfile, no port, no password. Measured
// in the viability spike.
const lcu = {
  post: (route) => fetch(route, { method: 'POST' }),
  get: (route) => fetch(route).then((r) => r.json()),
};

// Pengu exposes push events, so no polling loop is needed.
function subscribe(route, handler) {
  const observer = (message) => handler(message && message.data);
  window.addEventListener('riot:lcu', observer);
  if (typeof socket !== 'undefined' && socket.observe) socket.observe(route, observer);
  return () => window.removeEventListener('riot:lcu', observer);
}

function wireFeatures(cfg) {
  startAutoAccept({ enabled: !!cfg.settings.auto_accept, lcu, subscribe });
}
```

- [ ] **Step 6: Rebuild and commit**

```bash
cd plugin && npm run build && cd ..
git add plugin
git commit -m "feat: auto accept as the vertical slice proving the full path"
```

---

### Task 11: Wire the supervisor loop, the tray, and verify on the real machine

**Files:**
- Modify: `src-tauri/src/supervisor.rs` (add the loop around the pure `decide`)
- Modify: `src-tauri/src/lib.rs` (start the loop and `configd`, build the tray menu)
- Create: `src-tauri/src/lcu.rs`
- Create: `docs/manual-verification.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `supervisor::tick(...) -> Mode`, `lcu::client_running() -> bool`, `lcu::restart_ux() -> Result<(), LcuError>`

- [ ] **Step 1: Write `src-tauri/src/lcu.rs`**

```rust
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum LcuError {
    #[error("the League client is not running")]
    NotRunning,
    #[error("could not read the lockfile: {0}")]
    Lockfile(#[from] std::io::Error),
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
}

pub fn client_running() -> bool {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    // sysinfo 0.33 requires both arguments here; the older no-arg form does
    // not compile.
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes()
        .values()
        .any(|p| p.name().to_string_lossy().eq_ignore_ascii_case("LeagueClientUx.exe"))
}

fn lockfile_path(install_dir: &PathBuf) -> PathBuf {
    install_dir.join("lockfile")
}

/// Reloads only the client UI so a freshly deployed plugin is enumerated.
/// Never called automatically — restarting someone's client unasked is hostile.
pub async fn restart_ux(install_dir: &PathBuf) -> Result<(), LcuError> {
    let raw = std::fs::read_to_string(lockfile_path(install_dir))?;
    let parts: Vec<&str> = raw.split(':').collect();
    let (port, password) = (parts[2], parts[3]);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()?;
    client
        .post(format!("https://127.0.0.1:{port}/riotclient/kill-and-restart-ux"))
        .basic_auth("riot", Some(password))
        .send()
        .await?;
    Ok(())
}
```

- [ ] **Step 2: Add `tick` to `supervisor.rs`**

```rust
use crate::{configd, deploy, elevate, slot::{self, RegistryAccess}};

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
```

- [ ] **Step 3: Write the failing test for `tick`**

Add to the `supervisor` test module:

```rust
struct FakeReg(Option<String>);
impl crate::slot::RegistryAccess for FakeReg {
    fn read_debugger(&self) -> Result<Option<String>, crate::slot::SlotError> {
        Ok(self.0.clone())
    }
    fn write_debugger(&self, _v: &str) -> Result<(), crate::slot::SlotError> { Ok(()) }
}

#[test]
fn tick_deploys_into_a_foreign_loader_without_touching_the_registry() {
    let tmp = tempfile::tempdir().unwrap();
    let foreign_loader = tmp.path().join("Other").join("Pengu Loader");
    std::fs::create_dir_all(&foreign_loader).unwrap();
    let core = foreign_loader.join("core.dll");

    let reg = FakeReg(Some(crate::slot::debugger_value(&core)));
    let cfg = crate::configd::PluginConfig {
        token: "t".into(),
        port: 1,
        settings: Default::default(),
    };

    let mode = tick(&reg, &ours().join("core.dll"), &ours(), "console.log(1)", &cfg);

    assert_eq!(mode, Mode::Guest { host: "Other".into() });
    assert!(crate::deploy::plugin_dir(&foreign_loader).join("index.js").is_file());
    assert!(crate::deploy::plugin_dir(&foreign_loader).join("config.json").is_file());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass, including the new one.

- [ ] **Step 5: Start the loop and build the tray menu in `lib.rs`**

```rust
pub mod configd;
pub mod deploy;
pub mod elevate;
pub mod lcu;
pub mod paths;
pub mod slot;
pub mod strings;
pub mod supervisor;
pub mod vendored;

use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

const CONFIGD_PORT: u16 = 48151;
const INDEX_JS: &str = include_str!("../../plugin/dist/index.js");

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Install the vendored loader into %LOCALAPPDATA%\Drake\loader.
            let src = vendored::core_dll_source(app.handle())?;
            std::fs::create_dir_all(paths::our_loader_dir())?;
            std::fs::copy(&src, paths::our_core_dll())?;

            let state = Arc::new(configd::ConfigdState::new(CONFIGD_PORT));

            let reload = MenuItem::with_id(app, "reload", strings::MENU_RELOAD_CLIENT, true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", strings::MENU_QUIT, true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&reload, &quit])?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(strings::TRAY_TOOLTIP)
                .menu(&menu)
                .build(app)?;

            let serve_state = state.clone();
            tauri::async_runtime::spawn(async move { configd::serve(serve_state).await });

            let loop_state = state.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let cfg = configd::PluginConfig {
                        token: loop_state.token.clone(),
                        port: loop_state.port,
                        settings: loop_state.settings.lock().unwrap().clone(),
                    };
                    let mode = supervisor::tick(
                        &slot::WindowsRegistry,
                        &paths::our_core_dll(),
                        &paths::our_loader_dir(),
                        INDEX_JS,
                        &cfg,
                    );
                    let text = match &mode {
                        supervisor::Mode::OwnLoader => strings::MODE_OWN_LOADER.to_string(),
                        supervisor::Mode::Guest { host } => format!("{} {host}", strings::MODE_GUEST),
                        supervisor::Mode::Inactive { reason } => {
                            format!("{}: {reason}", strings::MODE_INACTIVE)
                        }
                    };
                    let _ = tray.set_tooltip(Some(&format!("{}\n{text}", strings::TRAY_TOOLTIP)));
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Drake");
}
```

- [ ] **Step 6: Write `docs/manual-verification.md`**

The state machine is unit-tested, but nothing above proves the plugin actually loads inside a real client. This checklist covers what cannot be simulated. Run it in full before any release.

```markdown
# Manual verification checklist

Run on Windows with League installed. Record the date and the result of each.

## A. Taking a free slot
1. Ensure no loader is active: the IFEO key must be absent.
2. Start Drake. Tray must read "Own loader active".
3. Verify the key now points at `%LOCALAPPDATA%\Drake\loader\core.dll`.
4. Start the League client. Open devtools and confirm `[Drake] check-in ok`.
5. Confirm the tray no longer offers "Reload client to apply".

## B. Guest mode
1. With Drake running, activate any other Pengu-based loader.
2. Within one tick, the tray must read "Running as a guest in <name>".
3. Verify the IFEO key still points at the OTHER loader — we must not have
   overwritten it. This is the single most important assertion here.
4. Verify `<other loader>\plugins\Drake\index.js` and `config.json` exist.
5. Restart the client UX and confirm the check-in still arrives.

## C. Handoff in both directions
1. From state B, quit the other loader. The key should disappear and Drake
   should retake it within one tick, tray back to "Own loader active".
2. Start the other loader again. Drake must yield without fighting. Watch for
   several ticks and confirm the key is not flapping between the two values.

## D. Host deletes our plugin
1. In guest mode, delete `<other loader>\plugins\Drake\` manually.
2. Within one tick it must reappear. This simulates the host's updater.

## E. Auto Accept end to end
1. Enable auto_accept in `%LOCALAPPDATA%\Drake\settings.json`, restart Drake.
2. Reload the client UI from the tray menu.
3. Queue up. The ready check must be accepted automatically.

## F. Uninstall
1. Uninstall Drake. Confirm the scheduled task is gone.
2. Confirm the IFEO key is removed IF it pointed at us, and left untouched if
   another loader owned it.
```

- [ ] **Step 7: Build the installer**

Run: `npm exec -y @tauri-apps/cli@2 -- build`
Expected: an NSIS installer in `src-tauri/target/release/bundle/nsis/`.

- [ ] **Step 8: Install and run the full manual checklist**

Record results inline in `docs/manual-verification.md`. Any failure is a bug to fix before the task is done, not a note to file.

- [ ] **Step 9: Commit**

```bash
git add src-tauri docs/manual-verification.md
git commit -m "feat: run the invariant loop behind the tray and verify end to end"
```

---

## Self-review notes

Checked against the spec:

- Every spec section maps to a task: components → Tasks 4–9, state machine → Task 6, desired-vs-effective → Task 8 (`EffectiveState`) and Task 11, elevation → Task 7, contract → Tasks 8–9, error handling → the `Inactive { reason }` paths in Task 11's `tick`, testing → the test steps throughout plus Task 11's checklist.
- The spec's "copy deliberately from the old repo" is **not** exercised by this plan: none of the copied assets (`bannerSkins.ts`, `champions.ts`, `champion_skins.json`) are needed for Auto Accept. They belong to spec 2, and copying them now would be dead code.
- `installMode` changed from the old product's `currentUser` to `perMachine`. This is a real deviation forced by the scheduled task needing an elevated installer, and it is recorded in Global Constraints.
- Task 11 embeds `plugin/dist/index.js` via `include_str!`, so `npm run build` in Task 9/10 must run before the Rust build. Task 11 Step 7 depends on that ordering.
