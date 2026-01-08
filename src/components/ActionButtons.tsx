import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import type { BatchStats, ProgressUpdate } from '../types';

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
  } = useAppStore();

  const isProcessing = processingState === 'processing';
  const canStart = files.length > 0 && outputDir && !isProcessing;

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

    // Listen for progress updates
    const unlistenProgress = await listen<ProgressUpdate>('processing-progress', (event) => {
      setProgress(event.payload);
    });

    // Listen for completion
    const unlistenComplete = await listen<BatchStats>('processing-complete', (event) => {
      setBatchStats(event.payload);
      setProcessingState('completed');
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
    <div className="flex space-x-3">
      <button
        onClick={handleStart}
        disabled={!canStart}
        className={`
          flex-1 py-3 rounded-lg font-medium text-white transition-colors
          ${canStart
            ? 'bg-blue-500 hover:bg-blue-600'
            : 'bg-gray-300 cursor-not-allowed'
          }
        `}
      >
        {isProcessing ? t('actions.processing') : t('actions.start')}
      </button>

      {isProcessing && (
        <button
          onClick={handleCancel}
          className="px-6 py-3 rounded-lg font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
        >
          {t('actions.cancel')}
        </button>
      )}
    </div>
  );
}
