//! System fonts and text rendering for the text watermark

use ab_glyph::{point, Font, FontRef, OutlinedGlyph, Rect, ScaleFont};
use image::{Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::OnceLock;

/// A selectable font face
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FontInfo {
    /// PostScript name, used as the identifier in settings
    pub id: String,
    /// Family name (the English one when the font has several)
    pub family: String,
}

/// Fonts offered in the settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontList {
    pub fonts: Vec<FontInfo>,
    /// Font used when none is chosen or the saved one is gone
    pub default_font: Option<String>,
}

/// Default font candidates, in order of preference
const DEFAULT_FONTS: &[&str] = &[
    "HiraginoSans-W3",
    "HiraKakuProN-W3",
    "Helvetica",
    "ArialMT",
    "DejaVuSans",
];

/// Font size used to measure the text before scaling it to the target width
const REFERENCE_PX: f32 = 100.0;

fn database() -> &'static fontdb::Database {
    static DATABASE: OnceLock<fontdb::Database> = OnceLock::new();
    DATABASE.get_or_init(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        db
    })
}

/// Installed fonts that can be drawn, sorted by family.
///
/// Faces whose PostScript name starts with "." are left out: macOS uses that
/// prefix for its private system faces. `.ttc` collections are listed face by
/// face.
pub fn font_list() -> &'static FontList {
    static FONTS: OnceLock<FontList> = OnceLock::new();
    FONTS.get_or_init(|| {
        let db = database();
        let mut seen = HashSet::new();
        let mut fonts: Vec<FontInfo> = db
            .faces()
            .filter(|face| {
                !face.post_script_name.is_empty() && !face.post_script_name.starts_with('.')
            })
            .filter(|face| seen.insert(face.post_script_name.clone()))
            .filter(|face| {
                db.with_face_data(face.id, |data, index| {
                    FontRef::try_from_slice_and_index(data, index).is_ok()
                })
                .unwrap_or(false)
            })
            .map(|face| FontInfo {
                id: face.post_script_name.clone(),
                family: face
                    .families
                    .iter()
                    .find(|(_, language)| *language == fontdb::Language::English_UnitedStates)
                    .or_else(|| face.families.first())
                    .map(|(name, _)| name.clone())
                    .unwrap_or_else(|| face.post_script_name.clone()),
            })
            .collect();
        fonts.sort_by(|a, b| {
            (a.family.to_lowercase(), &a.id).cmp(&(b.family.to_lowercase(), &b.id))
        });

        let default_font = DEFAULT_FONTS
            .iter()
            .find(|name| fonts.iter().any(|font| font.id == **name))
            .map(|name| name.to_string())
            .or_else(|| fonts.first().map(|font| font.id.clone()));

        FontList {
            fonts,
            default_font,
        }
    })
}

/// Run `f` with the face whose PostScript name is `font_id`
fn with_font<T>(font_id: &str, f: impl FnOnce(&FontRef) -> T) -> Result<T, String> {
    let db = database();
    let face = db
        .faces()
        .find(|face| face.post_script_name == font_id)
        .ok_or_else(|| format!("font not found: {}", font_id))?;
    db.with_face_data(face.id, |data, index| {
        FontRef::try_from_slice_and_index(data, index)
            .map(|font| f(&font))
            .map_err(|e| format!("{}: {}", font_id, e))
    })
    .ok_or_else(|| format!("failed to load font: {}", font_id))?
}

/// Characters of `text` that `font_id` cannot draw, without duplicates.
///
/// A character counts as missing when the font maps it to glyph 0 (.notdef,
/// drawn as a box) or when its glyph has no outline to fill, as with the
/// bitmap-only glyphs of color emoji fonts. Whitespace and control characters
/// are not checked.
pub fn missing_chars(font_id: &str, text: &str) -> Result<Vec<char>, String> {
    with_font(font_id, |font| {
        let mut missing = Vec::new();
        for c in text.chars() {
            if c.is_whitespace() || c.is_control() || missing.contains(&c) {
                continue;
            }
            if !draws_ink(font, c) {
                missing.push(c);
            }
        }
        missing
    })
}

fn draws_ink(font: &FontRef, c: char) -> bool {
    let id = font.glyph_id(c);
    if id.0 == 0 {
        return false;
    }
    let mut ink = false;
    if let Some(outlined) = font.outline_glyph(id.with_scale(32.0)) {
        outlined.draw(|_, _, coverage| ink |= coverage > 0.0);
    }
    ink
}

/// Parse a `#rrggbb` color
pub fn parse_hex_color(value: &str) -> Result<[u8; 3], String> {
    let invalid = || format!("invalid color: {}", value);
    let hex = value.strip_prefix('#').ok_or_else(invalid)?;
    if hex.len() != 6 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(invalid());
    }
    let channel = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).map_err(|_| invalid());
    Ok([channel(0)?, channel(2)?, channel(4)?])
}

/// How the text is drawn
pub struct TextStyle<'a> {
    pub text: &'a str,
    pub fill: [u8; 3],
    /// Outline color and width, the width as a fraction of the font size
    pub outline: Option<([u8; 3], f32)>,
}

/// Render `style.text` on one line so that the whole mark, outline included,
/// is about `target_width` px wide. Returns `None` when there is nothing to
/// draw.
pub fn render_text(
    font_id: &str,
    style: &TextStyle,
    target_width: u32,
) -> Result<Option<RgbaImage>, String> {
    with_font(font_id, |font| render_with_font(font, style, target_width))
}

fn render_with_font(font: &FontRef, style: &TextStyle, target_width: u32) -> Option<RgbaImage> {
    let outline_ratio = style.outline.map_or(0.0, |(_, width)| width.max(0.0));

    let (_, reference) = outline_glyphs(font, style.text, REFERENCE_PX)?;
    let reference_width = reference.width() + 2.0 * outline_ratio * REFERENCE_PX;
    if reference_width <= 0.0 || target_width == 0 {
        return None;
    }
    let px = REFERENCE_PX * target_width as f32 / reference_width;

    let (glyphs, bounds) = outline_glyphs(font, style.text, px)?;
    let radius = outline_ratio * px;
    // Outline alpha is `radius + 0.5 - distance`, so nothing is drawn beyond
    // round(radius) px outside the glyph bounds
    let pad = radius.round();
    let width = (bounds.width() + 2.0 * pad).ceil().max(1.0) as usize;
    let height = (bounds.height() + 2.0 * pad).ceil().max(1.0) as usize;

    let mut coverage = vec![0.0f32; width * height];
    for glyph in &glyphs {
        let glyph_bounds = glyph.px_bounds();
        let left = (glyph_bounds.min.x - bounds.min.x + pad) as i64;
        let top = (glyph_bounds.min.y - bounds.min.y + pad) as i64;
        glyph.draw(|x, y, value| {
            let (x, y) = (left + x as i64, top + y as i64);
            if (0..width as i64).contains(&x) && (0..height as i64).contains(&y) {
                let cell = &mut coverage[y as usize * width + x as usize];
                *cell = (*cell + value).min(1.0);
            }
        });
    }

    let distances = style
        .outline
        .filter(|_| radius > 0.0)
        .map(|_| squared_distance_to_ink(&coverage, width, height));

    let outline_color = style.outline.map_or([0, 0, 0], |(color, _)| color);
    let mut mark = RgbaImage::new(width as u32, height as u32);
    for (i, pixel) in mark.pixels_mut().enumerate() {
        let fill_alpha = coverage[i];
        let outline_alpha = distances.as_ref().map_or(0.0, |distances| {
            (radius + 0.5 - distances[i].sqrt() as f32)
                .clamp(0.0, 1.0)
                .max(fill_alpha)
        });
        let alpha = fill_alpha + outline_alpha * (1.0 - fill_alpha);
        if alpha <= 0.0 {
            continue;
        }
        let under = outline_alpha * (1.0 - fill_alpha);
        let channel = |c: usize| {
            ((style.fill[c] as f32 * fill_alpha + outline_color[c] as f32 * under) / alpha).round()
                as u8
        };
        *pixel = Rgba([
            channel(0),
            channel(1),
            channel(2),
            (alpha * 255.0).round() as u8,
        ]);
    }

    Some(mark)
}

/// Lay `text` out on one line at `px` and return the outlined glyphs with the
/// union of their pixel bounds. `None` when no glyph has an outline.
fn outline_glyphs(font: &FontRef, text: &str, px: f32) -> Option<(Vec<OutlinedGlyph>, Rect)> {
    let scaled = font.as_scaled(px);
    let mut caret = 0.0f32;
    let mut previous = None;
    let mut glyphs = Vec::new();
    for c in text.chars().filter(|c| !c.is_control()) {
        let id = scaled.glyph_id(c);
        if let Some(previous) = previous {
            caret += scaled.kern(previous, id);
        }
        if let Some(outlined) =
            font.outline_glyph(id.with_scale_and_position(px, point(caret, 0.0)))
        {
            glyphs.push(outlined);
        }
        caret += scaled.h_advance(id);
        previous = Some(id);
    }

    let bounds = glyphs
        .iter()
        .map(|glyph| glyph.px_bounds())
        .reduce(|a, b| Rect {
            min: point(a.min.x.min(b.min.x), a.min.y.min(b.min.y)),
            max: point(a.max.x.max(b.max.x), a.max.y.max(b.max.y)),
        })?;
    Some((glyphs, bounds))
}

/// Squared Euclidean distance from each pixel to the nearest pixel with at
/// least half coverage (Felzenszwalb & Huttenlocher).
fn squared_distance_to_ink(coverage: &[f32], width: usize, height: usize) -> Vec<f64> {
    const FAR: f64 = 1e20;
    let mut grid: Vec<f64> = coverage
        .iter()
        .map(|&value| if value >= 0.5 { 0.0 } else { FAR })
        .collect();

    let mut line = vec![0.0; width.max(height)];
    let mut out = vec![0.0; width.max(height)];
    for x in 0..width {
        for y in 0..height {
            line[y] = grid[y * width + x];
        }
        distance_1d(&line[..height], &mut out[..height]);
        for y in 0..height {
            grid[y * width + x] = out[y];
        }
    }
    for y in 0..height {
        let row = &mut grid[y * width..(y + 1) * width];
        line[..width].copy_from_slice(row);
        distance_1d(&line[..width], row);
    }
    grid
}

fn distance_1d(f: &[f64], d: &mut [f64]) {
    let n = f.len();
    if n == 0 {
        return;
    }
    let mut vertices = vec![0usize; n];
    let mut bounds = vec![0.0f64; n + 1];
    let mut k = 0;
    bounds[0] = f64::NEG_INFINITY;
    bounds[1] = f64::INFINITY;
    let intersect = |q: usize, p: usize| {
        let (qf, pf) = (q as f64, p as f64);
        ((f[q] + qf * qf) - (f[p] + pf * pf)) / (2.0 * (qf - pf))
    };
    for q in 1..n {
        let mut s = intersect(q, vertices[k]);
        while s <= bounds[k] {
            k -= 1;
            s = intersect(q, vertices[k]);
        }
        k += 1;
        vertices[k] = q;
        bounds[k] = s;
        bounds[k + 1] = f64::INFINITY;
    }
    k = 0;
    for (q, value) in d.iter_mut().enumerate() {
        while bounds[k + 1] < q as f64 {
            k += 1;
        }
        let offset = q as f64 - vertices[k] as f64;
        *value = offset * offset + f[vertices[k]];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WHITE: [u8; 3] = [255, 255, 255];
    const BLACK: [u8; 3] = [0, 0, 0];

    fn default_font() -> &'static str {
        font_list()
            .default_font
            .as_deref()
            .expect("no usable system font")
    }

    fn render(text: &str, outline: Option<([u8; 3], f32)>, width: u32) -> RgbaImage {
        let style = TextStyle {
            text,
            fill: WHITE,
            outline,
        };
        render_text(default_font(), &style, width)
            .unwrap()
            .expect("nothing drawn")
    }

    #[test]
    fn parses_hex_colors() {
        assert_eq!(parse_hex_color("#ff8000"), Ok([255, 128, 0]));
        assert_eq!(parse_hex_color("#FFFFFF"), Ok([255, 255, 255]));
        for bad in ["ff8000", "#ff800", "#ff80000", "#gg0000", "", "#"] {
            assert!(parse_hex_color(bad).is_err(), "{:?}", bad);
        }
    }

    #[test]
    fn distance_transform_is_euclidean() {
        // One inked pixel at (1, 1) in a 5x4 grid
        let mut coverage = vec![0.0; 5 * 4];
        coverage[5 + 1] = 1.0;
        let distances = squared_distance_to_ink(&coverage, 5, 4);

        assert_eq!(distances[5 + 1], 0.0);
        assert_eq!(distances[1], 1.0);
        assert_eq!(distances[0], 2.0);
        assert_eq!(distances[3 * 5 + 4], 13.0);
    }

    #[test]
    fn font_list_is_sorted_unique_and_has_a_default() {
        let list = font_list();
        assert!(!list.fonts.is_empty());
        let ids: HashSet<_> = list.fonts.iter().map(|font| &font.id).collect();
        assert_eq!(ids.len(), list.fonts.len());
        assert!(list.fonts.iter().all(|font| !font.id.starts_with('.')));
        let default = list.default_font.as_ref().unwrap();
        assert!(list.fonts.iter().any(|font| &font.id == default));
    }

    #[test]
    fn unknown_font_is_an_error() {
        assert!(missing_chars("No-Such-Font-Anywhere", "A").is_err());
        let style = TextStyle {
            text: "A",
            fill: WHITE,
            outline: None,
        };
        assert!(render_text("No-Such-Font-Anywhere", &style, 100).is_err());
    }

    #[test]
    fn reports_characters_the_font_lacks_once_and_skips_whitespace() {
        // U+10FFFD is a private-use code point no system font should map
        let missing = missing_chars(default_font(), "A \u{10FFFD}B\u{10FFFD}\n").unwrap();
        assert_eq!(missing, vec!['\u{10FFFD}']);
    }

    #[test]
    fn text_is_scaled_to_the_target_width() {
        for width in [40, 200, 900] {
            let mark = render("Sample", None, width);
            assert!(
                mark.width().abs_diff(width) <= 2,
                "target {} got {}",
                width,
                mark.width()
            );
            assert!(mark.height() > 0 && mark.height() < mark.width());
        }
    }

    #[test]
    fn text_is_drawn_in_the_fill_color_on_a_transparent_background() {
        let mark = render("H", None, 200);

        let opaque: Vec<_> = mark.pixels().filter(|p| p[3] == 255).collect();
        assert!(!opaque.is_empty());
        assert!(opaque.iter().all(|p| p.0[..3] == WHITE));
        // Between the two stems of the H
        let middle_top = mark.get_pixel(mark.width() / 2, 0);
        assert_eq!(middle_top[3], 0);
    }

    #[test]
    fn outline_surrounds_the_fill_and_fits_in_the_target_width() {
        let mark = render("H", Some((BLACK, 0.1)), 200);

        assert!(mark.width().abs_diff(200) <= 3, "width {}", mark.width());
        assert!(mark.pixels().any(|p| p[3] == 255 && p.0[..3] == WHITE));
        assert!(mark.pixels().any(|p| p[3] == 255 && p.0[..3] == BLACK));
        // The outline starts left of the fill
        let leftmost = |keep: &dyn Fn(&Rgba<u8>) -> bool| {
            mark.enumerate_pixels()
                .filter(|(_, _, p)| keep(p))
                .map(|(x, _, _)| x)
                .min()
                .unwrap()
        };
        let fill = leftmost(&|p| p[3] == 255 && p.0[..3] == WHITE);
        let outline = leftmost(&|p| p[3] > 0);
        assert!(outline + 10 <= fill, "outline {} fill {}", outline, fill);
    }

    #[test]
    fn blank_text_draws_nothing() {
        let style = TextStyle {
            text: "   ",
            fill: WHITE,
            outline: None,
        };
        assert!(render_text(default_font(), &style, 100).unwrap().is_none());
    }

    #[cfg(target_os = "macos")]
    mod macos {
        use super::*;

        #[test]
        fn faces_inside_ttc_collections_are_listed_and_drawn() {
            // Helvetica.ttc holds Helvetica at index 0 and Helvetica-Bold at 1
            let list = font_list();
            for id in ["Helvetica", "Helvetica-Bold", "HiraginoSans-W3"] {
                assert!(list.fonts.iter().any(|font| font.id == id), "{}", id);
            }
            let style = TextStyle {
                text: "Aa",
                fill: WHITE,
                outline: None,
            };
            let regular = render_text("Helvetica", &style, 400).unwrap().unwrap();
            let bold = render_text("Helvetica-Bold", &style, 400).unwrap().unwrap();
            let ink = |mark: &RgbaImage| mark.pixels().map(|p| p[3] as u64).sum::<u64>();
            assert!(ink(&bold) > ink(&regular));
        }

        #[test]
        fn japanese_is_missing_from_helvetica_but_not_from_hiragino() {
            assert_eq!(
                missing_chars("Helvetica", "Aあ漢").unwrap(),
                vec!['あ', '漢']
            );
            assert!(missing_chars("HiraginoSans-W3", "Aあ漢")
                .unwrap()
                .is_empty());
        }

        #[test]
        fn bitmap_only_emoji_count_as_missing() {
            assert_eq!(missing_chars("AppleColorEmoji", "😀").unwrap(), vec!['😀']);
        }

        #[test]
        fn default_font_is_hiragino_sans() {
            assert_eq!(font_list().default_font.as_deref(), Some("HiraginoSans-W3"));
        }
    }
}
