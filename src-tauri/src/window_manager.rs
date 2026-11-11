use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::capture::MonitorInfo;
use crate::error::AppResult;
use crate::state::AppState;
use crate::win32;

pub const MAIN: &str = "main";
pub const POPUP: &str = "popup";
pub const LIVE: &str = "live";

pub fn overlay_label(index: usize) -> String {
    format!("overlay-{index}")
}

pub fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(MAIN)
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = main_window(app) {
        if w.is_minimized().unwrap_or(false) {
            let _ = w.unminimize();
        }
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn toggle_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = main_window(app) {
        if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

pub fn apply_vibrancy<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    #[cfg(windows)]
    {
        window_vibrancy::apply_mica(window, Some(true)).is_ok()
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        false
    }
}

fn build_popup<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    url: &str,
) -> AppResult<WebviewWindow<R>> {
    let w = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("Translate")
        .inner_size(460.0, 220.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .build()?;
    Ok(w)
}

pub fn ensure_popups<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if app.get_webview_window(POPUP).is_none() {
        build_popup(app, POPUP, "popup.html")?;
    }
    if app.get_webview_window(LIVE).is_none() {
        build_popup(app, LIVE, "popup.html?live=1")?;
    }
    Ok(())
}

fn build_overlay<R: Runtime>(app: &AppHandle<R>, index: usize) -> AppResult<WebviewWindow<R>> {
    let w = WebviewWindowBuilder::new(
        app,
        overlay_label(index),
        WebviewUrl::App(format!("overlay.html?m={index}").into()),
    )
    .title("Translate — seleção")
    .decorations(false)
    .shadow(false)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .background_color(tauri::window::Color(0, 0, 0, 255))
    .visible(false)
    .build()?;
    Ok(w)
}

pub fn ensure_overlays<R: Runtime>(
    app: &AppHandle<R>,
    monitors: &[MonitorInfo],
) -> AppResult<Vec<WebviewWindow<R>>> {
    let mut out = Vec::with_capacity(monitors.len());
    for m in monitors {
        let w = match app.get_webview_window(&overlay_label(m.index)) {
            Some(w) => w,
            None => build_overlay(app, m.index)?,
        };
        place_physical(&w, m.bounds.x, m.bounds.y, m.bounds.width, m.bounds.height);
        out.push(w);
    }
    for (label, w) in app.webview_windows() {
        if let Some(idx) = label
            .strip_prefix("overlay-")
            .and_then(|s| s.parse::<usize>().ok())
        {
            if idx >= monitors.len() {
                let _ = w.hide();
            }
        }
    }
    Ok(out)
}

pub fn place_physical<R: Runtime>(w: &WebviewWindow<R>, x: i32, y: i32, width: u32, height: u32) {
    let _ = w.set_position(PhysicalPosition::new(x, y));
    let _ = w.set_size(PhysicalSize::new(width, height));
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

pub fn hide_overlays<R: Runtime>(app: &AppHandle<R>) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("overlay-") {
            let _ = w.hide();
        }
    }
    app.state::<AppState>().overlays_shown.lock().clear();
}

pub fn hide_popup<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(POPUP) {
        win32::hide(&w);
    }
    let state = app.state::<AppState>();
    state
        .popup_generation
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    state
        .popup_pinned
        .store(false, std::sync::atomic::Ordering::SeqCst);
}

pub fn hide_live<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(LIVE) {
        win32::hide(&w);
    }
}

pub fn popup_visible<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.get_webview_window(POPUP)
        .map(|w| win32::is_visible(&w))
        .unwrap_or(false)
}
