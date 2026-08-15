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
