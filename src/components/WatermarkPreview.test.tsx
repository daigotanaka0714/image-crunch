import { invoke } from "@tauri-apps/api/core";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_MAX_SIDE } from "../hooks/useWatermarkPreview";
import i18n from "../i18n";
import { useAppStore } from "../store/useAppStore";
import type { FileItem, TextWatermark } from "../types";
import { WatermarkPreview } from "./WatermarkPreview";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

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

function makeFile(path: string): FileItem {
  return {
    path,
    name: path.split("/").pop() ?? path,
    size: 1000,
    status: "pending",
  };
}

// zustand の store はモジュール単位のシングルトンなので、
// テストごとに初期状態へ戻す。
const initialState = useAppStore.getState();

beforeEach(async () => {
  useAppStore.setState(initialState, true);
  useAppStore.getState().setOptions({ watermark: TEXT });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(new ArrayBuffer(8));
  let urls = 0;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => {
      urls += 1;
      return `blob:${urls}`;
    }),
    revokeObjectURL: vi.fn(),
  });
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastPreviewCall = () => {
  const calls = invokeMock.mock.calls.filter(
    ([command]) => command === "render_preview",
  );
  return calls[calls.length - 1];
};

describe("WatermarkPreview", () => {
  it("ファイルが無ければ追加を促すだけで描かない", async () => {
    render(<WatermarkPreview />);

    expect(screen.getByText("Add images to see a preview")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("選択が無ければ先頭のファイルを、出力と同じリサイズで描く", async () => {
    useAppStore
      .getState()
      .addFiles([makeFile("/p/a.png"), makeFile("/p/b.png")]);
    useAppStore.getState().setOptions({ width: 640, height: 480 });
    render(<WatermarkPreview />);

    const image = await screen.findByRole("img", {
      name: "a.png with the watermark",
    });
    expect(image).toHaveAttribute("src", "blob:1");
    expect(lastPreviewCall()).toEqual([
      "render_preview",
      {
        path: "/p/a.png",
        width: 640,
        height: 480,
        watermark: TEXT,
        maxSide: PREVIEW_MAX_SIDE,
      },
    ]);
  });

  it("選んだファイルと変えた設定で描き直す", async () => {
    useAppStore
      .getState()
      .addFiles([makeFile("/p/a.png"), makeFile("/p/b.png")]);
    render(<WatermarkPreview />);
    await screen.findByRole("img", { name: "a.png with the watermark" });

    act(() => {
      useAppStore.getState().selectFile("/p/b.png");
      useAppStore.getState().setOptions({
        watermark: {
          ...TEXT,
          tile: { spacing_percent: 10, angle_degrees: 30 },
        },
      });
    });

    await screen.findByRole("img", { name: "b.png with the watermark" });
    await waitFor(() =>
      expect(lastPreviewCall()?.[1]).toMatchObject({
        path: "/p/b.png",
        watermark: { tile: { spacing_percent: 10, angle_degrees: 30 } },
      }),
    );
  });

  it("画質など見た目に関係しない設定では描き直さない", async () => {
    useAppStore.getState().addFiles([makeFile("/p/a.png")]);
    render(<WatermarkPreview />);
    await screen.findByRole("img");
    const calls = invokeMock.mock.calls.length;

    act(() => {
      useAppStore.getState().setOptions({ quality: 10, format: "png" });
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(invokeMock.mock.calls.length).toBe(calls);
  });

  it("描けなかったら理由を出す", async () => {
    invokeMock.mockRejectedValue("Failed to read image: gone");
    useAppStore.getState().addFiles([makeFile("/p/a.png")]);
    render(<WatermarkPreview />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not draw the preview: Failed to read image: gone",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
