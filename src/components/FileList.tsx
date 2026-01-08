import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';

export function FileList() {
  const { t } = useTranslation();
  const { files, removeFile, clearFiles, processingState } = useAppStore();

  if (files.length === 0) {
    return null;
  }

  const isProcessing = processingState === 'processing';

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium text-gray-700">
          {t('files.title')} ({t('files.count', { count: files.length })})
        </h3>
        <button
          onClick={clearFiles}
          disabled={isProcessing}
          className={`
            text-sm text-red-500 hover:text-red-700
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {t('files.clear')}
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1">
        {files.map((file) => (
          <div
            key={file.path}
            className="flex justify-between items-center py-1 px-2 bg-gray-50 rounded text-sm"
          >
            <span className="truncate flex-1 mr-2" title={file.path}>
              {file.name}
            </span>
            <button
              onClick={() => removeFile(file.path)}
              disabled={isProcessing}
              className={`
                text-gray-400 hover:text-red-500
                ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title={t('files.remove')}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
