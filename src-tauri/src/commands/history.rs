use std::fmt::Write as _;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::{AppError, AppResult};
use crate::history::{Entry, Page, Query, Stats};
use crate::pipeline::EVT_HISTORY_CHANGED;
use crate::state::AppState;

#[tauri::command]
pub fn history_list(state: State<'_, AppState>, query: Query) -> AppResult<Page> {
    state.history.list(&query)
}

#[tauri::command]
pub fn history_stats(state: State<'_, AppState>) -> AppResult<Stats> {
    state.history.stats()
}

#[tauri::command]
pub fn history_favorite(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    favorite: bool,
) -> AppResult<()> {
    state.history.set_favorite(id, favorite)?;
    let _ = app.emit(EVT_HISTORY_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn history_delete(app: AppHandle, state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state.history.delete(id)?;
    let _ = app.emit(EVT_HISTORY_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn history_clear(
    app: AppHandle,
    state: State<'_, AppState>,
    keep_favorites: bool,
) -> AppResult<u32> {
    let n = state.history.clear(keep_favorites)?;
    let _ = app.emit(EVT_HISTORY_CHANGED, ());
    Ok(n)
}

fn csv_field(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

fn to_csv(items: &[Entry]) -> String {
    let mut out = String::from(
        "\u{feff}data,origem,destino,detectado,provedor,favorito,texto_original,traducao\n",
    );
    for e in items {
        let date = chrono::DateTime::from_timestamp_millis(e.created_at)
            .map(|d| {
                d.with_timezone(&chrono::Local)
                    .format("%Y-%m-%d %H:%M:%S")
                    .to_string()
            })
            .unwrap_or_default();
        let _ = writeln!(
            out,
            "{},{},{},{},{},{},{},{}",
            date,
            e.source_lang,
            e.target_lang,
            e.detected_lang.as_deref().unwrap_or(""),
            e.provider,
            if e.favorite { "sim" } else { "não" },
            csv_field(&e.source_text),
            csv_field(&e.translated_text)
        );
    }
    out
}

#[tauri::command]
pub async fn history_export(
    app: AppHandle,
    state: State<'_, AppState>,
    format: String,
) -> AppResult<Option<String>> {
    let items = state.history.all()?;
    let (ext, name) = if format == "csv" {
        ("csv", "Planilha CSV")
    } else {
        ("json", "JSON")
    };
    let file = app
        .dialog()
        .file()
        .set_title("Exportar histórico")
        .add_filter(name, &[ext])
        .set_file_name(format!("translate-historico.{ext}"))
        .blocking_save_file();
    let Some(file) = file else { return Ok(None) };
    let path = file
        .into_path()
        .map_err(|e| AppError::Other(e.to_string()))?;
    let content = if ext == "csv" {
        to_csv(&items)
    } else {
        serde_json::to_string_pretty(&items).map_err(|e| AppError::Other(e.to_string()))?
    };
    std::fs::write(&path, content)?;
    Ok(Some(path.display().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_escapes_quotes_and_newlines() {
        let e = Entry {
            id: 1,
            created_at: 0,
            source_text: "He said \"hi\"\nok".into(),
            translated_text: "Ele disse \"oi\"".into(),
            source_lang: "auto".into(),
            target_lang: "pt".into(),
            detected_lang: Some("en".into()),
            provider: "google".into(),
            favorite: false,
        };
        let csv = to_csv(&[e]);
        assert!(csv.contains("\"He said \"\"hi\"\"\nok\""));
    }
}
