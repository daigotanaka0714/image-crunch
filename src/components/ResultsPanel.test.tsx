import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { useAppStore } from "../store/useAppStore";
import type { BatchStats } from "../types";
import { ResultsPanel } from "./ResultsPanel";

function makeStats(overrides: Partial<BatchStats> = {}): BatchStats {
  return {
    total_files: 10,
    processed_files: 10,
    successful_files: 10,
    failed_files: 0,
    total_original_size: 1024 * 1024,
    total_output_size: 1024 * 512,
    overall_reduction_percent: 50,
    average_reduction_percent: 50,
    median_reduction_percent: 50,
    ...overrides,
  };
}

// 完了状態の ResultsPanel を描画する。統計以外の状態は毎回同じにしておく。
function renderCompleted(overrides: Partial<BatchStats> = {}) {
  useAppStore.getState().setBatchStats(makeStats(overrides));
  useAppStore.getState().setProcessingState("completed");
  return render(<ResultsPanel />);
}

// 統計カードは「値の div」→「ラベルの div」の順に並ぶ。
// ラベルから引くことで、どの数値がどの指標なのかまで検査する。
function statValueFor(label: string): string | undefined {
  return (
    screen.getByText(label).previousElementSibling?.textContent ?? undefined
  );
}

// zustand の store はモジュール単位のシングルトンなので、
// テストごとに初期状態へ戻す。
const initialState = useAppStore.getState();

beforeEach(async () => {
  useAppStore.setState(initialState, true);
  await i18n.changeLanguage("en");
});

describe("ResultsPanel", () => {
  it("処理前（idle）のときは何も描画しない", () => {
    const { container } = render(<ResultsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("完了状態でも統計が無ければ何も描画しない", () => {
    useAppStore.getState().setProcessingState("completed");
    const { container } = render(<ResultsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("処理中は進捗を表示し、統計は表示しない", () => {
    useAppStore.getState().setProgress({
      current: 3,
      total: 10,
      current_file: "/tmp/images/photo.png",
      percent: 30,
    });
    useAppStore.getState().setBatchStats(makeStats());
    useAppStore.getState().setProcessingState("processing");

    render(<ResultsPanel />);

    // 進捗率は整数（小数点以下なし）で表示される
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    // 統計側は出さない
    expect(screen.queryByText("Processed")).not.toBeInTheDocument();
  });

  describe("件数の表示", () => {
    it("成功件数と全体件数を表示する", () => {
      renderCompleted({
        total_files: 10,
        successful_files: 8,
        failed_files: 2,
      });

      expect(screen.getByText("Processed")).toBeInTheDocument();
      expect(screen.getByText("8 / 10 files")).toBeInTheDocument();
    });

    it("失敗が 0 件のときは失敗の行を出さない", () => {
      renderCompleted({ failed_files: 0 });

      expect(screen.queryByText(/Failed:/)).not.toBeInTheDocument();
    });

    it("失敗があるときは失敗件数を表示する", () => {
      renderCompleted({
        total_files: 10,
        successful_files: 7,
        failed_files: 3,
      });

      expect(screen.getByText("Failed: 3 file(s)")).toBeInTheDocument();
    });
  });

  describe("削減率の表示", () => {
    it("全体・平均・中央値がそれぞれのラベルの値として小数第1位まで表示される", () => {
      renderCompleted({
        overall_reduction_percent: 62.34,
        average_reduction_percent: 58.06,
        median_reduction_percent: 60,
      });

      expect(statValueFor("Overall")).toBe("62.3%");
      expect(statValueFor("Average")).toBe("58.1%");
      expect(statValueFor("Median")).toBe("60.0%");
    });

    it("0% と 100% も小数第1位まで表示される", () => {
      renderCompleted({
        overall_reduction_percent: 0,
        average_reduction_percent: 100,
        median_reduction_percent: 0,
      });

      expect(statValueFor("Overall")).toBe("0.0%");
      expect(statValueFor("Average")).toBe("100.0%");
      expect(statValueFor("Median")).toBe("0.0%");
    });

    it("マイナスの削減率（サイズが増えた場合）も符号付きで表示される", () => {
      renderCompleted({ overall_reduction_percent: -12.5 });

      expect(statValueFor("Overall")).toBe("-12.5%");
    });
  });

  describe("合計サイズの表示", () => {
    it("変換前と変換後の合計サイズを表示する", () => {
      renderCompleted({
        total_original_size: 1024 * 1024 * 2,
        total_output_size: 1024 * 700,
      });

      expect(screen.getByText("2 MB")).toBeInTheDocument();
      expect(screen.getByText("700 KB")).toBeInTheDocument();
    });

    it.each([
      [0, "0 B"],
      [512, "512 B"],
      [1023, "1023 B"],
      [1024, "1 KB"],
      [1536, "1.5 KB"],
      [1024 * 1024, "1 MB"],
      [Math.round(1024 * 1024 * 1.25), "1.3 MB"],
      [1024 * 1024 * 1024 * 3, "3 GB"],
    ])("変換前の合計 %i バイトは %s と表記される", (bytes, expected) => {
      // 変換後は検査対象と重ならない値に固定しておく
      renderCompleted({
        total_original_size: bytes,
        total_output_size: 1024 * 99,
      });

      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  describe("端のケース", () => {
    it("0 件（すべて 0）でも壊れずに描画される", () => {
      renderCompleted({
        total_files: 0,
        processed_files: 0,
        successful_files: 0,
        failed_files: 0,
        total_original_size: 0,
        total_output_size: 0,
        overall_reduction_percent: 0,
        average_reduction_percent: 0,
        median_reduction_percent: 0,
      });

      expect(screen.getByText("Results")).toBeInTheDocument();
      expect(screen.getByText("0 / 0 files")).toBeInTheDocument();
      // 変換前・変換後ともに 0 B
      expect(screen.getAllByText("0 B")).toHaveLength(2);
      expect(screen.queryByText(/Failed:/)).not.toBeInTheDocument();
    });

    it("全件失敗でも壊れずに描画される", () => {
      renderCompleted({
        total_files: 3,
        processed_files: 3,
        successful_files: 0,
        failed_files: 3,
        total_original_size: 1024 * 300,
        total_output_size: 0,
        overall_reduction_percent: 0,
        average_reduction_percent: 0,
        median_reduction_percent: 0,
      });

      expect(screen.getByText("0 / 3 files")).toBeInTheDocument();
      expect(screen.getByText("Failed: 3 file(s)")).toBeInTheDocument();
      expect(screen.getByText("300 KB")).toBeInTheDocument();
      expect(screen.getByText("0 B")).toBeInTheDocument();
    });
  });

  it("日本語に切り替えるとラベルも日本語になる", async () => {
    await i18n.changeLanguage("ja");
    renderCompleted({ total_files: 10, successful_files: 8, failed_files: 2 });

    expect(screen.getByText("結果")).toBeInTheDocument();
    expect(screen.getByText("8 / 10 ファイル")).toBeInTheDocument();
    // 失敗件数の行だけ英語固定になっていた回帰を防ぐ
    expect(screen.getByText("2 ファイルが失敗しました")).toBeInTheDocument();
    expect(screen.queryByText(/Failed:/)).not.toBeInTheDocument();
  });
});
