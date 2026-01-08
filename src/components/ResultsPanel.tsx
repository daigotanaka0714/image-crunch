import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';

export function ResultsPanel() {
  const { t } = useTranslation();
  const { progress, batchStats, processingState } = useAppStore();

  const showProgress = processingState === 'processing' && progress;
  const showResults = processingState === 'completed' && batchStats;

  if (!showProgress && !showResults) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <h3 className="font-medium text-gray-700 border-b pb-2">{t('results.title')}</h3>

      {/* Progress Bar */}
      {showProgress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>
              {t('results.processed')}: {progress.current} {t('results.of')} {progress.total} {t('results.files')}
            </span>
            <span>{progress.percent.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-500 h-3 rounded-full transition-all duration-200"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 truncate" title={progress.current_file}>
            {progress.current_file.split('/').pop() || progress.current_file.split('\\').pop()}
          </p>
        </div>
      )}

      {/* Results Statistics */}
      {showResults && (
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('results.processed')}:</span>
            <span className="font-medium">
              {batchStats.successful_files} / {batchStats.total_files} {t('results.files')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-green-50 rounded p-2">
              <div className="text-lg font-bold text-green-600">
                {batchStats.overall_reduction_percent.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500">{t('results.overall')}</div>
            </div>
            <div className="bg-blue-50 rounded p-2">
              <div className="text-lg font-bold text-blue-600">
                {batchStats.average_reduction_percent.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500">{t('results.average')}</div>
            </div>
            <div className="bg-purple-50 rounded p-2">
              <div className="text-lg font-bold text-purple-600">
                {batchStats.median_reduction_percent.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500">{t('results.median')}</div>
            </div>
          </div>

          <div className="text-xs text-gray-500 text-center">
            {formatBytes(batchStats.total_original_size)} → {formatBytes(batchStats.total_output_size)}
          </div>

          {batchStats.failed_files > 0 && (
            <div className="text-sm text-red-500">
              Failed: {batchStats.failed_files} file(s)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
