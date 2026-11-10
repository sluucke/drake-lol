# Drake

League of Legends client overlay for auto accept, champ select, loot, and profile tools. A tray app on Windows keeps the plugin injected.

Drake is unofficial and is not endorsed by Riot Games. Using it may violate the League of Legends Terms of Use. You run it at your own risk.

<p align="center">
  <strong>Overlay home</strong><br>
  Open with Ctrl + D or the duck button in the bottom-right corner.
</p>
<p align="center">
  <img src="docs/assets/drake-main-screen.png" alt="Drake overlay main screen" width="720">
</p>

## What it does

Open the overlay with **Ctrl + D**, or click the duck button in the **bottom-right corner** of the client.

| | Feature | Description |
| --- | --- | --- |
| ⚡ | Auto Accept | Ready-check accept with optional delay |
| 🗡️ | Auto Pick | First + backup champ per role, with Insta Lock |
| 🚫 | Auto Ban | Ban a chosen champion automatically |
| 🧰 | Build Panel | OP.GG runes, items, skill order, spells, matchups, and top players in champ select |
| 🔍 | Lobby Reveal | Open team scouting on Porofessor / op.gg / etc. |
| 👁️ | In-client Team Reveal | Ally rows + stats cards in champ select |
| 🚪 | Dodge | Champ-select dodge button (with usual penalty) |
| ✨ | Bulk Disenchant | Disenchant many champion and skin shards at once from the Loot screen |
| 💬 | Status | Custom status message and availability |
| 🏅 | Profile | Rank crest, banner skins, Riot ID tools |
| 👥 | Friends | Friends list tools |
| 🎥 | Streaming mode | Moves Drake into a window OBS / Streamlabs / Discord cannot capture (On, Off or Auto) |
| ⚙️ | Settings | Start with Windows, auto reload, auto updates, language, anonymous usage stats |

The overlay is built with React and TypeScript and follows the League client language. It is translated into English, Brazilian Portuguese, Latin American Spanish, Russian, Turkish and Swedish; other languages fall back to English, and Swedish can be picked in Settings.

The tray is the source of truth for settings. The overlay reads and writes them through the tray, so they survive a client restart. With automatic updates on, Drake checks GitHub for a newer release, downloads the installer, and runs it. Windows will ask for permission because the app lives in Program Files. Some releases are required: Drake then pauses in the client and asks you to update, while League itself keeps working.

Drake also runs inside other loaders built on Pengu Loader. If that loader keeps its plugins in a folder only administrators can change, Drake asks once whether to restart as administrator.

## Screenshots

<p align="center">
  <strong>In-client team reveal</strong><br>
  Ally rows show Riot ID and recent win rate while you are in champ select.
</p>
<p align="center">
  <img src="docs/assets/auto-reveal-solo-queue.png" alt="In-client team reveal on ally rows" width="360">
</p>

<p align="center">
  <strong>Session revealed toast</strong><br>
  When the lobby is ready, Drake prompts you to open the stats cards.
</p>
<p align="center">
  <img src="docs/assets/auto-reveal-part-1.png" alt="Session revealed toast with View button" width="720">
</p>

<p align="center">
  <strong>Team stats cards</strong><br>
  Press Ctrl + Shift + D to see ranks, recent form, and recent champs for your team.
</p>
<p align="center">
  <img src="docs/assets/ctrl+shift+d-lobby-reveal.png" alt="Team stats cards overlay with Ctrl+Shift+D" width="720">
</p>

<p align="center">
  <strong>Build panel</strong><br>
  In the same Ctrl + Shift + D modal, open Build for OP.GG runes, items, skill order, and summoner spells. Spells sit under skill order so the layout stays compact.
</p>
<p align="center">
  <img src="docs/assets/build-panel.png" alt="Build panel with runes, items, skill order, and summoner spells" width="720">
</p>

<p align="center">
  <strong>Dodge</strong><br>
  Leave champ select from the in-client Dodge button. The usual dodge penalty still applies.
</p>
<p align="center">
  <img src="docs/assets/dodge-button.png" alt="Dodge button in champ select" width="420">
</p>

<p align="center">
  <strong>Bulk Disenchant</strong><br>
  On the Loot screen, the button above the help icon opens Drake's disenchanter. Filter champion and skin shards (owned, legacy, rarity, keep one of each), see the Blue and Orange Essence you will get, review the selection, and disenchant everything at once.
</p>
<p align="center">
  <img src="docs/assets/bulk-disenchant.webp" alt="Bulk disenchant button on the Loot screen and the champion and skin selection" width="720">
</p>

<p align="center">
  <strong>Status and rank crest</strong><br>
  Set a custom status (including ASCII art) and change the profile rank crest from the overlay.
</p>
<p align="center">
  <img src="docs/assets/ascii-art-elo-changer.png" alt="ASCII art status and custom rank crest" width="360">
</p>

## Installation / How to use

1. Download the latest installer from the [GitHub Releases](https://github.com/sluucke/drake-lol/releases) page.
2. Run the installer. Windows will ask for permission (Drake installs under Program Files).
3. Drake starts in the system tray. Keep it running while you play.
4. Open League of Legends. If the client was already open, use **Reload client to apply** in the tray menu.
5. Open the overlay with **Ctrl + D**, or click the duck button in the bottom-right corner of the client.
6. Turn on the features you want. Settings are saved by the tray and survive a client restart.

In champ select, **Ctrl + Shift + D** opens the in-client team stats cards when that feature is enabled. On the Loot screen, the button above the help icon opens Bulk Disenchant. Disenchanting cannot be undone, so review the selection before you confirm.

To remove Drake, quit it from the tray menu and uninstall it from Windows Settings > Apps.

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

The plugin is strict TypeScript. `npm test` runs Vitest (React components under jsdom), `npm run typecheck` runs the TypeScript compiler, and `npm run build` bundles and minifies the overlay into `plugin/dist/index.js` and the streaming window into `plugin/dist/overlay.js`.

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo build --release --manifest-path src-tauri/Cargo.toml
```

The tray binary is `src-tauri/target/release/drake.exe`. If League is already open after a plugin change, use **Reload client to apply** in the tray (or restart client UX) so the new bundle loads.

`plugin/dist/` is committed on purpose. The Rust build embeds those files, so a clone can build without Node.

## Layout

* `plugin/` in-client overlay (React + TypeScript) and its tests
* `src-tauri/` tray app, installer, and injection
* `vendor/pengu-loader/` pinned loader core shipped with the installer

## Privacy

With **Share anonymous usage stats and error reports** on (Settings > Updates), Drake sends a random install ID, the Drake version, your League server region and language, session start and stop, and error reports with Windows user names, tokens and Riot IDs removed. It never sends your summoner name, account or match data. Turn the setting off to send nothing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) as well.

## Security

See [SECURITY.md](SECURITY.md).

## License

Drake is MIT. See [LICENSE](LICENSE).

The installer vendors a copy of Pengu Loader (`vendor/pengu-loader/`), which is MIT as well. See `vendor/pengu-loader/LICENSE`.
