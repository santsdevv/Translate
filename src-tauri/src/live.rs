use std::sync::atomic::Ordering;
use std::time::Duration;

use futures::stream::{self, StreamExt};
use image::imageops::{self, FilterType};
use image::RgbaImage;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::capture::{self, MonitorInfo};
use crate::error::{AppError, AppResult};
use crate::geometry::Rect;
use crate::pipeline::{base_payload, start_capture};
use crate::settings::{Provider, TranslationSettings};
use crate::state::{AppState, CaptureMode, PopupPayload, PopupPhase};
use crate::translate::Translator;
use crate::win32;
use crate::window_manager::{self as wm, LIVE};

pub const EVT_LIVE_STATE: &str = "live://state";
pub const EVT_LIVE_ACTIVE: &str = "live://active";

const PARALLEL_REQUESTS: usize = 4;

pub fn is_active<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.state::<AppState>().live_active.load(Ordering::SeqCst)
}

pub async fn toggle<R: Runtime>(app: AppHandle<R>, from_main: bool) -> AppResult<()> {
    if is_active(&app) {
        stop(&app);
        Ok(())
    } else {
        start_capture(app, from_main, CaptureMode::Live).await
    }
}

pub fn start<R: Runtime>(app: AppHandle<R>, rect: Rect, monitor: MonitorInfo) {
    let state = app.state::<AppState>();
    let generation = state.live_generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.live_active.store(true, Ordering::SeqCst);
    {
        let mut g = state.live_popup.lock();
        g.anchor = rect;
        g.work_area = monitor.work_area;
        g.scale = monitor.scale;
        g.side = None;
        g.job = generation;
        g.cursor = win32::cursor();
    }
    if let Some(w) = app.get_webview_window(LIVE) {
        win32::set_exclude_from_capture(&w, true);
    }
    let _ = app.emit(EVT_LIVE_ACTIVE, true);
    emit_live(&app, live_payload(&app, generation, PopupPhase::Reading));

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move { run(app2, generation, rect).await });
}

pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    state.live_active.store(false, Ordering::SeqCst);
    state.live_generation.fetch_add(1, Ordering::SeqCst);
    wm::hide_live(app);
    if let Some(w) = app.get_webview_window(LIVE) {
        win32::set_exclude_from_capture(&w, false);
    }
    *state.live_payload.lock() = None;
    let _ = app.emit(EVT_LIVE_ACTIVE, false);
}

fn alive<R: Runtime>(app: &AppHandle<R>, generation: u64) -> bool {
    let state = app.state::<AppState>();
    state.live_active.load(Ordering::SeqCst)
        && state.live_generation.load(Ordering::SeqCst) == generation
}

fn live_payload<R: Runtime>(
    app: &AppHandle<R>,
    generation: u64,
    phase: PopupPhase,
) -> PopupPayload {
    let settings = app.state::<AppState>().settings();
    let mut p = base_payload(app, generation, phase);
    p.live = true;
    p.appearance.show_original = settings.live.show_original;
    p.appearance.auto_close = false;
    p
}

fn emit_live<R: Runtime>(app: &AppHandle<R>, payload: PopupPayload) {
    if !alive(app, payload.job) {
        return;
    }
    *app.state::<AppState>().live_payload.lock() = Some(payload.clone());
    if let Err(e) = app.emit_to(LIVE, EVT_LIVE_STATE, payload) {
        log::error!("falha ao enviar estado ao vivo: {e}");
    }
}

async fn capture(rect: Rect) -> AppResult<RgbaImage> {
    tauri::async_runtime::spawn_blocking(move || capture::capture_region(rect))
        .await
        .map_err(|e| AppError::Capture(e.to_string()))?
}

async fn run<R: Runtime>(app: AppHandle<R>, generation: u64, rect: Rect) {
    let mut last_sig: Option<Signature> = None;
    let mut last_text: Option<String> = None;
    let mut failures = 0u32;

    while alive(&app, generation) {
        let settings = app.state::<AppState>().settings();
        let interval = Duration::from_millis(settings.live.interval_ms as u64);

        let mut image = match capture(rect).await {
            Ok(img) => img,
            Err(e) => {
                failures += 1;
                if failures >= 5 {
                    let mut p = live_payload(&app, generation, PopupPhase::Error);
                    p.error = Some((&e).into());
                    emit_live(&app, p);
                }
                tokio::time::sleep(interval * 2).await;
                continue;
            }
        };
        failures = 0;

        let mut sig = Signature::of(&image);
        if let Some(prev) = &last_sig {
            if !prev.differs(&sig) {
                tokio::time::sleep(interval).await;
                continue;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
            if !alive(&app, generation) {
                break;
            }
            match capture(rect).await {
                Ok(again) => {
                    let sig2 = Signature::of(&again);
                    if sig.differs(&sig2) {
                        tokio::time::sleep(interval).await;
                        continue;
                    }
                    image = again;
                    sig = sig2;
                }
                Err(_) => continue,
            }
        }
        last_sig = Some(sig);

        let source = settings.translation.source_lang.clone();
        let ocr_settings = settings.ocr.clone();
        let ocr = tauri::async_runtime::spawn_blocking(move || {
            crate::ocr::recognize(&image, &source, &ocr_settings)
        })
        .await
        .map_err(|e| AppError::Ocr(e.to_string()))
        .and_then(|r| r);
        let text = match ocr {
            Ok(o) => o.text,
            Err(e) => {
                let mut p = live_payload(&app, generation, PopupPhase::Error);
                p.error = Some((&e).into());
                emit_live(&app, p);
                last_sig = None;
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };

        if last_text.as_deref() == Some(text.as_str()) {
            tokio::time::sleep(interval).await;
            continue;
        }
        if text.trim().is_empty() {
            last_text = Some(text);
            emit_live(&app, live_payload(&app, generation, PopupPhase::Empty));
            tokio::time::sleep(interval).await;
            continue;
        }

        let first = last_text.is_none();
        let mut p = live_payload(&app, generation, PopupPhase::Translating);
        p.original = text.clone();
        if first {
            emit_live(&app, p.clone());
        }

        let state = app.state::<AppState>();
        match translate_paragraphs(&state.translator, &text, &settings.translation).await {
            Ok(out) => {
                state.remember_detected(out.detected.as_deref());
                p.phase = PopupPhase::Done;
                p.translated = out.text;
                p.detected_lang = out.detected;
                p.provider = out.provider.key_id().into();
                p.fallback_used = out.fallback_used;
                emit_live(&app, p);
                last_text = Some(text);
            }
            Err(e) => {
                p.phase = PopupPhase::Error;
                p.error = Some((&e).into());
                emit_live(&app, p);
                last_sig = None;
                tokio::time::sleep(interval * 3).await;
                continue;
            }
        }
        tokio::time::sleep(interval).await;
    }
}

pub(crate) struct ParagraphTranslation {
    pub text: String,
    pub detected: Option<String>,
    pub provider: Provider,
    pub fallback_used: bool,
}

pub(crate) async fn translate_paragraphs(
    translator: &Translator,
    text: &str,
    settings: &TranslationSettings,
) -> AppResult<ParagraphTranslation> {
    let paragraphs: Vec<String> = text.split('\n').map(str::to_owned).collect();
    let tasks = paragraphs
        .clone()
        .into_iter()
        .map(|p| async move { translator.translate(&p, settings).await });
    let results: Vec<_> = stream::iter(tasks)
        .buffered(PARALLEL_REQUESTS)
        .collect()
        .await;

    let mut out = Vec::with_capacity(paragraphs.len());
    let mut detected: Vec<String> = Vec::new();
    let mut provider = settings.provider;
    let mut fallback_used = false;
    let mut first_err = None;
    let mut ok = 0usize;
    for (para, res) in paragraphs.iter().zip(results) {
        match res {
            Ok(t) => {
                if !para.trim().is_empty() {
                    ok += 1;
                    provider = t.provider;
                    fallback_used |= t.fallback_used;
                    if let Some(d) = t.detected_source {
                        detected.push(d);
                    }
                }
                out.push(t.text);
            }
            Err(e) => {
                out.push(para.to_string());
                first_err.get_or_insert(e);
            }
        }
    }
    if ok == 0 {
        if let Some(e) = first_err {
            return Err(e);
        }
    }
    Ok(ParagraphTranslation {
        text: out.join("\n"),
        detected: most_common(detected),
        provider,
        fallback_used,
    })
}

fn most_common(items: Vec<String>) -> Option<String> {
    let mut counts: Vec<(String, usize)> = Vec::new();
    for item in items {
        match counts.iter_mut().find(|(k, _)| *k == item) {
            Some((_, n)) => *n += 1,
            None => counts.push((item, 1)),
        }
    }
    counts.into_iter().max_by_key(|(_, n)| *n).map(|(k, _)| k)
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Signature {
    width: u32,
    height: u32,
    pixels: Vec<u8>,
}

impl Signature {
    pub fn of(img: &RgbaImage) -> Self {
        let (w, h) = img.dimensions();
        let max = w.max(h).max(1) as f32;
        let scale = (160.0 / max).min(1.0);
        let tw = ((w as f32 * scale).round() as u32).max(1);
        let th = ((h as f32 * scale).round() as u32).max(1);
        let small = imageops::resize(img, tw, th, FilterType::Triangle);
        let pixels = small
            .pixels()
            .map(|p| ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8)
            .collect();
        Self {
            width: tw,
            height: th,
            pixels,
        }
    }

    pub fn differs(&self, other: &Signature) -> bool {
        if self.width != other.width || self.height != other.height {
            return true;
        }
        let changed = self
            .pixels
            .iter()
            .zip(&other.pixels)
            .filter(|(a, b)| a.abs_diff(**b) > 24)
            .count();
        let threshold = ((self.pixels.len() as f32) * 0.002).ceil().max(2.0) as usize;
        changed >= threshold
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn chat(lines: u32) -> RgbaImage {
        let mut img = RgbaImage::from_pixel(600, 400, Rgba([54, 57, 63, 255]));
        for l in 0..lines {
            for y in (20 + l * 40)..(34 + l * 40) {
                for x in 20..(200 + (l * 37) % 300) {
                    img.put_pixel(x, y, Rgba([220, 221, 222, 255]));
                }
            }
        }
        img
    }

    #[test]
    fn detects_new_message() {
        assert!(Signature::of(&chat(3)).differs(&Signature::of(&chat(4))));
    }

    #[test]
    fn ignores_blinking_caret() {
        let a = chat(3);
        let mut b = a.clone();
        for y in 360..378 {
            b.put_pixel(30, y, Rgba([255, 255, 255, 255]));
        }
        assert!(!Signature::of(&a).differs(&Signature::of(&b)));
        assert!(!Signature::of(&a).differs(&Signature::of(&a.clone())));
    }

    #[test]
    fn picks_most_common_language() {
        let v = vec!["en".to_string(), "es".into(), "en".into()];
        assert_eq!(most_common(v), Some("en".into()));
        assert_eq!(most_common(vec![]), None);
    }
}
