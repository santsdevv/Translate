use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::error::{AppError, AppResult};
use crate::live::translate_paragraphs;
use crate::settings::Settings;
use crate::state::AppState;
use crate::win32;

const MAX_CHARS: usize = 4000;

pub fn resolve_target(settings: &Settings, last_detected: Option<&str>) -> String {
    let c = &settings.compose;
    if c.target_lang != "conversation" {
        return c.target_lang.clone();
    }
    match last_detected {
        Some(l) if l != settings.translation.target_lang => l.to_string(),
        _ => c.fallback_lang.clone(),
    }
}

async fn wait_until<F: Fn() -> bool>(timeout: Duration, f: F) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if f() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(15)).await;
    }
    f()
}

pub async fn run<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    if !cfg!(windows) {
        return Err(AppError::Other("Disponível apenas no Windows.".into()));
    }
    let state = app.state::<AppState>();
    let settings = state.settings();
    let foreground = win32::foreground();

    if !wait_until(Duration::from_millis(1500), || !win32::any_modifier_down()).await {
        return Err(AppError::Other(
            "Solte as teclas do atalho para traduzir a mensagem.".into(),
        ));
    }

    let clipboard = app.clipboard();
    let saved = clipboard.read_text().ok();
    let restore = |saved: &Option<String>| {
        if let Some(text) = saved {
            let _ = app.clipboard().write_text(text.clone());
        }
    };

    let seq = win32::clipboard_sequence();
    win32::send_ctrl(b'A');
    tokio::time::sleep(Duration::from_millis(40)).await;
    win32::send_ctrl(b'C');
    let copied = wait_until(Duration::from_millis(700), || {
        win32::clipboard_sequence() != seq
    })
    .await;
    if !copied {
        return Err(AppError::Other(
            "Não encontrei texto para traduzir. Clique no campo da mensagem, escreva e use o atalho de novo."
                .into(),
        ));
    }
    let text = clipboard.read_text().unwrap_or_default();
    if text.trim().is_empty() {
        restore(&saved);
        return Err(AppError::Other("O campo da mensagem está vazio.".into()));
    }
    if text.chars().count() > MAX_CHARS {
        restore(&saved);
        return Err(AppError::Other(
            "O texto do campo é longo demais para uma mensagem. Use num campo de chat.".into(),
        ));
    }

    let last = state.last_detected.lock().clone();
    let mut translation = settings.translation.clone();
    translation.source_lang = "auto".into();
    translation.target_lang = resolve_target(&settings, last.as_deref());

    let translated = match translate_paragraphs(&state.translator, &text, &translation).await {
        Ok(t) => t.text,
        Err(e) => {
            restore(&saved);
            return Err(e);
        }
    };

    if translated.trim() == text.trim() {
        restore(&saved);
        return Ok(());
    }

    if win32::foreground() != foreground {
        let _ = clipboard.write_text(translated);
        return Err(AppError::Other(
            "Você trocou de janela durante a tradução. A tradução ficou copiada: cole com Ctrl+V."
                .into(),
        ));
    }

    let seq = win32::clipboard_sequence();
    clipboard.write_text(translated).map_err(|e| {
        AppError::Other(format!(
            "não foi possível usar a área de transferência: {e}"
        ))
    })?;
    wait_until(Duration::from_millis(300), || {
        win32::clipboard_sequence() != seq
    })
    .await;
    win32::send_ctrl(b'V');

    tokio::time::sleep(Duration::from_millis(600)).await;
    restore(&saved);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_conversation_language() {
        let mut s = Settings::default();
        assert_eq!(resolve_target(&s, None), "en");
        assert_eq!(resolve_target(&s, Some("ja")), "ja");
        assert_eq!(resolve_target(&s, Some("pt")), "en");
        s.compose.target_lang = "es".into();
        assert_eq!(resolve_target(&s, Some("ja")), "es");
    }
}
