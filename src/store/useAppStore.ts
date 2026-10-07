import { create } from "zustand";
import type {
  BatchStats,
  FileItem,
  FileStatus,
  ProcessingOptions,
  ProcessingState,
  ProgressUpdate,
} from "../types";
import {
  loadIncludeSubfolders,
  saveIncludeSubfolders,
} from "./includeSubfolders";
import {
  initialWatermark,
  loadSavedWatermark,
  saveWatermarkSettings,
  toSaved,
} from "./watermarkSettings";

interface AppState {
  // Files
  files: FileItem[];
  addFiles: (files: FileItem[]) => void;
  removeFile: (path: string) => void;
  clearFiles: () => void;
  updateFileStatus: (
    path: string,
    status: FileStatus,
    result?: Partial<FileItem>,
  ) => void;
  // Only a pending file changes, so a late start never hides a result
  markFileProcessing: (path: string) => void;
  // Files still processing go back to pending; finished ones keep their result
  clearProcessingStatuses: () => void;
  resetFileStatuses: () => void;

  // File chosen in the list for the watermark preview (null = the first)
  selectedPath: string | null;
  selectFile: (path: string | null) => void;

  // Processing options
  options: ProcessingOptions;
  setOptions: (options: Partial<ProcessingOptions>) => void;

  // Output directory
  outputDir: string;
  setOutputDir: (dir: string) => void;

  // Whether adding a folder also adds the images in its subfolders
  includeSubfolders: boolean;
  setIncludeSubfolders: (include: boolean) => void;

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
  format: "webp",
  quality: 80,
  width: null,
  height: null,
  keep_metadata: false,
  compression: "lossy",
  watermark: null,
};

export const useAppStore = create<AppState>((set) => ({
  // Files
  files: [],
  addFiles: (newFiles) =>
    set((state) => ({
      files: [
        ...state.files,
        ...newFiles.filter(
          (newFile) => !state.files.some((f) => f.path === newFile.path),
        ),
      ],
    })),
  removeFile: (path) =>
    set((state) => ({
      files: state.files.filter((f) => f.path !== path),
      selectedPath: state.selectedPath === path ? null : state.selectedPath,
    })),
  clearFiles: () =>
    set({
      files: [],
      selectedPath: null,
      batchStats: null,
      processingState: "idle",
    }),
  updateFileStatus: (path, status, result) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.path === path ? { ...f, status, ...result } : f,
      ),
    })),
  markFileProcessing: (path) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.path === path && f.status === "pending"
          ? { ...f, status: "processing" as const }
          : f,
      ),
    })),
  clearProcessingStatuses: () =>
    set((state) => ({
      files: state.files.map((f) =>
        f.status === "processing" ? { ...f, status: "pending" as const } : f,
      ),
    })),
  resetFileStatuses: () =>
    set((state) => ({
      files: state.files.map((f) => ({
        ...f,
        status: "pending" as const,
        outputPath: undefined,
        outputSize: undefined,
        reductionPercent: undefined,
        error: undefined,
      })),
    })),

  selectedPath: null,
  selectFile: (selectedPath) => set({ selectedPath }),

  // Processing options
  options: { ...defaultOptions, watermark: initialWatermark() },
  setOptions: (newOptions) =>
    set((state) => ({
      options: { ...state.options, ...newOptions },
    })),

  // Output directory
  outputDir: "",
  setOutputDir: (dir) => set({ outputDir: dir }),

  includeSubfolders: loadIncludeSubfolders(),
  setIncludeSubfolders: (includeSubfolders) => set({ includeSubfolders }),

  // Processing state
  processingState: "idle",
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
      selectedPath: null,
      processingState: "idle",
      progress: null,
      batchStats: null,
      error: null,
    }),
}));

// File the watermark preview shows: the selected one, or the first
export function previewTarget(
  files: FileItem[],
  selectedPath: string | null,
): FileItem | null {
  return files.find((f) => f.path === selectedPath) ?? files[0] ?? null;
}

// Save the watermark settings whenever they change
useAppStore.subscribe((state, previous) => {
  if (state.options.watermark !== previous.options.watermark) {
    saveWatermarkSettings(
      toSaved(state.options.watermark, loadSavedWatermark()),
    );
  }
});

useAppStore.subscribe((state, previous) => {
  if (state.includeSubfolders !== previous.includeSubfolders) {
    saveIncludeSubfolders(state.includeSubfolders);
  }
});
