use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::error::{AppError, AppResult};
use crate::state::{AppState, PopupPayload};
use crate::{pipeline, window_manager as wm};

#[tauri::command]
pub fn popup_current(state: State<'_, AppState>, live: Option<bool>) -> Option<PopupPayload> {
    if live.unwrap_or(false) {
        state.live_payload.lock().clone()
    } else {
        state.popup_payload.lock().clone()
    }
}

#[tauri::command]
pub fn popup_present(
    app: AppHandle,
    window: tauri::WebviewWindow,
    job: u64,
    width: f64,
    height: f64,
    margin: f64,
) -> AppResult<()> {
    pipeline::present_popup(&app, window.label(), job, width, height, margin)
}

#[tauri::command]
pub fn popup_close(app: AppHandle) {
    wm::hide_popup(&app);
}

#[tauri::command]
pub fn popup_pin(state: State<'_, AppState>, pinned: bool) {
    state.popup_pinned.store(pinned, Ordering::SeqCst);
}

#[tauri::command]
pub fn open_main(app: AppHandle, route: Option<String>) {
    wm::show_main(&app);
    if let Some(route) = route {
        let _ = app.emit_to(wm::MAIN, "app://navigate", route);
    }
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> AppResult<()> {
    app.clipboard()
        .write_text(text)
        .map_err(|e| AppError::Other(format!("não foi possível copiar: {e}")))
}
