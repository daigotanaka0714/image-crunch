import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMissingGlyphs, useSystemFonts } from "../hooks/useFonts";
import { useAppStore } from "../store/useAppStore";
import {
  fromSaved,
  loadSavedWatermark,
  toSaved,
  WATERMARK_LIMITS,
  WATERMARK_POSITIONS,
} from "../store/watermarkSettings";
import type {
  CompressionType,
  OutputFormat,
  TextWatermark,
  WatermarkKind,
  WatermarkPlacement,
  WatermarkTile,
} from "../types";
import { FolderIcon, SettingsIcon, XIcon } from "./Icons";

const OUTPUT_FORMATS: OutputFormat[] = [
  "webp",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
];

const WATERMARK_KINDS: WatermarkKind[] = ["text", "image"];

// The border keeps a white swatch visible on the white panel
const COLOR_INPUT_CLASS =
  "h-8 w-12 p-0.5 rounded-lg border border-slate-300 bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

const MAX_WATERMARK_MARGIN = WATERMARK_LIMITS.margin_percent.max;
const MAX_OUTLINE_WIDTH = WATERMARK_LIMITS.outline_width_percent.max;
const TILE_SPACING = WATERMARK_LIMITS.tile_spacing_percent;
const TILE_ANGLE = WATERMARK_LIMITS.tile_angle_degrees;

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
  const textWatermark = watermark?.kind === "text" ? watermark : null;
  const systemFonts = useSystemFonts();
  const missingGlyphs = useMissingGlyphs(
    textWatermark?.font ?? null,
    textWatermark?.text ?? null,
  );

  const handleWatermarkToggle = (enabled: boolean) => {
    setOptions({ watermark: enabled ? fromSaved(loadSavedWatermark()) : null });
  };

  // Placement and the saved text settings carry over; the image path does not
  const handleKindChange = (kind: WatermarkKind) => {
    if (watermark && watermark.kind !== kind) {
      setOptions({
        watermark: fromSaved(toSaved(watermark, loadSavedWatermark()), kind),
      });
    }
  };

  const updatePlacement = (patch: Partial<WatermarkPlacement>) => {
    if (watermark) {
      setOptions({ watermark: { ...watermark, ...patch } });
    }
  };

  const handleLayoutChange = (tiled: boolean) => {
    const saved = loadSavedWatermark();
    updatePlacement({
      tile: tiled
        ? {
            spacing_percent: saved.tile_spacing_percent,
            angle_degrees: saved.tile_angle_degrees,
          }
        : null,
    });
  };

  const updateTile = (patch: Partial<WatermarkTile>) => {
    if (watermark?.tile) {
      updatePlacement({ tile: { ...watermark.tile, ...patch } });
    }
  };

  const updateText = (patch: Partial<Omit<TextWatermark, "kind">>) => {
    if (textWatermark) {
      setOptions({ watermark: { ...textWatermark, ...patch } });
    }
  };

  const handleOutlineToggle = (enabled: boolean) => {
    const saved = loadSavedWatermark();
    updateText({
      outline: enabled
        ? {
            color: saved.outline_color,
            width_percent: saved.outline_width_percent,
          }
        : null,
    });
  };

  const handleSelectWatermark = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "PNG", extensions: ["png"] }],
        title: t("settings.watermarkChoose"),
      });
      if (
        selected &&
        typeof selected === "string" &&
        watermark?.kind === "image"
      ) {
        setOptions({ watermark: { ...watermark, path: selected } });
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
          {systemFonts.replacement && (
            <div
              role="status"
              className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-xl text-xs"
            >
              <span className="flex-1">
                {t("settings.watermarkFontReplaced", {
                  ...systemFonts.replacement,
                })}
              </span>
              <button
                type="button"
                onClick={systemFonts.dismissReplacement}
                aria-label={t("settings.dismiss")}
                className="p-0.5 hover:bg-amber-100 rounded"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {watermark && (
            <div className="space-y-4 animate-fadeIn">
              <fieldset className="space-y-1">
                <legend className="text-xs font-medium text-slate-500">
                  {t("settings.watermarkKind")}
                </legend>
                <div className="flex gap-4">
                  {WATERMARK_KINDS.map((kind) => (
                    <label
                      key={kind}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="watermark-kind"
                        checked={watermark.kind === kind}
                        onChange={() => handleKindChange(kind)}
                        disabled={isProcessing}
                        className="custom-radio"
                      />
                      <span className="text-sm text-slate-700">
                        {t(
                          kind === "text"
                            ? "settings.watermarkKindText"
                            : "settings.watermarkKindImage",
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {watermark.kind === "image" && (
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
              )}

              {textWatermark && (
                <>
                  <div className="space-y-1">
                    <label
                      className="text-xs font-medium text-slate-500 block"
                      htmlFor="settings-watermark-text"
                    >
                      {t("settings.watermarkText")}
                    </label>
                    <input
                      id="settings-watermark-text"
                      type="text"
                      value={textWatermark.text}
                      onChange={(e) => updateText({ text: e.target.value })}
                      disabled={isProcessing}
                      className="w-full custom-input bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                    />
                    {!textWatermark.text.trim() && (
                      <p className="text-xs text-amber-600">
                        {t("settings.watermarkTextRequired")}
                      </p>
                    )}
                    {missingGlyphs.length > 0 && (
                      <p className="text-xs text-amber-600" role="alert">
                        {t("settings.watermarkMissingGlyphs", {
                          chars: missingGlyphs.join(" "),
                        })}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label
                      className="text-xs font-medium text-slate-500 block"
                      htmlFor="settings-watermark-font"
                    >
                      {t("settings.watermarkFont")}
                    </label>
                    <select
                      id="settings-watermark-font"
                      value={textWatermark.font}
                      onChange={(e) => updateText({ font: e.target.value })}
                      disabled={isProcessing || systemFonts.fonts === null}
                      className="w-full custom-select bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                    >
                      {systemFonts.fonts === null ? (
                        <option value={textWatermark.font}>
                          {systemFonts.failed
                            ? textWatermark.font
                            : t("settings.watermarkFontsLoading")}
                        </option>
                      ) : (
                        systemFonts.fonts.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.family === font.id
                              ? font.id
                              : `${font.family} (${font.id})`}
                          </option>
                        ))
                      )}
                    </select>
                    {systemFonts.failed && (
                      <p className="text-xs text-rose-600">
                        {t("settings.watermarkFontsError")}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <label
                      className="text-xs font-medium text-slate-500"
                      htmlFor="settings-watermark-color"
                    >
                      {t("settings.watermarkColor")}
                    </label>
                    <input
                      id="settings-watermark-color"
                      type="color"
                      value={textWatermark.color}
                      onChange={(e) => updateText({ color: e.target.value })}
                      disabled={isProcessing}
                      className={COLOR_INPUT_CLASS}
                    />
                    <span className="text-xs font-mono text-slate-500">
                      {textWatermark.color}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={textWatermark.outline !== null}
                        onChange={(e) => handleOutlineToggle(e.target.checked)}
                        disabled={isProcessing}
                        className="custom-checkbox"
                      />
                      <span className="text-xs font-medium text-slate-500">
                        {t("settings.watermarkOutline")}
                      </span>
                    </label>
                    {textWatermark.outline && (
                      <div className="space-y-3 animate-fadeIn">
                        <div className="flex items-center gap-3">
                          <label
                            className="text-xs font-medium text-slate-500"
                            htmlFor="settings-watermark-outline-color"
                          >
                            {t("settings.watermarkOutlineColor")}
                          </label>
                          <input
                            id="settings-watermark-outline-color"
                            type="color"
                            value={textWatermark.outline.color}
                            onChange={(e) =>
                              updateText({
                                outline: textWatermark.outline && {
                                  ...textWatermark.outline,
                                  color: e.target.value,
                                },
                              })
                            }
                            disabled={isProcessing}
                            className={COLOR_INPUT_CLASS}
                          />
                          <span className="text-xs font-mono text-slate-500">
                            {textWatermark.outline.color}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label
                              className="text-xs font-medium text-slate-500"
                              htmlFor="settings-watermark-outline-width"
                            >
                              {t("settings.watermarkOutlineWidth")}
                            </label>
                            <span className="text-xs font-bold text-indigo-600">
                              {textWatermark.outline.width_percent}%
                            </span>
                          </div>
                          <input
                            id="settings-watermark-outline-width"
                            type="range"
                            min="1"
                            max={MAX_OUTLINE_WIDTH}
                            value={textWatermark.outline.width_percent}
                            onChange={(e) =>
                              updateText({
                                outline: textWatermark.outline && {
                                  ...textWatermark.outline,
                                  width_percent: parseInt(e.target.value, 10),
                                },
                              })
                            }
                            disabled={isProcessing}
                            className="w-full disabled:opacity-50"
                            style={{
                              background: rangeBackground(
                                textWatermark.outline.width_percent,
                                MAX_OUTLINE_WIDTH,
                                1,
                              ),
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <fieldset className="space-y-1">
                <legend className="text-xs font-medium text-slate-500">
                  {t("settings.watermarkLayout")}
                </legend>
                <div className="flex gap-4">
                  {([false, true] as const).map((tiled) => (
                    <label
                      key={String(tiled)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="watermark-layout"
                        checked={(watermark.tile !== null) === tiled}
                        onChange={() => handleLayoutChange(tiled)}
                        disabled={isProcessing}
                        className="custom-radio"
                      />
                      <span className="text-sm text-slate-700">
                        {t(
                          tiled
                            ? "settings.watermarkLayoutTile"
                            : "settings.watermarkLayoutSingle",
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {watermark.tile === null && (
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
                          onChange={() => updatePlacement({ position })}
                          disabled={isProcessing}
                          className="custom-radio"
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

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
                    updatePlacement({
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
                    updatePlacement({ opacity: parseInt(e.target.value, 10) })
                  }
                  disabled={isProcessing}
                  className="w-full disabled:opacity-50"
                  style={{
                    background: rangeBackground(watermark.opacity, 100),
                  }}
                />
              </div>

              {watermark.tile ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label
                        className="text-xs font-medium text-slate-500"
                        htmlFor="settings-watermark-spacing"
                      >
                        {t("settings.watermarkSpacing")}
                      </label>
                      <span className="text-xs font-bold text-indigo-600">
                        {watermark.tile.spacing_percent}%
                      </span>
                    </div>
                    <input
                      id="settings-watermark-spacing"
                      type="range"
                      min={TILE_SPACING.min}
                      max={TILE_SPACING.max}
                      value={watermark.tile.spacing_percent}
                      onChange={(e) =>
                        updateTile({
                          spacing_percent: parseInt(e.target.value, 10),
                        })
                      }
                      disabled={isProcessing}
                      className="w-full disabled:opacity-50"
                      style={{
                        background: rangeBackground(
                          watermark.tile.spacing_percent,
                          TILE_SPACING.max,
                          TILE_SPACING.min,
                        ),
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label
                        className="text-xs font-medium text-slate-500"
                        htmlFor="settings-watermark-angle"
                      >
                        {t("settings.watermarkAngle")}
                      </label>
                      <span className="text-xs font-bold text-indigo-600">
                        {watermark.tile.angle_degrees}°
                      </span>
                    </div>
                    <input
                      id="settings-watermark-angle"
                      type="range"
                      min={TILE_ANGLE.min}
                      max={TILE_ANGLE.max}
                      value={watermark.tile.angle_degrees}
                      onChange={(e) =>
                        updateTile({
                          angle_degrees: parseInt(e.target.value, 10),
                        })
                      }
                      disabled={isProcessing}
                      className="w-full disabled:opacity-50"
                      style={{
                        background: rangeBackground(
                          watermark.tile.angle_degrees,
                          TILE_ANGLE.max,
                          TILE_ANGLE.min,
                        ),
                      }}
                    />
                  </div>
                </>
              ) : (
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
                      updatePlacement({
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
              )}
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
