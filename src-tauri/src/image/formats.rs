use serde::{Deserialize, Serialize};

/// Supported input formats
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InputFormat {
    Jpeg,
    Png,
    Gif,
    Bmp,
    Tiff,
    WebP,
}

/// Supported output formats
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Jpeg,
    Png,
    Gif,
    Bmp,
    Tiff,
    WebP,
}

impl InputFormat {
    /// Get format from file extension
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "jpg" | "jpeg" => Some(Self::Jpeg),
            "png" => Some(Self::Png),
            "gif" => Some(Self::Gif),
            "bmp" => Some(Self::Bmp),
            "tiff" | "tif" => Some(Self::Tiff),
            "webp" => Some(Self::WebP),
            _ => None,
        }
    }

    /// Check if the extension is supported
    pub fn is_supported(ext: &str) -> bool {
        Self::from_extension(ext).is_some()
    }
}

impl OutputFormat {
    /// Get file extension for this format
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Jpeg => "jpg",
            Self::Png => "png",
            Self::Gif => "gif",
            Self::Bmp => "bmp",
            Self::Tiff => "tiff",
            Self::WebP => "webp",
        }
    }

    /// Get MIME type for this format
    pub fn mime_type(&self) -> &'static str {
        match self {
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
            Self::Gif => "image/gif",
            Self::Bmp => "image/bmp",
            Self::Tiff => "image/tiff",
            Self::WebP => "image/webp",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_input_format_from_extension() {
        assert_eq!(InputFormat::from_extension("jpg"), Some(InputFormat::Jpeg));
        assert_eq!(InputFormat::from_extension("JPEG"), Some(InputFormat::Jpeg));
        assert_eq!(InputFormat::from_extension("png"), Some(InputFormat::Png));
        assert_eq!(InputFormat::from_extension("webp"), Some(InputFormat::WebP));
        assert_eq!(InputFormat::from_extension("unknown"), None);
    }

    #[test]
    fn test_output_format_extension() {
        assert_eq!(OutputFormat::Jpeg.extension(), "jpg");
        assert_eq!(OutputFormat::WebP.extension(), "webp");
    }
}
