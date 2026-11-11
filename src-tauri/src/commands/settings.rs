use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;

use crate::error::{AppError, AppResult};
use crate::settings::{Provider, Settings};
use crate::shortcuts::{self, Action, ShortcutFailure};
use crate::state::AppState;
use crate::{secrets, tray};

pub const EVT_SETTINGS_CHANGED: &str = "settings://changed";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResult {
    pub settings: Settings,
    pub shortcut_failures: Vec<ShortcutFailure>,
}

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn settings_update(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> AppResult<UpdateResult> {
    let mut next = settings.sanitized();
    let prev = state.settings();
    let mut failures = Vec::new();

    if next.shortcuts != prev.shortcuts {
        failures = shortcuts::apply(&app, &next.shortcuts);
        if !failures.is_empty() {
            for f in &failures {
                match f.action {
                    Action::Capture => next.shortcuts.capture = prev.shortcuts.capture.clone(),
                    Action::Recapture => {
                        next.shortcuts.recapture = prev.shortcuts.recapture.clone()
                    }
                    Action::ShowWindow => {
                        next.shortcuts.show_window = prev.shortcuts.show_window.clone()
                    }
                    Action::Live => next.shortcuts.live = prev.shortcuts.live.clone(),
                    Action::Compose => next.shortcuts.compose = prev.shortcuts.compose.clone(),
                }
            }
            let _ = shortcuts::apply(&app, &next.shortcuts);
        }
        *state.shortcut_failures.lock() = Vec::new();
        tray::refresh(&app, &next.shortcuts);
    }

    if next.general.launch_at_startup != prev.general.launch_at_startup {
        let launcher = app.autolaunch();
        let r = if next.general.launch_at_startup {
            launcher.enable()
        } else {
            launcher.disable()
        };
        if let Err(e) = r {
            log::warn!("autostart: {e}");
            next.general.launch_at_startup = prev.general.launch_at_startup;
        }
    }

    if next.translation != prev.translation {
        state.translator.clear_cache();
    }

    state.store.save(&next)?;
    *state.settings.write() = next.clone();
    let _ = app.emit(EVT_SETTINGS_CHANGED, &next);
    Ok(UpdateResult {
        settings: next,
        shortcut_failures: failures,
    })
}

#[tauri::command]
pub fn settings_reset(app: AppHandle, state: State<'_, AppState>) -> AppResult<UpdateResult> {
    let mut defaults = Settings {
        onboarded: true,
        ..Settings::default()
    };
    defaults.general.launch_at_startup = state.settings().general.launch_at_startup;
    settings_update(app, state, defaults)
}

#[tauri::command]
pub fn shortcuts_suspend(app: AppHandle, state: State<'_, AppState>, suspended: bool) {
    shortcuts::set_suspended(&app, suspended, &state.settings().shortcuts);
}

#[tauri::command]
pub fn shortcut_validate(accelerator: String) -> AppResult<()> {
    shortcuts::parse(&accelerator).map(|_| ())
}

#[tauri::command]
pub fn shortcuts_status(state: State<'_, AppState>) -> Vec<ShortcutFailure> {
    state.shortcut_failures.lock().clone()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: Provider,
    pub needs_key: bool,
    pub has_key: bool,
    pub key_hint: Option<String>,
}

#[tauri::command]
pub fn provider_status() -> Vec<ProviderStatus> {
    [Provider::Google, Provider::Deepl, Provider::Microsoft]
        .into_iter()
        .map(|p| ProviderStatus {
            provider: p,
            needs_key: p != Provider::Google,
            has_key: p == Provider::Google || secrets::has(p),
            key_hint: secrets::hint(p),
        })
        .collect()
}

#[tauri::command]
pub fn provider_set_key(
    state: State<'_, AppState>,
    provider: Provider,
    key: String,
) -> AppResult<()> {
    if provider == Provider::Google {
        return Err(AppError::Other("O Google Tradutor não usa chave.".into()));
    }
    secrets::set(provider, &key)?;
    state.translator.clear_cache();
    Ok(())
}

#[tauri::command]
pub async fn provider_test(state: State<'_, AppState>, provider: Provider) -> AppResult<u64> {
    let settings = state.settings().translation;
    state.translator.test(provider, &settings).await
}
