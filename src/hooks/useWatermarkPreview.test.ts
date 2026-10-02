import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingOptions, TextWatermark } from "../types";
import {
  PREVIEW_INTERVAL_MS,
  type PreviewRequest,
  PreviewScheduler,
  previewRequest,
  type WatermarkPreview,
} from "./useWatermarkPreview";

const TEXT: TextWatermark = {
  kind: "text",
  text: "© Example",
  font: "Helvetica",
  color: "#ffffff",
  outline: null,
  position: "bottom_right",
  margin_percent: 2,
  opacity: 50,
  scale_percent: 20,
  tile: null,
};

const OPTIONS: ProcessingOptions = {
  format: "webp",
  quality: 80,
  width: null,
  height: null,
  keep_metadata: false,
  compression: "lossy",
  watermark: TEXT,
};

const request = (scale_percent: number, path = "/a.png"): PreviewRequest => ({
  path,
  width: null,
  height: null,
  watermark: { ...TEXT, scale_percent },
});

// A render call that resolves or rejects when the test says so
interface Pending {
  request: PreviewRequest;
  resolve: (bytes: ArrayBuffer) => void;
  reject: (reason: unknown) => void;
}

let pending: Pending[];
let states: WatermarkPreview[];
let scheduler: PreviewScheduler;
let urls: number;

const lastState = () => states[states.length - 1];

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  pending = [];
  states = [];
  urls = 0;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => {
      urls += 1;
      return `blob:${urls}`;
    }),
    revokeObjectURL: vi.fn(),
  });
  scheduler = new PreviewScheduler(
    (state) => states.push(state),
    (next) =>
      new Promise((resolve, reject) => {
        pending.push({ request: next, resolve, reject });
      }),
  );
});

afterEach(() => {
  scheduler.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("previewRequest", () => {
  it("リサイズとウォーターマークだけを送る", () => {
    expect(
      previewRequest("/a.png", { ...OPTIONS, width: 640, quality: 10 }),
    ).toEqual({ path: "/a.png", width: 640, height: null, watermark: TEXT });
  });

  it("ファイルかウォーターマークが無ければ何も送らない", () => {
    expect(previewRequest(null, OPTIONS)).toBeNull();
    expect(
      previewRequest("/a.png", { ...OPTIONS, watermark: null }),
    ).toBeNull();
  });

  it("画像ファイル未指定の画像ウォーターマークは元の画像だけを描く", () => {
    const options: ProcessingOptions = {
      ...OPTIONS,
      watermark: { ...TEXT, kind: "image", path: "" },
    };
    expect(previewRequest("/a.png", options)?.watermark).toBeNull();
  });
});

describe("PreviewScheduler", () => {
  it("間隔内の変更はまとめて、最後の設定で 1 回だけ描く", async () => {
    scheduler.request(request(10));
    scheduler.request(request(20));
    scheduler.request(request(30));
    expect(lastState().loading).toBe(true);

    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS - 1);
    expect(pending).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(pending.map((p) => p.request)).toEqual([request(30)]);
  });

  it("描画中の変更は待たせ、終わったら最新の設定だけを描く", async () => {
    scheduler.request(request(10));
    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);
    scheduler.request(request(20));
    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);
    scheduler.request(request(30));
    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);
    expect(pending).toHaveLength(1);

    pending[0].resolve(new ArrayBuffer(1));
    await settle();

    // 描き終えた分は表示し、読み込み中のまま次を描く
    expect(lastState()).toMatchObject({ url: "blob:1", loading: true });
    expect(pending.map((p) => p.request)).toEqual([request(10), request(30)]);

    pending[1].resolve(new ArrayBuffer(1));
    await settle();
    expect(lastState()).toEqual({ url: "blob:2", loading: false, error: null });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("描けなかったら画像を消してエラーを出す", async () => {
    scheduler.request(request(10));
    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);
    pending[0].resolve(new ArrayBuffer(1));
    await settle();

    scheduler.request(request(20));
    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);
    pending[1].reject("Failed to read image: gone");
    await settle();

    expect(lastState()).toEqual({
      url: null,
      loading: false,
      error: "Failed to read image: gone",
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("消したあとに届いた結果は表示しない", async () => {
    scheduler.request(request(10, "/old.png"));
    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);
    scheduler.request(null);
    scheduler.request(request(10, "/new.png"));
    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);

    pending[0].resolve(new ArrayBuffer(1));
    await settle();

    expect(lastState().url).toBeNull();
    expect(pending.map((p) => p.request.path)).toEqual([
      "/old.png",
      "/new.png",
    ]);
  });
});
