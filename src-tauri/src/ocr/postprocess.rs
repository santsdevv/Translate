#[derive(Debug, Clone)]
pub struct RawLine {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x3040..=0x30FF
        | 0x3400..=0x4DBF
        | 0x4E00..=0x9FFF
        | 0xF900..=0xFAFF
        | 0x3000..=0x303F
        | 0xFF00..=0xFFEF
    )
}

pub fn collapse_cjk_spaces(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    for (i, &c) in chars.iter().enumerate() {
        if c == ' ' {
            let prev = out.chars().last();
            let next = chars[i + 1..].iter().find(|c| **c != ' ');
            if let (Some(p), Some(n)) = (prev, next) {
                if is_cjk(p) && is_cjk(*n) {
                    continue;
                }
            }
            if prev == Some(' ') {
                continue;
            }
        }
        out.push(c);
    }
    out.trim().to_string()
}

fn ends_sentence(s: &str) -> bool {
    s.trim_end()
        .ends_with(['.', '!', '?', ':', '。', '！', '？', '…', '"', '”'])
}

fn median(mut v: Vec<f32>) -> f32 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    v[v.len() / 2]
}

pub fn assemble(lines: Vec<RawLine>, merge: bool) -> String {
    let lines: Vec<RawLine> = lines
        .into_iter()
        .map(|mut l| {
            l.text = collapse_cjk_spaces(&l.text);
            l
        })
        .filter(|l| !l.text.is_empty())
        .collect();
    if lines.is_empty() {
        return String::new();
    }
    if !merge {
        return lines
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
    }

    let line_h = median(lines.iter().map(|l| l.height).collect()).max(1.0);
    let max_w = lines
        .iter()
        .map(|l| l.width)
        .fold(0.0_f32, f32::max)
        .max(1.0);

    let mut out = String::new();
    let mut prev: Option<&RawLine> = None;
    for line in &lines {
        if let Some(p) = prev {
            let gap = line.y - (p.y + p.height);
            let new_paragraph = gap > line_h * 0.85
                || (ends_sentence(&p.text) && p.width < max_w * 0.72)
                || line.y + line.height * 0.5 < p.y
                || line.x - p.x > line_h * 1.5;
            if new_paragraph {
                out.push('\n');
            } else {
                let last = out.chars().last().unwrap_or(' ');
                let first = line.text.chars().next().unwrap_or(' ');
                if last == '-' && first.is_lowercase() {
                    out.pop();
                } else if !(is_cjk(last) || is_cjk(first)) {
                    out.push(' ');
                }
            }
        }
        out.push_str(&line.text);
        prev = Some(line);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn l(text: &str, y: f32, w: f32) -> RawLine {
        RawLine {
            text: text.into(),
            x: 0.0,
            y,
            width: w,
            height: 20.0,
        }
    }

    #[test]
    fn merges_wrapped_lines() {
        let s = assemble(
            vec![
                l("The quick brown fox jumps", 0.0, 500.0),
                l("over the lazy dog.", 26.0, 300.0),
            ],
            true,
        );
        assert_eq!(s, "The quick brown fox jumps over the lazy dog.");
    }

    #[test]
    fn splits_paragraphs_on_gap() {
        let s = assemble(
            vec![l("Title", 0.0, 100.0), l("Body text here", 60.0, 400.0)],
            true,
        );
        assert_eq!(s, "Title\nBody text here");
    }

    #[test]
    fn removes_hyphenation() {
        let s = assemble(
            vec![l("transla-", 0.0, 500.0), l("tion works", 24.0, 500.0)],
            true,
        );
        assert_eq!(s, "translation works");
    }

    #[test]
    fn collapses_japanese_spaces() {
        assert_eq!(
            collapse_cjk_spaces("こ ん に ち は 世 界"),
            "こんにちは世界"
        );
        assert_eq!(collapse_cjk_spaces("Hello  world"), "Hello world");
    }

    #[test]
    fn keeps_lines_when_not_merging() {
        assert_eq!(
            assemble(vec![l("a", 0.0, 10.0), l("b", 22.0, 10.0)], false),
            "a\nb"
        );
    }
}
