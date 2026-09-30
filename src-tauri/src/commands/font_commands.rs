use crate::image::text::{self, FontList};

/// List installed fonts for the text watermark
#[tauri::command]
pub async fn list_fonts() -> FontList {
    text::font_list().clone()
}

/// Characters of `text` that `font` cannot draw
#[tauri::command]
pub async fn find_missing_glyphs(font: String, text: String) -> Result<Vec<char>, String> {
    text::missing_chars(&font, &text)
}
