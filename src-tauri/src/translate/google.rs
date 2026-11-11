use serde::Deserialize;

use super::{http_error, normalize_code, Request};
use crate::error::{AppError, AppResult};
use crate::settings::Provider;

const ENDPOINT: &str = "https://translate.googleapis.com/translate_a/single";

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    sentences: Vec<Sentence>,
    src: Option<String>,
}

#[derive(Deserialize)]
struct Sentence {
    trans: Option<String>,
}

fn code(c: &str) -> &str {
    match c {
        "zh-Hans" => "zh-CN",
        "zh-Hant" => "zh-TW",
        "nb" => "no",
        "fil" => "tl",
        other => other,
    }
}

pub async fn translate(
    client: &reqwest::Client,
    req: &Request<'_>,
) -> AppResult<(String, Option<String>)> {
    let url = format!(
        "{ENDPOINT}?client=gtx&dt=t&dj=1&ie=UTF-8&oe=UTF-8&sl={}&tl={}",
        urlencoding::encode(code(req.source)),
        urlencoding::encode(code(req.target))
    );
    let resp = client.post(url).form(&[("q", req.text)]).send().await?;
    let status = resp.status();
    let body = resp.text().await?;
    if !status.is_success() {
        return Err(http_error(Provider::Google, status, &body));
    }
    let parsed: Response = serde_json::from_str(&body)
        .map_err(|e| AppError::Translate(format!("resposta inesperada do Google: {e}")))?;
    let text: String = parsed
        .sentences
        .into_iter()
        .filter_map(|s| s.trans)
        .collect();
    if text.trim().is_empty() {
        return Err(AppError::Translate("o Google não retornou tradução".into()));
    }
    Ok((
        text.trim().to_string(),
        parsed.src.map(|s| normalize_code(&s)),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dj_format() {
        let raw = r#"{"sentences":[{"trans":"Olá, ","orig":"Hello, "},{"trans":"mundo","orig":"world"},{"translit":"x"}],"src":"en"}"#;
        let r: Response = serde_json::from_str(raw).unwrap();
        let t: String = r.sentences.into_iter().filter_map(|s| s.trans).collect();
        assert_eq!(t, "Olá, mundo");
        assert_eq!(r.src.as_deref(), Some("en"));
    }
}
