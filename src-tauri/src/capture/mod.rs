use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder, RgbaImage};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::error::{AppError, AppResult};
use crate::geometry::Rect;

static NEXT_FRAME: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub index: usize,
    pub bounds: Rect,
    pub work_area: Rect,
    pub scale: f64,
    pub primary: bool,
}

pub struct MonitorFrame {
    pub info: MonitorInfo,
    pub image: RgbaImage,
    pub png: Vec<u8>,
}

pub struct Frame {
    pub id: u64,
    pub monitors: Vec<MonitorFrame>,
}

#[derive(Default)]
pub struct FrameStore {
    current: Mutex<Option<Arc<Frame>>>,
}

impl FrameStore {
    pub fn set(&self, frame: Frame) -> Arc<Frame> {
        let frame = Arc::new(frame);
        *self.current.lock() = Some(frame.clone());
        frame
    }
    pub fn get(&self) -> Option<Arc<Frame>> {
        self.current.lock().clone()
    }
    pub fn clear(&self) {
        self.current.lock().take();
    }
    pub fn png(&self, frame_id: u64, index: usize) -> Option<Vec<u8>> {
        let guard = self.current.lock();
        let frame = guard.as_ref()?;
        if frame.id != frame_id {
            return None;
        }
        frame
            .monitors
            .iter()
            .find(|m| m.info.index == index)
            .map(|m| m.png.clone())
    }
}

pub fn monitors<R: Runtime>(app: &AppHandle<R>) -> AppResult<Vec<MonitorInfo>> {
    let primary = app.primary_monitor().ok().flatten().map(|m| *m.position());
    let list = app
        .available_monitors()
        .map_err(|e| AppError::Capture(e.to_string()))?;
    Ok(list
        .iter()
        .enumerate()
        .map(|(index, m)| {
            let pos = m.position();
            let size = m.size();
            let wa = m.work_area();
            MonitorInfo {
                index,
                bounds: Rect::new(pos.x, pos.y, size.width, size.height),
                work_area: Rect::new(wa.position.x, wa.position.y, wa.size.width, wa.size.height),
                scale: m.scale_factor(),
                primary: primary.map(|p| p == *pos).unwrap_or(index == 0),
            }
        })
        .collect())
}

fn find_xcap(monitors: &[xcap::Monitor], bounds: &Rect) -> Option<xcap::Monitor> {
    monitors
        .iter()
        .find(|m| m.x().ok() == Some(bounds.x) && m.y().ok() == Some(bounds.y))
        .or_else(|| {
            let (cx, cy) = bounds.center();
            monitors.iter().find(|m| {
                let (Ok(x), Ok(y), Ok(w), Ok(h)) = (m.x(), m.y(), m.width(), m.height()) else {
                    return false;
                };
                Rect::new(x, y, w, h).contains_point(cx, cy)
            })
        })
        .cloned()
}

fn encode_png(img: &RgbaImage) -> AppResult<Vec<u8>> {
    let mut out = Vec::with_capacity((img.width() * img.height()) as usize);
    PngEncoder::new_with_quality(&mut out, CompressionType::Fast, FilterType::Sub)
        .write_image(
            img.as_raw(),
            img.width(),
            img.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| AppError::Capture(e.to_string()))?;
    Ok(out)
}

pub fn capture_all(infos: Vec<MonitorInfo>) -> AppResult<Frame> {
    let xcaps = xcap::Monitor::all().map_err(|e| AppError::Capture(e.to_string()))?;

    let mut captured: Vec<(MonitorInfo, RgbaImage)> = Vec::with_capacity(infos.len());
    let mut last_err = None;
    for info in infos {
        let result = find_xcap(&xcaps, &info.bounds)
            .ok_or_else(|| AppError::Capture("monitor não encontrado".into()))
            .and_then(|m| {
                m.capture_image()
                    .map_err(|e| AppError::Capture(e.to_string()))
            });
        match result {
            Ok(image) => captured.push((info, image)),
            Err(e) => {
                log::warn!("captura do monitor {} falhou: {e}", info.index);
                last_err = Some(e);
            }
        }
    }
    drop(xcaps);

    let (monitors, encode_err) = encode_all(captured);
    if let Some(e) = encode_err {
        last_err = Some(e);
    }
    if monitors.is_empty() {
        return Err(
            last_err.unwrap_or_else(|| AppError::Capture("nenhum monitor disponível".into()))
        );
    }
    Ok(Frame {
        id: NEXT_FRAME.fetch_add(1, Ordering::Relaxed),
        monitors,
    })
}

fn encode_all(captured: Vec<(MonitorInfo, RgbaImage)>) -> (Vec<MonitorFrame>, Option<AppError>) {
    let encoded: Vec<AppResult<Vec<u8>>> = std::thread::scope(|scope| {
        let handles: Vec<_> = captured
            .iter()
            .map(|(_, image)| scope.spawn(move || encode_png(image)))
            .collect();
        handles
            .into_iter()
            .map(|h| {
                h.join().unwrap_or_else(|_| {
                    Err(AppError::Capture("thread de codificação falhou".into()))
                })
            })
            .collect()
    });

    let mut frames = Vec::with_capacity(captured.len());
    let mut last_err = None;
    for ((info, image), png) in captured.into_iter().zip(encoded) {
        match png {
            Ok(png) => frames.push(MonitorFrame { info, image, png }),
            Err(e) => last_err = Some(e),
        }
    }
    (frames, last_err)
}

pub fn crop(image: &RgbaImage, region: Rect) -> AppResult<RgbaImage> {
    let bounds = Rect::new(0, 0, image.width(), image.height());
    let r = bounds
        .intersect(&region)
        .ok_or_else(|| AppError::Capture("região fora da tela".into()))?;
    Ok(image::imageops::crop_imm(image, r.x as u32, r.y as u32, r.width, r.height).to_image())
}

pub fn capture_region(region: Rect) -> AppResult<RgbaImage> {
    let (cx, cy) = region.center();
    let monitor =
        xcap::Monitor::from_point(cx, cy).map_err(|e| AppError::Capture(e.to_string()))?;
    let (mx, my) = (
        monitor.x().map_err(|e| AppError::Capture(e.to_string()))?,
        monitor.y().map_err(|e| AppError::Capture(e.to_string()))?,
    );
    let (mw, mh) = (
        monitor
            .width()
            .map_err(|e| AppError::Capture(e.to_string()))?,
        monitor
            .height()
            .map_err(|e| AppError::Capture(e.to_string()))?,
    );
    let local = Rect::new(region.x - mx, region.y - my, region.width, region.height);
    let r = Rect::new(0, 0, mw, mh)
        .intersect(&local)
        .ok_or_else(|| AppError::Capture("a área anterior não está mais visível".into()))?;
    monitor
        .capture_region(r.x as u32, r.y as u32, r.width, r.height)
        .map_err(|e| AppError::Capture(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn info(index: usize, x: i32) -> MonitorInfo {
        MonitorInfo {
            index,
            bounds: Rect::new(x, 0, 64, 32),
            work_area: Rect::new(x, 0, 64, 30),
            scale: 1.0,
            primary: index == 0,
        }
    }

    #[test]
    fn encodes_every_monitor_in_order() {
        let captured: Vec<_> = (0..3)
            .map(|i| {
                let px = Rgba([i as u8 * 80, 10, 20, 255]);
                (info(i, i as i32 * 64), RgbaImage::from_pixel(64, 32, px))
            })
            .collect();
        let (frames, err) = encode_all(captured);
        assert!(err.is_none());
        assert_eq!(frames.len(), 3);
        for (i, f) in frames.iter().enumerate() {
            assert_eq!(f.info.index, i);
            let decoded = image::load_from_memory(&f.png).unwrap().to_rgba8();
            assert_eq!(decoded.dimensions(), (64, 32));
            assert_eq!(
                decoded.get_pixel(5, 5)[0],
                i as u8 * 80,
                "PNG trocado entre monitores"
            );
        }
    }

    #[test]
    fn crop_clamps_to_image() {
        let img = RgbaImage::from_pixel(100, 50, Rgba([0, 0, 0, 255]));
        let c = crop(&img, Rect::new(90, 40, 30, 30)).unwrap();
        assert_eq!(c.dimensions(), (10, 10));
        assert!(crop(&img, Rect::new(200, 0, 10, 10)).is_err());
    }
}
