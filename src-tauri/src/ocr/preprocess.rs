use image::imageops::{self, FilterType};
use image::{Rgba, RgbaImage};

const MIN_HEIGHT: u32 = 160;
const PADDING: u32 = 12;

pub fn prepare(src: &RgbaImage, upscale_small: bool, max_dim: u32) -> RgbaImage {
    let mut factor = 1.0_f32;
    if upscale_small && src.height() < MIN_HEIGHT {
        factor = (MIN_HEIGHT as f32 / src.height() as f32).clamp(1.0, 3.0);
    }
    let limit = max_dim.saturating_sub(PADDING * 2).max(64) as f32;
    let biggest = src.width().max(src.height()) as f32 * factor;
    if biggest > limit {
        factor *= limit / biggest;
    }

    let scaled = if (factor - 1.0).abs() > 0.01 {
        let w = ((src.width() as f32 * factor).round() as u32).max(1);
        let h = ((src.height() as f32 * factor).round() as u32).max(1);
        let filter = if factor > 1.0 {
            FilterType::CatmullRom
        } else {
            FilterType::Triangle
        };
        imageops::resize(src, w, h, filter)
    } else {
        src.clone()
    };

    let fill = border_color(&scaled);
    let mut canvas = RgbaImage::from_pixel(
        scaled.width() + PADDING * 2,
        scaled.height() + PADDING * 2,
        fill,
    );
    imageops::replace(&mut canvas, &scaled, PADDING as i64, PADDING as i64);
    canvas
}

fn border_color(img: &RgbaImage) -> Rgba<u8> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Rgba([255, 255, 255, 255]);
    }
    let mut sum = [0u64; 3];
    let mut n = 0u64;
    let mut add = |p: &Rgba<u8>| {
        sum[0] += p[0] as u64;
        sum[1] += p[1] as u64;
        sum[2] += p[2] as u64;
        n += 1;
    };
    for x in 0..w {
        add(img.get_pixel(x, 0));
        add(img.get_pixel(x, h - 1));
    }
    for y in 0..h {
        add(img.get_pixel(0, y));
        add(img.get_pixel(w - 1, y));
    }
    Rgba([
        (sum[0] / n) as u8,
        (sum[1] / n) as u8,
        (sum[2] / n) as u8,
        255,
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upscales_small_and_pads() {
        let img = RgbaImage::from_pixel(100, 40, Rgba([0, 0, 0, 255]));
        let out = prepare(&img, true, 2600);
        assert_eq!(out.height(), 120 + 24);
        assert_eq!(out.width(), 300 + 24);
    }

    #[test]
    fn respects_max_dimension() {
        let img = RgbaImage::from_pixel(5000, 400, Rgba([255, 255, 255, 255]));
        let out = prepare(&img, true, 2600);
        assert!(out.width() <= 2600);
    }
}
