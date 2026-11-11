use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Não foi possível capturar a tela: {0}")]
    Capture(String),

    #[error("O reconhecimento de texto falhou: {0}")]
    Ocr(String),

    #[cfg_attr(not(windows), allow(dead_code))]
    #[error("O idioma \"{0}\" não está instalado para reconhecimento de texto no Windows.")]
    OcrLanguageMissing(String),

    #[cfg_attr(windows, allow(dead_code))]
    #[error("O reconhecimento de texto nativo só está disponível no Windows 10 ou 11.")]
    OcrUnsupported,

    #[error("A tradução falhou: {0}")]
    Translate(String),

    #[error("Configure a chave de API do {0} em Configurações › Tradução.")]
    MissingApiKey(String),

    #[error("A chave de API do {0} foi recusada. Confira a chave e a região.")]
    InvalidApiKey(String),

    #[error("Limite de uso do {0} atingido. Tente novamente mais tarde ou troque o provedor.")]
    QuotaExceeded(String),

    #[error("Sem conexão com o serviço de tradução. Verifique sua internet.")]
    Network(String),

    #[error("O atalho \"{0}\" não é válido.")]
    InvalidShortcut(String),

    #[error("O atalho \"{0}\" já está em uso por outro aplicativo.")]
    ShortcutInUse(String),

    #[error("Erro no histórico: {0}")]
    Database(String),

    #[error("Erro ao salvar as configurações: {0}")]
    Settings(String),

    #[error("{0}")]
    Window(String),

    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Capture(_) => "capture",
            AppError::Ocr(_) => "ocr",
            AppError::OcrLanguageMissing(_) => "ocr_language_missing",
            AppError::OcrUnsupported => "ocr_unsupported",
            AppError::Translate(_) => "translate",
            AppError::MissingApiKey(_) => "missing_api_key",
            AppError::InvalidApiKey(_) => "invalid_api_key",
            AppError::QuotaExceeded(_) => "quota_exceeded",
            AppError::Network(_) => "network",
            AppError::InvalidShortcut(_) => "invalid_shortcut",
            AppError::ShortcutInUse(_) => "shortcut_in_use",
            AppError::Database(_) => "database",
            AppError::Settings(_) => "settings",
            AppError::Window(_) => "window",
            AppError::Other(_) => "other",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Database(e.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Window(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_connect() || e.is_timeout() {
            AppError::Network(e.to_string())
        } else {
            AppError::Translate(e.to_string())
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
