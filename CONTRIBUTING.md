# Contributing

Thanks for wanting to help. Small, focused changes are easier to review than large ones.

## Setup

Follow the Development section in [README.md](README.md). Run the plugin tests and the Rust tests before you open a pull request.

```bash
cd plugin
npm test
npm run build
```

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

If you change overlay code, rebuild `plugin/dist/index.js` and include that file in the same change. The tray embeds it at compile time.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). Subject only, no body:

* `feat: add a second auto pick champion`
* `fix: retry pick after a client refusal`
* `docs: describe how to build the overlay`

Do not add `Co-authored-by` trailers.

## Pull requests

* Describe what changed and why.
* Do not commit secrets, lockfiles from the League client, or `%PROGRAMDATA%\Drake` data.
* Do not expand scope into unrelated refactors.

## Conduct

Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
