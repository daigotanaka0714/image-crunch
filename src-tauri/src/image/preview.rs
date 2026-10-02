//! Small image of what the conversion will produce, for the settings panel

use image::codecs::png::{CompressionType, PngEncoder};
use image::{DynamicImage, ImageReader};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use super::processor::{ImageProcessor, ProcessError, ProcessingOptions};

/// A decoded and shrunk input, reused while only the watermark settings
/// change
struct Shrunk {
    path: PathBuf,
    modified: Option<SystemTime>,
    len: u64,
    /// Size of the input before shrinking
    input_size: (u32, u32),
    image: DynamicImage,
}

/// The last shrunk input
#[derive(Default)]
pub struct PreviewCache(Mutex<Option<Shrunk>>);

/// Size of the preview: the output size, shrunk to fit `max_side`. Each side
/// is at least 1 px.
pub(crate) fn preview_dimensions(output: (u32, u32), max_side: u32) -> (u32, u32) {
    let (width, height) = (output.0.max(1), output.1.max(1));
    let longest = width.max(height);
    if longest <= max_side {
        return (width, height);
    }
    let scale = max_side as f64 / longest as f64;
    let shrink = |side: u32| ((side as f64 * scale).round() as u32).max(1);
    (shrink(width), shrink(height))
}

/// Render `input` as the conversion would, at most `max_side` px on the
/// longest side.
///
/// The input is shrunk to the output's aspect ratio first and the watermark
/// is drawn on the small image by the same code as the conversion. Every
/// watermark length follows the image width, so it comes out at the same
/// proportions as in the output.
pub fn render(
    cache: &PreviewCache,
    input: &Path,
    options: &ProcessingOptions,
    max_side: u32,
) -> Result<DynamicImage, ProcessError> {
    let base = shrunk_input(cache, input, options, max_side)?;
    ImageProcessor::draw_watermark(base, options.watermark.as_ref())
}

fn shrunk_input(
    cache: &PreviewCache,
    input: &Path,
    options: &ProcessingOptions,
    max_side: u32,
) -> Result<DynamicImage, ProcessError> {
    let metadata = std::fs::metadata(input).map_err(|e| ProcessError::ReadError(e.to_string()))?;
    let modified = metadata.modified().ok();
    let mut cached = cache.0.lock().unwrap_or_else(|e| e.into_inner());

    if let Some(shrunk) = cached.as_ref() {
        let (width, height) = shrunk.input_size;
        let size = preview_dimensions(
            ImageProcessor::output_dimensions(width, height, options),
            max_side,
        );
        if shrunk.path == input
            && shrunk.modified == modified
            && shrunk.len == metadata.len()
            && (shrunk.image.width(), shrunk.image.height()) == size
        {
            return Ok(shrunk.image.clone());
        }
    }

    let img = ImageReader::open(input)
        .map_err(|e| ProcessError::ReadError(e.to_string()))?
        .decode()
        .map_err(|e| ProcessError::ReadError(e.to_string()))?;
    let (width, height) = preview_dimensions(
        ImageProcessor::output_dimensions(img.width(), img.height(), options),
        max_side,
    );
    let image = img.thumbnail_exact(width, height);

    *cached = Some(Shrunk {
        path: input.to_path_buf(),
        modified,
        len: metadata.len(),
        input_size: (img.width(), img.height()),
        image: image.clone(),
    });
    Ok(image)
}

/// PNG bytes of `image`, compressed for speed rather than size
pub fn encode_png(image: &DynamicImage) -> Result<Vec<u8>, ProcessError> {
    let mut bytes = Vec::new();
    let encoder = PngEncoder::new_with_quality(
        &mut bytes,
        CompressionType::Fast,
        image::codecs::png::FilterType::Adaptive,
    );
    image
        .write_with_encoder(encoder)
        .map_err(|e| ProcessError::WriteError(e.to_string()))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::image::formats::OutputFormat;
    use crate::image::processor::{
        ImageWatermark, TextWatermark, Watermark, WatermarkPosition, WatermarkTile,
    };
    use crate::image::text;
    use image::{Rgb, RgbImage, Rgba, RgbaImage};

    const BLUE: [u8; 3] = [0, 0, 255];

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "image-crunch-preview-{}-{}",
            name,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("failed to create scratch dir");
        dir
    }

    fn image_watermark(mark: &Path) -> ImageWatermark {
        ImageWatermark {
            path: mark.to_string_lossy().to_string(),
            position: WatermarkPosition::BottomRight,
            margin_percent: 5.0,
            opacity: 100,
            scale_percent: 25.0,
            tile: None,
        }
    }

    fn text_watermark() -> TextWatermark {
        TextWatermark {
            text: "WM".into(),
            font: text::font_list()
                .default_font
                .clone()
                .expect("no usable system font"),
            color: "#ff0000".into(),
            outline: None,
            position: WatermarkPosition::TopLeft,
            margin_percent: 5.0,
            opacity: 100,
            scale_percent: 30.0,
            tile: None,
        }
    }

    /// Where the red mark was drawn over the blue base, as fractions of the
    /// image: bounding box (left, top, right, bottom) and the mean red, which
    /// counts anti-aliased edges by their coverage
    fn changed(img: &DynamicImage) -> ([f64; 4], f64) {
        let rgb = img.to_rgb8();
        let (width, height) = (rgb.width() as f64, rgb.height() as f64);
        let mut bounds = [f64::MAX, f64::MAX, 0.0f64, 0.0f64];
        let mut red = 0.0;
        for (x, y, pixel) in rgb.enumerate_pixels() {
            red += pixel[0] as f64 / 255.0;
            if pixel.0.iter().zip(BLUE).any(|(a, b)| a.abs_diff(b) > 60) {
                bounds[0] = bounds[0].min(x as f64 / width);
                bounds[1] = bounds[1].min(y as f64 / height);
                bounds[2] = bounds[2].max((x + 1) as f64 / width);
                bounds[3] = bounds[3].max((y + 1) as f64 / height);
            }
        }
        (bounds, red / (width * height))
    }

    #[test]
    fn preview_is_the_output_size_shrunk_to_fit() {
        assert_eq!(preview_dimensions((4000, 3000), 800), (800, 600));
        assert_eq!(preview_dimensions((3000, 4000), 800), (600, 800));
        assert_eq!(preview_dimensions((640, 480), 800), (640, 480));
        assert_eq!(preview_dimensions((10000, 1), 800), (800, 1));
        assert_eq!(preview_dimensions((0, 0), 800), (1, 1));
    }

    #[test]
    fn preview_matches_the_converted_output() {
        let dir = scratch_dir("matches-output");
        let input = dir.join("input.png");
        RgbImage::from_pixel(1000, 500, Rgb(BLUE))
            .save(&input)
            .unwrap();
        let mark = dir.join("mark.png");
        RgbaImage::from_pixel(40, 20, Rgba([255, 0, 0, 255]))
            .save(&mark)
            .unwrap();
        let tile = Some(WatermarkTile {
            spacing_percent: 10.0,
            angle_degrees: 30.0,
        });

        let watermarks = [
            Watermark::Image(image_watermark(&mark)),
            Watermark::Image(ImageWatermark {
                tile: tile.clone(),
                ..image_watermark(&mark)
            }),
            Watermark::Text(text_watermark()),
            Watermark::Text(TextWatermark {
                tile,
                ..text_watermark()
            }),
        ];
        // Kept as is, scaled down, and stretched to another aspect ratio
        let resizes = [(None, None), (Some(800), None), (Some(600), Some(600))];

        for watermark in &watermarks {
            for (width, height) in resizes {
                let options = ProcessingOptions {
                    format: OutputFormat::Png,
                    width,
                    height,
                    watermark: Some(watermark.clone()),
                    ..ProcessingOptions::default()
                };
                let output = dir.join("out.png");
                ImageProcessor::process_image(&input, &output, &options).unwrap();
                let output = image::open(&output).unwrap();

                let preview = render(&PreviewCache::default(), &input, &options, 250).unwrap();

                let output_ratio = output.width() as f64 / output.height() as f64;
                let preview_ratio = preview.width() as f64 / preview.height() as f64;
                assert!(
                    (output_ratio - preview_ratio).abs() < 0.02,
                    "{:?} {:?}: aspect {} vs {}",
                    watermark,
                    (width, height),
                    output_ratio,
                    preview_ratio
                );

                let (output_box, output_area) = changed(&output);
                let (preview_box, preview_area) = changed(&preview);
                for (o, p) in output_box.iter().zip(preview_box) {
                    assert!(
                        (o - p).abs() < 0.03,
                        "{:?} {:?}: box {:?} vs {:?}",
                        watermark,
                        (width, height),
                        output_box,
                        preview_box
                    );
                }
                assert!(
                    (output_area - preview_area).abs() < output_area * 0.05,
                    "{:?} {:?}: ink {} vs {}",
                    watermark,
                    (width, height),
                    output_area,
                    preview_area
                );
            }
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn preview_follows_changes_to_the_file_and_the_resize() {
        let dir = scratch_dir("cache");
        let input = dir.join("input.png");
        RgbImage::from_pixel(400, 200, Rgb(BLUE))
            .save(&input)
            .unwrap();
        let cache = PreviewCache::default();
        let options = ProcessingOptions::default();

        let first = render(&cache, &input, &options, 100).unwrap();
        assert_eq!((first.width(), first.height()), (100, 50));

        let square = ProcessingOptions {
            width: Some(300),
            height: Some(300),
            ..ProcessingOptions::default()
        };
        let resized = render(&cache, &input, &square, 100).unwrap();
        assert_eq!((resized.width(), resized.height()), (100, 100));

        // Another size, so the length and the decoded image both change
        RgbImage::from_pixel(200, 400, Rgb([0, 255, 0]))
            .save(&input)
            .unwrap();
        let replaced = render(&cache, &input, &options, 100).unwrap();
        assert_eq!((replaced.width(), replaced.height()), (50, 100));
        assert_eq!(replaced.to_rgb8().get_pixel(25, 50).0, [0, 255, 0]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn preview_reports_a_missing_input_and_watermark() {
        let dir = scratch_dir("errors");
        let input = dir.join("input.png");
        let cache = PreviewCache::default();

        let err = render(&cache, &input, &ProcessingOptions::default(), 100).unwrap_err();
        assert!(matches!(err, ProcessError::ReadError(_)), "{}", err);

        RgbImage::from_pixel(8, 8, Rgb(BLUE)).save(&input).unwrap();
        let options = ProcessingOptions {
            watermark: Some(Watermark::Image(image_watermark(&dir.join("nope.png")))),
            ..ProcessingOptions::default()
        };
        let err = render(&cache, &input, &options, 100).unwrap_err();
        assert!(matches!(err, ProcessError::Watermark(_)), "{}", err);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn encoded_preview_decodes_to_the_same_pixels() {
        let image = DynamicImage::ImageRgba8(RgbaImage::from_fn(16, 8, |x, y| {
            Rgba([x as u8 * 10, y as u8 * 20, 0, 128])
        }));

        let bytes = encode_png(&image).unwrap();

        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!(decoded.to_rgba8(), image.to_rgba8());
    }
}
