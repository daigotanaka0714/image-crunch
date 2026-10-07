import { beforeEach, describe, expect, it } from "vitest";
import type { FileItem } from "../types";
import { previewTarget, useAppStore } from "./useAppStore";

function makeFile(path: string, overrides: Partial<FileItem> = {}): FileItem {
  return {
    path,
    name: path.split("/").pop() ?? path,
    size: 1000,
    status: "pending",
    ...overrides,
  };
}

// zustand の store はモジュール単位のシングルトンなので、
// テストごとに初期状態へ戻す。
const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

describe("useAppStore", () => {
  describe("addFiles", () => {
    it("ファイルを追加できる", () => {
      useAppStore.getState().addFiles([makeFile("/a.png"), makeFile("/b.png")]);
      expect(useAppStore.getState().files.map((f) => f.path)).toEqual([
        "/a.png",
        "/b.png",
      ]);
    });

    it("同じ path のファイルは重複して追加されない", () => {
      useAppStore.getState().addFiles([makeFile("/a.png")]);
      useAppStore.getState().addFiles([makeFile("/a.png"), makeFile("/b.png")]);
      expect(useAppStore.getState().files.map((f) => f.path)).toEqual([
        "/a.png",
        "/b.png",
      ]);
    });
  });

  describe("removeFile", () => {
    it("指定した path のファイルだけ消える", () => {
      useAppStore.getState().addFiles([makeFile("/a.png"), makeFile("/b.png")]);
      useAppStore.getState().removeFile("/a.png");
      expect(useAppStore.getState().files.map((f) => f.path)).toEqual([
        "/b.png",
      ]);
    });

    it("存在しない path を渡しても何も起きない", () => {
      useAppStore.getState().addFiles([makeFile("/a.png")]);
      useAppStore.getState().removeFile("/zzz.png");
      expect(useAppStore.getState().files).toHaveLength(1);
    });
  });

  describe("プレビューの対象ファイル", () => {
    const files = [makeFile("/a.png"), makeFile("/b.png")];

    it("選んだファイルを返し、選択が無ければ先頭を返す", () => {
      expect(previewTarget(files, "/b.png")?.path).toBe("/b.png");
      expect(previewTarget(files, null)?.path).toBe("/a.png");
      expect(previewTarget(files, "/gone.png")?.path).toBe("/a.png");
      expect(previewTarget([], null)).toBeNull();
    });

    it("選んだファイルを消すと選択も外れ、他を消しても残る", () => {
      const { addFiles, selectFile, removeFile } = useAppStore.getState();
      addFiles([...files, makeFile("/c.png")]);
      selectFile("/b.png");

      removeFile("/c.png");
      expect(useAppStore.getState().selectedPath).toBe("/b.png");

      removeFile("/b.png");
      expect(useAppStore.getState().selectedPath).toBeNull();
    });

    it("すべてクリアと reset で選択が外れる", () => {
      useAppStore.getState().addFiles(files);
      useAppStore.getState().selectFile("/b.png");
      useAppStore.getState().clearFiles();
      expect(useAppStore.getState().selectedPath).toBeNull();

      useAppStore.getState().addFiles(files);
      useAppStore.getState().selectFile("/b.png");
      useAppStore.getState().reset();
      expect(useAppStore.getState().selectedPath).toBeNull();
    });
  });

  describe("updateFileStatus", () => {
    it("対象ファイルの status と結果が更新される", () => {
      useAppStore.getState().addFiles([makeFile("/a.png"), makeFile("/b.png")]);
      useAppStore.getState().updateFileStatus("/a.png", "completed", {
        outputPath: "/a.webp",
        outputSize: 400,
        reductionPercent: 60,
      });

      const [a, b] = useAppStore.getState().files;
      expect(a).toMatchObject({
        status: "completed",
        outputPath: "/a.webp",
        outputSize: 400,
        reductionPercent: 60,
      });
      // 他のファイルは巻き添えにならない
      expect(b.status).toBe("pending");
    });
  });

  describe("markFileProcessing", () => {
    it("pending のファイルだけが processing になる", () => {
      useAppStore
        .getState()
        .addFiles([
          makeFile("/a.png"),
          makeFile("/b.png", { status: "completed" }),
          makeFile("/c.png", { status: "error" }),
        ]);

      for (const path of ["/a.png", "/b.png", "/c.png"]) {
        useAppStore.getState().markFileProcessing(path);
      }

      expect(useAppStore.getState().files.map((f) => f.status)).toEqual([
        "processing",
        "completed",
        "error",
      ]);
    });
  });

  describe("clearProcessingStatuses", () => {
    it("processing のファイルだけが pending に戻り、結果は残る", () => {
      useAppStore
        .getState()
        .addFiles([
          makeFile("/a.png", { status: "processing" }),
          makeFile("/b.png", { status: "completed", reductionPercent: 60 }),
          makeFile("/c.png", { status: "error", error: "失敗" }),
        ]);

      useAppStore.getState().clearProcessingStatuses();

      expect(useAppStore.getState().files).toMatchObject([
        { status: "pending" },
        { status: "completed", reductionPercent: 60 },
        { status: "error", error: "失敗" },
      ]);
    });
  });

  describe("resetFileStatuses", () => {
    it("status と結果だけが初期化され、ファイル自体は残る", () => {
      useAppStore.getState().addFiles([makeFile("/a.png")]);
      useAppStore.getState().updateFileStatus("/a.png", "completed", {
        outputPath: "/a.webp",
        outputSize: 400,
        reductionPercent: 60,
        error: "何かのエラー",
      });
      useAppStore.getState().resetFileStatuses();

      const [a] = useAppStore.getState().files;
      expect(a.path).toBe("/a.png");
      expect(a.status).toBe("pending");
      expect(a.outputPath).toBeUndefined();
      expect(a.outputSize).toBeUndefined();
      expect(a.reductionPercent).toBeUndefined();
      expect(a.error).toBeUndefined();
    });
  });

  describe("setOptions", () => {
    it("渡した項目だけが上書きされる", () => {
      const before = useAppStore.getState().options;
      useAppStore.getState().setOptions({ quality: 50 });

      const after = useAppStore.getState().options;
      expect(after.quality).toBe(50);
      expect(after.format).toBe(before.format);
      expect(after.compression).toBe(before.compression);
    });
  });

  describe("clearFiles", () => {
    it("ファイルと結果が消え、状態が idle に戻る", () => {
      useAppStore.getState().addFiles([makeFile("/a.png")]);
      useAppStore.getState().setProcessingState("completed");
      useAppStore.getState().clearFiles();

      expect(useAppStore.getState().files).toEqual([]);
      expect(useAppStore.getState().batchStats).toBeNull();
      expect(useAppStore.getState().processingState).toBe("idle");
    });
  });

  describe("reset", () => {
    it("処理まわりの状態が初期化される。出力先は保持される", () => {
      useAppStore.getState().addFiles([makeFile("/a.png")]);
      useAppStore.getState().setOutputDir("/out");
      useAppStore.getState().setError("失敗しました");
      useAppStore.getState().setProcessingState("error");
      useAppStore.getState().reset();

      expect(useAppStore.getState().files).toEqual([]);
      expect(useAppStore.getState().error).toBeNull();
      expect(useAppStore.getState().processingState).toBe("idle");
      // 出力先はユーザーが選んだ設定なので reset では消さない
      expect(useAppStore.getState().outputDir).toBe("/out");
    });
  });
});
