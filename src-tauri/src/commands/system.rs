use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::ocr::{self, OcrLanguage};
use crate::state::AppState;
use crate::window_manager as wm;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub platform: &'static str,
    pub vibrancy: bool,
}

#[tauri::command]
pub fn app_ready(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    if !state.start_hidden.swap(false, Ordering::SeqCst) {
        wm::show_main(&app);
    }
    app_info(state)
}

#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        platform: std::env::consts::OS,
        vibrancy: state.vibrancy.load(Ordering::SeqCst),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatus {
    pub available: bool,
    pub languages: Vec<OcrLanguage>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn ocr_status() -> OcrStatus {
    match tauri::async_runtime::spawn_blocking(ocr::languages).await {
        Ok(Ok(languages)) => OcrStatus {
            available: true,
            languages,
            error: None,
        },
        Ok(Err(e)) => OcrStatus {
            available: false,
            languages: vec![],
            error: Some(e.to_string()),
        },
        Err(e) => OcrStatus {
            available: false,
            languages: vec![],
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
pub fn ocr_install(app: AppHandle, code: String) -> AppResult<()> {
    let capability = ocr::capability_name(&code)
        .ok_or_else(|| AppError::Other("Este idioma não tem pacote de OCR no Windows.".into()))?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use tauri::Emitter;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let elevated = format!(
            "$Host.UI.RawUI.WindowTitle = 'Translate'; \
             Write-Host 'Instalando o reconhecimento de texto ({code}). Isso pode levar alguns minutos...'; \
             Add-WindowsCapability -Online -Name '{capability}' | Out-Null; \
             Write-Host 'Pronto.'; Start-Sleep -Seconds 2"
        );
        let script = format!(
            "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand {}'",
            encode_ps(&elevated)
        );
        let mut child = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-EncodedCommand",
                &encode_ps(&script),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| AppError::Other(format!("não foi possível iniciar o instalador: {e}")))?;
        std::thread::spawn(move || {
            let ok = child.wait().map(|s| s.success()).unwrap_or(false);
            let _ = app.emit("ocr://changed", ok);
        });
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, capability);
        Err(AppError::OcrUnsupported)
    }
}

#[tauri::command]
pub fn open_language_settings() -> AppResult<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg("ms-settings:regionlanguage")
            .spawn()?;
    }
    Ok(())
}

#[cfg_attr(not(windows), allow(dead_code))]
fn encode_ps(script: &str) -> String {
    use base64::Engine;
    let bytes: Vec<u8> = script
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    const ALLOWED: [&str; 3] = [
        "https://www.deepl.com/",
        "https://portal.azure.com/",
        "https://learn.microsoft.com/",
    ];
    if !ALLOWED.iter().any(|p| url.starts_with(p)) {
        return Err(AppError::Other("link não permitido".into()));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}
