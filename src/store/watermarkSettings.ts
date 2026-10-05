import type { Watermark, WatermarkKind, WatermarkPosition } from "../types";

// Row-major order, so the radios render as a 3x3 grid
export const WATERMARK_POSITIONS: WatermarkPosition[] = [
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

export const WATERMARK_LIMITS = {
  margin_percent: { min: 0, max: 20 },
  opacity: { min: 1, max: 100 },
  scale_percent: { min: 1, max: 100 },
  outline_width_percent: { min: 1, max: 20 },
  tile_spacing_percent: { min: 0, max: 50 },
  tile_angle_degrees: { min: -90, max: 90 },
} as const;

// Watermark settings kept across launches. The image path is not saved.
export interface SavedWatermark {
  enabled: boolean;
  kind: WatermarkKind;
  position: WatermarkPosition;
  margin_percent: number;
  opacity: number;
  scale_percent: number;
  tile_enabled: boolean;
  tile_spacing_percent: number;
  tile_angle_degrees: number;
  text: string;
  // PostScript name. "" means the default font.
  font: string;
  color: string;
  outline_enabled: boolean;
  outline_color: string;
  outline_width_percent: number;
}

export const DEFAULT_SAVED_WATERMARK: SavedWatermark = {
  enabled: false,
  kind: "text",
  position: "bottom_right",
  margin_percent: 2,
  opacity: 50,
  scale_percent: 20,
  tile_enabled: false,
  tile_spacing_percent: 10,
  tile_angle_degrees: 30,
  text: "",
  font: "",
  color: "#ffffff",
  outline_enabled: false,
  outline_color: "#000000",
  outline_width_percent: 5,
};

export const WATERMARK_STORAGE_KEY = "image-crunch.watermark";

const isBoolean = (value: unknown) => typeof value === "boolean";
const isString = (value: unknown) => typeof value === "string";
const isHexColor = (value: unknown) =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
const inRange =
  ({ min, max }: { min: number; max: number }) =>
  (value: unknown) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;

const VALIDATORS: Record<keyof SavedWatermark, (value: unknown) => boolean> = {
  enabled: isBoolean,
  kind: (value) => value === "text" || value === "image",
  position: (value) => WATERMARK_POSITIONS.includes(value as WatermarkPosition),
  margin_percent: inRange(WATERMARK_LIMITS.margin_percent),
  opacity: inRange(WATERMARK_LIMITS.opacity),
  scale_percent: inRange(WATERMARK_LIMITS.scale_percent),
  tile_enabled: isBoolean,
  tile_spacing_percent: inRange(WATERMARK_LIMITS.tile_spacing_percent),
  tile_angle_degrees: inRange(WATERMARK_LIMITS.tile_angle_degrees),
  text: isString,
  font: isString,
  color: isHexColor,
  outline_enabled: isBoolean,
  outline_color: isHexColor,
  outline_width_percent: inRange(WATERMARK_LIMITS.outline_width_percent),
};

// Keep each valid field and put the default back in the others
export function sanitizeSavedWatermark(raw: unknown): SavedWatermark {
  const source =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const result: Record<string, unknown> = { ...DEFAULT_SAVED_WATERMARK };
  for (const key of Object.keys(VALIDATORS) as (keyof SavedWatermark)[]) {
    if (VALIDATORS[key](source[key])) {
      result[key] = source[key];
    }
  }
  return result as unknown as SavedWatermark;
}

export function loadSavedWatermark(): SavedWatermark {
  try {
    const stored = localStorage.getItem(WATERMARK_STORAGE_KEY);
    return stored === null
      ? DEFAULT_SAVED_WATERMARK
      : sanitizeSavedWatermark(JSON.parse(stored));
  } catch (error) {
    console.error("Failed to load watermark settings:", error);
    return DEFAULT_SAVED_WATERMARK;
  }
}

export function saveWatermarkSettings(saved: SavedWatermark) {
  try {
    localStorage.setItem(WATERMARK_STORAGE_KEY, JSON.stringify(saved));
  } catch (error) {
    console.error("Failed to save watermark settings:", error);
  }
}

// Merge the current watermark into the saved settings. Fields of the other
// kind keep their saved values.
export function toSaved(
  watermark: Watermark | null,
  previous: SavedWatermark,
): SavedWatermark {
  if (watermark === null) {
    return { ...previous, enabled: false };
  }
  const placement = {
    enabled: true,
    kind: watermark.kind,
    position: watermark.position,
    margin_percent: watermark.margin_percent,
    opacity: watermark.opacity,
    scale_percent: watermark.scale_percent,
    tile_enabled: watermark.tile !== null,
    tile_spacing_percent:
      watermark.tile?.spacing_percent ?? previous.tile_spacing_percent,
    tile_angle_degrees:
      watermark.tile?.angle_degrees ?? previous.tile_angle_degrees,
  };
  if (watermark.kind === "image") {
    return { ...previous, ...placement };
  }
  return {
    ...previous,
    ...placement,
    text: watermark.text,
    font: watermark.font,
    color: watermark.color,
    outline_enabled: watermark.outline !== null,
    outline_color: watermark.outline?.color ?? previous.outline_color,
    outline_width_percent:
      watermark.outline?.width_percent ?? previous.outline_width_percent,
  };
}

export function fromSaved(
  saved: SavedWatermark,
  kind: WatermarkKind = saved.kind,
): Watermark {
  const placement = {
    position: saved.position,
    margin_percent: saved.margin_percent,
    opacity: saved.opacity,
    scale_percent: saved.scale_percent,
    tile: saved.tile_enabled
      ? {
          spacing_percent: saved.tile_spacing_percent,
          angle_degrees: saved.tile_angle_degrees,
        }
      : null,
  };
  if (kind === "image") {
    return { kind: "image", path: "", ...placement };
  }
  return {
    kind: "text",
    text: saved.text,
    font: saved.font,
    color: saved.color,
    outline: saved.outline_enabled
      ? {
          color: saved.outline_color,
          width_percent: saved.outline_width_percent,
        }
      : null,
    ...placement,
  };
}

export function initialWatermark(): Watermark | null {
  const saved = loadSavedWatermark();
  return saved.enabled ? fromSaved(saved) : null;
}

// An enabled watermark without its image, text or font would fail every file
// or draw nothing
export function isWatermarkReady(watermark: Watermark | null): boolean {
  if (watermark === null) return true;
  return watermark.kind === "image"
    ? !!watermark.path
    : !!watermark.text.trim() && !!watermark.font;
}
