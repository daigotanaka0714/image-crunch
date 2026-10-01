import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { ProcessingOptions, Watermark } from "../types";

// Longest side of the preview, in px
export const PREVIEW_MAX_SIDE = 800;
// Shortest time between two preview requests while settings keep changing
export const PREVIEW_INTERVAL_MS = 100;

// The settings that change how the preview looks
export interface PreviewRequest {
  path: string;
  width: number | null;
  height: number | null;
  watermark: Watermark | null;
}

export interface WatermarkPreview {
  // Object URL of the PNG
  url: string | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: WatermarkPreview = { url: null, loading: false, error: null };

function renderPreview(request: PreviewRequest) {
  return invoke<ArrayBuffer>("render_preview", {
    ...request,
    maxSide: PREVIEW_MAX_SIDE,
  });
}

// Sends preview requests at most every PREVIEW_INTERVAL_MS, one at a time.
// Changes made while a request is in flight are merged into the next one.
export class PreviewScheduler {
  private latest: PreviewRequest | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private queued = false;
  // Bumped when the preview is cleared, so earlier results are dropped
  private generation = 0;
  private state = EMPTY;

  constructor(
    private readonly listener: (preview: WatermarkPreview) => void,
    private readonly render = renderPreview,
  ) {}

  request(next: PreviewRequest | null) {
    this.latest = next;
    if (next === null) {
      this.queued = false;
      this.generation += 1;
      this.update({ url: null, loading: false, error: null });
      return;
    }
    this.update({ loading: true });
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.send();
      }, PREVIEW_INTERVAL_MS);
    }
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.request(null);
  }

  private send() {
    const request = this.latest;
    if (request === null) return;
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    this.inFlight = true;
    const generation = this.generation;
    const current = () => generation === this.generation;
    this.render(request)
      .then((bytes) => {
        if (!current()) return;
        const blob = new Blob([bytes], { type: "image/png" });
        this.update({ url: URL.createObjectURL(blob), error: null });
      })
      .catch((reason) => {
        if (!current()) return;
        this.update({ url: null, error: String(reason) });
      })
      .finally(() => {
        this.inFlight = false;
        if (this.queued) {
          this.queued = false;
          this.send();
        } else if (this.latest === request) {
          this.update({ loading: false });
        }
      });
  }

  private update(patch: Partial<WatermarkPreview>) {
    const next = { ...this.state, ...patch };
    if (this.state.url && this.state.url !== next.url) {
      URL.revokeObjectURL(this.state.url);
    }
    this.state = next;
    this.listener(next);
  }
}

// What the request for `path` with `options` looks like, or null when there
// is nothing to preview. An image watermark without a file previews the
// image as it is.
export function previewRequest(
  path: string | null,
  options: ProcessingOptions,
): PreviewRequest | null {
  if (path === null || options.watermark === null) return null;
  const { width, height, watermark } = options;
  const hasMark = watermark.kind !== "image" || watermark.path !== "";
  return { path, width, height, watermark: hasMark ? watermark : null };
}

// Render `path` with the watermark through the conversion code in Rust
export function useWatermarkPreview(
  path: string | null,
  options: ProcessingOptions,
): WatermarkPreview {
  const [preview, setPreview] = useState(EMPTY);
  const [scheduler] = useState(() => new PreviewScheduler(setPreview));

  // A string, so that only a change in what is drawn sends a request
  const request = previewRequest(path, options);
  const key = request === null ? null : JSON.stringify(request);

  useEffect(() => {
    scheduler.request(key === null ? null : JSON.parse(key));
  }, [key, scheduler]);

  useEffect(() => () => scheduler.dispose(), [scheduler]);

  return preview;
}
