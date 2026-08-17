//! Opens a URL in the user's default browser.
//!
//! The tray does this rather than the plugin, because `window.open` inside the
//! client's CEF is unreliable -- it can be swallowed entirely, with no error,
//! and the user just sees nothing happen.

use std::process::Command;

/// Hands the URL to the shell.
///
/// `cmd /c start` needs an empty first argument: `start` treats a lone quoted
/// argument as the *window title*, so `start "https://..."` opens a console
/// titled with the URL instead of opening the URL. The empty string is that
/// title.
///
/// The caller must have already checked the URL against the allow-list
/// (`configd::is_openable`); this function does not re-validate, and must not
/// be called with unchecked input.
pub fn open(url: &str) -> std::io::Result<()> {
    Command::new("cmd").args(["/C", "start", "", url]).spawn().map(|_| ())
}
