use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};

use parking_lot::{Mutex, RwLock};
use serde::Serialize;

use crate::capture::{FrameStore, MonitorInfo};
use crate::error::AppError;
use crate::geometry::Rect;
use crate::history::History;
use crate::positioner::Side;
use crate::settings::{PopupSettings, Settings, SettingsStore};
use crate::translate::Translator;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureMode {
    Translate,
    Live,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Idle,
    Selecting,
}

#[derive(Debug, Clone, Default)]
pub struct PopupGeometry {
    pub anchor: Rect,
    pub work_area: Rect,
    pub scale: f64,
    pub side: Option<Side>,
    pub window: Rect,
    pub job: u64,
    pub cursor: (i32, i32),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PopupPhase {
    Reading,
    Translating,
    Done,
    Empty,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupError {
    pub code: String,
    pub message: String,
}

impl From<&AppError> for PopupError {
    fn from(e: &AppError) -> Self {
        Self {
            code: e.code().into(),
            message: e.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupPayload {
    pub job: u64,
    pub phase: PopupPhase,
    pub original: String,
    pub translated: String,
    pub source_lang: String,
    pub target_lang: String,
    pub detected_lang: Option<String>,
    pub provider: String,
    pub fallback_used: bool,
    pub error: Option<PopupError>,
    pub history_id: Option<i64>,
    pub appearance: PopupSettings,
    pub reduce_motion: Option<bool>,
    pub live: bool,
}

#[derive(Debug, Clone)]
pub struct LastRegion {
    pub rect: Rect,
    pub monitor: MonitorInfo,
}

pub struct AppState {
    pub settings: RwLock<Settings>,
    pub store: SettingsStore,
    pub frames: FrameStore,
    pub translator: Translator,
    pub history: History,
    pub phase: Mutex<Phase>,
    pub prev_foreground: AtomicIsize,
    pub main_hidden_for_capture: AtomicBool,
    pub job: AtomicU64,
    pub popup: Mutex<PopupGeometry>,
    pub popup_payload: Mutex<Option<PopupPayload>>,
    pub popup_pinned: AtomicBool,
    pub popup_generation: AtomicU64,
    pub overlays_shown: Mutex<Vec<usize>>,
    pub last_region: Mutex<Option<LastRegion>>,
    pub vibrancy: AtomicBool,
    pub start_hidden: AtomicBool,
    pub shortcut_failures: Mutex<Vec<crate::shortcuts::ShortcutFailure>>,
    pub capture_mode: Mutex<CaptureMode>,
    pub live_popup: Mutex<PopupGeometry>,
    pub live_payload: Mutex<Option<PopupPayload>>,
    pub live_generation: AtomicU64,
    pub live_active: AtomicBool,
    pub last_detected: Mutex<Option<String>>,
}

impl AppState {
    pub fn new(store: SettingsStore, history: History) -> Self {
        let settings = store.load();
        Self {
            settings: RwLock::new(settings),
            store,
            frames: FrameStore::default(),
            translator: Translator::new(),
            history,
            phase: Mutex::new(Phase::Idle),
            prev_foreground: AtomicIsize::new(0),
            main_hidden_for_capture: AtomicBool::new(false),
            job: AtomicU64::new(0),
            popup: Mutex::new(PopupGeometry::default()),
            popup_payload: Mutex::new(None),
            popup_pinned: AtomicBool::new(false),
            popup_generation: AtomicU64::new(0),
            overlays_shown: Mutex::new(Vec::new()),
            last_region: Mutex::new(None),
            vibrancy: AtomicBool::new(false),
            start_hidden: AtomicBool::new(false),
            shortcut_failures: Mutex::new(Vec::new()),
            capture_mode: Mutex::new(CaptureMode::Translate),
            live_popup: Mutex::new(PopupGeometry::default()),
            live_payload: Mutex::new(None),
            live_generation: AtomicU64::new(0),
            live_active: AtomicBool::new(false),
            last_detected: Mutex::new(None),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().clone()
    }

    pub fn next_job(&self) -> u64 {
        self.job.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn current_job(&self) -> u64 {
        self.job.load(Ordering::SeqCst)
    }

    pub fn remember_detected(&self, lang: Option<&str>) {
        if let Some(l) = lang.filter(|l| !l.is_empty() && *l != "auto") {
            *self.last_detected.lock() = Some(l.to_string());
        }
    }
}
