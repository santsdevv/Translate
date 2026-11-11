use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }
    pub fn right(&self) -> i32 {
        self.x + self.width as i32
    }
    pub fn bottom(&self) -> i32 {
        self.y + self.height as i32
    }
    pub fn center(&self) -> (i32, i32) {
        (
            self.x + self.width as i32 / 2,
            self.y + self.height as i32 / 2,
        )
    }
    pub fn contains_point(&self, px: i32, py: i32) -> bool {
        px >= self.x && px < self.right() && py >= self.y && py < self.bottom()
    }
    pub fn contains_rect(&self, other: &Rect) -> bool {
        other.x >= self.x
            && other.y >= self.y
            && other.right() <= self.right()
            && other.bottom() <= self.bottom()
    }
    pub fn intersect(&self, other: &Rect) -> Option<Rect> {
        let x = self.x.max(other.x);
        let y = self.y.max(other.y);
        let r = self.right().min(other.right());
        let b = self.bottom().min(other.bottom());
        (r > x && b > y).then(|| Rect::new(x, y, (r - x) as u32, (b - y) as u32))
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct CssRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn css_to_physical(
    sel: CssRect,
    viewport: (f64, f64),
    image_w: u32,
    image_h: u32,
) -> Option<Rect> {
    let ratio = |img: u32, vp: f64| {
        if vp.is_finite() && vp > 0.0 {
            img as f64 / vp
        } else {
            1.0
        }
    };
    let (sx, sy) = (ratio(image_w, viewport.0), ratio(image_h, viewport.1));
    let x0 = (sel.x.min(sel.x + sel.width) * sx).floor().max(0.0);
    let y0 = (sel.y.min(sel.y + sel.height) * sy).floor().max(0.0);
    let x1 = (sel.x.max(sel.x + sel.width) * sx)
        .ceil()
        .min(image_w as f64);
    let y1 = (sel.y.max(sel.y + sel.height) * sy)
        .ceil()
        .min(image_h as f64);
    let w = (x1 - x0) as i64;
    let h = (y1 - y0) as i64;
    (w >= 2 && h >= 2).then(|| Rect::new(x0 as i32, y0 as i32, w as u32, h as u32))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_with_fractional_scale() {
        let r = css_to_physical(
            CssRect {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 50.0,
            },
            (1536.0, 864.0),
            1920,
            1080,
        )
        .unwrap();
        assert_eq!(r, Rect::new(12, 25, 126, 63));
    }

    #[test]
    fn normalizes_negative_drag_and_clamps() {
        let r = css_to_physical(
            CssRect {
                x: 100.0,
                y: 100.0,
                width: -150.0,
                height: 2000.0,
            },
            (1920.0, 1080.0),
            1920,
            1080,
        )
        .unwrap();
        assert_eq!(r, Rect::new(0, 100, 100, 980));
    }

    #[test]
    fn rejects_tiny() {
        assert!(css_to_physical(
            CssRect {
                x: 1.0,
                y: 1.0,
                width: 0.5,
                height: 10.0
            },
            (100.0, 100.0),
            100,
            100
        )
        .is_none());
    }
}
