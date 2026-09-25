use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ClientBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct OverlayUiState {
    pub panel_open: bool,
    pub dragging: bool,
    pub ready_check: bool,
    pub dodge: bool,
    pub bounds: Option<ClientBounds>,
    pub positions: OverlayPositions,
}

#[derive(Debug, Default)]
pub struct OverlayBridge {
    pub ui: OverlayUiState,
    pub actions: VecDeque<String>,
    pub dirty: AtomicBool,
}

impl OverlayBridge {
    pub fn push_action(&mut self, action: String) {
        if self.actions.len() < 32 {
            self.actions.push_back(action);
        }
        self.dirty.store(true, Ordering::SeqCst);
    }

    pub fn drain_actions(&mut self) -> Vec<String> {
        self.actions.drain(..).collect()
    }

    pub fn mark_dirty(&self) {
        self.dirty.store(true, Ordering::SeqCst);
    }

    pub fn take_dirty(&self) -> bool {
        self.dirty.swap(false, Ordering::SeqCst)
    }
}

pub type OverlayBridgeLock = Mutex<OverlayBridge>;

pub const WINDOW_LABEL: &str = "streaming-overlay";
pub const WDA_EXCLUDEFROMCAPTURE: u32 = 0x0000_0011;

#[derive(Debug, Clone)]
pub struct LeagueWindow {
    pub hwnd: isize,
    pub bounds: ClientBounds,
    pub minimized: bool,
    pub visible: bool,
}

pub const FOCUS_GRACE_TICKS: u32 = 4;

#[derive(Debug, Default)]
pub struct FocusGate {
    misses: u32,
}

impl FocusGate {
    pub fn update(&mut self, focused: bool) -> bool {
        if focused {
            self.misses = 0;
            return true;
        }
        self.misses = self.misses.saturating_add(1);
        self.misses < FOCUS_GRACE_TICKS
    }
}

pub fn should_show_with_focus(
    effective_overlay: bool,
    client: Option<&LeagueWindow>,
    focused: bool,
) -> bool {
    if !effective_overlay {
        return false;
    }
    let Some(client) = client else {
        return false;
    };
    if client.minimized || !client.visible {
        return false;
    }
    focused
}

pub fn league_or_overlay_focused(client: Option<&LeagueWindow>, overlay_hwnd: Option<isize>) -> bool {
    client
        .map(|c| league_related_foreground(c.hwnd, overlay_hwnd))
        .unwrap_or(false)
}

#[cfg(windows)]
fn league_related_foreground(league_hwnd: isize, overlay_hwnd: Option<isize>) -> bool {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetAncestor, GetForegroundWindow, GetWindowThreadProcessId, GA_ROOT,
    };

    let fg = unsafe { GetForegroundWindow() };
    if fg.is_null() {
        return false;
    }
    let fg_id = fg as isize;
    if overlay_hwnd == Some(fg_id) {
        return true;
    }
    if fg_id == league_hwnd {
        return true;
    }
    unsafe {
        let root = GetAncestor(fg, GA_ROOT);
        if !root.is_null() && (root as isize == league_hwnd || overlay_hwnd == Some(root as isize)) {
            return true;
        }
        let mut fg_pid = 0u32;
        let mut league_pid = 0u32;
        GetWindowThreadProcessId(fg, &mut fg_pid);
        GetWindowThreadProcessId(league_hwnd as HWND, &mut league_pid);
        fg_pid != 0 && fg_pid == league_pid
    }
}

#[cfg(not(windows))]
fn league_related_foreground(_league_hwnd: isize, _overlay_hwnd: Option<isize>) -> bool {
    false
}

pub const FAB_SIZE: (i32, i32) = (52, 52);
pub const CANCEL_SIZE: (i32, i32) = (120, 48);
pub const DODGE_SIZE: (i32, i32) = (96, 32);
pub const REL_SCALE: u32 = 10_000;
const MARGIN: i32 = 14;
const CANCEL_BOTTOM: i32 = 48;
const DODGE_RIGHT: i32 = 72;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RelPos {
    pub x: u32,
    pub y: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OverlayPositions {
    #[serde(default)]
    pub fab: Option<RelPos>,
    #[serde(default)]
    pub dodge: Option<RelPos>,
}

pub fn normalize_positions(positions: OverlayPositions) -> OverlayPositions {
    let clamp = |rel: Option<RelPos>| {
        rel.map(|r| RelPos {
            x: r.x.min(REL_SCALE),
            y: r.y.min(REL_SCALE),
        })
    };
    OverlayPositions {
        fab: clamp(positions.fab),
        dodge: clamp(positions.dodge),
    }
}

pub fn place_piece(
    client: &ClientBounds,
    rel: Option<RelPos>,
    default: (i32, i32),
    size: (i32, i32),
) -> (i32, i32) {
    let Some(rel) = rel else {
        return default;
    };
    let max_x = client.x + (client.width as i32 - size.0).max(0);
    let max_y = client.y + (client.height as i32 - size.1).max(0);
    let x = client.x + (client.width as i64 * rel.x as i64 / REL_SCALE as i64) as i32;
    let y = client.y + (client.height as i64 * rel.y as i64 / REL_SCALE as i64) as i32;
    (x.clamp(client.x, max_x), y.clamp(client.y, max_y))
}

pub fn chrome_bounds(client: &ClientBounds, ui: &OverlayUiState) -> ClientBounds {
    if ui.panel_open || ui.dragging {
        return client.clone();
    }

    let right_edge = client.x + client.width as i32;
    let bottom_edge = client.y + client.height as i32;
    let fab = place_piece(
        client,
        ui.positions.fab,
        (right_edge - MARGIN - FAB_SIZE.0, bottom_edge - MARGIN - FAB_SIZE.1),
        FAB_SIZE,
    );
    let mut left = fab.0;
    let mut top = fab.1;
    let mut right = fab.0 + FAB_SIZE.0;
    let mut bottom = fab.1 + FAB_SIZE.1;
    let mut include = |pos: (i32, i32), size: (i32, i32)| {
        left = left.min(pos.0);
        top = top.min(pos.1);
        right = right.max(pos.0 + size.0);
        bottom = bottom.max(pos.1 + size.1);
    };

    if ui.ready_check {
        let cx = client.x + client.width as i32 / 2;
        include(
            (cx - CANCEL_SIZE.0 / 2, bottom_edge - CANCEL_BOTTOM - CANCEL_SIZE.1),
            CANCEL_SIZE,
        );
    }

    if ui.dodge {
        let dodge = place_piece(
            client,
            ui.positions.dodge,
            (right_edge - DODGE_RIGHT - DODGE_SIZE.0, bottom_edge - MARGIN - DODGE_SIZE.1),
            DODGE_SIZE,
        );
        include(dodge, DODGE_SIZE);
    }

    ClientBounds {
        x: left,
        y: top,
        width: (right - left).max(1) as u32,
        height: (bottom - top).max(1) as u32,
    }
}

#[cfg(windows)]
pub fn exclude_from_capture(hwnd: isize) -> bool {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity;
    unsafe { SetWindowDisplayAffinity(hwnd as HWND, WDA_EXCLUDEFROMCAPTURE) != 0 }
}

#[cfg(not(windows))]
pub fn exclude_from_capture(_hwnd: isize) -> bool {
    false
}

#[cfg(windows)]
pub fn foreground_hwnd() -> Option<isize> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        None
    } else {
        Some(hwnd as isize)
    }
}

#[cfg(not(windows))]
pub fn foreground_hwnd() -> Option<isize> {
    None
}

#[cfg(windows)]
pub fn focus_window(hwnd: isize) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsIconic, SetForegroundWindow, ShowWindow,
        SW_RESTORE,
    };

    #[link(name = "user32")]
    unsafe extern "system" {
        fn AttachThreadInput(id_attach: u32, id_attach_to: u32, attach: i32) -> i32;
        fn BringWindowToTop(hwnd: HWND) -> i32;
    }

    unsafe {
        let h = hwnd as HWND;
        if IsIconic(h) != 0 {
            ShowWindow(h, SW_RESTORE);
        }
        let fg = GetForegroundWindow();
        let mut fg_pid = 0u32;
        let mut target_pid = 0u32;
        let fg_tid = GetWindowThreadProcessId(fg, &mut fg_pid);
        let target_tid = GetWindowThreadProcessId(h, &mut target_pid);
        let cur = GetCurrentThreadId();
        let attached_fg = !fg.is_null() && fg_tid != 0 && fg_tid != cur;
        let attached_target = target_tid != 0 && target_tid != cur && target_tid != fg_tid;
        if attached_fg {
            AttachThreadInput(cur, fg_tid, 1);
        }
        if attached_target {
            AttachThreadInput(cur, target_tid, 1);
        }
        BringWindowToTop(h);
        SetForegroundWindow(h);
        if attached_target {
            AttachThreadInput(cur, target_tid, 0);
        }
        if attached_fg {
            AttachThreadInput(cur, fg_tid, 0);
        }
    }
}

#[cfg(not(windows))]
pub fn focus_window(_hwnd: isize) {}

struct PidCache {
    at: Instant,
    pids: Vec<u32>,
}

static PID_CACHE: Mutex<Option<PidCache>> = Mutex::new(None);

fn league_pids() -> Vec<u32> {
    let now = Instant::now();
    if let Ok(guard) = PID_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if now.duration_since(cache.at) < Duration::from_millis(2000) {
                return cache.pids.clone();
            }
        }
    }

    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let pids: Vec<u32> = sys
        .processes()
        .values()
        .filter(|p| {
            p.name()
                .to_string_lossy()
                .eq_ignore_ascii_case("LeagueClientUx.exe")
        })
        .map(|p| p.pid().as_u32())
        .collect();

    if let Ok(mut guard) = PID_CACHE.lock() {
        *guard = Some(PidCache {
            at: now,
            pids: pids.clone(),
        });
    }
    pids
}

#[cfg(windows)]
pub fn find_league_window() -> Option<LeagueWindow> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        GW_OWNER,
    };

    let pids = league_pids();
    if pids.is_empty() {
        return None;
    }

    struct EnumState {
        pids: Vec<u32>,
        best: Option<(isize, i32)>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam as *mut EnumState);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if !state.pids.contains(&pid) {
            return 1;
        }
        if !GetWindow(hwnd, GW_OWNER).is_null() {
            return 1;
        }
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return 1;
        }
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        if w < 400 || h < 300 {
            return 1;
        }
        let area = w.saturating_mul(h);
        match state.best {
            Some((_, best_area)) if best_area >= area => {}
            _ => state.best = Some((hwnd as isize, area)),
        }
        1
    }

    let mut state = EnumState { pids, best: None };
    unsafe {
        EnumWindows(Some(enum_proc), &mut state as *mut _ as LPARAM);
    }
    let (hwnd, _) = state.best?;
    let rect = visible_window_rect(hwnd as HWND)?;
    let width = (rect.right - rect.left).max(0) as u32;
    let height = (rect.bottom - rect.top).max(0) as u32;
    Some(LeagueWindow {
        hwnd,
        bounds: ClientBounds {
            x: rect.left,
            y: rect.top,
            width,
            height,
        },
        minimized: unsafe { IsIconic(hwnd as HWND) != 0 },
        visible: unsafe { IsWindowVisible(hwnd as HWND) != 0 },
    })
}

#[cfg(windows)]
fn visible_window_rect(hwnd: windows_sys::Win32::Foundation::HWND) -> Option<windows_sys::Win32::Foundation::RECT> {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;

    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let frame = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as u32,
            &mut rect as *mut RECT as *mut core::ffi::c_void,
            std::mem::size_of::<RECT>() as u32,
        )
    };
    if frame == 0 && rect.right > rect.left && rect.bottom > rect.top {
        return Some(rect);
    }
    if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
        return None;
    }
    Some(rect)
}

#[cfg(not(windows))]
pub fn find_league_window() -> Option<LeagueWindow> {
    None
}

#[cfg(windows)]
fn clear_owner(overlay_hwnd: isize) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowLongPtrW, GWLP_HWNDPARENT};
    unsafe {
        SetWindowLongPtrW(overlay_hwnd as HWND, GWLP_HWNDPARENT, 0);
    }
}

#[cfg(not(windows))]
fn clear_owner(_overlay_hwnd: isize) {}

#[cfg(windows)]
fn set_no_activate(overlay_hwnd: isize, enabled: bool) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
    };
    unsafe {
        let h = overlay_hwnd as HWND;
        let mut ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
        if enabled {
            ex |= WS_EX_NOACTIVATE as isize;
        } else {
            ex &= !(WS_EX_NOACTIVATE as isize);
        }
        SetWindowLongPtrW(h, GWL_EXSTYLE, ex);
    }
}

#[cfg(not(windows))]
fn set_no_activate(_overlay_hwnd: isize, _enabled: bool) {}

pub fn ensure_window(app: &tauri::AppHandle, port: u16, token: &str) {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    if app.get_webview_window(WINDOW_LABEL).is_some() {
        return;
    }
    let url = format!("http://127.0.0.1:{port}/overlay/?token={token}&port={port}");
    let Ok(parsed) = url.parse() else {
        return;
    };
    let builder = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(parsed))
        .title("Drake")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .focused(false)
        .shadow(false);
    match builder.build() {
        Ok(_win) => {
            #[cfg(debug_assertions)]
            if std::env::var_os("DRAKE_OVERLAY_DEVTOOLS").is_some() {
                _win.open_devtools();
            }
        }
        Err(e) => eprintln!("[Drake] overlay window: {e}"),
    }
}

pub fn hide_quiet(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.hide();
    }
}

#[derive(Debug, Default)]
pub struct OverlaySyncCache {
    show: bool,
    chrome: Option<ClientBounds>,
    panel_open: bool,
}

pub fn sync_window(
    app: &tauri::AppHandle,
    show: bool,
    port: u16,
    token: &str,
    league: Option<&LeagueWindow>,
    ui: &OverlayUiState,
    was_panel_open: bool,
    cache: &mut OverlaySyncCache,
) {
    use tauri::Manager;

    ensure_window(app, port, token);

    let Some(win) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };

    if !show {
        if cache.show {
            let _ = win.hide();
            cache.show = false;
            cache.chrome = None;
        }
        return;
    }

    let Some(league) = league else {
        if cache.show {
            let _ = win.hide();
            cache.show = false;
            cache.chrome = None;
        }
        return;
    };

    let chrome = chrome_bounds(&league.bounds, ui);
    let panel_closed = was_panel_open && !ui.panel_open;
    let panel_opened = !was_panel_open && ui.panel_open;
    let need_show = !cache.show;
    let need_panel_style = cache.panel_open != ui.panel_open || need_show || panel_closed || panel_opened;

    if ui.panel_open && cache.panel_open && cache.show && !need_show {
        cache.panel_open = true;
        return;
    }

    let need_pos = panel_closed
        || panel_opened
        || need_show
        || match cache.chrome.as_ref() {
            Some(prev) => chrome_moved(prev, &chrome),
            None => true,
        };

    if need_pos {
        position_chrome(&win, &chrome);
        cache.chrome = Some(chrome);
    }

    if need_panel_style {
        if let Ok(hwnd) = win.hwnd() {
            let h = hwnd.0 as isize;
            clear_owner(h);
            set_no_activate(h, !ui.panel_open);
            let _ = exclude_from_capture(h);
        }
        let _ = win.set_always_on_top(true);
    }

    if need_show {
        let _ = win.show();
        apply_capture_exclusion(&win);
        cache.show = true;
    }

    cache.panel_open = ui.panel_open;

    if panel_closed {
        if let Ok(hwnd) = win.hwnd() {
            set_no_activate(hwnd.0 as isize, true);
        }
        focus_window(league.hwnd);
    }
}

fn position_chrome(win: &tauri::WebviewWindow, bounds: &ClientBounds) {
    let _ = win.set_position(tauri::PhysicalPosition::new(bounds.x, bounds.y));
    let _ = win.set_size(tauri::PhysicalSize::new(bounds.width, bounds.height));
}

fn chrome_moved(prev: &ClientBounds, next: &ClientBounds) -> bool {
    (prev.x - next.x).abs() > 1
        || (prev.y - next.y).abs() > 1
        || (prev.width as i32 - next.width as i32).abs() > 1
        || (prev.height as i32 - next.height as i32).abs() > 1
}

fn apply_capture_exclusion(win: &tauri::WebviewWindow) {
    #[cfg(windows)]
    {
        if let Ok(hwnd) = win.hwnd() {
            let _ = exclude_from_capture(hwnd.0 as isize);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hide_when_no_client_or_minimized() {
        assert!(!should_show_with_focus(true, None, true));
        let minimized = LeagueWindow {
            hwnd: 1,
            bounds: ClientBounds::default(),
            minimized: true,
            visible: true,
        };
        assert!(!should_show_with_focus(true, Some(&minimized), true));
    }

    #[test]
    fn chrome_fab_only_when_idle() {
        let client = ClientBounds {
            x: 100,
            y: 50,
            width: 1280,
            height: 720,
        };
        let ui = OverlayUiState::default();
        let b = chrome_bounds(&client, &ui);
        assert!(b.width <= 60);
        assert!(b.height <= 60);
        assert!(b.x > client.x);
        assert!(b.y > client.y);
    }

    #[test]
    fn chrome_fills_client_when_panel_open() {
        let client = ClientBounds {
            x: 10,
            y: 20,
            width: 800,
            height: 600,
        };
        let ui = OverlayUiState {
            panel_open: true,
            ..OverlayUiState::default()
        };
        assert_eq!(chrome_bounds(&client, &ui).width, 800);
    }

    fn client_1280() -> ClientBounds {
        ClientBounds {
            x: 100,
            y: 50,
            width: 1280,
            height: 720,
        }
    }

    #[test]
    fn chrome_follows_a_custom_button_position() {
        let ui = OverlayUiState {
            positions: OverlayPositions {
                fab: Some(RelPos { x: 5000, y: 5000 }),
                dodge: None,
            },
            ..OverlayUiState::default()
        };
        let b = chrome_bounds(&client_1280(), &ui);
        assert_eq!((b.x, b.y, b.width, b.height), (740, 410, FAB_SIZE.0 as u32, FAB_SIZE.1 as u32));
    }

    #[test]
    fn custom_positions_stay_inside_the_client() {
        let client = client_1280();
        let (x, y) = place_piece(&client, Some(RelPos { x: 10000, y: 10000 }), (0, 0), FAB_SIZE);
        assert_eq!((x, y), (100 + 1280 - FAB_SIZE.0, 50 + 720 - FAB_SIZE.1));
    }

    #[test]
    fn chrome_fills_client_while_dragging() {
        let ui = OverlayUiState {
            dragging: true,
            ..OverlayUiState::default()
        };
        assert_eq!(chrome_bounds(&client_1280(), &ui), client_1280());
    }

    #[test]
    fn dodge_dock_is_compact() {
        assert_eq!(DODGE_SIZE, (96, 32));
        let ui = OverlayUiState {
            dodge: true,
            positions: OverlayPositions {
                fab: None,
                dodge: Some(RelPos { x: 0, y: 0 }),
            },
            ..OverlayUiState::default()
        };
        let b = chrome_bounds(&client_1280(), &ui);
        assert_eq!((b.x, b.y), (100, 50));
    }

    #[test]
    fn relative_positions_are_clamped() {
        let p = normalize_positions(OverlayPositions {
            fab: Some(RelPos { x: 20000, y: 3 }),
            dodge: None,
        });
        assert_eq!(p.fab, Some(RelPos { x: 10000, y: 3 }));
        assert_eq!(p.dodge, None);
    }

    #[test]
    fn action_queue_drains() {
        let mut b = OverlayBridge::default();
        b.push_action("cancel".into());
        b.push_action("dodge".into());
        assert_eq!(b.drain_actions(), vec!["cancel", "dodge"]);
        assert!(b.drain_actions().is_empty());
    }

    #[test]
    fn open_panel_still_hides_when_another_app_is_in_front() {
        let client = LeagueWindow {
            hwnd: 1,
            bounds: ClientBounds::default(),
            minimized: false,
            visible: true,
        };
        assert!(!should_show_with_focus(true, Some(&client), false));
        assert!(should_show_with_focus(true, Some(&client), true));
        assert!(!should_show_with_focus(false, Some(&client), true));
    }

    #[test]
    fn focus_gate_ignores_brief_focus_gaps() {
        let mut gate = FocusGate::default();
        assert!(gate.update(true));
        for _ in 0..FOCUS_GRACE_TICKS - 1 {
            assert!(gate.update(false), "a short gap keeps the overlay");
        }
        assert!(!gate.update(false), "a sustained loss of focus hides it");
        assert!(gate.update(true), "focus back shows it at once");
    }
}
