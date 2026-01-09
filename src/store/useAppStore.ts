import { create } from 'zustand';
import type {
  ProcessingOptions,
  FileItem,
  ProcessingState,
  BatchStats,
  ProgressUpdate,
  FileStatus,
} from '../types';

interface AppState {
  // Files
  files: FileItem[];
  addFiles: (files: FileItem[]) => void;
  removeFile: (path: string) => void;
  clearFiles: () => void;
  updateFileStatus: (path: string, status: FileStatus, result?: Partial<FileItem>) => void;
  resetFileStatuses: () => void;

  // Processing options
  options: ProcessingOptions;
  setOptions: (options: Partial<ProcessingOptions>) => void;

  // Output directory
  outputDir: string;
  setOutputDir: (dir: string) => void;

  // Processing state
  processingState: ProcessingState;
  setProcessingState: (state: ProcessingState) => void;

  // Progress
  progress: ProgressUpdate | null;
  setProgress: (progress: ProgressUpdate | null) => void;

  // Results
  batchStats: BatchStats | null;
  setBatchStats: (stats: BatchStats | null) => void;

  // Error
  error: string | null;
  setError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

const defaultOptions: ProcessingOptions = {
  format: 'webp',
  quality: 80,
  width: null,
  height: null,
  keep_metadata: false,
  compression: 'lossy',
};

export const useAppStore = create<AppState>((set) => ({
  // Files
  files: [],
  addFiles: (newFiles) =>
    set((state) => ({
      files: [
        ...state.files,
        ...newFiles.filter(
          (newFile) => !state.files.some((f) => f.path === newFile.path)
        ),
      ],
    })),
  removeFile: (path) =>
    set((state) => ({
      files: state.files.filter((f) => f.path !== path),
    })),
  clearFiles: () => set({ files: [], batchStats: null, processingState: 'idle' }),
  updateFileStatus: (path, status, result) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.path === path ? { ...f, status, ...result } : f
      ),
    })),
  resetFileStatuses: () =>
    set((state) => ({
      files: state.files.map((f) => ({
        ...f,
        status: 'pending' as const,
        outputPath: undefined,
        outputSize: undefined,
        reductionPercent: undefined,
        error: undefined,
      })),
    })),

  // Processing options
  options: defaultOptions,
  setOptions: (newOptions) =>
    set((state) => ({
      options: { ...state.options, ...newOptions },
    })),

  // Output directory
  outputDir: '',
  setOutputDir: (dir) => set({ outputDir: dir }),

  // Processing state
  processingState: 'idle',
  setProcessingState: (processingState) => set({ processingState }),

  // Progress
  progress: null,
  setProgress: (progress) => set({ progress }),

  // Results
  batchStats: null,
  setBatchStats: (batchStats) => set({ batchStats }),

  // Error
  error: null,
  setError: (error) => set({ error }),

  // Reset
  reset: () =>
    set({
      files: [],
      processingState: 'idle',
      progress: null,
      batchStats: null,
      error: null,
    }),
}));
