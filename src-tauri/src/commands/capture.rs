use tauri::AppHandle;

use crate::error::AppResult;
use crate::geometry::CssRect;
use crate::state::CaptureMode;
use crate::{live, pipeline};

#[tauri::command]
pub async fn capture_start(app: AppHandle) -> AppResult<()> {
    pipeline::start_capture(app, true, CaptureMode::Translate).await
}

#[tauri::command]
pub async fn live_toggle(app: AppHandle) -> AppResult<()> {
    live::toggle(app, true).await
}

#[tauri::command]
pub fn live_stop(app: AppHandle) {
    live::stop(&app);
}

#[tauri::command]
pub fn live_status(app: AppHandle) -> bool {
    live::is_active(&app)
}

#[tauri::command]
pub fn conversation_language(state: tauri::State<'_, crate::state::AppState>) -> Option<String> {
    state.last_detected.lock().clone()
}

#[tauri::command]
pub async fn capture_repeat(app: AppHandle) -> AppResult<()> {
    pipeline::recapture(app).await
}

#[tauri::command]
pub fn overlay_ready(app: AppHandle, frame_id: u64, index: usize) {
    pipeline::overlay_ready(&app, frame_id, index);
}

#[tauri::command]
pub async fn overlay_submit(
    app: AppHandle,
    frame_id: u64,
    index: usize,
    rect: CssRect,
    viewport_width: f64,
    viewport_height: f64,
) -> AppResult<()> {
    pipeline::submit_selection(
        app,
        frame_id,
        index,
        rect,
        (viewport_width, viewport_height),
    )
    .await
}

#[tauri::command]
pub fn overlay_cancel(app: AppHandle) {
    pipeline::cancel_selection(&app);
}
