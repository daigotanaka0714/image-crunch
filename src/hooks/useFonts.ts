import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  loadSavedWatermark,
  saveWatermarkSettings,
} from "../store/watermarkSettings";
import type { FontInfo, FontList } from "../types";

export interface FontReplacement {
  missing: string;
  replacement: string;
}

// Put the default font in place of a font that is unset or not installed.
// Returns what was replaced when a saved font was missing.
export function resolveWatermarkFont(list: FontList): FontReplacement | null {
  const { options, setOptions } = useAppStore.getState();
  const { watermark } = options;
  const current =
    watermark?.kind === "text" ? watermark.font : loadSavedWatermark().font;
  if (current && list.fonts.some((font) => font.id === current)) {
    return null;
  }

  const replacement = list.default_font ?? "";
  if (watermark?.kind === "text") {
    setOptions({ watermark: { ...watermark, font: replacement } });
  } else {
    saveWatermarkSettings({ ...loadSavedWatermark(), font: replacement });
  }
  return current && replacement ? { missing: current, replacement } : null;
}

// Load the system fonts once and fix up the watermark font against them
export function useSystemFonts() {
  const [fonts, setFonts] = useState<FontInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [replacement, setReplacement] = useState<FontReplacement | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<FontList>("list_fonts")
      .then((list) => {
        if (cancelled) return;
        setFonts(list.fonts);
        setReplacement(resolveWatermarkFont(list));
      })
      .catch((error) => {
        console.error("Failed to list fonts:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    fonts,
    failed,
    replacement,
    dismissReplacement: () => setReplacement(null),
  };
}

const MISSING_GLYPHS_DELAY_MS = 200;

// Characters of `text` that `font` cannot draw, checked after typing pauses
export function useMissingGlyphs(font: string | null, text: string | null) {
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    if (!font || !text?.trim()) {
      setMissing([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      invoke<string[]>("find_missing_glyphs", { font, text })
        .then((chars) => {
          if (!cancelled) setMissing(chars);
        })
        .catch((error) => {
          console.error("Failed to check glyphs:", error);
          if (!cancelled) setMissing([]);
        });
    }, MISSING_GLYPHS_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [font, text]);

  return missing;
}
