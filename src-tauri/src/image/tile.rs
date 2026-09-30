//! Repeating a watermark over the whole image

use image::RgbaImage;

/// Repeat `mark` over `base` on a grid turned `angle_degrees` counterclockwise
/// around the image center, `gap` px apart. The marks turn with the grid,
/// every other row is shifted by half a step, and one mark sits at the center.
///
/// Each output pixel is mapped back into the grid and the mark is sampled
/// bilinearly, so rotated edges stay smooth.
pub fn tile(base: &mut RgbaImage, mark: &RgbaImage, gap: f64, angle_degrees: f64) {
    if mark.width() == 0 || mark.height() == 0 {
        return;
    }
    let (mark_width, mark_height) = (mark.width() as f64, mark.height() as f64);
    let gap = gap.max(0.0);
    let (step_x, step_y) = (mark_width + gap, mark_height + gap);
    let (sin, cos) = angle_degrees.to_radians().sin_cos();
    let (center_x, center_y) = (base.width() as f64 / 2.0, base.height() as f64 / 2.0);

    for (x, y, pixel) in base.enumerate_pixels_mut() {
        let dx = x as f64 + 0.5 - center_x;
        let dy = y as f64 + 0.5 - center_y;
        // Grid coordinates, with the origin at the top-left of the center mark
        let u = cos * dx - sin * dy + mark_width / 2.0;
        let v = sin * dx + cos * dy + mark_height / 2.0;

        let row = (v / step_y).floor();
        let shift = if row.rem_euclid(2.0) == 1.0 {
            step_x / 2.0
        } else {
            0.0
        };
        let cell_x = cell_offset((u + shift).rem_euclid(step_x), step_x);
        let cell_y = cell_offset(v.rem_euclid(step_y), step_y);

        let [red, green, blue, alpha] = sample(mark, cell_x, cell_y);
        if alpha <= 0.0 {
            continue;
        }
        let base_alpha = pixel[3] as f64 / 255.0;
        let under = base_alpha * (1.0 - alpha);
        let out_alpha = alpha + under;
        let blend = |premultiplied: f64, channel: u8| {
            ((premultiplied + channel as f64 * under) / out_alpha)
                .round()
                .clamp(0.0, 255.0) as u8
        };
        pixel.0 = [
            blend(red, pixel[0]),
            blend(green, pixel[1]),
            blend(blue, pixel[2]),
            (out_alpha * 255.0).round() as u8,
        ];
    }
}

/// Position inside a cell, in mark pixel coordinates. Near the end of the
/// cell it wraps to just before the next mark, so that mark's leading edge
/// is sampled too.
fn cell_offset(position: f64, step: f64) -> f64 {
    let pixel = position - 0.5;
    if pixel > step - 1.0 {
        pixel - step
    } else {
        pixel
    }
}

/// Bilinear sample with transparent pixels outside the mark. Returns
/// premultiplied RGB (0-255) and alpha (0-1).
fn sample(mark: &RgbaImage, x: f64, y: f64) -> [f64; 4] {
    let (x0, y0) = (x.floor(), y.floor());
    let (fx, fy) = (x - x0, y - y0);
    let mut sum = [0.0; 4];
    for (ox, oy, weight) in [
        (0.0, 0.0, (1.0 - fx) * (1.0 - fy)),
        (1.0, 0.0, fx * (1.0 - fy)),
        (0.0, 1.0, (1.0 - fx) * fy),
        (1.0, 1.0, fx * fy),
    ] {
        let (px, py) = (x0 + ox, y0 + oy);
        if weight <= 0.0
            || px < 0.0
            || py < 0.0
            || px >= mark.width() as f64
            || py >= mark.height() as f64
        {
            continue;
        }
        let pixel = mark.get_pixel(px as u32, py as u32);
        let alpha = pixel[3] as f64 / 255.0 * weight;
        for channel in 0..3 {
            sum[channel] += pixel[channel] as f64 * alpha;
        }
        sum[3] += alpha;
    }
    sum
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    const BLUE: Rgba<u8> = Rgba([0, 0, 255, 255]);
    const RED: Rgba<u8> = Rgba([255, 0, 0, 255]);

    fn is_red(pixel: &Rgba<u8>) -> bool {
        pixel[0] > 200 && pixel[2] < 55
    }

    #[test]
    fn marks_repeat_with_the_gap_and_one_sits_at_the_center() {
        // 10x10 marks, 10px gap -> 20px steps, a mark centered on (50, 50)
        let mut base = RgbaImage::from_pixel(100, 100, BLUE);
        tile(&mut base, &RgbaImage::from_pixel(10, 10, RED), 10.0, 0.0);

        assert!(is_red(base.get_pixel(50, 50)));
        assert!(is_red(base.get_pixel(46, 46)));
        assert!(!is_red(base.get_pixel(57, 50)), "gap to the right");
        assert!(is_red(base.get_pixel(70, 50)), "next mark in the row");
        assert!(is_red(base.get_pixel(30, 50)), "previous mark in the row");
        assert!(is_red(base.get_pixel(10, 50)), "repeats to the edge");
        assert_eq!(*base.get_pixel(50, 60), BLUE, "gap below");
    }

    #[test]
    fn every_other_row_is_shifted_by_half_a_step() {
        let mut base = RgbaImage::from_pixel(100, 100, BLUE);
        tile(&mut base, &RgbaImage::from_pixel(10, 10, RED), 10.0, 0.0);

        // The row below the center one: marks centered at x = 40, 60
        assert!(is_red(base.get_pixel(40, 70)));
        assert!(is_red(base.get_pixel(60, 70)));
        assert_eq!(*base.get_pixel(50, 70), BLUE);
    }

    #[test]
    fn rotation_turns_the_grid_and_the_marks() {
        // A wide mark (30x4) turned 90 degrees stands upright
        let mut base = RgbaImage::from_pixel(100, 100, BLUE);
        tile(&mut base, &RgbaImage::from_pixel(30, 4, RED), 40.0, 90.0);

        assert!(is_red(base.get_pixel(50, 38)));
        assert!(is_red(base.get_pixel(50, 62)));
        assert_eq!(*base.get_pixel(40, 50), BLUE);
        assert_eq!(*base.get_pixel(60, 50), BLUE);
    }

    #[test]
    fn rotated_edges_are_blended_rather_than_jagged() {
        let mut base = RgbaImage::from_pixel(100, 100, BLUE);
        tile(&mut base, &RgbaImage::from_pixel(40, 40, RED), 60.0, 30.0);

        let mixed = base
            .pixels()
            .filter(|p| p[0] > 20 && p[0] < 235 && p[1] == 0)
            .count();
        assert!(mixed > 0);
    }

    #[test]
    fn transparent_mark_pixels_leave_the_base_unchanged() {
        let mut base = RgbaImage::from_pixel(50, 50, BLUE);
        tile(&mut base, &RgbaImage::new(10, 10), 0.0, 45.0);

        assert!(base.pixels().all(|p| *p == BLUE));
    }

    #[test]
    fn a_transparent_base_keeps_its_transparency_between_marks() {
        let mut base = RgbaImage::new(100, 100);
        tile(&mut base, &RgbaImage::from_pixel(10, 10, RED), 10.0, 0.0);

        assert_eq!(*base.get_pixel(50, 50), RED);
        assert_eq!(base.get_pixel(50, 60)[3], 0);
    }
}
