import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { XIcon, DownloadIcon } from './Icons';

interface UpdateInfo {
  update_available: boolean;
  current_version: string;
  latest_version: string;
  release_url: string;
  release_notes: string | null;
}

export function UpdateNotification() {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const info = await invoke<UpdateInfo>('check_for_updates');
        setUpdateInfo(info);
      } catch (error) {
        console.error('Failed to check for updates:', error);
      } finally {
        setChecking(false);
      }
    };

    checkUpdate();
  }, []);

  const handleDownload = async () => {
    if (updateInfo?.release_url) {
      await openUrl(updateInfo.release_url);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  if (checking || !updateInfo?.update_available || dismissed) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-xl shadow-sm animate-fadeIn">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <DownloadIcon className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{t('update.available')}</span>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              v{updateInfo.current_version} → v{updateInfo.latest_version}
            </span>
          </div>
          <p className="text-xs text-indigo-600 mt-1">{t('update.description')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {t('update.download')}
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 hover:bg-indigo-100 rounded-lg transition-colors"
            aria-label={t('update.dismiss')}
          >
            <XIcon className="w-4 h-4 text-indigo-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
