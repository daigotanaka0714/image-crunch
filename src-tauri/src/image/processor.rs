use image::{DynamicImage, ImageFormat, ImageReader};
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
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
    #[error("Processing failed: {0}")]
    ProcessingFailed(String),
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
                let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                    &mut file,
                    options.quality,
                );
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
                    webp::Encoder::from_rgba(&rgba, width, height)
                        .encode_lossless()
                } else {
                    webp::Encoder::from_rgba(&rgba, width, height)
                        .encode(options.quality as f32)
                };
                
                std::fs::write(output_path, &*encoded)
                    .map_err(|e| ProcessError::WriteError(e.to_string()))?;
            }
        }

        Ok(())
    }
}
