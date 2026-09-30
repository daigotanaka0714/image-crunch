use image::{DynamicImage, ImageFormat, ImageReader, RgbaImage};
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

use super::formats::OutputFormat;

/// Image processing errors
#[derive(Error, Debug)]
pub enum ProcessError {
    #[error("Failed to read image: {0}")]
    ReadError(String),
    #[error("Failed to write image: {0}")]
    WriteError(String),
    #[error("Failed to read watermark image: {0}")]
    Watermark(String),
}

/// Anchor of the watermark on a 3x3 grid
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WatermarkPosition {
    TopLeft,
    TopCenter,
    TopRight,
    MiddleLeft,
    Center,
    MiddleRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

/// Image watermark drawn once over the output image
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageWatermark {
    /// Path to the watermark image (a PNG with transparency is expected)
    pub path: String,
    /// Anchor on the 3x3 grid
    pub position: WatermarkPosition,
    /// Distance from the edges, as a percentage of the output width (0-50)
    pub margin_percent: f32,
    /// Opacity (0-100)
    pub opacity: u8,
    /// Watermark width, as a percentage of the output width (1-100)
    pub scale_percent: f32,
}

/// Compression type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompressionType {
    Lossy,
    Lossless,
}

/// Image processing options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingOptions {
    /// Output format
    pub format: OutputFormat,
    /// Quality (0-100, for lossy compression)
    pub quality: u8,
    /// Resize width (None = keep original)
    pub width: Option<u32>,
    /// Resize height (None = keep original)
    pub height: Option<u32>,
    /// Keep metadata (EXIF, etc.)
    pub keep_metadata: bool,
    /// Compression type
    pub compression: CompressionType,
    /// Image watermark (None = off)
    pub watermark: Option<ImageWatermark>,
}

impl Default for ProcessingOptions {
    fn default() -> Self {
        Self {
            format: OutputFormat::WebP,
            quality: 80,
            width: None,
            height: None,
            keep_metadata: false,
            compression: CompressionType::Lossy,
            watermark: None,
        }
    }
}

/// Result of processing a single image
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingResult {
    /// Original file path
    pub original_path: String,
    /// Output file path
    pub output_path: String,
    /// Original file size in bytes
    pub original_size: u64,
    /// Output file size in bytes
    pub output_size: u64,
    /// Reduction percentage
    pub reduction_percent: f64,
    /// Whether processing was successful
    pub success: bool,
    /// Error message if failed
    pub error: Option<String>,
}

/// Image processor
pub struct ImageProcessor;

impl ImageProcessor {
    /// Process a single image
    pub fn process_image<P: AsRef<Path>, Q: AsRef<Path>>(
        input_path: P,
        output_path: Q,
        options: &ProcessingOptions,
    ) -> Result<ProcessingResult, ProcessError> {
        let input_path = input_path.as_ref();
        let output_path = output_path.as_ref();

        // Get original file size
        let original_size = std::fs::metadata(input_path)
            .map_err(|e| ProcessError::ReadError(e.to_string()))?
            .len();

        // Load image
        let img = ImageReader::open(input_path)
            .map_err(|e| ProcessError::ReadError(e.to_string()))?
            .decode()
            .map_err(|e| ProcessError::ReadError(e.to_string()))?;

        // Apply resize if specified
        let img = Self::apply_resize(img, options);

        // Apply watermark if specified
        let img = match &options.watermark {
            Some(watermark) => Self::apply_watermark(img, watermark)?,
            None => img,
        };

        // Save with specified format
        Self::save_image(&img, output_path, options)?;

        // Get output file size
        let output_size = std::fs::metadata(output_path)
            .map_err(|e| ProcessError::WriteError(e.to_string()))?
            .len();

        // Calculate reduction
        let reduction_percent = if original_size > 0 {
            ((original_size as f64 - output_size as f64) / original_size as f64) * 100.0
        } else {
            0.0
        };

        Ok(ProcessingResult {
            original_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            original_size,
            output_size,
            reduction_percent,
            success: true,
            error: None,
        })
    }

    /// Apply resize transformation
    fn apply_resize(img: DynamicImage, options: &ProcessingOptions) -> DynamicImage {
        match (options.width, options.height) {
            (Some(w), Some(h)) => img.resize_exact(w, h, image::imageops::FilterType::Lanczos3),
            (Some(w), None) => {
                let ratio = w as f64 / img.width() as f64;
                let h = (img.height() as f64 * ratio) as u32;
                img.resize_exact(w, h, image::imageops::FilterType::Lanczos3)
            }
            (None, Some(h)) => {
                let ratio = h as f64 / img.height() as f64;
                let w = (img.width() as f64 * ratio) as u32;
                img.resize_exact(w, h, image::imageops::FilterType::Lanczos3)
            }
            (None, None) => img,
        }
    }

    /// Load the watermark file and draw it over the image
    fn apply_watermark(
        img: DynamicImage,
        watermark: &ImageWatermark,
    ) -> Result<DynamicImage, ProcessError> {
        let mark = ImageReader::open(&watermark.path)
            .map_err(|e| ProcessError::Watermark(e.to_string()))?
            .with_guessed_format()
            .map_err(|e| ProcessError::Watermark(e.to_string()))?
            .decode()
            .map_err(|e| ProcessError::Watermark(e.to_string()))?
            .to_rgba8();

        Ok(Self::composite_watermark(img, &mark, watermark))
    }

    /// Scale `mark` to the output width, apply opacity and alpha-blend it at
    /// the chosen position.
    ///
    /// Blending is done in RGBA8. An image without alpha is converted back to
    /// RGB8 afterwards, so opaque inputs stay opaque in every output format.
    fn composite_watermark(
        img: DynamicImage,
        mark: &RgbaImage,
        watermark: &ImageWatermark,
    ) -> DynamicImage {
        let (width, height) = (img.width(), img.height());
        if width == 0 || height == 0 || mark.width() == 0 || mark.height() == 0 {
            return img;
        }

        let scale = watermark.scale_percent.clamp(1.0, 100.0) as f64 / 100.0;
        let mark_width = ((width as f64 * scale).round() as u32).max(1);
        let mark_height = ((mark.height() as f64 * mark_width as f64 / mark.width() as f64).round()
            as u32)
            .max(1);
        let mut mark = image::imageops::resize(
            mark,
            mark_width,
            mark_height,
            image::imageops::FilterType::Lanczos3,
        );

        let opacity = watermark.opacity.min(100) as u16;
        for pixel in mark.pixels_mut() {
            pixel[3] = (pixel[3] as u16 * opacity / 100) as u8;
        }

        let margin = (width as f64 * watermark.margin_percent.clamp(0.0, 50.0) as f64 / 100.0)
            .round() as i64;
        let free_x = width as i64 - mark_width as i64;
        let free_y = height as i64 - mark_height as i64;
        let (x, y) = {
            use WatermarkPosition::*;
            let x = match watermark.position {
                TopLeft | MiddleLeft | BottomLeft => margin,
                TopCenter | Center | BottomCenter => free_x / 2,
                TopRight | MiddleRight | BottomRight => free_x - margin,
            };
            let y = match watermark.position {
                TopLeft | TopCenter | TopRight => margin,
                MiddleLeft | Center | MiddleRight => free_y / 2,
                BottomLeft | BottomCenter | BottomRight => free_y - margin,
            };
            (x, y)
        };

        let has_alpha = img.color().has_alpha();
        let mut base = img.to_rgba8();
        image::imageops::overlay(&mut base, &mark, x, y);

        if has_alpha {
            DynamicImage::ImageRgba8(base)
        } else {
            DynamicImage::ImageRgb8(DynamicImage::ImageRgba8(base).to_rgb8())
        }
    }

    /// Save image in specified format
    fn save_image<P: AsRef<Path>>(
        img: &DynamicImage,
        output_path: P,
        options: &ProcessingOptions,
    ) -> Result<(), ProcessError> {
        let output_path = output_path.as_ref();

        match options.format {
            OutputFormat::Jpeg => {
                let mut file = std::fs::File::create(output_path)
                    .map_err(|e| ProcessError::WriteError(e.to_string()))?;
                let encoder =
                    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, options.quality);
                img.to_rgb8()
                    .write_with_encoder(encoder)
                    .map_err(|e| ProcessError::WriteError(e.to_string()))?;
            }
            OutputFormat::Png => {
                img.save_with_format(output_path, ImageFormat::Png)
                    .map_err(|e| ProcessError::WriteError(e.to_string()))?;
            }
            OutputFormat::Gif => {
                img.save_with_format(output_path, ImageFormat::Gif)
                    .map_err(|e| ProcessError::WriteError(e.to_string()))?;
            }
            OutputFormat::Bmp => {
                img.save_with_format(output_path, ImageFormat::Bmp)
                    .map_err(|e| ProcessError::WriteError(e.to_string()))?;
            }
            OutputFormat::Tiff => {
                img.save_with_format(output_path, ImageFormat::Tiff)
                    .map_err(|e| ProcessError::WriteError(e.to_string()))?;
            }
            OutputFormat::WebP => {
                // Use webp crate for better quality control
                let rgba = img.to_rgba8();
                let (width, height) = rgba.dimensions();

                let encoded = if options.compression == CompressionType::Lossless {
                    webp::Encoder::from_rgba(&rgba, width, height).encode_lossless()
                } else {
                    webp::Encoder::from_rgba(&rgba, width, height).encode(options.quality as f32)
                };

                std::fs::write(output_path, &*encoded)
                    .map_err(|e| ProcessError::WriteError(e.to_string()))?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_error_messages() {
        assert_eq!(
            ProcessError::ReadError("a.png".into()).to_string(),
            "Failed to read image: a.png"
        );
        assert_eq!(
            ProcessError::WriteError("b.png".into()).to_string(),
            "Failed to write image: b.png"
        );
    }

    use image::{Rgb, RgbImage, Rgba};

    const BLUE: Rgb<u8> = Rgb([0, 0, 255]);
    const RED: Rgba<u8> = Rgba([255, 0, 0, 255]);

    fn watermark(position: WatermarkPosition) -> ImageWatermark {
        ImageWatermark {
            path: String::new(),
            position,
            margin_percent: 0.0,
            opacity: 100,
            scale_percent: 25.0,
        }
    }

    fn blue_base(width: u32, height: u32) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_pixel(width, height, BLUE))
    }

    fn red_mark(width: u32, height: u32) -> RgbaImage {
        RgbaImage::from_pixel(width, height, RED)
    }

    fn rgb_at(img: &DynamicImage, x: u32, y: u32) -> [u8; 3] {
        img.to_rgb8().get_pixel(x, y).0
    }

    #[test]
    fn watermark_is_off_by_default() {
        assert!(ProcessingOptions::default().watermark.is_none());
    }

    #[test]
    fn watermark_deserializes_from_frontend_shape() {
        let options: ProcessingOptions = serde_json::from_str(
            r#"{
                "format": "png", "quality": 80, "width": null, "height": null,
                "keep_metadata": false, "compression": "lossy",
                "watermark": {
                    "path": "/tmp/logo.png", "position": "bottom_right",
                    "margin_percent": 2, "opacity": 50, "scale_percent": 20
                }
            }"#,
        )
        .unwrap();

        let watermark = options.watermark.unwrap();
        assert_eq!(watermark.position, WatermarkPosition::BottomRight);
        assert_eq!(watermark.opacity, 50);
    }

    #[test]
    fn watermark_null_deserializes_to_none() {
        let options: ProcessingOptions = serde_json::from_str(
            r#"{
                "format": "png", "quality": 80, "width": null, "height": null,
                "keep_metadata": false, "compression": "lossy", "watermark": null
            }"#,
        )
        .unwrap();

        assert!(options.watermark.is_none());
    }

    #[test]
    fn watermark_is_scaled_to_percentage_of_output_width_keeping_aspect() {
        // 100x100 base, 25% width -> a 10x20 mark becomes 25x50 at the bottom right
        let out = ImageProcessor::composite_watermark(
            blue_base(100, 100),
            &red_mark(10, 20),
            &watermark(WatermarkPosition::BottomRight),
        );

        assert_eq!(rgb_at(&out, 75, 50), [255, 0, 0]);
        assert_eq!(rgb_at(&out, 99, 99), [255, 0, 0]);
        assert_eq!(rgb_at(&out, 74, 99), BLUE.0);
        assert_eq!(rgb_at(&out, 99, 49), BLUE.0);
    }

    #[test]
    fn watermark_is_placed_on_the_3x3_grid_with_margin() {
        // 100x80 base, 20x20 mark, margin 10% of width = 10px
        let cases = [
            (WatermarkPosition::TopLeft, (10, 10)),
            (WatermarkPosition::TopCenter, (40, 10)),
            (WatermarkPosition::TopRight, (70, 10)),
            (WatermarkPosition::MiddleLeft, (10, 30)),
            (WatermarkPosition::Center, (40, 30)),
            (WatermarkPosition::MiddleRight, (70, 30)),
            (WatermarkPosition::BottomLeft, (10, 50)),
            (WatermarkPosition::BottomCenter, (40, 50)),
            (WatermarkPosition::BottomRight, (70, 50)),
        ];

        for (position, (x, y)) in cases {
            let settings = ImageWatermark {
                margin_percent: 10.0,
                scale_percent: 20.0,
                ..watermark(position)
            };
            let out = ImageProcessor::composite_watermark(
                blue_base(100, 80),
                &red_mark(20, 20),
                &settings,
            );

            assert_eq!(rgb_at(&out, x, y), [255, 0, 0], "{:?} top-left", position);
            assert_eq!(
                rgb_at(&out, x + 19, y + 19),
                [255, 0, 0],
                "{:?} bottom-right",
                position
            );
            assert_eq!(rgb_at(&out, x - 1, y), BLUE.0, "{:?} left of", position);
            assert_eq!(rgb_at(&out, x, y - 1), BLUE.0, "{:?} above", position);
        }
    }

    #[test]
    fn watermark_opacity_blends_with_the_base() {
        let settings = ImageWatermark {
            opacity: 50,
            scale_percent: 100.0,
            ..watermark(WatermarkPosition::Center)
        };
        let out = ImageProcessor::composite_watermark(blue_base(8, 8), &red_mark(8, 8), &settings);

        let [r, g, b] = rgb_at(&out, 4, 4);
        assert!((126..=129).contains(&r), "r = {}", r);
        assert_eq!(g, 0);
        assert!((126..=129).contains(&b), "b = {}", b);
    }

    #[test]
    fn transparent_watermark_pixels_leave_the_base_unchanged() {
        // Left half transparent, right half opaque red
        let mark = RgbaImage::from_fn(
            20,
            20,
            |x, _| {
                if x < 10 {
                    Rgba([255, 0, 0, 0])
                } else {
                    RED
                }
            },
        );
        let settings = ImageWatermark {
            scale_percent: 100.0,
            ..watermark(WatermarkPosition::Center)
        };
        let out = ImageProcessor::composite_watermark(blue_base(20, 20), &mark, &settings);

        assert_eq!(rgb_at(&out, 5, 10), BLUE.0);
        assert_eq!(rgb_at(&out, 15, 10), [255, 0, 0]);
    }

    #[test]
    fn opaque_input_stays_without_alpha_and_transparent_input_keeps_it() {
        let settings = watermark(WatermarkPosition::Center);

        let opaque =
            ImageProcessor::composite_watermark(blue_base(40, 40), &red_mark(4, 4), &settings);
        assert!(!opaque.color().has_alpha());

        let transparent = DynamicImage::ImageRgba8(RgbaImage::new(40, 40));
        let out = ImageProcessor::composite_watermark(transparent, &red_mark(4, 4), &settings);
        assert!(out.color().has_alpha());
        assert_eq!(out.to_rgba8().get_pixel(0, 0).0, [0, 0, 0, 0]);
        assert_eq!(out.to_rgba8().get_pixel(20, 20).0, RED.0);
    }

    fn scratch_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "image-crunch-processor-{}-{}",
            name,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("failed to create scratch dir");
        dir
    }

    fn close(actual: [u8; 3], expected: [u8; 3], tolerance: u8) -> bool {
        actual
            .iter()
            .zip(expected)
            .all(|(a, e)| a.abs_diff(e) <= tolerance)
    }

    #[test]
    fn watermark_is_applied_in_every_output_format() {
        let dir = scratch_dir("all-formats");
        let input = dir.join("input.png");
        RgbImage::from_pixel(128, 64, BLUE).save(&input).unwrap();
        let mark_path = dir.join("mark.png");
        red_mark(16, 16).save(&mark_path).unwrap();

        for format in [
            OutputFormat::Jpeg,
            OutputFormat::Png,
            OutputFormat::Gif,
            OutputFormat::Bmp,
            OutputFormat::Tiff,
            OutputFormat::WebP,
        ] {
            let output = dir.join(format!("out.{}", format.extension()));
            let options = ProcessingOptions {
                format,
                quality: 90,
                width: Some(64),
                watermark: Some(ImageWatermark {
                    path: mark_path.to_string_lossy().to_string(),
                    position: WatermarkPosition::BottomRight,
                    margin_percent: 0.0,
                    opacity: 100,
                    scale_percent: 50.0,
                }),
                ..ProcessingOptions::default()
            };

            ImageProcessor::process_image(&input, &output, &options)
                .unwrap_or_else(|e| panic!("{:?}: {}", format, e));

            // Resized to 64x32 first, so the mark is 32x32 in the right half
            let out = image::open(&output).unwrap();
            assert_eq!((out.width(), out.height()), (64, 32), "{:?}", format);
            let inside = rgb_at(&out, 48, 16);
            let outside = rgb_at(&out, 16, 16);
            assert!(
                close(inside, [255, 0, 0], 40),
                "{:?} inside: {:?}",
                format,
                inside
            );
            assert!(
                close(outside, BLUE.0, 40),
                "{:?} outside: {:?}",
                format,
                outside
            );
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_watermark_file_fails_the_image() {
        let dir = scratch_dir("missing-mark");
        let input = dir.join("input.png");
        RgbImage::from_pixel(8, 8, BLUE).save(&input).unwrap();
        let output = dir.join("out.png");
        let options = ProcessingOptions {
            format: OutputFormat::Png,
            watermark: Some(ImageWatermark {
                path: dir.join("nope.png").to_string_lossy().to_string(),
                ..watermark(WatermarkPosition::Center)
            }),
            ..ProcessingOptions::default()
        };

        let err = ImageProcessor::process_image(&input, &output, &options).unwrap_err();

        assert!(matches!(err, ProcessError::Watermark(_)), "{}", err);
        assert!(!output.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
