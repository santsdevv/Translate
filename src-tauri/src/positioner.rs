use serde::Serialize;

use crate::geometry::Rect;
use crate::settings::PopupPlacement;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Below,
    Above,
    Right,
    Left,
    Inside,
    Cursor,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub side: Side,
}

pub struct PlaceInput {
    pub anchor: Rect,
    pub card_w: u32,
    pub card_h: u32,
    pub work_area: Rect,
    pub gap: i32,
    pub preference: PopupPlacement,
    pub cursor: (i32, i32),
    pub sticky: Option<Side>,
}

pub fn place(input: &PlaceInput) -> Placement {
    let PlaceInput {
        anchor,
        card_w,
        card_h,
        work_area,
        gap,
        ..
    } = *input;
    let w = card_w as i32;
    let h = card_h as i32;

    let candidate = |side: Side| -> (i32, i32) {
        match side {
            Side::Below => (anchor.x, anchor.bottom() + gap),
            Side::Above => (anchor.x, anchor.y - gap - h),
            Side::Right => (anchor.right() + gap, anchor.y),
            Side::Left => (anchor.x - gap - w, anchor.y),
            Side::Inside => (anchor.right() - w - gap, anchor.bottom() - h - gap),
            Side::Cursor => (input.cursor.0 + 16, input.cursor.1 + 20),
        }
    };
    let fits = |side: Side, (x, y): (i32, i32)| match side {
        Side::Below | Side::Above => {
            y >= work_area.y && y + h <= work_area.bottom() && w <= work_area.width as i32
        }
        Side::Left | Side::Right => {
            x >= work_area.x && x + w <= work_area.right() && h <= work_area.height as i32
        }
        _ => work_area.contains_rect(&Rect::new(x, y, card_w, card_h)),
    };

    let order: &[Side] = match (input.sticky, input.preference) {
        (Some(side), _) => &[side][..],
        (None, PopupPlacement::Cursor) => &[Side::Cursor],
        (None, PopupPlacement::Above) => &[Side::Above, Side::Below, Side::Right, Side::Left],
        (None, PopupPlacement::Below) => &[Side::Below, Side::Above, Side::Right, Side::Left],
        (None, PopupPlacement::Auto) => &[Side::Below, Side::Above, Side::Right, Side::Left],
    };

    let forced = input.sticky.is_some() || input.preference == PopupPlacement::Cursor;
    let (side, (x, y)) = if forced {
        (order[0], candidate(order[0]))
    } else {
        order
            .iter()
            .map(|&s| (s, candidate(s)))
            .find(|&(side, pos)| fits(side, pos))
            .unwrap_or((Side::Inside, candidate(Side::Inside)))
    };

    let max_x = (work_area.right() - w).max(work_area.x);
    let max_y = (work_area.bottom() - h).max(work_area.y);
    Placement {
        x: x.clamp(work_area.x, max_x),
        y: y.clamp(work_area.y, max_y),
        side,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(anchor: Rect, w: u32, h: u32) -> PlaceInput {
        PlaceInput {
            anchor,
            card_w: w,
            card_h: h,
            work_area: Rect::new(0, 0, 1920, 1040),
            gap: 10,
            preference: PopupPlacement::Auto,
            cursor: (0, 0),
            sticky: None,
        }
    }

    #[test]
    fn prefers_below() {
        let p = place(&input(Rect::new(100, 100, 300, 40), 400, 200));
        assert_eq!((p.x, p.y, p.side), (100, 150, Side::Below));
    }

    #[test]
    fn goes_above_near_taskbar() {
        let p = place(&input(Rect::new(100, 950, 300, 40), 400, 200));
        assert_eq!((p.x, p.y, p.side), (100, 740, Side::Above));
    }

    #[test]
    fn clamps_horizontally() {
        let p = place(&input(Rect::new(1800, 100, 100, 40), 400, 200));
        assert_eq!(p.x, 1520);
        assert_eq!(p.side, Side::Below);
    }

    #[test]
    fn huge_selection_goes_inside() {
        let p = place(&input(Rect::new(0, 0, 1920, 1040), 400, 200));
        assert_eq!(p.side, Side::Inside);
        assert!(p.x + 400 <= 1920 && p.y + 200 <= 1040);
    }

    #[test]
    fn respects_monitor_offset() {
        let mut i = input(Rect::new(-1800, 300, 200, 40), 400, 200);
        i.work_area = Rect::new(-1920, 0, 1920, 1040);
        let p = place(&i);
        assert_eq!((p.x, p.y), (-1800, 350));
    }
}
