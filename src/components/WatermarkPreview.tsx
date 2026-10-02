import { useTranslation } from "react-i18next";
import { useWatermarkPreview } from "../hooks/useWatermarkPreview";
import { previewTarget, useAppStore } from "../store/useAppStore";
import { SpinnerIcon } from "./Icons";

// The file chosen in the list, drawn with the current resize and watermark
export function WatermarkPreview() {
  const { t } = useTranslation();
  const { files, selectedPath, options } = useAppStore();
  const target = previewTarget(files, selectedPath);
  const preview = useWatermarkPreview(target?.path ?? null, options);

  if (target === null) {
    return (
      <p className="text-xs text-slate-500">
        {t("settings.watermarkPreviewNoFiles")}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs font-medium text-slate-500">
          {t("settings.watermarkPreview")}
        </span>
        <span className="text-xs text-slate-400 truncate" title={target.path}>
          {target.name}
        </span>
      </div>
      <div
        className="flex items-center justify-center min-h-32 rounded-xl bg-slate-100 overflow-hidden"
        aria-busy={preview.loading}
      >
        {preview.url ? (
          <img
            src={preview.url}
            alt={t("settings.watermarkPreviewAlt", { name: target.name })}
            className="max-w-full max-h-80 object-contain"
          />
        ) : (
          preview.loading && (
            <SpinnerIcon className="w-5 h-5 text-indigo-500 animate-spin" />
          )
        )}
      </div>
      {preview.error && (
        <p className="text-xs text-rose-600" role="alert">
          {t("settings.watermarkPreviewError", { error: preview.error })}
        </p>
      )}
      {files.length > 1 && (
        <p className="text-xs text-slate-400">
          {t("settings.watermarkPreviewHint")}
        </p>
      )}
    </div>
  );
}
