import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { DropZone } from "./DropZone";

// DropZone は Tauri の API（invoke / dialog / window のドラッグイベント）に
// 全面的に依存しているので、境界をまるごとモックして「何をどう呼ぶか」を検査する。
const invoke = vi.hoisted(() => vi.fn());
const open = vi.hoisted(() => vi.fn());
const onDragDropEvent = vi.hoisted(() => vi.fn());
const unlisten = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onDragDropEvent }),
}));

type DragDropPayload =
  | { type: "enter" }
  | { type: "over" }
  | { type: "drop"; paths: string[] }
  | { type: "leave" };

type DragDropHandler = (event: { payload: DragDropPayload }) => void;

// zustand の store はモジュール単位のシングルトンなので、
// テストごとに初期状態へ戻す。
const initialState = useAppStore.getState();

beforeEach(async () => {
  useAppStore.setState(initialState, true);
  await i18n.changeLanguage("en");

  vi.clearAllMocks();
  invoke.mockResolvedValue([]);
  open.mockResolvedValue(null);
  onDragDropEvent.mockResolvedValue(unlisten);

  // Tauri 環境だと判定させる（この目印が無いとリスナ登録自体が行われない）
  (window as unknown as Record<string, unknown>).__TAURI__ = {};

  // 失敗系のテストで console が汚れるので黙らせる
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// リスナ登録は非同期なので、解決を待ってから
// 登録済みハンドラを呼べる emit を返す。
async function renderDropZone() {
  const utils = render(<DropZone />);
  await act(async () => {});

  const { calls } = onDragDropEvent.mock;
  const handler = calls[calls.length - 1]?.[0] as DragDropHandler | undefined;

  const emit = async (payload: DragDropPayload) => {
    if (!handler) throw new Error("ドラッグイベントのハンドラが未登録");
    await act(async () => {
      handler({ payload });
    });
  };

  // 一番外側の枠。ドラッグ中のスタイルはここに載る。
  const zone = utils.container.firstElementChild as HTMLElement;

  return { ...utils, emit, zone };
}

function filePaths() {
  return useAppStore.getState().files.map((f) => f.path);
}

describe("DropZone", () => {
  describe("初期描画", () => {
    it("見出しと対応形式、2 つの選択ボタンを表示する", async () => {
      await renderDropZone();

      expect(
        screen.getByText("Drop images or folders here"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Supported: JPG, PNG, GIF, BMP, TIFF, WebP"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Select Files/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Select Folder/ }),
      ).toBeInTheDocument();
    });

    it("マウント時に Tauri のドラッグイベントを購読する", async () => {
      await renderDropZone();
      expect(onDragDropEvent).toHaveBeenCalledTimes(1);
    });

    it("Tauri 環境でなければ購読せず、警告だけ出す", async () => {
      // 実装は `"__TAURI__" in window` で判定するので、値を消す必要がある
      Reflect.deleteProperty(window, "__TAURI__");

      render(<DropZone />);
      await act(async () => {});

      expect(onDragDropEvent).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });

    it("アンマウント時に購読を解除する", async () => {
      const { unmount } = await renderDropZone();

      unmount();
      expect(unlisten).toHaveBeenCalledTimes(1);
    });
  });

  describe("ドラッグ中の見た目", () => {
    it("over でハイライトされ、leave で元に戻る", async () => {
      const { emit, zone } = await renderDropZone();

      expect(zone.className).not.toContain("border-indigo-400");

      await emit({ type: "over" });
      expect(zone.className).toContain("border-indigo-400");

      await emit({ type: "leave" });
      expect(zone.className).not.toContain("border-indigo-400");
    });

    it("drop でハイライトが解除される", async () => {
      const { emit, zone } = await renderDropZone();

      await emit({ type: "over" });
      await emit({ type: "drop", paths: ["/photos/a.png"] });

      expect(zone.className).not.toContain("border-indigo-400");
    });
  });

  describe("ドロップ", () => {
    it("ドロップされたパスを get_image_files に渡す", async () => {
      const { emit } = await renderDropZone();

      await emit({ type: "drop", paths: ["/photos", "/photos/a.png"] });

      expect(invoke).toHaveBeenCalledWith("get_image_files", {
        paths: ["/photos", "/photos/a.png"],
      });
    });

    it("Rust が返したパスだけを store に追加する（展開結果を採用する）", async () => {
      invoke.mockResolvedValue(["/photos/a.png", "/photos/b.jpg"]);
      const { emit } = await renderDropZone();

      await emit({ type: "drop", paths: ["/photos"] });

      expect(filePaths()).toEqual(["/photos/a.png", "/photos/b.jpg"]);
    });

    it("追加されるファイルは pending・サイズ 0 で、名前はパス末尾になる", async () => {
      invoke.mockResolvedValue(["/photos/sub/a.png"]);
      const { emit } = await renderDropZone();

      await emit({ type: "drop", paths: ["/photos"] });

      expect(useAppStore.getState().files).toEqual([
        {
          path: "/photos/sub/a.png",
          name: "a.png",
          size: 0,
          status: "pending",
        },
      ]);
    });

    it("Rust が空配列を返したら何も追加しない", async () => {
      invoke.mockResolvedValue([]);
      const { emit } = await renderDropZone();

      await emit({ type: "drop", paths: ["/empty-dir"] });

      expect(filePaths()).toEqual([]);
    });

    it("invoke が失敗しても落ちず、ファイルも増えない", async () => {
      invoke.mockRejectedValue(new Error("boom"));
      const { emit } = await renderDropZone();

      await emit({ type: "drop", paths: ["/photos/a.png"] });

      expect(filePaths()).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });

    it("処理中のドロップは無視される", async () => {
      useAppStore.setState({ processingState: "processing" });
      const { emit } = await renderDropZone();

      await emit({ type: "drop", paths: ["/photos/a.png"] });

      expect(invoke).not.toHaveBeenCalled();
      expect(filePaths()).toEqual([]);
    });
  });

  describe("ファイル選択ボタン", () => {
    it("画像拡張子で絞った複数選択ダイアログを開く", async () => {
      const user = userEvent.setup();
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Files/ }));

      expect(open).toHaveBeenCalledWith({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Images",
            extensions: [
              "jpg",
              "jpeg",
              "png",
              "gif",
              "bmp",
              "tiff",
              "tif",
              "webp",
            ],
          },
        ],
      });
    });

    it("選択された複数パスがそのまま get_image_files に渡る", async () => {
      const user = userEvent.setup();
      open.mockResolvedValue(["/photos/a.png", "/photos/b.jpg"]);
      invoke.mockResolvedValue(["/photos/a.png", "/photos/b.jpg"]);
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Files/ }));

      expect(invoke).toHaveBeenCalledWith("get_image_files", {
        paths: ["/photos/a.png", "/photos/b.jpg"],
      });
      expect(filePaths()).toEqual(["/photos/a.png", "/photos/b.jpg"]);
    });

    it("1 件だけ選ばれて文字列が返っても配列にして渡す", async () => {
      const user = userEvent.setup();
      open.mockResolvedValue("/photos/a.png");
      invoke.mockResolvedValue(["/photos/a.png"]);
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Files/ }));

      expect(invoke).toHaveBeenCalledWith("get_image_files", {
        paths: ["/photos/a.png"],
      });
    });

    it("キャンセル（null）のときは get_image_files を呼ばない", async () => {
      const user = userEvent.setup();
      open.mockResolvedValue(null);
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Files/ }));

      expect(invoke).not.toHaveBeenCalled();
      expect(filePaths()).toEqual([]);
    });

    it("ダイアログが失敗しても落ちない", async () => {
      const user = userEvent.setup();
      open.mockRejectedValue(new Error("dialog failed"));
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Files/ }));

      expect(invoke).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("フォルダ選択ボタン", () => {
    it("ディレクトリ選択ダイアログを開く", async () => {
      const user = userEvent.setup();
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Folder/ }));

      expect(open).toHaveBeenCalledWith({
        multiple: false,
        directory: true,
      });
    });

    it("選んだフォルダを get_image_files に渡し、展開結果を追加する", async () => {
      const user = userEvent.setup();
      open.mockResolvedValue("/photos");
      invoke.mockResolvedValue(["/photos/a.png", "/photos/b.jpg"]);
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Folder/ }));

      expect(invoke).toHaveBeenCalledWith("get_image_files", {
        paths: ["/photos"],
      });
      expect(filePaths()).toEqual(["/photos/a.png", "/photos/b.jpg"]);
    });

    it("キャンセル（null）のときは get_image_files を呼ばない", async () => {
      const user = userEvent.setup();
      open.mockResolvedValue(null);
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Folder/ }));

      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("処理中", () => {
    it("2 つの選択ボタンが無効化される", async () => {
      useAppStore.setState({ processingState: "processing" });
      await renderDropZone();

      expect(
        screen.getByRole("button", { name: /Select Files/ }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /Select Folder/ }),
      ).toBeDisabled();
    });

    it("クリックしてもダイアログは開かない", async () => {
      const user = userEvent.setup();
      useAppStore.setState({ processingState: "processing" });
      await renderDropZone();

      await user.click(screen.getByRole("button", { name: /Select Files/ }));
      await user.click(screen.getByRole("button", { name: /Select Folder/ }));

      expect(open).not.toHaveBeenCalled();
    });
  });
});
