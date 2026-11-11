mod capture;
mod commands;
mod compose;
mod error;
mod geometry;
mod history;
mod live;
mod ocr;
mod pipeline;
mod positioner;
mod secrets;
mod settings;
mod shortcuts;
mod state;
mod translate;
mod tray;
mod win32;
mod window_manager;

use std::sync::atomic::Ordering;

use tauri::http::{Response, StatusCode};
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use crate::history::History;
use crate::settings::SettingsStore;
use crate::state::AppState;
use crate::window_manager as wm;

fn frame_response<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: &str) -> Response<Vec<u8>> {
    let path = urlencoding::decode(path)
        .map(|p| p.into_owned())
        .unwrap_or_else(|_| path.to_string());
    let mut parts = path.trim_matches('/').split('/');
    let frame_id = parts.next().and_then(|p| p.parse::<u64>().ok());
    let index = parts
        .next()
        .and_then(|p| p.trim_end_matches(".png").parse::<usize>().ok());
    let bytes = match (frame_id, index) {
        (Some(f), Some(i)) => app.state::<AppState>().frames.png(f, i),
        _ => None,
    };
    match bytes {
        Some(b) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "image/png")
            .header("Cache-Control", "no-store")
            .header("Access-Control-Allow-Origin", "*")
            .body(b)
            .unwrap(),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Vec::new())
            .unwrap(),
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let config_dir = app.path().app_config_dir()?;
    let data_dir = app.path().app_data_dir()?;
    let history = History::open(&data_dir.join("history.db"))?;
    let state = AppState::new(SettingsStore::new(config_dir), history);
    let settings = state.settings();

    let launched_minimized = std::env::args().any(|a| a == "--minimized");
    state.start_hidden.store(
        launched_minimized || settings.general.start_minimized,
        Ordering::SeqCst,
    );
    app.manage(state);
    let state = app.state::<AppState>();

    if let Some(main) = wm::main_window(&handle) {
        state
            .vibrancy
            .store(wm::apply_vibrancy(&main), Ordering::SeqCst);
    }

    wm::ensure_popups(&handle)?;
    if let Ok(monitors) = capture::monitors(&handle) {
        let _ = wm::ensure_overlays(&handle, &monitors);
    }

    let failures = shortcuts::apply(&handle, &settings.shortcuts);
    for f in &failures {
        log::warn!(
            "atalho {:?} ({}) não registrado: {}",
            f.action,
            f.accelerator,
            f.message
        );
    }
    *state.shortcut_failures.lock() = failures;

    tray::create(&handle, &settings.shortcuts)?;

    let launcher = handle.autolaunch();
    if launcher.is_enabled().unwrap_or(false) != settings.general.launch_at_startup {
        let _ = if settings.general.launch_at_startup {
            launcher.enable()
        } else {
            launcher.disable()
        };
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            wm::show_main(app)
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(shortcuts::handle)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .level_for("tao", log::LevelFilter::Info)
                .level_for("wry", log::LevelFilter::Info)
                .level_for("keyring", log::LevelFilter::Info)
                .level_for("reqwest", log::LevelFilter::Info)
                .level_for("hyper_util", log::LevelFilter::Info)
                .max_file_size(2_000_000)
                .build(),
        )
        .register_asynchronous_uri_scheme_protocol("frame", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            std::thread::spawn(move || responder.respond(frame_response(&app, &path)));
        })
        .setup(setup)
        .on_window_event(|window, event| {
            let WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };
            let app = window.app_handle();
            let label = window.label();
            if label == wm::MAIN {
                if app
                    .state::<AppState>()
                    .settings
                    .read()
                    .general
                    .close_to_tray
                {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    app.exit(0);
                }
            } else if label.starts_with("overlay-") {
                api.prevent_close();
                pipeline::cancel_selection(app);
            } else if label == wm::POPUP {
                api.prevent_close();
                wm::hide_popup(app);
            } else if label == wm::LIVE {
                api.prevent_close();
                live::stop(app);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture::capture_start,
            commands::capture::capture_repeat,
            commands::capture::live_toggle,
            commands::capture::live_stop,
            commands::capture::live_status,
            commands::capture::conversation_language,
            commands::capture::overlay_ready,
            commands::capture::overlay_submit,
            commands::capture::overlay_cancel,
            commands::popup::popup_current,
            commands::popup::popup_present,
            commands::popup::popup_close,
            commands::popup::popup_pin,
            commands::popup::open_main,
            commands::popup::copy_text,
            commands::history::history_list,
            commands::history::history_stats,
            commands::history::history_favorite,
            commands::history::history_delete,
            commands::history::history_clear,
            commands::history::history_export,
            commands::settings::settings_get,
            commands::settings::settings_update,
            commands::settings::settings_reset,
            commands::settings::shortcuts_suspend,
            commands::settings::shortcut_validate,
            commands::settings::shortcuts_status,
            commands::settings::provider_status,
            commands::settings::provider_set_key,
            commands::settings::provider_test,
            commands::system::app_ready,
            commands::system::app_info,
            commands::system::ocr_status,
            commands::system::ocr_install,
            commands::system::open_language_settings,
            commands::system::open_url,
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Translate");

    app.run(|_app, event| {
        if let RunEvent::ExitRequested {
            api, code: None, ..
        } = event
        {
            api.prevent_exit();
        }
    });
}
