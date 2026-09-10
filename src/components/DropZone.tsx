import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import type { FileItem } from "../types";
import { FileIcon, FolderIcon, UploadCloudIcon } from "./Icons";

const ACCEPTED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
  "tif",
  "webp",
];

// パスの末尾（ファイル名）を取り出す。
// Tauri が返すパスは OS 依存で、Windows では "\\" 区切りになる。
// 片方の区切りだけで split して pop すると、もう一方の OS では
// パス全体が 1 要素として返ってきてしまうため、両方の区切りで分割する。
function basename(path: string): string {
  const segments = path.split(/[/\\]/);
  return segments[segments.length - 1] || path;
}

export function DropZone() {
  const { t } = useTranslation();
  const { addFiles, processingState } = useAppStore();
  const [isDropped, setIsDropped] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const processDroppedPaths = useCallback(
    async (paths: string[]) => {
      if (processingState === "processing") return;

      try {
        // Get all image files (including from directories)
        const imagePaths = await invoke<string[]>("get_image_files", { paths });

        const fileItems: FileItem[] = imagePaths.map((path) => ({
          path,
          name: basename(path),
          size: 0, // Will be populated when processing
          status: "pending" as const,
        }));

        addFiles(fileItems);

        // Trigger drop animation
        setIsDropped(true);
        setTimeout(() => setIsDropped(false), 300);
      } catch (error) {
        console.error("Failed to process dropped files:", error);
      }
    },
    [addFiles, processingState],
  );

  // Set up Tauri drag and drop event listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // onDragDropEvent の解決前にアンマウントされたかどうか。
    // cleanup 時点では unlisten がまだ未代入なので、この印が無いと
    // 後から確立した購読が解除されずに残る。
    let disposed = false;

    const setupDragDrop = async () => {
      // Check if running in Tauri environment
      if (typeof window === "undefined" || !("__TAURI__" in window)) {
        console.warn(
          "Not running in Tauri environment, drag and drop disabled",
        );
        return;
      }

      try {
        const currentWindow = getCurrentWindow();
        const stop = await currentWindow.onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setIsDragActive(true);
          } else if (event.payload.type === "drop") {
            setIsDragActive(false);
            processDroppedPaths(event.payload.paths);
          } else if (event.payload.type === "leave") {
            setIsDragActive(false);
          }
        });

        // 確立を待っている間にアンマウントされていたら、その場で解除する
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
      } catch (error) {
        console.error("Failed to set up drag and drop:", error);
      }
    };

    setupDragDrop();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [processDroppedPaths]);

  // Handle click to open file picker
  const handleSelectFiles = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (processingState === "processing") return;

      try {
        const selected = await open({
          multiple: true,
          directory: false,
          filters: [
            {
              name: "Images",
              extensions: ACCEPTED_EXTENSIONS,
            },
          ],
        });

        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          await processDroppedPaths(paths);
        }
      } catch (error) {
        console.error("Failed to open file picker:", error);
      }
    },
    [processingState, processDroppedPaths],
  );

  // Handle click to open folder picker
  const handleSelectFolder = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (processingState === "processing") return;

      try {
        const selected = await open({
          multiple: false,
          directory: true,
        });

        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          await processDroppedPaths(paths);
        }
      } catch (error) {
        console.error("Failed to open folder picker:", error);
      }
    },
    [processingState, processDroppedPaths],
  );

  const isProcessing = processingState === "processing";

  return (
    <div
      className={`
        relative overflow-hidden
        border-2 border-dashed rounded-2xl p-8 text-center
        transition-all duration-300 ease-out
        ${
          isDragActive
            ? "border-indigo-400 bg-indigo-50/80 scale-[1.02] shadow-lg shadow-indigo-200/50"
            : "border-slate-200 bg-white/60"
        }
        ${isProcessing ? "opacity-50 pointer-events-none" : ""}
        ${isDropped ? "animate-dropBounce" : ""}
      `}
    >
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5 pointer-events-none" />

      <div className="relative space-y-4">
        {/* Icon container */}
        <div
          className={`
          mx-auto rounded-2xl
          bg-gradient-to-br from-indigo-100 to-violet-100
          flex items-center justify-center
          transition-all duration-300
          ${isDragActive ? "scale-110 shadow-lg shadow-indigo-200/50" : ""}
        `}
          style={{ width: "80px", height: "80px" }}
        >
          <UploadCloudIcon
            style={{ width: "40px", height: "40px" }}
            className={`
              text-indigo-500
              transition-transform duration-300
              ${isDragActive ? "-translate-y-1" : ""}
            `}
          />
        </div>

        {/* Text content */}
        <div className="space-y-2">
          <p className="text-lg font-semibold text-slate-700">
            {t("dropzone.title")}
          </p>
          <p className="text-xs text-slate-400 font-medium">
            {t("dropzone.supported")}
          </p>
        </div>

        {/* Selection buttons */}
        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSelectFiles}
            disabled={isProcessing}
            className="
              inline-flex items-center gap-2 px-4 py-2
              bg-white border border-slate-200 rounded-lg
              text-sm font-medium text-slate-700
              hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <FileIcon className="w-4 h-4 text-indigo-500" />
            {t("dropzone.selectFiles")}
          </button>
          <button
            type="button"
            onClick={handleSelectFolder}
            disabled={isProcessing}
            className="
              inline-flex items-center gap-2 px-4 py-2
              bg-white border border-slate-200 rounded-lg
              text-sm font-medium text-slate-700
              hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <FolderIcon className="w-4 h-4 text-violet-500" />
            {t("dropzone.selectFolder")}
          </button>
        </div>
      </div>
    </div>
  );
}
