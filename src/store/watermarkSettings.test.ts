import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextWatermark } from "../types";
import {
  DEFAULT_SAVED_WATERMARK,
  fromSaved,
  loadSavedWatermark,
  type SavedWatermark,
  sanitizeSavedWatermark,
  toSaved,
  WATERMARK_STORAGE_KEY,
} from "./watermarkSettings";

const VALID: SavedWatermark = {
  enabled: true,
  kind: "image",
  position: "top_left",
  margin_percent: 20,
  opacity: 1,
  scale_percent: 100,
  tile_enabled: true,
  tile_spacing_percent: 50,
  tile_angle_degrees: -90,
  text: "© Example",
  font: "Helvetica",
  color: "#A0b1C2",
  outline_enabled: true,
  outline_color: "#000000",
  outline_width_percent: 20,
};

beforeEach(() => {
  localStorage.clear();
});

describe("sanitizeSavedWatermark", () => {
  it("有効な値はそのまま残す（範囲の端を含む）", () => {
    expect(sanitizeSavedWatermark(VALID)).toEqual(VALID);
  });

  it.each([
    ["enabled", "yes"],
    ["kind", "both"],
    ["position", "upper_left"],
    ["margin_percent", 21],
    ["margin_percent", -1],
    ["opacity", 0],
    ["opacity", 101],
    ["scale_percent", 0],
    ["scale_percent", Number.NaN],
    ["scale_percent", "50"],
    ["text", 42],
    ["font", null],
    ["color", "red"],
    ["color", "#fff"],
    ["outline_enabled", 1],
    ["outline_color", "#0000000"],
    ["outline_width_percent", 0],
    ["outline_width_percent", 21],
    ["tile_enabled", "true"],
    ["tile_spacing_percent", -1],
    ["tile_spacing_percent", 51],
    ["tile_angle_degrees", -91],
    ["tile_angle_degrees", 91],
  ] as const)("%s が %s なら、その項目だけ既定値に戻す", (key, value) => {
    expect(sanitizeSavedWatermark({ ...VALID, [key]: value })).toEqual({
      ...VALID,
      [key]: DEFAULT_SAVED_WATERMARK[key],
    });
  });

  it.each([null, "text", 42, []])(
    "オブジェクトでない %s は全部既定値",
    (raw) => {
      expect(sanitizeSavedWatermark(raw)).toEqual(DEFAULT_SAVED_WATERMARK);
    },
  );

  it("欠けている項目は既定値で埋め、知らない項目は捨てる", () => {
    expect(
      sanitizeSavedWatermark({ text: "Only text", path: "/tmp/logo.png" }),
    ).toEqual({ ...DEFAULT_SAVED_WATERMARK, text: "Only text" });
  });
});

describe("loadSavedWatermark", () => {
  it("何も保存されていなければ既定値", () => {
    expect(loadSavedWatermark()).toEqual(DEFAULT_SAVED_WATERMARK);
  });

  it("壊れた JSON なら既定値", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    localStorage.setItem(WATERMARK_STORAGE_KEY, "{broken");

    expect(loadSavedWatermark()).toEqual(DEFAULT_SAVED_WATERMARK);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("toSaved / fromSaved", () => {
  const text: TextWatermark = {
    kind: "text",
    text: "© Example",
    font: "Helvetica",
    color: "#ff0000",
    outline: { color: "#00ff00", width_percent: 8 },
    position: "center",
    margin_percent: 3,
    opacity: 60,
    scale_percent: 40,
    tile: null,
  };

  it("文字ウォーターマークは保存して戻すと同じになる", () => {
    expect(fromSaved(toSaved(text, DEFAULT_SAVED_WATERMARK))).toEqual(text);
  });

  it("画像ウォーターマークはパスを保存せず、文字の設定は前の値を残す", () => {
    const previous = toSaved(text, DEFAULT_SAVED_WATERMARK);
    const saved = toSaved(
      {
        kind: "image",
        path: "/tmp/logo.png",
        position: "top_right",
        margin_percent: 1,
        opacity: 90,
        scale_percent: 10,
        tile: { spacing_percent: 20, angle_degrees: 45 },
      },
      previous,
    );

    expect(JSON.stringify(saved)).not.toContain("/tmp/logo.png");
    expect(fromSaved(saved)).toEqual({
      kind: "image",
      path: "",
      position: "top_right",
      margin_percent: 1,
      opacity: 90,
      scale_percent: 10,
      tile: { spacing_percent: 20, angle_degrees: 45 },
    });
    expect(fromSaved(saved, "text")).toEqual({
      ...text,
      position: "top_right",
      margin_percent: 1,
      opacity: 90,
      scale_percent: 10,
      tile: { spacing_percent: 20, angle_degrees: 45 },
    });
  });

  it("縁取りを外しても、色と太さは次に付けるときのために残す", () => {
    const saved = toSaved({ ...text, outline: null }, DEFAULT_SAVED_WATERMARK);

    expect(saved).toMatchObject({
      outline_enabled: false,
      outline_color: "#000000",
      outline_width_percent: 5,
    });
    expect(fromSaved(saved)).toMatchObject({ outline: null });
  });

  it("1 か所に戻しても、間隔と角度は次に敷き詰めるときのために残す", () => {
    const tiled = toSaved(
      { ...text, tile: { spacing_percent: 25, angle_degrees: -45 } },
      DEFAULT_SAVED_WATERMARK,
    );
    const single = toSaved({ ...text, tile: null }, tiled);

    expect(single).toMatchObject({
      tile_enabled: false,
      tile_spacing_percent: 25,
      tile_angle_degrees: -45,
    });
    expect(fromSaved(single)).toMatchObject({ tile: null });
  });

  it("オフにすると enabled だけが false になる", () => {
    const previous = toSaved(text, DEFAULT_SAVED_WATERMARK);

    expect(toSaved(null, previous)).toEqual({ ...previous, enabled: false });
  });
});
