# Drake

League of Legends client overlay for auto accept, champ select, and profile tools. A tray app on Windows keeps the plugin injected.

Drake is unofficial and is not endorsed by Riot Games. Using it may violate the League of Legends Terms of Use. You run it at your own risk.

## What it does

Open the overlay in the client with **Ctrl + D**.

* Auto Accept, with an optional delay
* Auto Pick (first and second champion) and Auto Ban
* Insta Lock, dodge, and lobby reveal
* Status message, rank, and banner skins
* Riot ID and friends tools
* Settings for start with Windows and auto reload

The tray is the source of truth for settings. The overlay reads and writes them through the tray, so they survive a client restart.

## Requirements

* Windows 10 or later
* League of Legends
* For development: Rust (stable), Node.js 20 or later, and Visual Studio C++ build tools

## Development

```bash
cd plugin
npm install
npm test
npm run build
```

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo build --release --manifest-path src-tauri/Cargo.toml
```

The tray binary is `src-tauri/target/release/drake.exe`. If League is already open after a plugin change, use **Reload client to apply** in the tray (or restart client UX) so the new bundle loads.

`plugin/dist/index.js` is committed on purpose. The Rust build embeds that file, so a clone can build without Node.

## Layout

* `plugin/` in-client overlay (JavaScript) and its tests
* `src-tauri/` tray app, installer, and injection
* `vendor/pengu-loader/` pinned loader core shipped with the installer

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) as well.

## Security

See [SECURITY.md](SECURITY.md).

## License

Drake is MIT. See [LICENSE](LICENSE).

The installer vendors a copy of Pengu Loader (`vendor/pengu-loader/`), which is MIT as well. See `vendor/pengu-loader/LICENSE`.
