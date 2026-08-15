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
