import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircleIcon, DownloadIcon, XIcon } from "./Icons";

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const info = await invoke<UpdateInfo>("check_for_updates");
        setUpdateInfo(info);
      } catch (error) {
        // Rust 側は通信失敗も 403 も Err で返してくる。ここで握り潰すと
        // 「更新が無い」のか「チェックが壊れている」のかを利用者が区別できない。
        // 原因の切り分けにはログが要るので、console には出したうえで表示もする。
        console.error("Failed to check for updates:", error);
        setFailed(true);
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

  if (checking || dismissed) {
    return null;
  }

  if (failed) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl shadow-sm flex items-center gap-3 animate-fadeIn">
        <AlertCircleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
        <span className="flex-1 text-sm">{t("update.checkFailed")}</span>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors"
          aria-label={t("update.dismiss")}
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (!updateInfo?.update_available) {
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
            <span className="font-medium text-sm">{t("update.available")}</span>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              v{updateInfo.current_version} → v{updateInfo.latest_version}
            </span>
          </div>
          <p className="text-xs text-indigo-600 mt-1">
            {t("update.description")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {t("update.download")}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 hover:bg-indigo-100 rounded-lg transition-colors"
            aria-label={t("update.dismiss")}
          >
            <XIcon className="w-4 h-4 text-indigo-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
