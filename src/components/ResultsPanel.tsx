import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BarChartIcon,
  ScaleIcon,
  TrendingDownIcon,
} from "./Icons";

export function ResultsPanel() {
  const { t } = useTranslation();
  const { batchStats, processingState } = useAppStore();

  // Progress while processing is on the start button
  if (processingState !== "completed" || !batchStats) {
    return null;
  }

  return (
    <div className="card p-4 space-y-4 animate-slideUp">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
          <BarChartIcon className="w-4 h-4 text-emerald-500" />
        </div>
        <h3 className="font-semibold text-slate-800">{t("results.title")}</h3>
      </div>

      {/* Results Statistics */}
      <div className="space-y-4">
        {/* File count */}
        <div className="flex justify-between items-center text-sm bg-slate-50 rounded-xl px-4 py-2.5">
          <span className="text-slate-600">{t("results.processed")}</span>
          <span className="font-semibold text-slate-800">
            {batchStats.successful_files} / {batchStats.total_files}{" "}
            {t("results.files")}
          </span>
        </div>

        {/* Statistics cards */}
        <div className="grid grid-cols-3 gap-3">
          {/* Overall */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-xl p-3 text-center border border-emerald-100/50 shadow-sm">
            <TrendingDownIcon className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
            <div className="text-xl font-bold text-emerald-600">
              {batchStats.overall_reduction_percent.toFixed(1)}%
            </div>
            <div className="text-xs text-emerald-600/70 font-medium">
              {t("results.overall")}
            </div>
          </div>

          {/* Average */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl p-3 text-center border border-blue-100/50 shadow-sm">
            <BarChartIcon className="w-5 h-5 text-blue-500 mx-auto mb-1.5" />
            <div className="text-xl font-bold text-blue-600">
              {batchStats.average_reduction_percent.toFixed(1)}%
            </div>
            <div className="text-xs text-blue-600/70 font-medium">
              {t("results.average")}
            </div>
          </div>

          {/* Median */}
          <div className="bg-gradient-to-br from-violet-50 to-purple-50/50 rounded-xl p-3 text-center border border-violet-100/50 shadow-sm">
            <ScaleIcon className="w-5 h-5 text-violet-500 mx-auto mb-1.5" />
            <div className="text-xl font-bold text-violet-600">
              {batchStats.median_reduction_percent.toFixed(1)}%
            </div>
            <div className="text-xs text-violet-600/70 font-medium">
              {t("results.median")}
            </div>
          </div>
        </div>

        {/* Size comparison */}
        <div className="flex items-center justify-center gap-3 text-sm text-slate-500 bg-slate-50/50 rounded-xl py-2">
          <span className="font-medium">
            {formatBytes(batchStats.total_original_size)}
          </span>
          <ArrowRightIcon className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-emerald-600">
            {formatBytes(batchStats.total_output_size)}
          </span>
        </div>

        {/* Error count */}
        {batchStats.failed_files > 0 && (
          <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-4 py-2.5">
            <AlertCircleIcon className="w-4 h-4" />
            <span>{t("results.failed", { n: batchStats.failed_files })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
