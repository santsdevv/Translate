use serde::Deserialize;
use serde_json::json;

use super::{http_error, normalize_code, Request};
use crate::error::{AppError, AppResult};
use crate::settings::Provider;

#[derive(Deserialize)]
struct Response {
    translations: Vec<Item>,
}

#[derive(Deserialize)]
struct Item {
    text: String,
    detected_source_language: Option<String>,
}

fn target_code(c: &str) -> String {
    match c {
        "en" => "EN-US".into(),
        "pt" => "PT-BR".into(),
        "zh-Hans" => "ZH-HANS".into(),
        "zh-Hant" => "ZH-HANT".into(),
        other => other.to_ascii_uppercase(),
    }
}

fn source_code(c: &str) -> Option<String> {
    match c {
        "auto" => None,
        "zh-Hans" | "zh-Hant" => Some("ZH".into()),
        other => Some(
            other
                .split('-')
                .next()
                .unwrap_or(other)
                .to_ascii_uppercase(),
        ),
    }
}

pub fn endpoint(key: &str) -> &'static str {
    if key.trim_end().ends_with(":fx") {
        "https://api-free.deepl.com/v2/translate"
    } else {
        "https://api.deepl.com/v2/translate"
    }
}

pub async fn translate(
    client: &reqwest::Client,
    req: &Request<'_>,
    key: &str,
    formality: &str,
) -> AppResult<(String, Option<String>)> {
    let mut body = json!({
        "text": [req.text],
        "target_lang": target_code(req.target),
        "preserve_formatting": true,
    });
    if let Some(src) = source_code(req.source) {
        body["source_lang"] = json!(src);
    }
    if matches!(formality, "more" | "less" | "prefer_more" | "prefer_less") {
        let f = if formality.starts_with("prefer_") {
            formality.to_string()
        } else {
            format!("prefer_{formality}")
        };
        body["formality"] = json!(f);
    }

    let resp = client
        .post(endpoint(key))
        .header("Authorization", format!("DeepL-Auth-Key {}", key.trim()))
        .json(&body)
        .send()
        .await?;
    let status = resp.status();
    let raw = resp.text().await?;
    if !status.is_success() {
        return Err(http_error(Provider::Deepl, status, &raw));
    }
    let parsed: Response = serde_json::from_str(&raw)
        .map_err(|e| AppError::Translate(format!("resposta inesperada do DeepL: {e}")))?;
    let item = parsed
        .translations
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Translate("DeepL sem resultado".into()))?;
    Ok((
        item.text,
        item.detected_source_language.map(|c| normalize_code(&c)),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_codes() {
        assert_eq!(target_code("pt"), "PT-BR");
        assert_eq!(source_code("zh-Hant").as_deref(), Some("ZH"));
        assert_eq!(source_code("auto"), None);
        assert_eq!(
            endpoint("abc:fx"),
            "https://api-free.deepl.com/v2/translate"
        );
    }
}
