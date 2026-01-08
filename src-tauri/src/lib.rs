mod commands;
mod image;
mod utils;

use commands::image_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            image_commands::get_image_files,
            image_commands::process_single_image,
            image_commands::process_batch,
            image_commands::get_image_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
