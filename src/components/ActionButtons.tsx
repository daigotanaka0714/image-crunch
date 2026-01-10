import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { useAppStore } from '../store/useAppStore';
import { PlayIcon, SpinnerIcon, XIcon } from './Icons';
import type { BatchStats, ProgressUpdate, ProcessingResult } from '../types';

export function ActionButtons() {
  const { t } = useTranslation();
  const {
    files,
    options,
    outputDir,
    processingState,
    setProcessingState,
    setProgress,
    setBatchStats,
    setError,
    updateFileStatus,
    resetFileStatuses,
  } = useAppStore();

  const isProcessing = processingState === 'processing';
  const canStart = files.length > 0 && outputDir && !isProcessing;

  // Send desktop notification
  const sendCompletionNotification = async (stats: BatchStats) => {
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }

      if (permissionGranted) {
        const body = t('notification.body', {
          count: stats.successful_files,
          reduction: stats.overall_reduction_percent.toFixed(1),
        });
        sendNotification({
          title: 'Image Crunch',
          body,
        });
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  };

  const handleStart = async () => {
    if (!canStart) {
      if (files.length === 0) {
        setError(t('errors.noFiles'));
      } else if (!outputDir) {
        setError(t('errors.noOutputDir'));
      }
      return;
    }

    setProcessingState('processing');
    setError(null);
    setBatchStats(null);
    resetFileStatuses();

    // Listen for progress updates
    const unlistenProgress = await listen<ProgressUpdate>('processing-progress', (event) => {
      setProgress(event.payload);
      // Update current file status to processing
      updateFileStatus(event.payload.current_file, 'processing');
    });

    // Listen for individual file results
    const unlistenResult = await listen<ProcessingResult>('processing-result', (event) => {
      const result = event.payload;
      if (result.success) {
        updateFileStatus(result.original_path, 'completed', {
          outputPath: result.output_path,
          outputSize: result.output_size,
          reductionPercent: result.reduction_percent,
        });
      } else {
        updateFileStatus(result.original_path, 'error', {
          error: result.error || t('errors.unknown'),
        });
      }
    });

    // Listen for completion
    const unlistenComplete = await listen<BatchStats>('processing-complete', (event) => {
      setBatchStats(event.payload);
      setProcessingState('completed');
      // Send desktop notification
      sendCompletionNotification(event.payload);
    });

    try {
      const inputPaths = files.map((f) => f.path);
      await invoke('process_batch', {
        inputPaths,
        outputDir,
        options,
      });
    } catch (error) {
      console.error('Processing failed:', error);
      setError(t('errors.processingFailed') + ': ' + String(error));
      setProcessingState('error');
    } finally {
      unlistenProgress();
      unlistenResult();
      unlistenComplete();
      setProgress(null);
    }
  };

  const handleCancel = () => {
    // For now, we just reset the state
    // In a future version, we could implement actual cancellation
    setProcessingState('idle');
    setProgress(null);
  };

  return (
    <div className="flex gap-4 pt-2">
      <button
        onClick={handleStart}
        disabled={!canStart}
        className={`
          flex-1 py-3.5 px-6 rounded-xl font-semibold text-white
          flex items-center justify-center gap-2.5
          transition-all duration-200 ease-out
          ${
            canStart
              ? 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }
        `}
      >
        {isProcessing ? (
          <>
            <SpinnerIcon className="w-5 h-5 animate-spin" />
            <span>{t('actions.processing')}</span>
          </>
        ) : (
          <>
            <PlayIcon className="w-5 h-5" />
            <span>{t('actions.start')}</span>
          </>
        )}
      </button>

      {isProcessing && (
        <button
          onClick={handleCancel}
          className="
            flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white
            bg-gradient-to-r from-rose-500 to-pink-500
            hover:from-rose-600 hover:to-pink-600
            shadow-lg shadow-rose-500/25 hover:shadow-xl hover:shadow-rose-500/30
            transition-all duration-200 ease-out
            hover:scale-[1.02] active:scale-[0.98]
            animate-fadeIn
          "
        >
          <XIcon className="w-5 h-5" />
          <span>{t('actions.cancel')}</span>
        </button>
      )}
    </div>
  );
}
