// Image formats
export type InputFormat = 'jpeg' | 'png' | 'gif' | 'bmp' | 'tiff' | 'webp';
export type OutputFormat = 'jpeg' | 'png' | 'gif' | 'bmp' | 'tiff' | 'webp';

// Compression type
export type CompressionType = 'lossy' | 'lossless';

// Processing options
export interface ProcessingOptions {
  format: OutputFormat;
  quality: number;
  width: number | null;
  height: number | null;
  keep_metadata: boolean;
  compression: CompressionType;
}

// Processing result for single image
export interface ProcessingResult {
  original_path: string;
  output_path: string;
  original_size: number;
  output_size: number;
  reduction_percent: number;
  success: boolean;
  error: string | null;
}

// Batch processing statistics
export interface BatchStats {
  total_files: number;
  processed_files: number;
  successful_files: number;
  failed_files: number;
  total_original_size: number;
  total_output_size: number;
  overall_reduction_percent: number;
  average_reduction_percent: number;
  median_reduction_percent: number;
}

// Progress update
export interface ProgressUpdate {
  current: number;
  total: number;
  current_file: string;
  percent: number;
}

// Image info
export interface ImageInfo {
  path: string;
  width: number;
  height: number;
  size_bytes: number;
  format: string;
}

// File processing status
export type FileStatus = 'pending' | 'processing' | 'completed' | 'error';

// File item for UI
export interface FileItem {
  path: string;
  name: string;
  size: number;
  preview?: string;
  status: FileStatus;
  outputPath?: string;
  outputSize?: number;
  reductionPercent?: number;
  error?: string;
}

// App state
export type ProcessingState = 'idle' | 'processing' | 'completed' | 'error';
