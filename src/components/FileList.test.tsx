import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { useAppStore } from "../store/useAppStore";
import type { FileItem } from "../types";
import { FileList } from "./FileList";

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

beforeEach(async () => {
  useAppStore.setState(initialState, true);
  await i18n.changeLanguage("en");
});

function setFiles(files: FileItem[]) {
  useAppStore.setState({ files });
}

describe("FileList", () => {
  describe("一覧の描画", () => {
    it("ファイルが 1 つも無いときは何も描画しない", () => {
      const { container } = render(<FileList />);
      expect(container).toBeEmptyDOMElement();
    });

    it("追加されたファイルの名前が並ぶ", () => {
      setFiles([makeFile("/photos/a.png"), makeFile("/photos/b.jpg")]);
      render(<FileList />);

      expect(screen.getByText("a.png")).toBeInTheDocument();
      expect(screen.getByText("b.jpg")).toBeInTheDocument();
    });

    it("ファイル名にはフルパスが title として付く", () => {
      setFiles([makeFile("/photos/a.png")]);
      render(<FileList />);

      expect(screen.getByText("a.png")).toHaveAttribute(
        "title",
        "/photos/a.png",
      );
    });

    it("ヘッダーにファイル数が表示される", () => {
      setFiles([makeFile("/a.png"), makeFile("/b.png"), makeFile("/c.png")]);
      render(<FileList />);

      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  describe("削除ボタン", () => {
    it("クリックしたファイルだけが store から消える", async () => {
      const user = userEvent.setup();
      setFiles([makeFile("/photos/a.png"), makeFile("/photos/b.jpg")]);
      render(<FileList />);

      const [firstRemove] = screen.getAllByRole("button", { name: "Remove" });
      await user.click(firstRemove);

      expect(useAppStore.getState().files.map((f) => f.path)).toEqual([
        "/photos/b.jpg",
      ]);
      expect(screen.queryByText("a.png")).not.toBeInTheDocument();
      expect(screen.getByText("b.jpg")).toBeInTheDocument();
    });

    it("pending のファイルにだけ表示される", () => {
      setFiles([
        makeFile("/a.png"),
        makeFile("/b.png", { status: "processing" }),
        makeFile("/c.png", { status: "completed" }),
        makeFile("/d.png", { status: "error" }),
      ]);
      render(<FileList />);

      expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    });

    it("処理中は無効化される", () => {
      setFiles([makeFile("/a.png")]);
      useAppStore.setState({ processingState: "processing" });
      render(<FileList />);

      expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    });
  });

  describe("すべてクリア", () => {
    it("クリックすると全ファイルが消える", async () => {
      const user = userEvent.setup();
      setFiles([makeFile("/a.png"), makeFile("/b.png")]);
      render(<FileList />);

      await user.click(screen.getByRole("button", { name: /Clear All/ }));

      expect(useAppStore.getState().files).toEqual([]);
    });

    it("処理中は無効化され、クリックしてもファイルは消えない", async () => {
      const user = userEvent.setup();
      setFiles([makeFile("/a.png")]);
      useAppStore.setState({ processingState: "processing" });
      render(<FileList />);

      const clearButton = screen.getByRole("button", { name: /Clear All/ });
      expect(clearButton).toBeDisabled();

      await user.click(clearButton);
      expect(useAppStore.getState().files).toHaveLength(1);
    });
  });

  describe("status ごとの表示", () => {
    it("pending は結果もエラーも出さず、削除ボタンだけを持つ", () => {
      setFiles([makeFile("/a.png")]);
      render(<FileList />);

      expect(screen.getByText("a.png")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
      expect(screen.queryByText(/reduced/)).not.toBeInTheDocument();
    });

    it("processing は削除ボタンを出さない", () => {
      setFiles([makeFile("/a.png", { status: "processing" })]);
      render(<FileList />);

      expect(screen.getByText("a.png")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Remove" }),
      ).not.toBeInTheDocument();
    });

    it("completed は出力ファイル名と削減率を出す", () => {
      setFiles([
        makeFile("/photos/a.png", {
          status: "completed",
          outputPath: "/out/a.webp",
          outputSize: 400,
          reductionPercent: 60,
        }),
      ]);
      render(<FileList />);

      expect(screen.getByText(/a\.webp/)).toBeInTheDocument();
      expect(screen.getByText(/60\.0% reduced/)).toBeInTheDocument();
    });

    it("completed でも削減率が無ければ結果行は出ない", () => {
      setFiles([
        makeFile("/photos/a.png", {
          status: "completed",
          outputPath: "/out/a.webp",
        }),
      ]);
      render(<FileList />);

      expect(screen.queryByText(/reduced/)).not.toBeInTheDocument();
    });

    it("error はエラーメッセージを出す", () => {
      setFiles([
        makeFile("/a.png", { status: "error", error: "変換に失敗しました" }),
      ]);
      render(<FileList />);

      expect(screen.getByText("変換に失敗しました")).toBeInTheDocument();
    });

    it("完了数と失敗数がヘッダーに集計される", () => {
      setFiles([
        makeFile("/a.png", { status: "completed" }),
        makeFile("/b.png", { status: "completed" }),
        makeFile("/c.png", { status: "error", error: "失敗" }),
        makeFile("/d.png"),
      ]);
      render(<FileList />);

      // 全体件数 4 / 完了 2 / 失敗 1
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("完了も失敗も無いときは集計バッジを出さない", () => {
      setFiles([makeFile("/a.png"), makeFile("/b.png")]);
      render(<FileList />);

      // ファイル数のバッジだけが残る
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    });
  });
});
