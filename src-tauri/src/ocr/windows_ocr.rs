use image::RgbaImage;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::DataWriter;

use super::postprocess::RawLine;
use super::{tag_matches, OcrLanguage};
use crate::error::{AppError, AppResult};

fn ocr_err(e: windows::core::Error) -> AppError {
    AppError::Ocr(e.message().to_string())
}

pub fn max_image_dimension() -> u32 {
    OcrEngine::MaxImageDimension().unwrap_or(2600).max(256)
}

pub fn languages() -> AppResult<Vec<OcrLanguage>> {
    let list = OcrEngine::AvailableRecognizerLanguages().map_err(ocr_err)?;
    let mut out = Vec::new();
    for lang in &list {
        let tag = lang.LanguageTag().map_err(ocr_err)?.to_string();
        let name = lang
            .DisplayName()
            .map(|n| n.to_string())
            .unwrap_or_else(|_| tag.clone());
        out.push(OcrLanguage { tag, name });
    }
    Ok(out)
}

fn engine_for(source: &str) -> AppResult<(OcrEngine, Option<String>)> {
    if source != "auto" {
        let list = OcrEngine::AvailableRecognizerLanguages().map_err(ocr_err)?;
        for lang in &list {
            let tag = lang.LanguageTag().map_err(ocr_err)?.to_string();
            if tag_matches(&tag, source) {
                let engine = OcrEngine::TryCreateFromLanguage(&lang).map_err(ocr_err)?;
                return Ok((engine, Some(tag)));
            }
        }
        return Err(AppError::OcrLanguageMissing(source.to_string()));
    }

    if let Ok(engine) = OcrEngine::TryCreateFromUserProfileLanguages() {
        let tag = engine
            .RecognizerLanguage()
            .and_then(|l| l.LanguageTag())
            .map(|t| t.to_string())
            .ok();
        return Ok((engine, tag));
    }
    let list = OcrEngine::AvailableRecognizerLanguages().map_err(ocr_err)?;
    let first = list
        .into_iter()
        .next()
        .ok_or_else(|| AppError::OcrLanguageMissing("auto".into()))?;
    let tag = first.LanguageTag().map(|t| t.to_string()).ok();
    let engine = OcrEngine::TryCreateFromLanguage(&first).map_err(ocr_err)?;
    Ok((engine, tag))
}

fn to_bitmap(image: &RgbaImage) -> AppResult<SoftwareBitmap> {
    let mut bgra = image.as_raw().clone();
    for px in bgra.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    let writer = DataWriter::new().map_err(ocr_err)?;
    writer.WriteBytes(&bgra).map_err(ocr_err)?;
    let buffer = writer.DetachBuffer().map_err(ocr_err)?;
    SoftwareBitmap::CreateCopyFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        image.width() as i32,
        image.height() as i32,
    )
    .map_err(ocr_err)
}

pub fn recognize(image: &RgbaImage, source: &str) -> AppResult<(Vec<RawLine>, Option<String>)> {
    let (engine, tag) = engine_for(source)?;
    let bitmap = to_bitmap(image)?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(ocr_err)?
        .join()
        .map_err(ocr_err)?;

    let mut lines = Vec::new();
    for line in &result.Lines().map_err(ocr_err)? {
        let text = line.Text().map_err(ocr_err)?.to_string();
        let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        if let Ok(words) = line.Words() {
            for word in &words {
                if let Ok(r) = word.BoundingRect() {
                    x0 = x0.min(r.X);
                    y0 = y0.min(r.Y);
                    x1 = x1.max(r.X + r.Width);
                    y1 = y1.max(r.Y + r.Height);
                }
            }
        }
        if x0 > x1 {
            (x0, y0, x1, y1) = (0.0, 0.0, 0.0, 0.0);
        }
        lines.push(RawLine {
            text,
            x: x0,
            y: y0,
            width: x1 - x0,
            height: y1 - y0,
        });
    }
    Ok((lines, tag))
}
