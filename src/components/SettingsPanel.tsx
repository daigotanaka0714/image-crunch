import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import type {
  CompressionType,
  ImageWatermark,
  OutputFormat,
  WatermarkPosition,
} from "../types";
import { FolderIcon, SettingsIcon } from "./Icons";

const OUTPUT_FORMATS: OutputFormat[] = [
  "webp",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
];

// Row-major order, so the radios render as a 3x3 grid
const WATERMARK_POSITIONS: WatermarkPosition[] = [
  "top_left",
  "top_center",
  "top_right",
  "middle_left",
  "center",
  "middle_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
];

const DEFAULT_WATERMARK: ImageWatermark = {
  path: "",
  position: "bottom_right",
  margin_percent: 2,
  opacity: 50,
  scale_percent: 20,
};

const MAX_WATERMARK_MARGIN = 20;

// Fill the range track up to the current value
const rangeBackground = (value: number, max: number, min = 0) => {
  const filled = ((value - min) / (max - min)) * 100;
  return `linear-gradient(to right, var(--color-primary-500) 0%, var(--color-primary-500) ${filled}%, var(--color-slate-200) ${filled}%, var(--color-slate-200) 100%)`;
};

export function SettingsPanel() {
  const { t } = useTranslation();
  const { options, setOptions, outputDir, setOutputDir, processingState } =
    useAppStore();
  const [resizeEnabled, setResizeEnabled] = useState(
    options.width !== null || options.height !== null,
  );

  const isProcessing = processingState === "processing";

  const handleSelectOutputDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("settings.selectDir"),
      });
      if (selected && typeof selected === "string") {
        setOutputDir(selected);
      }
    } catch (error) {
      console.error("Failed to select directory:", error);
    }
  };

  const handleResizeToggle = (enabled: boolean) => {
    setResizeEnabled(enabled);
    if (!enabled) {
      setOptions({ width: null, height: null });
    }
  };

  const { watermark } = options;

  const handleWatermarkToggle = (enabled: boolean) => {
    setOptions({ watermark: enabled ? DEFAULT_WATERMARK : null });
  };

  const updateWatermark = (patch: Partial<ImageWatermark>) => {
    if (watermark) {
      setOptions({ watermark: { ...watermark, ...patch } });
    }
  };

  const handleSelectWatermark = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "PNG", extensions: ["png"] }],
        title: t("settings.watermarkChoose"),
      });
      if (selected && typeof selected === "string") {
        updateWatermark({ path: selected });
      }
    } catch (error) {
      console.error("Failed to select watermark image:", error);
    }
  };

  // Calculate slider background based on value
  const sliderBackground = rangeBackground(options.quality, 100);

  return (
    <div className="card divide-y divide-slate-100 animate-slideUp">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
            <SettingsIcon className="w-4 h-4 text-indigo-500" />
          </div>
          <h3 className="font-semibold text-slate-800">
            {t("settings.title")}
          </h3>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Output Format */}
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-600"
            htmlFor="settings-format"
          >
            {t("settings.format")}
          </label>
          <select
            id="settings-format"
            value={options.format}
            onChange={(e) =>
              setOptions({ format: e.target.value as OutputFormat })
            }
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
            <label
              className="text-sm font-medium text-slate-600"
              htmlFor="settings-quality"
            >
              {t("settings.quality")}
            </label>
            <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
              {options.quality}%
            </span>
          </div>
          <input
            id="settings-quality"
            type="range"
            min="1"
            max="100"
            value={options.quality}
            onChange={(e) =>
              setOptions({ quality: parseInt(e.target.value, 10) })
            }
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
            <span className="text-sm font-medium text-slate-600">
              {t("settings.resizeEnable")}
            </span>
          </label>
          {resizeEnabled && (
            <div className="flex gap-3 animate-fadeIn">
              <div className="flex-1">
                <label
                  className="text-xs font-medium text-slate-500 mb-1 block"
                  htmlFor="settings-width"
                >
                  {t("settings.width")}
                </label>
                <input
                  id="settings-width"
                  type="number"
                  placeholder="px"
                  value={options.width || ""}
                  onChange={(e) =>
                    setOptions({
                      width: e.target.value
                        ? parseInt(e.target.value, 10)
                        : null,
                    })
                  }
                  disabled={isProcessing}
                  className="w-full custom-input bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                />
              </div>
              <div className="flex-1">
                <label
                  className="text-xs font-medium text-slate-500 mb-1 block"
                  htmlFor="settings-height"
                >
                  {t("settings.height")}
                </label>
                <input
                  id="settings-height"
                  type="number"
                  placeholder="px"
                  value={options.height || ""}
                  onChange={(e) =>
                    setOptions({
                      height: e.target.value
                        ? parseInt(e.target.value, 10)
                        : null,
                    })
                  }
                  disabled={isProcessing}
                  className="w-full custom-input bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Metadata */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-600">
            {t("settings.metadata")}
          </legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={options.keep_metadata}
                onChange={() => setOptions({ keep_metadata: true })}
                disabled={isProcessing}
                className="custom-radio"
              />
              <span className="text-sm text-slate-700">
                {t("settings.keepMetadata")}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!options.keep_metadata}
                onChange={() => setOptions({ keep_metadata: false })}
                disabled={isProcessing}
                className="custom-radio"
              />
              <span className="text-sm text-slate-700">
                {t("settings.removeMetadata")}
              </span>
            </label>
          </div>
        </fieldset>

        {/* Compression */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-600">
            {t("settings.compression")}
          </legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={options.compression === "lossy"}
                onChange={() =>
                  setOptions({ compression: "lossy" as CompressionType })
                }
                disabled={isProcessing}
                className="custom-radio"
              />
              <span className="text-sm text-slate-700">
                {t("settings.lossy")}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={options.compression === "lossless"}
                onChange={() =>
                  setOptions({ compression: "lossless" as CompressionType })
                }
                disabled={isProcessing}
                className="custom-radio"
              />
              <span className="text-sm text-slate-700">
                {t("settings.lossless")}
              </span>
            </label>
          </div>
        </fieldset>

        {/* Watermark */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={watermark !== null}
              onChange={(e) => handleWatermarkToggle(e.target.checked)}
              disabled={isProcessing}
              className="custom-checkbox"
            />
            <span className="text-sm font-medium text-slate-600">
              {t("settings.watermarkEnable")}
            </span>
          </label>
          {watermark && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-1">
                <label
                  className="text-xs font-medium text-slate-500 block"
                  htmlFor="settings-watermark-file"
                >
                  {t("settings.watermarkImage")}
                </label>
                <div className="flex gap-2">
                  <input
                    id="settings-watermark-file"
                    type="text"
                    value={watermark.path}
                    disabled={isProcessing}
                    className="flex-1 min-w-0 custom-input bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 disabled:opacity-50"
                    readOnly
                    placeholder={t("settings.watermarkNoFile")}
                  />
                  <button
                    type="button"
                    onClick={handleSelectWatermark}
                    disabled={isProcessing}
                    className={`
                      px-3 py-2
                      bg-slate-100 hover:bg-slate-200 border border-slate-200
                      rounded-xl text-sm font-medium text-slate-700
                      transition-all duration-200
                      ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}
                    `}
                  >
                    {t("settings.watermarkChoose")}
                  </button>
                </div>
                {!watermark.path && (
                  <p className="text-xs text-amber-600">
                    {t("settings.watermarkRequired")}
                  </p>
                )}
              </div>

              <fieldset className="space-y-1">
                <legend className="text-xs font-medium text-slate-500">
                  {t("settings.watermarkPosition")}
                </legend>
                <div className="grid grid-cols-3 gap-1 w-24">
                  {WATERMARK_POSITIONS.map((position) => (
                    <label
                      key={position}
                      className="flex items-center justify-center p-1 cursor-pointer"
                      title={t(`settings.watermarkPositions.${position}`)}
                    >
                      <input
                        type="radio"
                        name="watermark-position"
                        aria-label={t(
                          `settings.watermarkPositions.${position}`,
                        )}
                        checked={watermark.position === position}
                        onChange={() => updateWatermark({ position })}
                        disabled={isProcessing}
                        className="custom-radio"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label
                    className="text-xs font-medium text-slate-500"
                    htmlFor="settings-watermark-size"
                  >
                    {t("settings.watermarkSize")}
                  </label>
                  <span className="text-xs font-bold text-indigo-600">
                    {watermark.scale_percent}%
                  </span>
                </div>
                <input
                  id="settings-watermark-size"
                  type="range"
                  min="1"
                  max="100"
                  value={watermark.scale_percent}
                  onChange={(e) =>
                    updateWatermark({
                      scale_percent: parseInt(e.target.value, 10),
                    })
                  }
                  disabled={isProcessing}
                  className="w-full disabled:opacity-50"
                  style={{
                    background: rangeBackground(watermark.scale_percent, 100),
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label
                    className="text-xs font-medium text-slate-500"
                    htmlFor="settings-watermark-opacity"
                  >
                    {t("settings.watermarkOpacity")}
                  </label>
                  <span className="text-xs font-bold text-indigo-600">
                    {watermark.opacity}%
                  </span>
                </div>
                <input
                  id="settings-watermark-opacity"
                  type="range"
                  min="1"
                  max="100"
                  value={watermark.opacity}
                  onChange={(e) =>
                    updateWatermark({ opacity: parseInt(e.target.value, 10) })
                  }
                  disabled={isProcessing}
                  className="w-full disabled:opacity-50"
                  style={{
                    background: rangeBackground(watermark.opacity, 100),
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label
                    className="text-xs font-medium text-slate-500"
                    htmlFor="settings-watermark-margin"
                  >
                    {t("settings.watermarkMargin")}
                  </label>
                  <span className="text-xs font-bold text-indigo-600">
                    {watermark.margin_percent}%
                  </span>
                </div>
                <input
                  id="settings-watermark-margin"
                  type="range"
                  min="0"
                  max={MAX_WATERMARK_MARGIN}
                  value={watermark.margin_percent}
                  onChange={(e) =>
                    updateWatermark({
                      margin_percent: parseInt(e.target.value, 10),
                    })
                  }
                  disabled={isProcessing}
                  className="w-full disabled:opacity-50"
                  style={{
                    background: rangeBackground(
                      watermark.margin_percent,
                      MAX_WATERMARK_MARGIN,
                    ),
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Output Directory */}
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-600"
            htmlFor="settings-output-dir"
          >
            {t("settings.outputDir")}
          </label>
          <div className="flex gap-2">
            <input
              id="settings-output-dir"
              type="text"
              value={outputDir}
              disabled={isProcessing}
              className="flex-1 custom-input bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 disabled:opacity-50"
              readOnly
              placeholder={t("settings.selectDir")}
            />
            <button
              type="button"
              onClick={handleSelectOutputDir}
              disabled={isProcessing}
              className={`
                flex items-center gap-2 px-4 py-2.5
                bg-slate-100 hover:bg-slate-200 border border-slate-200
                rounded-xl text-sm font-medium text-slate-700
                transition-all duration-200
                ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              <FolderIcon className="w-4 h-4" />
              {t("settings.selectDir")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
