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

pub fn parse_plugins_dir(config: &str) -> Option<PathBuf> {
    config
        .lines()
        .map(str::trim)
        .filter(|line| !line.starts_with(';') && !line.starts_with('#'))
        .filter_map(|line| line.split_once('='))
        .filter(|(key, _)| key.trim().eq_ignore_ascii_case("plugins_dir"))
        .map(|(_, value)| value.trim().trim_matches('"').trim().to_string())
        .find(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub fn plugins_root(loader_dir: &Path) -> PathBuf {
    std::fs::read_to_string(loader_dir.join("config"))
        .ok()
        .and_then(|config| parse_plugins_dir(&config))
        .map(|dir| if dir.is_absolute() { dir } else { loader_dir.join(dir) })
        .unwrap_or_else(|| loader_dir.join("plugins"))
}

pub fn plugin_dir(loader_dir: &Path) -> PathBuf {
    plugins_root(loader_dir).join(PLUGIN_FOLDER_NAME)
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
    fn reads_the_plugins_folder_a_loader_configures() {
        let config = "; Gerado pelo SkLoLLauncher.\nplugins_dir = C:\\Program Files\\SkLoL\\plugin\nuse_devtools = false\n";
        assert_eq!(parse_plugins_dir(config), Some(PathBuf::from(r"C:\Program Files\SkLoL\plugin")));
        assert_eq!(parse_plugins_dir("PLUGINS_DIR=\"D:\\x\"\n"), Some(PathBuf::from(r"D:\x")));
        assert_eq!(parse_plugins_dir("; plugins_dir = C:\\nope\nuse_devtools = true"), None);
        assert_eq!(parse_plugins_dir("plugins_dir =   \n"), None);
    }

    #[test]
    fn deploys_where_the_loader_config_points() {
        let tmp = tempfile::tempdir().unwrap();
        let loader = tmp.path().join("core");
        std::fs::create_dir_all(&loader).unwrap();
        assert_eq!(plugin_dir(&loader), loader.join("plugins").join("Drake"));
        let custom = tmp.path().join("plugin");
        std::fs::write(loader.join("config"), format!("plugins_dir = {}\n", custom.display())).unwrap();
        assert_eq!(plugin_dir(&loader), custom.join("Drake"));
        std::fs::write(loader.join("config"), "plugins_dir = extras\n").unwrap();
        assert_eq!(plugin_dir(&loader), loader.join("extras").join("Drake"));
        ensure_plugin(&loader, "x").unwrap();
        assert!(loader.join("extras").join("Drake").join("index.js").is_file());
    }

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
