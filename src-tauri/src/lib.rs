mod commands;
mod image;
mod utils;

use commands::image_commands;
use commands::update_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            image_commands::get_image_files,
            image_commands::process_single_image,
            image_commands::process_batch,
            image_commands::get_image_info,
            update_commands::check_for_updates,
            update_commands::get_current_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
