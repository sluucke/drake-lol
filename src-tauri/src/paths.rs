use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    let program_data = std::env::var("PROGRAMDATA").expect("PROGRAMDATA is always set on Windows");
    PathBuf::from(program_data).join("Drake")
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
