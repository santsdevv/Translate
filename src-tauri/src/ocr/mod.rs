pub mod postprocess;
mod preprocess;

#[cfg(windows)]
mod windows_ocr;

use image::RgbaImage;
use serde::Serialize;

#[cfg(not(windows))]
use crate::error::AppError;
use crate::error::AppResult;
use crate::settings::OcrSettings;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLanguage {
    pub tag: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrOutput {
    pub text: String,
    pub line_count: usize,
    pub engine_language: Option<String>,
}

pub fn recognize(image: &RgbaImage, source: &str, settings: &OcrSettings) -> AppResult<OcrOutput> {
    if image.width() < 4 || image.height() < 4 {
        return Ok(OcrOutput {
            text: String::new(),
            line_count: 0,
            engine_language: None,
        });
    }
    let max_dim = max_image_dimension();
    let prepared = preprocess::prepare(image, settings.upscale_small, max_dim);
    let (lines, lang) = recognize_lines(&prepared, source)?;
    let line_count = lines.len();
    let text = postprocess::assemble(lines, settings.merge_lines);
    Ok(OcrOutput {
        text,
        line_count,
        engine_language: lang,
    })
}

#[cfg(windows)]
fn recognize_lines(
    image: &RgbaImage,
    source: &str,
) -> AppResult<(Vec<postprocess::RawLine>, Option<String>)> {
    windows_ocr::recognize(image, source)
}

#[cfg(not(windows))]
fn recognize_lines(
    _image: &RgbaImage,
    _source: &str,
) -> AppResult<(Vec<postprocess::RawLine>, Option<String>)> {
    Err(AppError::OcrUnsupported)
}

#[cfg(windows)]
fn max_image_dimension() -> u32 {
    windows_ocr::max_image_dimension()
}

#[cfg(not(windows))]
fn max_image_dimension() -> u32 {
    4096
}

pub fn languages() -> AppResult<Vec<OcrLanguage>> {
    #[cfg(windows)]
    {
        windows_ocr::languages()
    }
    #[cfg(not(windows))]
    {
        Err(AppError::OcrUnsupported)
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
pub fn tag_matches(tag: &str, code: &str) -> bool {
    let tag = tag.to_ascii_lowercase();
    let code = code.to_ascii_lowercase();
    let code = if code == "zh" {
        "zh-hans".to_string()
    } else {
        code
    };
    tag == code || tag.starts_with(&format!("{code}-"))
}

pub fn capability_name(code: &str) -> Option<&'static str> {
    Some(match code {
        "en" => "Language.OCR~~~en-US~0.0.1.0",
        "pt" => "Language.OCR~~~pt-BR~0.0.1.0",
        "es" => "Language.OCR~~~es-ES~0.0.1.0",
        "fr" => "Language.OCR~~~fr-FR~0.0.1.0",
        "de" => "Language.OCR~~~de-DE~0.0.1.0",
        "it" => "Language.OCR~~~it-IT~0.0.1.0",
        "nl" => "Language.OCR~~~nl-NL~0.0.1.0",
        "pl" => "Language.OCR~~~pl-PL~0.0.1.0",
        "ru" => "Language.OCR~~~ru-RU~0.0.1.0",
        "uk" => "Language.OCR~~~uk-UA~0.0.1.0",
        "tr" => "Language.OCR~~~tr-TR~0.0.1.0",
        "ja" => "Language.OCR~~~ja-JP~0.0.1.0",
        "ko" => "Language.OCR~~~ko-KR~0.0.1.0",
        "zh-Hans" => "Language.OCR~~~zh-CN~0.0.1.0",
        "zh-Hant" => "Language.OCR~~~zh-TW~0.0.1.0",
        "ar" => "Language.OCR~~~ar-SA~0.0.1.0",
        "cs" => "Language.OCR~~~cs-CZ~0.0.1.0",
        "da" => "Language.OCR~~~da-DK~0.0.1.0",
        "fi" => "Language.OCR~~~fi-FI~0.0.1.0",
        "el" => "Language.OCR~~~el-GR~0.0.1.0",
        "hu" => "Language.OCR~~~hu-HU~0.0.1.0",
        "nb" => "Language.OCR~~~nb-NO~0.0.1.0",
        "ro" => "Language.OCR~~~ro-RO~0.0.1.0",
        "sv" => "Language.OCR~~~sv-SE~0.0.1.0",
        "sk" => "Language.OCR~~~sk-SK~0.0.1.0",
        "hr" => "Language.OCR~~~hr-HR~0.0.1.0",
        "sr" => "Language.OCR~~~sr-Latn-RS~0.0.1.0",
        "bg" => "Language.OCR~~~bg-BG~0.0.1.0",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_tags() {
        assert!(tag_matches("en-US", "en"));
        assert!(tag_matches("zh-Hans-CN", "zh-Hans"));
        assert!(tag_matches("zh-Hans-CN", "zh"));
        assert!(!tag_matches("zh-Hant-TW", "zh-Hans"));
        assert!(tag_matches("ja", "ja"));
        assert!(!tag_matches("en-US", "e"));
    }
}
