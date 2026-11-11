use serde::Deserialize;
use serde_json::json;

use super::{http_error, normalize_code, Request};
use crate::error::{AppError, AppResult};
use crate::settings::Provider;

const ENDPOINT: &str = "https://api.cognitive.microsofttranslator.com/translate";

#[derive(Deserialize)]
struct Item {
    #[serde(rename = "detectedLanguage")]
    detected: Option<Detected>,
    translations: Vec<Out>,
}

#[derive(Deserialize)]
struct Detected {
    language: String,
}

#[derive(Deserialize)]
struct Out {
    text: String,
}

pub async fn translate(
    client: &reqwest::Client,
    req: &Request<'_>,
    key: &str,
    region: &str,
) -> AppResult<(String, Option<String>)> {
    let mut url = format!(
        "{ENDPOINT}?api-version=3.0&to={}",
        urlencoding::encode(req.target)
    );
    if req.source != "auto" {
        url.push_str(&format!("&from={}", urlencoding::encode(req.source)));
    }
    let mut builder = client
        .post(url)
        .header("Ocp-Apim-Subscription-Key", key.trim())
        .json(&json!([{ "Text": req.text }]));
    if !region.is_empty() {
        builder = builder.header("Ocp-Apim-Subscription-Region", region);
    }
    let resp = builder.send().await?;
    let status = resp.status();
    let raw = resp.text().await?;
    if !status.is_success() {
        return Err(http_error(Provider::Microsoft, status, &raw));
    }
    let items: Vec<Item> = serde_json::from_str(&raw)
        .map_err(|e| AppError::Translate(format!("resposta inesperada da Microsoft: {e}")))?;
    let item = items
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Translate("Microsoft sem resultado".into()))?;
    let text = item
        .translations
        .into_iter()
        .next()
        .map(|t| t.text)
        .unwrap_or_default();
    Ok((text, item.detected.map(|d| normalize_code(&d.language))))
}
