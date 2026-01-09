import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../store/useAppStore';
import { SettingsIcon, FolderIcon } from './Icons';
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

  // Calculate slider background based on value
  const sliderBackground = `linear-gradient(to right, var(--color-primary-500) 0%, var(--color-primary-500) ${options.quality}%, var(--color-slate-200) ${options.quality}%, var(--color-slate-200) 100%)`;

  return (
    <div className="card divide-y divide-slate-100 animate-slideUp">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
            <SettingsIcon className="w-4 h-4 text-indigo-500" />
          </div>
          <h3 className="font-semibold text-slate-800">{t('settings.title')}</h3>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Output Format */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-600">{t('settings.format')}</label>
          <select
            value={options.format}
            onChange={(e) => setOptions({ format: e.target.value as OutputFormat })}
            disabled={isProcessing}
            className={`
              w-full custom-select
              bg-slate-50 border border-slate-200 rounded-xl
              px-4 py-2.5 text-sm text-slate-700 font-medium
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {OUTPUT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Quality */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-slate-600">{t('settings.quality')}</label>
            <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
              {options.quality}%
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={options.quality}
            onChange={(e) => setOptions({ quality: parseInt(e.target.value) })}
            disabled={isProcessing}
            className="w-full disabled:opacity-50"
            style={{ background: sliderBackground }}
          />
        </div>

        {/* Resize */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={resizeEnabled}
              onChange={(e) => handleResizeToggle(e.target.checked)}
              disabled={isProcessing}
              className="custom-checkbox"
            />
            <span className="text-sm font-medium text-slate-600">{t('settings.resizeEnable')}</span>
          </label>
          {resizeEnabled && (
            <div className="flex gap-3 animate-fadeIn">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-500 mb-1 block">{t('settings.width')}</label>
                <input
                  type="number"
                  placeholder="px"
                  value={options.width || ''}
                  onChange={(e) =>
                    setOptions({ width: e.target.value ? parseInt(e.target.value) : null })
                  }
                  disabled={isProcessing}
                  className="w-full custom-input bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-500 mb-1 block">{t('settings.height')}</label>
                <input
                  type="number"
                  placeholder="px"
                  value={options.height || ''}
                  onChange={(e) =>
                    setOptions({ height: e.target.value ? parseInt(e.target.value) : null })
                  }
                  disabled={isProcessing}
                  className="w-full custom-input bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-600">{t('settings.metadata')}</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={options.keep_metadata}
                onChange={() => setOptions({ keep_metadata: true })}
                disabled={isProcessing}
                className="custom-radio"
              />
              <span className="text-sm text-slate-700">{t('settings.keepMetadata')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!options.keep_metadata}
                onChange={() => setOptions({ keep_metadata: false })}
                disabled={isProcessing}
                className="custom-radio"
              />
              <span className="text-sm text-slate-700">{t('settings.removeMetadata')}</span>
            </label>
          </div>
        </div>

        {/* Compression */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-600">{t('settings.compression')}</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={options.compression === 'lossy'}
                onChange={() => setOptions({ compression: 'lossy' as CompressionType })}
                disabled={isProcessing}
                className="custom-radio"
              />
              <span className="text-sm text-slate-700">{t('settings.lossy')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={options.compression === 'lossless'}
                onChange={() => setOptions({ compression: 'lossless' as CompressionType })}
                disabled={isProcessing}
                className="custom-radio"
              />
              <span className="text-sm text-slate-700">{t('settings.lossless')}</span>
            </label>
          </div>
        </div>

        {/* Output Directory */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-600">{t('settings.outputDir')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              disabled={isProcessing}
              className="flex-1 custom-input bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 disabled:opacity-50"
              readOnly
              placeholder={t('settings.selectDir')}
            />
            <button
              onClick={handleSelectOutputDir}
              disabled={isProcessing}
              className={`
                flex items-center gap-2 px-4 py-2.5
                bg-slate-100 hover:bg-slate-200 border border-slate-200
                rounded-xl text-sm font-medium text-slate-700
                transition-all duration-200
                ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <FolderIcon className="w-4 h-4" />
              {t('settings.selectDir')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
