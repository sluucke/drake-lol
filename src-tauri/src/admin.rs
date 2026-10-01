use std::time::Duration;

pub const ELEVATED_FLAG: &str = "--elevated-relaunch";
pub const PROMPT_AFTER: Duration = Duration::from_secs(20);

pub fn is_elevated_relaunch(args: &[String]) -> bool {
    args.iter().any(|a| a == ELEVATED_FLAG)
}

pub fn prompt_text(host: &str, locale: &str) -> (String, String) {
    let lang = locale.to_ascii_lowercase();
    let message = if lang.starts_with("pt") {
        format!(
            "O Drake precisa de permissão de administrador para funcionar junto com o {host}.\n\n\
             O {host} guarda os plugins numa pasta que só administradores podem alterar.\n\n\
             Reabrir o Drake como administrador agora?\n\n\
             Se escolher Não, o Drake continua aberto, mas não carrega no cliente do League enquanto o {host} estiver ativo."
        )
    } else if lang.starts_with("es") {
        format!(
            "Drake necesita permisos de administrador para funcionar junto con {host}.\n\n\
             {host} guarda sus plugins en una carpeta que solo los administradores pueden modificar.\n\n\
             ¿Abrir Drake de nuevo como administrador ahora?\n\n\
             Si eliges No, Drake sigue abierto, pero no se carga en el cliente de League mientras {host} esté activo."
        )
    } else {
        format!(
            "Drake needs administrator rights to run together with {host}.\n\n\
             {host} keeps its plugins in a folder only administrators can change.\n\n\
             Restart Drake as administrator now?\n\n\
             If you choose No, Drake stays open but does not load in the League client while {host} is active."
        )
    };
    ("Drake".to_string(), message)
}

pub fn relaunch_script(exe: &std::path::Path) -> String {
    let path = exe.display().to_string().replace('\'', "''");
    format!(
        "try {{ Start-Process -FilePath '{path}' -ArgumentList '{ELEVATED_FLAG}' -Verb RunAs -ErrorAction Stop; exit 0 }} catch {{ exit 1 }}"
    )
}

#[derive(Debug, Default)]
pub struct PromptGate {
    since: Option<std::time::Instant>,
    asked: bool,
}

impl PromptGate {
    pub fn update(&mut self, needs_admin: bool, elevated: bool) -> bool {
        if !needs_admin {
            self.since = None;
            return false;
        }
        let since = *self.since.get_or_insert_with(std::time::Instant::now);
        if self.asked || elevated || since.elapsed() < PROMPT_AFTER {
            return false;
        }
        self.asked = true;
        true
    }

    pub fn stuck(&self) -> bool {
        self.since.is_some_and(|at| at.elapsed() >= PROMPT_AFTER)
    }

    #[cfg(test)]
    fn backdate(&mut self, by: Duration) {
        self.since = self.since.map(|at| at - by);
    }
}

#[cfg(windows)]
pub fn is_elevated() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut size = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut core::ffi::c_void,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut size,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
pub fn is_elevated() -> bool {
    false
}

#[cfg(windows)]
pub fn ask(host: &str, locale: &str) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONWARNING, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNO};
    let (title, message) = prompt_text(host, locale);
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (title, message) = (wide(&title), wide(&message));
    let result = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_YESNO | MB_ICONWARNING | MB_TOPMOST | MB_SETFOREGROUND,
        )
    };
    result == IDYES
}

#[cfg(not(windows))]
pub fn ask(_host: &str, _locale: &str) -> bool {
    false
}

#[cfg(not(windows))]
pub fn relaunch_elevated() -> std::io::Result<bool> {
    Ok(false)
}

#[cfg(windows)]
pub fn relaunch_elevated() -> std::io::Result<bool> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let exe = std::env::current_exe()?;
    let status = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &relaunch_script(&exe)])
        .creation_flags(CREATE_NO_WINDOW)
        .status()?;
    Ok(status.success())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_prompt_names_the_host_in_the_user_language() {
        let (_, pt) = prompt_text("SkLoL", "pt_BR");
        assert!(pt.contains("junto com o SkLoL"));
        let (_, es) = prompt_text("SkLoL", "es_MX");
        assert!(es.contains("junto con SkLoL"));
        let (_, en) = prompt_text("SkLoL", "");
        assert!(en.contains("together with SkLoL"));
    }

    #[test]
    fn the_relaunch_asks_windows_for_admin_and_marks_the_new_instance() {
        let script = relaunch_script(std::path::Path::new(r"C:\Program Files\Drake\Drake's.exe"));
        assert!(script.contains("-Verb RunAs"));
        assert!(script.contains(ELEVATED_FLAG));
        assert!(script.contains("Drake''s.exe"));
        assert!(is_elevated_relaunch(&["Drake.exe".into(), ELEVATED_FLAG.into()]));
        assert!(!is_elevated_relaunch(&["Drake.exe".into()]));
    }

    #[test]
    fn asks_once_after_the_folder_stays_locked_for_a_while() {
        let mut gate = PromptGate::default();
        assert!(!gate.update(true, false));
        gate.backdate(PROMPT_AFTER);
        assert!(gate.update(true, false));
        assert!(!gate.update(true, false), "only once per session");
    }

    #[test]
    fn a_locked_folder_only_counts_as_stuck_after_the_wait() {
        let mut gate = PromptGate::default();
        gate.update(true, true);
        assert!(!gate.stuck(), "the SYSTEM task usually opens it within seconds");
        gate.backdate(PROMPT_AFTER);
        assert!(gate.stuck());
        gate.update(false, true);
        assert!(!gate.stuck());
    }

    #[test]
    fn never_asks_when_already_admin_or_when_the_problem_clears() {
        let mut gate = PromptGate::default();
        gate.update(true, true);
        gate.backdate(PROMPT_AFTER);
        assert!(!gate.update(true, true));
        let mut gate = PromptGate::default();
        gate.update(true, false);
        gate.backdate(PROMPT_AFTER);
        assert!(!gate.update(false, false));
        assert!(!gate.update(true, false), "the wait starts again after the problem clears");
    }
}
