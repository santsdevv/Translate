use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::error::{AppError, AppResult};
use crate::settings::ShortcutSettings;
use crate::state::CaptureMode;
use crate::{compose, live, pipeline, win32, window_manager as wm};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Capture,
    Recapture,
    ShowWindow,
    Live,
    Compose,
}

fn registry() -> &'static Mutex<HashMap<u32, Action>> {
    static REG: OnceLock<Mutex<HashMap<u32, Action>>> = OnceLock::new();
    REG.get_or_init(Default::default)
}

static SUSPENDED: AtomicBool = AtomicBool::new(false);

pub fn parse(accelerator: &str) -> AppResult<Shortcut> {
    let acc = accelerator.trim();
    if acc.is_empty() {
        return Err(AppError::InvalidShortcut(accelerator.into()));
    }
    let shortcut: Shortcut = acc
        .parse()
        .map_err(|_| AppError::InvalidShortcut(accelerator.into()))?;
    let key = acc
        .rsplit('+')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    let is_fn_key = key.starts_with('F') && key[1..].parse::<u8>().is_ok();
    if shortcut.mods.is_empty() && !is_fn_key {
        return Err(AppError::InvalidShortcut(accelerator.into()));
    }
    Ok(shortcut)
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed || SUSPENDED.load(Ordering::SeqCst) {
        return;
    }
    let Some(action) = registry().lock().get(&shortcut.id()).copied() else {
        return;
    };
    let app = app.clone();
    match action {
        Action::Capture => {
            tauri::async_runtime::spawn(async move {
                if let Err(e) = pipeline::start_capture(app, false, CaptureMode::Translate).await {
                    log::error!("captura: {e}");
                }
            });
        }
        Action::Recapture => {
            tauri::async_runtime::spawn(async move {
                if let Err(e) = pipeline::recapture(app).await {
                    log::error!("repetir área: {e}");
                }
            });
        }
        Action::ShowWindow => wm::toggle_main(&app),
        Action::Live => {
            tauri::async_runtime::spawn(async move {
                if let Err(e) = live::toggle(app, false).await {
                    log::error!("ao vivo: {e}");
                }
            });
        }
        Action::Compose => {
            if win32::alt_down() {
                win32::send_mask_key();
            }
            tauri::async_runtime::spawn(async move {
                if let Err(e) = compose::run(app.clone()).await {
                    let _ = pipeline::show_message_at_cursor(&app, e.code(), &e.to_string());
                }
            });
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutFailure {
    pub action: Action,
    pub accelerator: String,
    pub message: String,
}

pub fn apply<R: Runtime>(app: &AppHandle<R>, cfg: &ShortcutSettings) -> Vec<ShortcutFailure> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    registry().lock().clear();

    let mut failures = Vec::new();
    let mut seen: HashMap<u32, Action> = HashMap::new();
    for (action, acc) in [
        (Action::Capture, &cfg.capture),
        (Action::Recapture, &cfg.recapture),
        (Action::ShowWindow, &cfg.show_window),
        (Action::Live, &cfg.live),
        (Action::Compose, &cfg.compose),
    ] {
        if acc.trim().is_empty() {
            continue;
        }
        let result = parse(acc).and_then(|sc| {
            if seen.contains_key(&sc.id()) {
                return Err(AppError::Other(format!(
                    "\"{acc}\" já está em uso por outra ação do Translate."
                )));
            }
            gs.register(sc)
                .map_err(|_| AppError::ShortcutInUse(acc.clone()))?;
            seen.insert(sc.id(), action);
            Ok(())
        });
        if let Err(e) = result {
            failures.push(ShortcutFailure {
                action,
                accelerator: acc.clone(),
                message: e.to_string(),
            });
        }
    }
    *registry().lock() = seen;
    failures
}

pub fn set_suspended<R: Runtime>(app: &AppHandle<R>, suspended: bool, cfg: &ShortcutSettings) {
    SUSPENDED.store(suspended, Ordering::SeqCst);
    if suspended {
        let _ = app.global_shortcut().unregister_all();
    } else {
        apply(app, cfg);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_accelerators() {
        assert!(parse("Alt+Q").is_ok());
        assert!(parse("Ctrl+Shift+F2").is_ok());
        assert!(parse("F8").is_ok());
        assert!(parse("Q").is_err());
        assert!(parse("").is_err());
        assert!(parse("Alt+").is_err());
    }
}
