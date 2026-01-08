import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../store/useAppStore';
import type { OutputFormat, CompressionType } from '../types';

const OUTPUT_FORMATS: OutputFormat[] = ['webp', 'jpeg', 'png', 'gif', 'bmp', 'tiff'];

export function SettingsPanel() {
  const { t } = useTranslation();
  const { options, setOptions, outputDir, setOutputDir, processingState } = useAppStore();
  const [resizeEnabled, setResizeEnabled] = useState(
    options.width !== null || options.height !== null
  );

  const isProcessing = processingState === 'processing';

  const handleSelectOutputDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('settings.selectDir'),
      });
      if (selected && typeof selected === 'string') {
        setOutputDir(selected);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleResizeToggle = (enabled: boolean) => {
    setResizeEnabled(enabled);
    if (!enabled) {
      setOptions({ width: null, height: null });
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <h3 className="font-medium text-gray-700 border-b pb-2">{t('settings.title')}</h3>

      {/* Output Format */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">{t('settings.format')}</label>
        <select
          value={options.format}
          onChange={(e) => setOptions({ format: e.target.value as OutputFormat })}
          disabled={isProcessing}
          className="w-full border rounded px-3 py-2 text-sm"
        >
          {OUTPUT_FORMATS.map((format) => (
            <option key={format} value={format}>
              {format.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Quality */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">
          {t('settings.quality')}: {options.quality}%
        </label>
        <input
          type="range"
          min="1"
          max="100"
          value={options.quality}
          onChange={(e) => setOptions({ quality: parseInt(e.target.value) })}
          disabled={isProcessing}
          className="w-full"
        />
      </div>

      {/* Resize */}
      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={resizeEnabled}
            onChange={(e) => handleResizeToggle(e.target.checked)}
            disabled={isProcessing}
          />
          <span className="text-sm text-gray-600">{t('settings.resizeEnable')}</span>
        </label>
        {resizeEnabled && (
          <div className="flex space-x-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">{t('settings.width')}</label>
              <input
                type="number"
                placeholder="px"
                value={options.width || ''}
                onChange={(e) =>
                  setOptions({ width: e.target.value ? parseInt(e.target.value) : null })
                }
                disabled={isProcessing}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">{t('settings.height')}</label>
              <input
                type="number"
                placeholder="px"
                value={options.height || ''}
                onChange={(e) =>
                  setOptions({ height: e.target.value ? parseInt(e.target.value) : null })
                }
                disabled={isProcessing}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">{t('settings.metadata')}</label>
        <div className="flex space-x-4">
          <label className="flex items-center space-x-1">
            <input
              type="radio"
              checked={options.keep_metadata}
              onChange={() => setOptions({ keep_metadata: true })}
              disabled={isProcessing}
            />
            <span className="text-sm">{t('settings.keepMetadata')}</span>
          </label>
          <label className="flex items-center space-x-1">
            <input
              type="radio"
              checked={!options.keep_metadata}
              onChange={() => setOptions({ keep_metadata: false })}
              disabled={isProcessing}
            />
            <span className="text-sm">{t('settings.removeMetadata')}</span>
          </label>
        </div>
      </div>

      {/* Compression */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">{t('settings.compression')}</label>
        <div className="flex space-x-4">
          <label className="flex items-center space-x-1">
            <input
              type="radio"
              checked={options.compression === 'lossy'}
              onChange={() => setOptions({ compression: 'lossy' as CompressionType })}
              disabled={isProcessing}
            />
            <span className="text-sm">{t('settings.lossy')}</span>
          </label>
          <label className="flex items-center space-x-1">
            <input
              type="radio"
              checked={options.compression === 'lossless'}
              onChange={() => setOptions({ compression: 'lossless' as CompressionType })}
              disabled={isProcessing}
            />
            <span className="text-sm">{t('settings.lossless')}</span>
          </label>
        </div>
      </div>

      {/* Output Directory */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">{t('settings.outputDir')}</label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            disabled={isProcessing}
            className="flex-1 border rounded px-3 py-2 text-sm bg-gray-50"
            readOnly
          />
          <button
            onClick={handleSelectOutputDir}
            disabled={isProcessing}
            className={`
              px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm
              ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {t('settings.selectDir')}
          </button>
        </div>
      </div>
    </div>
  );
}
