use rayon::prelude::*;
use rayon::ThreadPoolBuilder;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
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

/// Destination for events sent to the frontend.
///
/// `tauri::Emitter` is sealed and an `AppHandle` cannot be built outside a
/// running app, so batch processing emits through this trait instead. That lets
/// the tests run a whole batch against an emitter that always fails.
pub(crate) trait EventEmitter {
    fn emit_event<S: Serialize + Clone>(&self, event: &str, payload: S) -> Result<(), String>;
}

impl EventEmitter for AppHandle {
    fn emit_event<S: Serialize + Clone>(&self, event: &str, payload: S) -> Result<(), String> {
        self.emit(event, payload).map_err(|e| e.to_string())
    }
}

/// Where messages about failed emissions go.
type LogSink<'a> = &'a (dyn Fn(String) + Sync);

/// Default log sink: stderr.
fn log_to_stderr(message: String) {
    eprintln!("[image-crunch] {}", message);
}

/// Emit an event, recording any failure instead of discarding it.
///
/// The failure is logged and processing continues: one lost notification must
/// not abort a batch that is already half done, but it must not be invisible
/// either - a dropped `processing-complete` is what used to leave the UI stuck
/// in the `processing` state.
fn emit_or_log<E, S>(emitter: &E, event: &str, payload: S, log: LogSink<'_>)
where
    E: EventEmitter,
    S: Serialize + Clone,
{
    if let Err(err) = emitter.emit_event(event, payload) {
        log(format!("failed to emit \"{}\" event: {}", event, err));
    }
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
    let file_stem = input
        .file_stem()
        .ok_or_else(|| "Invalid input file".to_string())?;
    let output_path = output_dir.join(format!(
        "{}.{}",
        file_stem.to_string_lossy(),
        options.format.extension()
    ));

    ImageProcessor::process_image(input, &output_path, &options).map_err(|e| e.to_string())
}

/// Calculate optimal thread count for image processing
/// Limits parallelism to avoid I/O bottlenecks and excessive memory usage
fn calculate_optimal_threads() -> usize {
    let cpu_count = std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(4);

    // Use half of available CPUs, with a minimum of 2 and maximum of 8
    // This prevents I/O saturation and reduces memory pressure for large images
    cpu_count.div_ceil(2).clamp(2, 8)
}

/// Process multiple images in batch
#[tauri::command]
pub async fn process_batch(
    app: AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    options: ProcessingOptions,
) -> Result<BatchStats, String> {
    process_batch_with(&app, input_paths, output_dir, options, &log_to_stderr)
}

/// Batch processing itself, generic over the event emitter and the log sink.
fn process_batch_with<E: EventEmitter + Sync>(
    emitter: &E,
    input_paths: Vec<String>,
    output_dir: String,
    options: ProcessingOptions,
    log: LogSink<'_>,
) -> Result<BatchStats, String> {
    let total_files = input_paths.len();
    let output_dir_path = PathBuf::from(&output_dir);

    // Ensure output directory exists
    std::fs::create_dir_all(&output_dir_path)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    // Calculate optimal thread count to balance CPU and I/O
    let num_threads = calculate_optimal_threads();

    // Create a custom thread pool with limited parallelism
    let pool = ThreadPoolBuilder::new()
        .num_threads(num_threads)
        .build()
        .map_err(|e| format!("Failed to create thread pool: {}", e))?;

    // Use atomic counter for accurate progress tracking across threads
    let processed_count = Arc::new(AtomicUsize::new(0));

    // Process images in parallel with controlled concurrency
    let results: Vec<ProcessingResult> = pool.install(|| {
        input_paths
            .par_iter()
            .enumerate()
            .map(|(index, input_path)| {
                let input = Path::new(input_path);
                let file_stem = input
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| format!("image_{}", index));

                let output_path =
                    output_dir_path.join(format!("{}.{}", file_stem, options.format.extension()));

                // Process the image
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

                // Update progress counter atomically
                let current = processed_count.fetch_add(1, Ordering::SeqCst) + 1;

                // Emit progress update
                emit_or_log(
                    emitter,
                    "processing-progress",
                    ProgressUpdate {
                        current,
                        total: total_files,
                        current_file: input_path.clone(),
                        percent: (current as f64 / total_files as f64) * 100.0,
                    },
                    log,
                );

                // Emit individual file result
                emit_or_log(emitter, "processing-result", &result, log);

                result
            })
            .collect()
    });

    // Calculate statistics
    let stats = calculate_batch_stats(&results);

    // Emit completion event
    emit_or_log(emitter, "processing-complete", &stats, log);

    Ok(stats)
}

/// Calculate batch processing statistics
fn calculate_batch_stats(results: &[ProcessingResult]) -> BatchStats {
    let total_files = results.len();
    let successful_results: Vec<&ProcessingResult> = results.iter().filter(|r| r.success).collect();

    let successful_files = successful_results.len();
    let failed_files = total_files - successful_files;

    let total_original_size: u64 = successful_results.iter().map(|r| r.original_size).sum();

    let total_output_size: u64 = successful_results.iter().map(|r| r.output_size).sum();

    let overall_reduction_percent = if total_original_size > 0 {
        ((total_original_size as f64 - total_output_size as f64) / total_original_size as f64)
            * 100.0
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
        if reductions.len().is_multiple_of(2) {
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

    let metadata = std::fs::metadata(path).map_err(|e| format!("Failed to read file: {}", e))?;

    let img = image::open(path).map_err(|e| format!("Failed to open image: {}", e))?;

    Ok(ImageInfo {
        path: path.to_string_lossy().to_string(),
        width: img.width(),
        height: img.height(),
        size_bytes: metadata.len(),
        format: path
            .extension()
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU32;
    use std::sync::Mutex;

    /// Emitter that always fails, standing in for a webview that went away
    /// mid-batch.
    struct FailingEmitter;

    impl EventEmitter for FailingEmitter {
        fn emit_event<S: Serialize + Clone>(
            &self,
            _event: &str,
            _payload: S,
        ) -> Result<(), String> {
            Err("webview channel closed".to_string())
        }
    }

    struct OkEmitter;

    impl EventEmitter for OkEmitter {
        fn emit_event<S: Serialize + Clone>(
            &self,
            _event: &str,
            _payload: S,
        ) -> Result<(), String> {
            Ok(())
        }
    }

    static TEST_DIR_COUNTER: AtomicU32 = AtomicU32::new(0);

    /// Create a unique scratch directory for one test.
    fn scratch_dir(name: &str) -> PathBuf {
        let id = TEST_DIR_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "image-crunch-{}-{}-{}",
            name,
            std::process::id(),
            id
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("failed to create scratch dir");
        dir
    }

    /// Write a small valid PNG and return its path.
    fn write_png(dir: &Path, name: &str) -> String {
        let path = dir.join(name);
        image::RgbaImage::from_pixel(8, 8, image::Rgba([12, 34, 56, 255]))
            .save(&path)
            .expect("failed to write test png");
        path.to_string_lossy().to_string()
    }

    #[test]
    fn emit_failure_is_logged_with_event_name_and_cause() {
        let logged = Mutex::new(Vec::new());

        emit_or_log(&FailingEmitter, "processing-complete", (), &|message| {
            logged.lock().unwrap().push(message)
        });

        let logged = logged.into_inner().unwrap();
        assert_eq!(
            logged.len(),
            1,
            "emit failure must leave exactly one record"
        );
        assert!(
            logged[0].contains("processing-complete"),
            "log must name the event: {:?}",
            logged[0]
        );
        assert!(
            logged[0].contains("webview channel closed"),
            "log must carry the cause: {:?}",
            logged[0]
        );
    }

    #[test]
    fn successful_emit_logs_nothing() {
        let logged = Mutex::new(Vec::new());

        emit_or_log(&OkEmitter, "processing-progress", (), &|message| {
            logged.lock().unwrap().push(message)
        });

        assert!(logged.into_inner().unwrap().is_empty());
    }

    #[test]
    fn batch_finishes_and_logs_every_failed_emit() {
        let dir = scratch_dir("batch-emit-failure");
        let input_dir = dir.join("input");
        std::fs::create_dir_all(&input_dir).expect("failed to create input dir");
        let inputs = vec![
            write_png(&input_dir, "a.png"),
            write_png(&input_dir, "b.png"),
        ];
        let output_dir = dir.join("output").to_string_lossy().to_string();
        let logged = Mutex::new(Vec::new());

        let stats = process_batch_with(
            &FailingEmitter,
            inputs,
            output_dir,
            ProcessingOptions::default(),
            &|message| logged.lock().unwrap().push(message),
        )
        .expect("batch must finish even when every emit fails");

        // Failing notifications must not take the batch down with them.
        assert_eq!(stats.total_files, 2);
        assert_eq!(stats.successful_files, 2);
        assert_eq!(stats.failed_files, 0);

        // ...but each failure has to be traceable to the event it belongs to.
        let logged = logged.into_inner().unwrap();
        for event in [
            "processing-progress",
            "processing-result",
            "processing-complete",
        ] {
            assert!(
                logged.iter().any(|message| message.contains(event)),
                "no log for failed \"{}\" emit: {:?}",
                event,
                logged
            );
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}
