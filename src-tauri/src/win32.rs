use tauri::{Runtime, WebviewWindow};

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::Win32::Foundation::{HWND, POINT};
    use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
        KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_ESCAPE, VK_LBUTTON, VK_LWIN, VK_MBUTTON,
        VK_MENU, VK_RBUTTON, VK_RWIN, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, IsWindow, IsWindowVisible, SetForegroundWindow,
        SetWindowDisplayAffinity, SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE, WDA_EXCLUDEFROMCAPTURE,
        WDA_NONE,
    };

    fn hwnd<R: Runtime>(w: &WebviewWindow<R>) -> Option<HWND> {
        w.hwnd().ok()
    }

    pub fn foreground() -> isize {
        unsafe { GetForegroundWindow().0 as isize }
    }

    pub fn restore_foreground(handle: isize) {
        if handle == 0 {
            return;
        }
        let h = HWND(handle as *mut _);
        unsafe {
            if IsWindow(Some(h)).as_bool() {
                let _ = SetForegroundWindow(h);
            }
        }
    }

    pub fn is_foreground<R: Runtime>(w: &WebviewWindow<R>) -> bool {
        hwnd(w)
            .map(|h| unsafe { GetForegroundWindow() } == h)
            .unwrap_or(false)
    }

    pub fn show_no_activate<R: Runtime>(w: &WebviewWindow<R>) {
        if let Some(h) = hwnd(w) {
            unsafe {
                let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
                let _ = SetWindowPos(
                    h,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
            }
        }
    }

    pub fn hide<R: Runtime>(w: &WebviewWindow<R>) {
        if let Some(h) = hwnd(w) {
            unsafe {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
    }

    pub fn is_visible<R: Runtime>(w: &WebviewWindow<R>) -> bool {
        hwnd(w)
            .map(|h| unsafe { IsWindowVisible(h).as_bool() })
            .unwrap_or(false)
    }

    pub fn cursor() -> (i32, i32) {
        let mut p = POINT::default();
        unsafe {
            let _ = GetCursorPos(&mut p);
        }
        (p.x, p.y)
    }

    fn down(vk: u16) -> bool {
        unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
    }

    pub fn any_mouse_button_down() -> bool {
        down(VK_LBUTTON.0) || down(VK_RBUTTON.0) || down(VK_MBUTTON.0)
    }

    pub fn escape_down() -> bool {
        down(VK_ESCAPE.0)
    }

    pub fn set_exclude_from_capture<R: Runtime>(w: &WebviewWindow<R>, exclude: bool) {
        if let Some(h) = hwnd(w) {
            let affinity = if exclude {
                WDA_EXCLUDEFROMCAPTURE
            } else {
                WDA_NONE
            };
            unsafe {
                let _ = SetWindowDisplayAffinity(h, affinity);
            }
        }
    }

    fn key(vk: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: if up {
                        KEYEVENTF_KEYUP
                    } else {
                        KEYBD_EVENT_FLAGS(0)
                    },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    pub fn send_ctrl(letter: u8) {
        let inputs = [
            key(VK_CONTROL.0, false),
            key(letter as u16, false),
            key(letter as u16, true),
            key(VK_CONTROL.0, true),
        ];
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    pub fn send_mask_key() {
        let inputs = [key(0xE8, false), key(0xE8, true)];
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    pub fn alt_down() -> bool {
        down(VK_MENU.0)
    }

    pub fn any_modifier_down() -> bool {
        [VK_MENU, VK_CONTROL, VK_SHIFT, VK_LWIN, VK_RWIN]
            .iter()
            .any(|k| down(k.0))
    }

    pub fn clipboard_sequence() -> u32 {
        unsafe { GetClipboardSequenceNumber() }
    }
}
#[cfg(not(windows))]
mod imp {
    use super::*;

    pub fn foreground() -> isize {
        0
    }
    pub fn restore_foreground(_handle: isize) {}
    pub fn is_foreground<R: Runtime>(w: &WebviewWindow<R>) -> bool {
        w.is_focused().unwrap_or(false)
    }
    pub fn show_no_activate<R: Runtime>(w: &WebviewWindow<R>) {
        let _ = w.show();
    }
    pub fn hide<R: Runtime>(w: &WebviewWindow<R>) {
        let _ = w.hide();
    }
    pub fn is_visible<R: Runtime>(w: &WebviewWindow<R>) -> bool {
        w.is_visible().unwrap_or(false)
    }
    pub fn cursor() -> (i32, i32) {
        (0, 0)
    }
    pub fn any_mouse_button_down() -> bool {
        false
    }
    pub fn escape_down() -> bool {
        false
    }
    pub fn set_exclude_from_capture<R: Runtime>(_w: &WebviewWindow<R>, _exclude: bool) {}
    pub fn send_ctrl(_letter: u8) {}
    pub fn send_mask_key() {}
    pub fn alt_down() -> bool {
        false
    }
    pub fn any_modifier_down() -> bool {
        false
    }
    pub fn clipboard_sequence() -> u32 {
        0
    }
}

pub use imp::*;
