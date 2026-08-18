use crate::strings;

const MUTEX_NAME: &str = "Local\\Drake.Tray.SingleInstance.v1";

#[cfg(windows)]
fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn alert_already_running() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};

    let title = to_wide(strings::SINGLE_INSTANCE_TITLE);
    let message = to_wide(strings::SINGLE_INSTANCE_MESSAGE);
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONINFORMATION,
        );
    }
}

#[cfg(windows)]
fn try_acquire_guard() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
    use windows_sys::Win32::System::Threading::CreateMutexW;

    let name = to_wide(MUTEX_NAME);
    let handle: HANDLE = unsafe { CreateMutexW(std::ptr::null(), 1, name.as_ptr()) };
    if handle.is_null() {
        return false;
    }
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe {
            CloseHandle(handle);
        }
        return false;
    }
    let _ = handle;
    true
}

#[cfg(not(windows))]
fn try_acquire_guard() -> bool {
    true
}

#[cfg(not(windows))]
fn alert_already_running() {}

pub fn acquire_or_alert() -> bool {
    if try_acquire_guard() {
        return true;
    }
    alert_already_running();
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_instance_message_tells_the_user_to_quit_the_tray() {
        assert!(strings::SINGLE_INSTANCE_MESSAGE.contains("already running"));
        assert!(strings::SINGLE_INSTANCE_MESSAGE.contains("Quit"));
    }
}
