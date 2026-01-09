import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { ImageIcon, XIcon, TrashIcon, CheckCircleIcon, AlertCircleIcon, SpinnerIcon } from './Icons';
import type { FileStatus } from '../types';

function StatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircleIcon className="w-4 h-4 text-emerald-500" />;
    case 'error':
      return <AlertCircleIcon className="w-4 h-4 text-rose-500" />;
    case 'processing':
      return <SpinnerIcon className="w-4 h-4 text-indigo-500 animate-spin" />;
    default:
      return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function FileList() {
  const { t } = useTranslation();
  const { files, removeFile, clearFiles, processingState } = useAppStore();

  if (files.length === 0) {
    return null;
  }

  const isProcessing = processingState === 'processing';
  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="card p-4 animate-slideUp">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-800">{t('files.title')}</h3>
          <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
            {files.length}
          </span>
          {completedCount > 0 && (
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full flex items-center gap-1">
              <CheckCircleIcon className="w-3 h-3" />
              {completedCount}
            </span>
          )}
          {errorCount > 0 && (
            <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-semibold rounded-full flex items-center gap-1">
              <AlertCircleIcon className="w-3 h-3" />
              {errorCount}
            </span>
          )}
        </div>
        <button
          onClick={clearFiles}
          disabled={isProcessing}
          className={`
            flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-600
            px-2.5 py-1 rounded-lg hover:bg-rose-50
            transition-colors duration-200
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <TrashIcon className="w-3.5 h-3.5" />
          {t('files.clear')}
        </button>
      </div>

      {/* File List */}
      <div className="max-h-52 overflow-y-auto space-y-1.5 custom-scrollbar">
        {files.map((file, index) => (
          <div
            key={file.path}
            className={`
              flex items-center gap-2.5 py-2.5 px-3 rounded-xl text-sm group transition-all duration-200
              ${file.status === 'completed' ? 'bg-emerald-50/80 hover:bg-emerald-100/80' : ''}
              ${file.status === 'error' ? 'bg-rose-50/80 hover:bg-rose-100/80' : ''}
              ${file.status === 'pending' || file.status === 'processing' ? 'bg-slate-50/80 hover:bg-slate-100' : ''}
            `}
            style={{ animationDelay: `${index * 30}ms` }}
          >
            {/* Status/File icon */}
            <div className={`
              w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
              ${file.status === 'completed' ? 'bg-gradient-to-br from-emerald-100 to-teal-100' : ''}
              ${file.status === 'error' ? 'bg-gradient-to-br from-rose-100 to-pink-100' : ''}
              ${file.status === 'pending' || file.status === 'processing' ? 'bg-gradient-to-br from-indigo-100 to-violet-100' : ''}
            `}>
              {file.status === 'pending' ? (
                <ImageIcon className="w-4 h-4 text-indigo-500" />
              ) : (
                <StatusIcon status={file.status} />
              )}
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <span className={`
                truncate block font-medium
                ${file.status === 'completed' ? 'text-emerald-700' : ''}
                ${file.status === 'error' ? 'text-rose-700' : ''}
                ${file.status === 'pending' || file.status === 'processing' ? 'text-slate-700' : ''}
              `} title={file.path}>
                {file.name}
              </span>
              {file.status === 'completed' && file.reductionPercent !== undefined && (
                <span className="text-xs text-emerald-600">
                  → {file.outputPath?.split('/').pop()} ({file.reductionPercent.toFixed(1)}% {t('files.reduced')})
                </span>
              )}
              {file.status === 'error' && file.error && (
                <span className="text-xs text-rose-600 truncate block" title={file.error}>
                  {file.error}
                </span>
              )}
            </div>

            {/* Remove button - only show for pending files */}
            {file.status === 'pending' && (
              <button
                onClick={() => removeFile(file.path)}
                disabled={isProcessing}
                className={`
                  p-1.5 rounded-lg
                  opacity-0 group-hover:opacity-100
                  text-slate-400 hover:text-rose-500 hover:bg-rose-50
                  transition-all duration-200
                  ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                title={t('files.remove')}
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
