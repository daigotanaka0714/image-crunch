use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::image::formats::InputFormat;
use crate::image::processor::{ImageProcessor, ProcessingOptions, ProcessingResult};

/// Batch processing statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchStats {
    pub total_files: usize,
    pub processed_files: usize,
    pub successful_files: usize,
    pub failed_files: usize,
    pub total_original_size: u64,
    pub total_output_size: u64,
    pub overall_reduction_percent: f64,
    pub average_reduction_percent: f64,
    pub median_reduction_percent: f64,
}

/// Progress update event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressUpdate {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
    pub percent: f64,
}

/// Get list of image files from paths (supports files and directories)
#[tauri::command]
pub fn get_image_files(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut image_files = Vec::new();

    for path_str in paths {
        let path = Path::new(&path_str);
        
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if InputFormat::is_supported(&ext.to_string_lossy()) {
                    image_files.push(path_str);
                }
            }
        } else if path.is_dir() {
            // Recursively walk directory
            for entry in WalkDir::new(path)
                .follow_links(true)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let entry_path = entry.path();
                if entry_path.is_file() {
                    if let Some(ext) = entry_path.extension() {
                        if InputFormat::is_supported(&ext.to_string_lossy()) {
                            image_files.push(entry_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(image_files)
}

/// Process a single image
#[tauri::command]
pub fn process_single_image(
    input_path: String,
    output_dir: String,
    options: ProcessingOptions,
) -> Result<ProcessingResult, String> {
    let input = Path::new(&input_path);
    let output_dir = Path::new(&output_dir);
    
    // Create output path
    let file_stem = input.file_stem()
        .ok_or_else(|| "Invalid input file".to_string())?;
    let output_path = output_dir
        .join(format!("{}.{}", file_stem.to_string_lossy(), options.format.extension()));

    ImageProcessor::process_image(input, &output_path, &options)
        .map_err(|e| e.to_string())
}

/// Process multiple images in batch
#[tauri::command]
pub async fn process_batch(
    app: AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    options: ProcessingOptions,
) -> Result<BatchStats, String> {
    let total_files = input_paths.len();
    let output_dir_path = PathBuf::from(&output_dir);

    // Ensure output directory exists
    std::fs::create_dir_all(&output_dir_path)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    // Process images in parallel
    let results: Vec<ProcessingResult> = input_paths
        .par_iter()
        .enumerate()
        .map(|(index, input_path)| {
            let input = Path::new(input_path);
            let file_stem = input.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("image_{}", index));

            let output_path = output_dir_path
                .join(format!("{}.{}", file_stem, options.format.extension()));

            // Emit progress update
            let _ = app.emit("processing-progress", ProgressUpdate {
                current: index + 1,
                total: total_files,
                current_file: input_path.clone(),
                percent: ((index + 1) as f64 / total_files as f64) * 100.0,
            });

            let result = match ImageProcessor::process_image(input, &output_path, &options) {
                Ok(result) => result,
                Err(e) => ProcessingResult {
                    original_path: input_path.clone(),
                    output_path: output_path.to_string_lossy().to_string(),
                    original_size: 0,
                    output_size: 0,
                    reduction_percent: 0.0,
                    success: false,
                    error: Some(e.to_string()),
                },
            };

            // Emit individual file result
            let _ = app.emit("processing-result", &result);

            result
        })
        .collect();

    // Calculate statistics
    let stats = calculate_batch_stats(&results);

    // Emit completion event
    let _ = app.emit("processing-complete", &stats);

    Ok(stats)
}

/// Calculate batch processing statistics
fn calculate_batch_stats(results: &[ProcessingResult]) -> BatchStats {
    let total_files = results.len();
    let successful_results: Vec<&ProcessingResult> = results
        .iter()
        .filter(|r| r.success)
        .collect();

    let successful_files = successful_results.len();
    let failed_files = total_files - successful_files;

    let total_original_size: u64 = successful_results
        .iter()
        .map(|r| r.original_size)
        .sum();

    let total_output_size: u64 = successful_results
        .iter()
        .map(|r| r.output_size)
        .sum();

    let overall_reduction_percent = if total_original_size > 0 {
        ((total_original_size as f64 - total_output_size as f64) / total_original_size as f64) * 100.0
    } else {
        0.0
    };

    let mut reductions: Vec<f64> = successful_results
        .iter()
        .map(|r| r.reduction_percent)
        .collect();

    let average_reduction_percent = if !reductions.is_empty() {
        reductions.iter().sum::<f64>() / reductions.len() as f64
    } else {
        0.0
    };

    let median_reduction_percent = if !reductions.is_empty() {
        reductions.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let mid = reductions.len() / 2;
        if reductions.len() % 2 == 0 {
            (reductions[mid - 1] + reductions[mid]) / 2.0
        } else {
            reductions[mid]
        }
    } else {
        0.0
    };

    BatchStats {
        total_files,
        processed_files: total_files,
        successful_files,
        failed_files,
        total_original_size,
        total_output_size,
        overall_reduction_percent,
        average_reduction_percent,
        median_reduction_percent,
    }
}

/// Get image info (for preview)
#[tauri::command]
pub fn get_image_info(path: String) -> Result<ImageInfo, String> {
    let path = Path::new(&path);
    
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let img = image::open(path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    Ok(ImageInfo {
        path: path.to_string_lossy().to_string(),
        width: img.width(),
        height: img.height(),
        size_bytes: metadata.len(),
        format: path.extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default(),
    })
}

/// Image information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
    pub format: String,
}
