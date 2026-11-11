mod deepl;
mod google;
mod microsoft;

use std::num::NonZeroUsize;
use std::time::{Duration, Instant};

use lru::LruCache;
use parking_lot::Mutex;
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::secrets;
use crate::settings::{Provider, TranslationSettings};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Translation {
    pub text: String,
    pub detected_source: Option<String>,
    pub provider: Provider,
    pub fallback_used: bool,
}

pub(crate) struct Request<'a> {
    pub text: &'a str,
    pub source: &'a str,
    pub target: &'a str,
}

type CacheKey = (Provider, String, String, String);

pub struct Translator {
    client: reqwest::Client,
    cache: Mutex<LruCache<CacheKey, Translation>>,
}

impl Translator {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(6))
            .timeout(Duration::from_secs(15))
            .user_agent(concat!("Translate/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("cliente HTTP");
        Self {
            client,
            cache: Mutex::new(LruCache::new(NonZeroUsize::new(256).unwrap())),
        }
    }

    pub async fn translate(
        &self,
        text: &str,
        settings: &TranslationSettings,
    ) -> AppResult<Translation> {
        let text = text.trim();
        if text.is_empty() {
            return Ok(Translation {
                text: String::new(),
                detected_source: None,
                provider: settings.provider,
                fallback_used: false,
            });
        }
        let key: CacheKey = (
            settings.provider,
            settings.source_lang.clone(),
            settings.target_lang.clone(),
            text.to_string(),
        );
        if let Some(hit) = self.cache.lock().get(&key).cloned() {
            return Ok(hit);
        }

        let req = Request {
            text,
            source: &settings.source_lang,
            target: &settings.target_lang,
        };
        let result = match self.call(settings.provider, &req, settings).await {
            Ok(t) => Ok(t),
            Err(primary)
                if settings.provider != Provider::Google && settings.fallback_to_google =>
            {
                log::warn!(
                    "{} falhou ({primary}); usando Google como reserva",
                    settings.provider.label()
                );
                self.call(Provider::Google, &req, settings)
                    .await
                    .map(|mut t| {
                        t.fallback_used = true;
                        t
                    })
                    .map_err(|_| primary)
            }
            Err(e) => Err(e),
        }?;

        self.cache.lock().put(key, result.clone());
        Ok(result)
    }

    async fn call(
        &self,
        provider: Provider,
        req: &Request<'_>,
        settings: &TranslationSettings,
    ) -> AppResult<Translation> {
        let (text, detected) = match provider {
            Provider::Google => google::translate(&self.client, req).await?,
            Provider::Deepl => {
                let key = secrets::get(provider)
                    .ok_or_else(|| AppError::MissingApiKey(provider.label().into()))?;
                deepl::translate(&self.client, req, &key, &settings.deepl_formality).await?
            }
            Provider::Microsoft => {
                let key = secrets::get(provider)
                    .ok_or_else(|| AppError::MissingApiKey(provider.label().into()))?;
                microsoft::translate(&self.client, req, &key, &settings.microsoft_region).await?
            }
        };
        Ok(Translation {
            text,
            detected_source: detected,
            provider,
            fallback_used: false,
        })
    }

    pub async fn test(&self, provider: Provider, settings: &TranslationSettings) -> AppResult<u64> {
        let started = Instant::now();
        let req = Request {
            text: "Hello, world",
            source: "en",
            target: "pt",
        };
        self.call(provider, &req, settings).await?;
        Ok(started.elapsed().as_millis() as u64)
    }

    pub fn clear_cache(&self) {
        self.cache.lock().clear();
    }
}

pub(crate) fn http_error(provider: Provider, status: reqwest::StatusCode, body: &str) -> AppError {
    let name = provider.label().to_string();
    match status.as_u16() {
        401 | 403 => AppError::InvalidApiKey(name),
        429 | 456 => AppError::QuotaExceeded(name),
        _ => {
            let snippet: String = body.chars().take(160).collect();
            AppError::Translate(format!("{name} respondeu {status}: {snippet}"))
        }
    }
}

pub(crate) fn normalize_code(code: &str) -> String {
    let lower = code.to_ascii_lowercase();
    match lower.as_str() {
        "zh-cn" | "zh-hans" | "zh" => "zh-Hans".into(),
        "zh-tw" | "zh-hant" => "zh-Hant".into(),
        "iw" => "he".into(),
        "no" => "nb".into(),
        "tl" => "fil".into(),
        other => other.split('-').next().unwrap_or(other).to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_codes() {
        assert_eq!(normalize_code("EN-US"), "en");
        assert_eq!(normalize_code("zh-CN"), "zh-Hans");
        assert_eq!(normalize_code("iw"), "he");
    }
}
