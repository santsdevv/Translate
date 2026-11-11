use std::sync::atomic::Ordering;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::capture::{self, MonitorInfo};
use crate::error::{AppError, AppResult};
use crate::geometry::{css_to_physical, CssRect, Rect};
use crate::history::NewEntry;
use crate::positioner::{self, PlaceInput};
use crate::settings::{MotionPreference, Settings};
use crate::state::{
    AppState, CaptureMode, LastRegion, Phase, PopupError, PopupGeometry, PopupPayload, PopupPhase,
};
use crate::win32;
use crate::window_manager::{self as wm, LIVE, POPUP};

pub const EVT_OVERLAY_OPEN: &str = "overlay://open";
pub const EVT_POPUP_STATE: &str = "popup://state";
pub const EVT_HISTORY_CHANGED: &str = "history://changed";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayOpen {
    frame_id: u64,
    index: usize,
    width: f64,
    height: f64,
    scale: f64,
    show_magnifier: bool,
    reduce_motion: Option<bool>,
    mode: CaptureMode,
}

pub(crate) fn reduce_motion(s: &Settings) -> Option<bool> {
    match s.general.motion {
        MotionPreference::System => None,
        MotionPreference::Reduced => Some(true),
        MotionPreference::Full => Some(false),
    }
}

pub async fn start_capture<R: Runtime>(
    app: AppHandle<R>,
    from_main: bool,
    mode: CaptureMode,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    {
        let mut phase = state.phase.lock();
        if *phase == Phase::Selecting {
            return Ok(());
        }
        *phase = Phase::Selecting;
    }
    *state.capture_mode.lock() = mode;
    let result = open_overlays(&app, from_main).await;
    if result.is_err() {
        *state.phase.lock() = Phase::Idle;
        wm::hide_overlays(&app);
        restore_after_selection(&app);
    }
    result
}

async fn open_overlays<R: Runtime>(app: &AppHandle<R>, from_main: bool) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut waited = false;

    if from_main {
        if let Some(main) = wm::main_window(app) {
            if main.is_visible().unwrap_or(false) {
                state.main_hidden_for_capture.store(true, Ordering::SeqCst);
                state.prev_foreground.store(0, Ordering::SeqCst);
                let _ = main.hide();
                waited = true;
            }
        }
    } else {
        state.main_hidden_for_capture.store(false, Ordering::SeqCst);
        state
            .prev_foreground
            .store(win32::foreground(), Ordering::SeqCst);
    }
    if wm::popup_visible(app) {
        wm::hide_popup(app);
        waited = true;
    }
    if waited {
        tokio::time::sleep(Duration::from_millis(140)).await;
    }

    let monitors = capture::monitors(app)?;
    let frame = tauri::async_runtime::spawn_blocking(move || capture::capture_all(monitors))
        .await
        .map_err(|e| AppError::Capture(e.to_string()))??;
    let frame = state.frames.set(frame);

    let infos: Vec<MonitorInfo> = frame.monitors.iter().map(|m| m.info.clone()).collect();
    let windows = wm::ensure_overlays(app, &infos)?;
    let settings = state.settings();
    state.overlays_shown.lock().clear();

    for (info, window) in infos.iter().zip(windows.iter()) {
        let payload = OverlayOpen {
            frame_id: frame.id,
            index: info.index,
            width: info.bounds.width as f64 / info.scale,
            height: info.bounds.height as f64 / info.scale,
            scale: info.scale,
            show_magnifier: settings.general.show_magnifier,
            reduce_motion: reduce_motion(&settings),
            mode: *state.capture_mode.lock(),
        };
        window.emit_to(window.label(), EVT_OVERLAY_OPEN, payload)?;
    }

    let app2 = app.clone();
    let frame_id = frame.id;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(900)).await;
        let state = app2.state::<AppState>();
        let same_frame = state
            .frames
            .get()
            .map(|f| f.id == frame_id)
            .unwrap_or(false);
        if same_frame && *state.phase.lock() == Phase::Selecting {
            for info in infos {
                overlay_ready(&app2, frame_id, info.index);
            }
        }
    });
    Ok(())
}

pub fn overlay_ready<R: Runtime>(app: &AppHandle<R>, frame_id: u64, index: usize) {
    let state = app.state::<AppState>();
    let Some(frame) = state.frames.get() else {
        return;
    };
    if frame.id != frame_id || *state.phase.lock() != Phase::Selecting {
        return;
    }
    {
        let mut shown = state.overlays_shown.lock();
        if shown.contains(&index) {
            return;
        }
        shown.push(index);
    }
    let Some(w) = app.get_webview_window(&wm::overlay_label(index)) else {
        return;
    };
    let _ = w.set_always_on_top(true);
    let _ = w.show();

    let (cx, cy) = win32::cursor();
    let under_cursor = frame
        .monitors
        .iter()
        .find(|m| m.info.bounds.contains_point(cx, cy))
        .map(|m| m.info.index);
    if under_cursor.unwrap_or(0) == index {
        let _ = w.set_focus();
    }
}

fn restore_after_selection<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if state.main_hidden_for_capture.swap(false, Ordering::SeqCst) {
        wm::show_main(app);
    } else {
        win32::restore_foreground(state.prev_foreground.load(Ordering::SeqCst));
    }
}

pub fn cancel_selection<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    *state.phase.lock() = Phase::Idle;
    wm::hide_overlays(app);
    state.frames.clear();
    restore_after_selection(app);
}

pub async fn submit_selection<R: Runtime>(
    app: AppHandle<R>,
    frame_id: u64,
    index: usize,
    rect: CssRect,
    viewport: (f64, f64),
) -> AppResult<()> {
    let state = app.state::<AppState>();
    {
        let mut phase = state.phase.lock();
        if *phase != Phase::Selecting {
            return Ok(());
        }
        *phase = Phase::Idle;
    }
    wm::hide_overlays(&app);
    let frame = state.frames.get();
    state.frames.clear();
    restore_after_selection(&app);

    let frame = frame
        .filter(|f| f.id == frame_id)
        .ok_or_else(|| AppError::Capture("seleção expirada".into()))?;
    let monitor = frame
        .monitors
        .iter()
        .find(|m| m.info.index == index)
        .ok_or_else(|| AppError::Capture("monitor não encontrado".into()))?;
    let Some(local) = css_to_physical(
        rect,
        viewport,
        monitor.image.width(),
        monitor.image.height(),
    ) else {
        return Ok(());
    };
    let image = capture::crop(&monitor.image, local)?;
    let info = monitor.info.clone();
    drop(frame);

    let anchor = Rect::new(
        info.bounds.x + local.x,
        info.bounds.y + local.y,
        local.width,
        local.height,
    );
    let mode = *state.capture_mode.lock();
    if mode == CaptureMode::Live {
        crate::live::start(app.clone(), anchor, info);
        return Ok(());
    }
    *state.last_region.lock() = Some(LastRegion {
        rect: anchor,
        monitor: info.clone(),
    });
    process(app.clone(), image, anchor, info).await;
    Ok(())
}

pub async fn recapture<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    let state = app.state::<AppState>();
    if *state.phase.lock() == Phase::Selecting {
        return Ok(());
    }
    let last = state.last_region.lock().clone();
    let Some(last) = last else {
        show_message_at_cursor(
            &app,
            "no_region",
            "Nenhuma área traduzida ainda. Use o atalho de seleção primeiro.",
        )?;
        return Ok(());
    };

    if wm::popup_visible(&app) {
        wm::hide_popup(&app);
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    let rect = last.rect;
    let image = tauri::async_runtime::spawn_blocking(move || capture::capture_region(rect))
        .await
        .map_err(|e| AppError::Capture(e.to_string()))??;
    process(app.clone(), image, last.rect, last.monitor).await;
    Ok(())
}

pub fn show_message_at_cursor<R: Runtime>(
    app: &AppHandle<R>,
    code: &str,
    message: &str,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let monitors = capture::monitors(app)?;
    let (cx, cy) = win32::cursor();
    let monitor = monitors
        .iter()
        .find(|m| m.bounds.contains_point(cx, cy))
        .or(monitors.first())
        .cloned()
        .ok_or_else(|| AppError::Capture("nenhum monitor".into()))?;
    let job = state.next_job();
    set_anchor(app, job, Rect::new(cx, cy, 1, 1), &monitor);
    let mut p = base_payload(app, job, PopupPhase::Error);
    p.error = Some(PopupError {
        code: code.into(),
        message: message.into(),
    });
    emit_popup(app, p);
    Ok(())
}

fn set_anchor<R: Runtime>(app: &AppHandle<R>, job: u64, anchor: Rect, monitor: &MonitorInfo) {
    let state = app.state::<AppState>();
    let mut g = state.popup.lock();
    g.anchor = anchor;
    g.work_area = monitor.work_area;
    g.scale = monitor.scale;
    g.side = None;
    g.job = job;
    g.cursor = win32::cursor();
    state.popup_pinned.store(false, Ordering::SeqCst);
}

pub(crate) fn base_payload<R: Runtime>(
    app: &AppHandle<R>,
    job: u64,
    phase: PopupPhase,
) -> PopupPayload {
    let s = app.state::<AppState>().settings();
    PopupPayload {
        job,
        phase,
        original: String::new(),
        translated: String::new(),
        source_lang: s.translation.source_lang.clone(),
        target_lang: s.translation.target_lang.clone(),
        detected_lang: None,
        provider: s.translation.provider.key_id().into(),
        fallback_used: false,
        error: None,
        history_id: None,
        appearance: s.popup.clone(),
        reduce_motion: reduce_motion(&s),
        live: false,
    }
}

fn emit_popup<R: Runtime>(app: &AppHandle<R>, payload: PopupPayload) {
    let state = app.state::<AppState>();
    if payload.job != state.current_job() {
        return;
    }
    *state.popup_payload.lock() = Some(payload.clone());
    if let Err(e) = app.emit_to(POPUP, EVT_POPUP_STATE, payload) {
        log::error!("falha ao enviar estado ao popup: {e}");
    }
}

async fn process<R: Runtime>(
    app: AppHandle<R>,
    image: image::RgbaImage,
    anchor: Rect,
    monitor: MonitorInfo,
) {
    let state = app.state::<AppState>();
    let job = state.next_job();
    set_anchor(&app, job, anchor, &monitor);
    let settings = state.settings();

    let source = settings.translation.source_lang.clone();
    let ocr_settings = settings.ocr.clone();
    let mut ocr_task = tauri::async_runtime::spawn_blocking(move || {
        crate::ocr::recognize(&image, &source, &ocr_settings)
    });
    let ocr = tokio::select! {
        r = &mut ocr_task => r,
        _ = tokio::time::sleep(Duration::from_millis(150)) => {
            emit_popup(&app, base_payload(&app, job, PopupPhase::Reading));
            ocr_task.await
        }
    };
    let ocr = match ocr
        .map_err(|e| AppError::Ocr(e.to_string()))
        .and_then(|r| r)
    {
        Ok(o) => o,
        Err(e) => {
            let mut p = base_payload(&app, job, PopupPhase::Error);
            p.error = Some((&e).into());
            emit_popup(&app, p);
            return;
        }
    };

    if ocr.text.trim().is_empty() {
        emit_popup(&app, base_payload(&app, job, PopupPhase::Empty));
        return;
    }

    let mut p = base_payload(&app, job, PopupPhase::Translating);
    p.original = ocr.text.clone();
    emit_popup(&app, p.clone());

    match state
        .translator
        .translate(&ocr.text, &settings.translation)
        .await
    {
        Ok(t) => {
            p.phase = PopupPhase::Done;
            p.translated = t.text.clone();
            p.detected_lang = t.detected_source.clone();
            p.provider = t.provider.key_id().into();
            p.fallback_used = t.fallback_used;
            state.remember_detected(t.detected_source.as_deref());

            if settings.general.save_history {
                let saved = state.history.insert(
                    NewEntry {
                        source_text: &ocr.text,
                        translated_text: &t.text,
                        source_lang: &settings.translation.source_lang,
                        target_lang: &settings.translation.target_lang,
                        detected_lang: t.detected_source.as_deref(),
                        provider: t.provider.key_id(),
                    },
                    settings.general.history_limit,
                );
                match saved {
                    Ok(entry) => {
                        p.history_id = Some(entry.id);
                        let _ = app.emit(EVT_HISTORY_CHANGED, ());
                    }
                    Err(e) => log::error!("histórico: {e}"),
                }
            }
            if settings.popup.auto_copy {
                let _ = app.clipboard().write_text(t.text.clone());
            }
            emit_popup(&app, p);
        }
        Err(e) => {
            p.phase = PopupPhase::Error;
            p.error = Some((&e).into());
            emit_popup(&app, p);
        }
    }
}

pub fn present_popup<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    job: u64,
    width: f64,
    height: f64,
    margin: f64,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let is_live = label == LIVE;
    let current = if is_live {
        state.live_generation.load(Ordering::SeqCst)
    } else {
        state.current_job()
    };
    if job != current || (is_live && !state.live_active.load(Ordering::SeqCst)) {
        return Ok(());
    }
    let Some(window) = app.get_webview_window(if is_live { LIVE } else { POPUP }) else {
        return Ok(());
    };
    let preference = if is_live {
        crate::settings::PopupPlacement::Auto
    } else {
        state.settings().popup.placement
    };
    let geometry: &parking_lot::Mutex<PopupGeometry> = if is_live {
        &state.live_popup
    } else {
        &state.popup
    };

    let (x, y, w, h) = {
        let mut g = geometry.lock();
        let scale = if g.scale > 0.0 { g.scale } else { 1.0 };
        let w = (width * scale).ceil().max(1.0) as u32;
        let h = (height * scale).ceil().max(1.0) as u32;
        let m = (margin * scale).round() as i32;
        let card_w = w.saturating_sub((2 * m) as u32).max(1);
        let card_h = h.saturating_sub((2 * m) as u32).max(1);
        let placement = positioner::place(&PlaceInput {
            anchor: g.anchor,
            card_w,
            card_h,
            work_area: g.work_area,
            gap: (8.0 * scale).round() as i32,
            preference,
            cursor: g.cursor,
            sticky: g.side,
        });
        g.side = Some(placement.side);
        let (x, y) = (placement.x - m, placement.y - m);
        g.window = Rect::new(placement.x, placement.y, card_w, card_h);
        (x, y, w, h)
    };

    wm::place_physical(&window, x, y, w, h);
    if !win32::is_visible(&window) {
        win32::show_no_activate(&window);
        if !is_live {
            let generation = state.popup_generation.fetch_add(1, Ordering::SeqCst) + 1;
            spawn_dismiss_watcher(app.clone(), generation);
        }
    }
    Ok(())
}

fn spawn_dismiss_watcher<R: Runtime>(app: AppHandle<R>, generation: u64) {
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let mut mouse_was_down = win32::any_mouse_button_down();
        let mut esc_was_down = win32::escape_down();
        loop {
            std::thread::sleep(Duration::from_millis(30));
            if state.popup_generation.load(Ordering::SeqCst) != generation {
                break;
            }
            let Some(window) = app.get_webview_window(POPUP) else {
                break;
            };
            if !win32::is_visible(&window) {
                break;
            }
            let s = state.settings.read().popup.clone();
            let pinned = state.popup_pinned.load(Ordering::SeqCst);

            let esc = win32::escape_down();
            if esc && !esc_was_down && s.dismiss_on_escape {
                wm::hide_popup(&app);
                break;
            }
            esc_was_down = esc;

            let mouse = win32::any_mouse_button_down();
            if mouse && !mouse_was_down && s.dismiss_on_outside_click && !pinned {
                let (cx, cy) = win32::cursor();
                let inside = state.popup.lock().window.contains_point(cx, cy);
                if !inside {
                    wm::hide_popup(&app);
                    break;
                }
            }
            mouse_was_down = mouse;

            if win32::is_foreground(&window) {
                let prev = state.prev_foreground.load(Ordering::SeqCst);
                if prev != 0 {
                    win32::restore_foreground(prev);
                }
            }
        }
    });
}
