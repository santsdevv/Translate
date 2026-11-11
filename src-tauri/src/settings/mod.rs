use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Google,
    Deepl,
    Microsoft,
}

impl Provider {
    pub fn label(self) -> &'static str {
        match self {
            Provider::Google => "Google Tradutor",
            Provider::Deepl => "DeepL",
            Provider::Microsoft => "Microsoft Translator",
        }
    }
    pub fn key_id(self) -> &'static str {
        match self {
            Provider::Google => "google",
            Provider::Deepl => "deepl",
            Provider::Microsoft => "microsoft",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PopupPlacement {
    #[default]
    Auto,
    Below,
    Above,
    Cursor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum MotionPreference {
    #[default]
    System,
    Reduced,
    Full,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TranslationSettings {
    pub provider: Provider,
    pub source_lang: String,
    pub target_lang: String,
    pub fallback_to_google: bool,
    pub microsoft_region: String,
    pub deepl_formality: String,
}

impl Default for TranslationSettings {
    fn default() -> Self {
        Self {
            provider: Provider::Google,
            source_lang: "auto".into(),
            target_lang: "pt".into(),
            fallback_to_google: true,
            microsoft_region: String::new(),
            deepl_formality: "default".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OcrSettings {
    pub merge_lines: bool,
    pub upscale_small: bool,
}

impl Default for OcrSettings {
    fn default() -> Self {
        Self {
            merge_lines: true,
            upscale_small: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShortcutSettings {
    pub capture: String,
    pub recapture: String,
    pub show_window: String,
    pub live: String,
    pub compose: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            capture: "Alt+Q".into(),
            recapture: "Alt+Shift+Q".into(),
            show_window: "Alt+Shift+T".into(),
            live: "Alt+W".into(),
            compose: "Alt+E".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PopupSettings {
    pub placement: PopupPlacement,
    pub max_width: u32,
    pub font_size: u32,
    pub opacity: u32,
    pub show_original: bool,
    pub auto_close: bool,
    pub auto_close_seconds: u32,
    pub dismiss_on_outside_click: bool,
    pub dismiss_on_escape: bool,
    pub auto_copy: bool,
}

impl Default for PopupSettings {
    fn default() -> Self {
        Self {
            placement: PopupPlacement::Auto,
            max_width: 420,
            font_size: 15,
            opacity: 96,
            show_original: true,
            auto_close: false,
            auto_close_seconds: 12,
            dismiss_on_outside_click: true,
            dismiss_on_escape: true,
            auto_copy: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LiveSettings {
    pub interval_ms: u32,
    pub show_original: bool,
}

impl Default for LiveSettings {
    fn default() -> Self {
        Self {
            interval_ms: 1000,
            show_original: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ComposeSettings {
    pub target_lang: String,
    pub fallback_lang: String,
}

impl Default for ComposeSettings {
    fn default() -> Self {
        Self {
            target_lang: "conversation".into(),
            fallback_lang: "en".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GeneralSettings {
    pub launch_at_startup: bool,
    pub start_minimized: bool,
    pub close_to_tray: bool,
    pub save_history: bool,
    pub history_limit: u32,
    pub motion: MotionPreference,
    pub show_magnifier: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            launch_at_startup: false,
            start_minimized: false,
            close_to_tray: true,
            save_history: true,
            history_limit: 2000,
            motion: MotionPreference::System,
            show_magnifier: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub translation: TranslationSettings,
    pub ocr: OcrSettings,
    pub shortcuts: ShortcutSettings,
    pub popup: PopupSettings,
    pub general: GeneralSettings,
    pub live: LiveSettings,
    pub compose: ComposeSettings,
    pub onboarded: bool,
}

impl Settings {
    pub fn sanitized(mut self) -> Self {
        let p = &mut self.popup;
        p.max_width = p.max_width.clamp(280, 640);
        p.font_size = p.font_size.clamp(12, 22);
        p.opacity = p.opacity.clamp(60, 100);
        p.auto_close_seconds = p.auto_close_seconds.clamp(3, 120);
        let g = &mut self.general;
        g.history_limit = g.history_limit.clamp(50, 50_000);
        let t = &mut self.translation;
        if t.target_lang.trim().is_empty() || t.target_lang == "auto" {
            t.target_lang = "pt".into();
        }
        if t.source_lang.trim().is_empty() {
            t.source_lang = "auto".into();
        }
        t.microsoft_region = t.microsoft_region.trim().to_string();
        self.live.interval_ms = self.live.interval_ms.clamp(400, 5000);
        let c = &mut self.compose;
        if c.target_lang.trim().is_empty() || c.target_lang == "auto" {
            c.target_lang = "conversation".into();
        }
        if c.fallback_lang.trim().is_empty()
            || matches!(c.fallback_lang.as_str(), "auto" | "conversation")
        {
            c.fallback_lang = "en".into();
        }
        self
    }
}

pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(config_dir: PathBuf) -> Self {
        Self {
            path: config_dir.join("settings.json"),
        }
    }

    pub fn load(&self) -> Settings {
        match std::fs::read_to_string(&self.path) {
            Ok(raw) => match serde_json::from_str::<Settings>(&raw) {
                Ok(s) => s.sanitized(),
                Err(e) => {
                    log::warn!("settings.json inválido, usando padrões: {e}");
                    let _ = std::fs::rename(&self.path, self.path.with_extension("json.bak"));
                    Settings::default()
                }
            },
            Err(_) => Settings::default(),
        }
    }

    pub fn save(&self, settings: &Settings) -> AppResult<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| AppError::Settings(e.to_string()))?;
        }
        let tmp = self.path.with_extension("json.tmp");
        let json =
            serde_json::to_vec_pretty(settings).map_err(|e| AppError::Settings(e.to_string()))?;
        std::fs::write(&tmp, json).map_err(|e| AppError::Settings(e.to_string()))?;
        std::fs::rename(&tmp, &self.path).map_err(|e| AppError::Settings(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_json_fills_defaults() {
        let s: Settings = serde_json::from_str(r#"{"popup":{"fontSize":40}}"#).unwrap();
        let s = s.sanitized();
        assert_eq!(s.popup.font_size, 22);
        assert_eq!(s.shortcuts.capture, "Alt+Q");
        assert_eq!(s.translation.provider, Provider::Google);
    }
}
