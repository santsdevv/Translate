use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Runtime};

use crate::error::AppResult;
use crate::settings::ShortcutSettings;
use crate::state::CaptureMode;
use crate::{live, pipeline, window_manager as wm};

pub const TRAY_ID: &str = "translate-tray";

fn label(text: &str, accelerator: &str) -> String {
    if accelerator.trim().is_empty() {
        text.to_string()
    } else {
        format!("{text}\t{accelerator}")
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, sc: &ShortcutSettings) -> AppResult<Menu<R>> {
    let capture = MenuItem::with_id(
        app,
        "capture",
        label("Traduzir área da tela", &sc.capture),
        true,
        None::<&str>,
    )?;
    let recapture = MenuItem::with_id(
        app,
        "recapture",
        label("Repetir última área", &sc.recapture),
        true,
        None::<&str>,
    )?;
    let live = MenuItem::with_id(
        app,
        "live",
        label("Traduzir área ao vivo (liga/desliga)", &sc.live),
        true,
        None::<&str>,
    )?;
    let open = MenuItem::with_id(app, "open", "Abrir o Translate", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    Ok(Menu::with_items(
        app,
        &[&capture, &recapture, &live, &sep1, &open, &sep2, &quit],
    )?)
}

pub fn create<R: Runtime>(app: &AppHandle<R>, sc: &ShortcutSettings) -> AppResult<()> {
    let menu = build_menu(app, sc)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Translate")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "capture" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = pipeline::start_capture(app, false, CaptureMode::Translate).await;
                });
            }
            "recapture" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = pipeline::recapture(app).await;
                });
            }
            "live" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = live::toggle(app, false).await;
                });
            }
            "open" => wm::show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                wm::show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn refresh<R: Runtime>(app: &AppHandle<R>, sc: &ShortcutSettings) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(app, sc)) {
        let _ = tray.set_menu(Some(menu));
    }
}
