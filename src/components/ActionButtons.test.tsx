import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { useAppStore } from "../store/useAppStore";
import type {
  BatchStats,
  FileItem,
  ProcessingResult,
  ProgressUpdate,
} from "../types";
import { ActionButtons } from "./ActionButtons";

// Tauri の API は jsdom では動かないので、境界ごとモックする。
// このコンポーネントの中身は「イベント購読 → store 更新」なので、
// listen に渡されたハンドラを掴んでおいて、テスト側から発火させる。
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

type EventHandler = (event: { payload: unknown }) => void;

// listen("イベント名", handler) の handler と、返した unlisten を控えておく。
const handlers = new Map<string, EventHandler>();
const unlisteners = new Map<string, ReturnType<typeof vi.fn>>();

// invoke("process_batch") は「まだ終わっていない Promise」を返す。
// これで処理中の見た目と、成功／失敗それぞれの後始末を検査できる。
// Rust 側の process_batch は BatchStats を返すので、解決値もそれに合わせる。
let finishInvoke: (stats?: BatchStats) => void = () => {};
let failInvoke: (reason: unknown) => void = () => {};

function makeFile(path: string, overrides: Partial<FileItem> = {}): FileItem {
  return {
    path,
    name: path.split("/").pop() ?? path,
    size: 1000,
    status: "pending",
    ...overrides,
  };
}

function makeStats(overrides: Partial<BatchStats> = {}): BatchStats {
  return {
    total_files: 1,
    processed_files: 1,
    successful_files: 1,
    failed_files: 0,
    total_original_size: 1000,
    total_output_size: 400,
    overall_reduction_percent: 60,
    average_reduction_percent: 60,
    median_reduction_percent: 60,
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<ProcessingResult> = {},
): ProcessingResult {
  return {
    original_path: "/photos/a.png",
    output_path: "/out/a.webp",
    original_size: 1000,
    output_size: 400,
    reduction_percent: 60,
    success: true,
    error: null,
    ...overrides,
  };
}

function makeProgress(overrides: Partial<ProgressUpdate> = {}): ProgressUpdate {
  return {
    current: 1,
    total: 2,
    current_file: "/photos/a.png",
    percent: 50,
    ...overrides,
  };
}

// 購読済みのイベントを発火する。store 更新を伴うので act() で包む。
async function emit(event: string, payload: unknown) {
  const handler = handlers.get(event);
  if (!handler) {
    throw new Error(`購読されていないイベント: ${event}`);
  }
  await act(async () => {
    handler({ payload });
  });
}

// 開始できる状態（ファイルあり・出力先あり）にする。
function setReady(files: FileItem[] = [makeFile("/photos/a.png")]) {
  useAppStore.setState({ files, outputDir: "/out" });
}

// ボタンは言語によって表示が変わるので、翻訳キー経由で引く。
function startButton() {
  return screen.getByRole("button", { name: i18n.t("actions.start") });
}

// キャンセルボタンを押す。
async function cancel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: i18n.t("actions.cancel") }),
  );
}

// 描画して開始ボタンを押し、invoke が呼ばれるところまで進める。
async function start() {
  const user = userEvent.setup();
  render(<ActionButtons />);
  await user.click(startButton());
  await waitFor(() => expect(invoke).toHaveBeenCalled());
  return user;
}

// zustand の store はモジュール単位のシングルトンなので、
// テストごとに初期状態へ戻す。
const initialState = useAppStore.getState();

beforeEach(async () => {
  useAppStore.setState(initialState, true);
  await i18n.changeLanguage("en");

  vi.clearAllMocks();
  handlers.clear();
  unlisteners.clear();

  vi.mocked(listen).mockImplementation(async (event, handler) => {
    handlers.set(event, handler as EventHandler);
    const unlisten = vi.fn();
    unlisteners.set(event, unlisten);
    return unlisten;
  });

  vi.mocked(invoke).mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        finishInvoke = (stats = makeStats()) => resolve(stats);
        failInvoke = reject;
      }),
  );

  vi.mocked(isPermissionGranted).mockResolvedValue(true);
  vi.mocked(requestPermission).mockResolvedValue("granted");

  // 失敗系のテストで実装が console.error を呼ぶので、出力を抑えておく。
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActionButtons", () => {
  describe("開始ボタンの活性", () => {
    it("ファイルも出力先も無ければ無効", () => {
      render(<ActionButtons />);

      expect(startButton()).toBeDisabled();
    });

    it("ファイルはあっても出力先が未選択なら無効", () => {
      useAppStore.setState({ files: [makeFile("/photos/a.png")] });
      render(<ActionButtons />);

      expect(startButton()).toBeDisabled();
    });

    it("出力先はあってもファイルが 0 件なら無効", () => {
      useAppStore.setState({ outputDir: "/out" });
      render(<ActionButtons />);

      expect(startButton()).toBeDisabled();
    });

    it("ファイルと出力先がそろえば有効になる", () => {
      setReady();
      render(<ActionButtons />);

      expect(startButton()).toBeEnabled();
    });

    it("処理中は無効になり、ラベルが処理中の表示に変わる", () => {
      setReady();
      useAppStore.setState({ processingState: "processing" });
      render(<ActionButtons />);

      const button = screen.getByRole("button", {
        name: i18n.t("actions.processing"),
      });
      expect(button).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: i18n.t("actions.start") }),
      ).not.toBeInTheDocument();
    });

    it("無効なときに押しても処理は始まらない", async () => {
      const user = userEvent.setup();
      render(<ActionButtons />);

      await user.click(startButton());

      expect(invoke).not.toHaveBeenCalled();
      // 開始条件を満たしていない旨のエラーも出ない（ボタンが無効なので押せない）
      expect(useAppStore.getState().error).toBeNull();
    });
  });

  describe("処理の開始", () => {
    it("選択中のファイルのパス・出力先・オプションを渡して process_batch を呼ぶ", async () => {
      setReady([makeFile("/photos/a.png"), makeFile("/photos/b.jpg")]);
      useAppStore.getState().setOptions({ format: "png", quality: 55 });
      await start();

      expect(invoke).toHaveBeenCalledWith("process_batch", {
        inputPaths: ["/photos/a.png", "/photos/b.jpg"],
        outputDir: "/out",
        options: useAppStore.getState().options,
      });
    });

    it("状態を processing にして、キャンセルボタンを出す", async () => {
      setReady();
      await start();

      expect(useAppStore.getState().processingState).toBe("processing");
      expect(
        screen.getByRole("button", { name: i18n.t("actions.cancel") }),
      ).toBeInTheDocument();
    });

    it("前回のエラー・統計・ファイルの状態をリセットしてから始める", async () => {
      setReady([
        makeFile("/photos/a.png", {
          status: "completed",
          outputPath: "/out/a.webp",
          outputSize: 400,
          reductionPercent: 60,
        }),
        makeFile("/photos/b.jpg", { status: "error", error: "前回の失敗" }),
      ]);
      useAppStore.setState({
        error: "前回のエラー",
        batchStats: makeStats(),
      });

      await start();

      const state = useAppStore.getState();
      expect(state.error).toBeNull();
      expect(state.batchStats).toBeNull();
      expect(state.files).toEqual([
        expect.objectContaining({
          path: "/photos/a.png",
          status: "pending",
          outputPath: undefined,
          outputSize: undefined,
          reductionPercent: undefined,
          error: undefined,
        }),
        expect.objectContaining({ path: "/photos/b.jpg", status: "pending" }),
      ]);
    });

    it("進捗・個別結果・完了の 3 つのイベントを購読する", async () => {
      setReady();
      await start();

      expect([...handlers.keys()]).toEqual([
        "processing-progress",
        "processing-result",
        "processing-complete",
      ]);
    });

    it("購読が終わってから process_batch を呼ぶ（イベントの取りこぼしを防ぐ）", async () => {
      setReady();
      await start();

      expect(listen).toHaveBeenCalledTimes(3);
      const listenOrder = vi.mocked(listen).mock.invocationCallOrder;
      const invokeOrder = vi.mocked(invoke).mock.invocationCallOrder[0];
      for (const order of listenOrder) {
        expect(order).toBeLessThan(invokeOrder);
      }
    });
  });

  describe("進捗イベント", () => {
    it("進捗を store に反映し、処理中のファイルに印を付ける", async () => {
      setReady([makeFile("/photos/a.png"), makeFile("/photos/b.jpg")]);
      await start();

      const progress = makeProgress({ current_file: "/photos/b.jpg" });
      await emit("processing-progress", progress);

      const state = useAppStore.getState();
      expect(state.progress).toEqual(progress);
      expect(state.files.map((f) => f.status)).toEqual([
        "pending",
        "processing",
      ]);
    });

    it("知らないパスが来ても他のファイルの状態は変わらない", async () => {
      setReady([makeFile("/photos/a.png")]);
      await start();

      await emit(
        "processing-progress",
        makeProgress({ current_file: "/photos/unknown.png" }),
      );

      expect(useAppStore.getState().files[0].status).toBe("pending");
    });
  });

  describe("個別ファイルの結果イベント", () => {
    it("成功なら completed にして出力パス・サイズ・削減率を入れる", async () => {
      setReady();
      await start();

      await emit(
        "processing-result",
        makeResult({
          original_path: "/photos/a.png",
          output_path: "/out/a.webp",
          output_size: 400,
          reduction_percent: 60,
        }),
      );

      expect(useAppStore.getState().files[0]).toMatchObject({
        status: "completed",
        outputPath: "/out/a.webp",
        outputSize: 400,
        reductionPercent: 60,
      });
    });

    it("失敗ならエラーメッセージを添えて error にする", async () => {
      setReady();
      await start();

      await emit(
        "processing-result",
        makeResult({ success: false, error: "変換に失敗しました" }),
      );

      expect(useAppStore.getState().files[0]).toMatchObject({
        status: "error",
        error: "変換に失敗しました",
      });
    });

    it("失敗の理由が無いときは既定の文言を入れる", async () => {
      setReady();
      await start();

      await emit("processing-result", makeResult({ success: false }));

      expect(useAppStore.getState().files[0].error).toBe("Unknown error");
    });

    it("失敗の理由が空文字のときも既定の文言を入れる", async () => {
      setReady();
      await start();

      await emit(
        "processing-result",
        makeResult({ success: false, error: "" }),
      );

      expect(useAppStore.getState().files[0].error).toBe("Unknown error");
    });

    it("既定の文言は言語設定に従う", async () => {
      await i18n.changeLanguage("ja");
      setReady();
      await start();

      await emit("processing-result", makeResult({ success: false }));

      expect(useAppStore.getState().files[0].error).toBe("不明なエラー");
    });
  });

  describe("完了イベント", () => {
    it("統計を保存して状態を completed にする", async () => {
      setReady();
      await start();

      const stats = makeStats({ successful_files: 3, total_files: 3 });
      await emit("processing-complete", stats);

      const state = useAppStore.getState();
      expect(state.batchStats).toEqual(stats);
      expect(state.processingState).toBe("completed");
    });

    it("完了するとキャンセルボタンが消え、開始ボタンに戻る", async () => {
      setReady();
      await start();

      await emit("processing-complete", makeStats());

      expect(
        screen.queryByRole("button", { name: i18n.t("actions.cancel") }),
      ).not.toBeInTheDocument();
      expect(startButton()).toBeEnabled();
    });
  });

  describe("完了通知", () => {
    it("許可済みなら成功件数と削減率を入れて通知する", async () => {
      setReady();
      await start();

      await emit(
        "processing-complete",
        makeStats({ successful_files: 8, overall_reduction_percent: 62.34 }),
      );

      await waitFor(() =>
        expect(sendNotification).toHaveBeenCalledWith({
          title: "Image Crunch",
          body: "Converted 8 images (62.3% reduction)",
        }),
      );
      expect(requestPermission).not.toHaveBeenCalled();
    });

    it("未許可なら許可を求め、得られたら通知する", async () => {
      vi.mocked(isPermissionGranted).mockResolvedValue(false);
      vi.mocked(requestPermission).mockResolvedValue("granted");
      setReady();
      await start();

      await emit("processing-complete", makeStats());

      await waitFor(() => expect(requestPermission).toHaveBeenCalled());
      expect(sendNotification).toHaveBeenCalled();
    });

    it("許可が得られなければ通知しない", async () => {
      vi.mocked(isPermissionGranted).mockResolvedValue(false);
      vi.mocked(requestPermission).mockResolvedValue("denied");
      setReady();
      await start();

      await emit("processing-complete", makeStats());

      await waitFor(() => expect(requestPermission).toHaveBeenCalled());
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("通知に失敗しても処理結果の表示は保たれる", async () => {
      vi.mocked(isPermissionGranted).mockRejectedValue(
        new Error("通知が使えない"),
      );
      setReady();
      await start();

      const stats = makeStats();
      await emit("processing-complete", stats);

      await waitFor(() => expect(console.error).toHaveBeenCalled());
      expect(sendNotification).not.toHaveBeenCalled();
      expect(useAppStore.getState().processingState).toBe("completed");
      expect(useAppStore.getState().batchStats).toEqual(stats);
    });

    it("通知の本文は言語設定に従う", async () => {
      await i18n.changeLanguage("ja");
      setReady();
      await start();

      await emit(
        "processing-complete",
        makeStats({ successful_files: 8, overall_reduction_percent: 62.34 }),
      );

      await waitFor(() =>
        expect(sendNotification).toHaveBeenCalledWith({
          title: "Image Crunch",
          body: "8枚の画像を変換しました（62.3%削減）",
        }),
      );
    });
  });

  describe("処理の失敗", () => {
    it("process_batch が失敗したらエラー文言を残して error 状態にする", async () => {
      setReady();
      await start();

      await act(async () => {
        failInvoke(new Error("boom"));
      });

      const state = useAppStore.getState();
      expect(state.error).toBe("Processing failed: Error: boom");
      expect(state.processingState).toBe("error");
    });

    it("エラー文言は言語設定に従う", async () => {
      await i18n.changeLanguage("ja");
      setReady();
      await start();

      await act(async () => {
        failInvoke("失敗");
      });

      expect(useAppStore.getState().error).toBe("処理に失敗しました: 失敗");
    });

    it("失敗するとキャンセルボタンが消える", async () => {
      setReady();
      await start();

      await act(async () => {
        failInvoke(new Error("boom"));
      });

      expect(
        screen.queryByRole("button", { name: i18n.t("actions.cancel") }),
      ).not.toBeInTheDocument();
    });
  });

  describe("後始末", () => {
    it("成功したら購読をすべて解除して進捗を消す", async () => {
      setReady();
      await start();

      await emit("processing-progress", makeProgress());
      expect(useAppStore.getState().progress).not.toBeNull();

      await act(async () => {
        finishInvoke();
      });

      for (const [event, unlisten] of unlisteners) {
        expect(unlisten, `${event} が解除されていない`).toHaveBeenCalledTimes(
          1,
        );
      }
      expect(useAppStore.getState().progress).toBeNull();
    });

    it("失敗しても購読をすべて解除して進捗を消す", async () => {
      setReady();
      await start();

      await emit("processing-progress", makeProgress());

      await act(async () => {
        failInvoke(new Error("boom"));
      });

      for (const [event, unlisten] of unlisteners) {
        expect(unlisten, `${event} が解除されていない`).toHaveBeenCalledTimes(
          1,
        );
      }
      expect(useAppStore.getState().progress).toBeNull();
    });

    it("完了イベントが来なくても process_batch が終われば処理中から抜ける", async () => {
      setReady();
      await start();

      // Rust 側の emit は `let _ = app.emit(...)` で失敗を握り潰すので、
      // 完了イベントが届かないまま process_batch だけが正常終了しうる。
      // このとき戻り値で完了させないと processing のまま開始ボタンが死ぬ。
      const stats = makeStats({ successful_files: 3, total_files: 3 });
      await act(async () => {
        finishInvoke(stats);
      });

      const state = useAppStore.getState();
      expect(state.processingState).toBe("completed");
      expect(state.batchStats).toEqual(stats);
      expect(startButton()).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: i18n.t("actions.cancel") }),
      ).not.toBeInTheDocument();
    });

    it("完了イベントが来なくても戻り値の統計で通知する", async () => {
      setReady();
      await start();

      await act(async () => {
        finishInvoke(
          makeStats({ successful_files: 8, overall_reduction_percent: 62.34 }),
        );
      });

      await waitFor(() =>
        expect(sendNotification).toHaveBeenCalledWith({
          title: "Image Crunch",
          body: "Converted 8 images (62.3% reduction)",
        }),
      );
    });

    it("完了イベントと戻り値の両方が届いても完了は 1 回だけ扱う", async () => {
      setReady();
      await start();

      const fromEvent = makeStats({ successful_files: 3 });
      await emit("processing-complete", fromEvent);
      await act(async () => {
        finishInvoke(makeStats({ successful_files: 99 }));
      });

      // 先に届いたイベントの統計を採用し、通知も二重に出さない。
      expect(useAppStore.getState().batchStats).toEqual(fromEvent);
      await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));
    });

    it("戻り値で完了したあとに完了イベントが来ても二重に扱わない", async () => {
      setReady();
      await start();

      const fromReturn = makeStats({ successful_files: 3 });
      await act(async () => {
        finishInvoke(fromReturn);
      });
      // finally で購読は解除済みだが、解除前に届いた場合を想定して
      // 掴んだハンドラを直接叩く。
      await emit("processing-complete", makeStats({ successful_files: 99 }));

      expect(useAppStore.getState().batchStats).toEqual(fromReturn);
      await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));
    });

    it("process_batch が失敗したときは完了扱いにしない", async () => {
      setReady();
      await start();

      await act(async () => {
        failInvoke(new Error("boom"));
      });

      const state = useAppStore.getState();
      expect(state.processingState).toBe("error");
      expect(state.batchStats).toBeNull();
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("2 回続けて実行しても購読が積み上がらない", async () => {
      setReady();
      const user = await start();

      await emit("processing-complete", makeStats());
      await act(async () => {
        finishInvoke();
      });
      expect(listen).toHaveBeenCalledTimes(3);

      await user.click(startButton());
      await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

      expect(listen).toHaveBeenCalledTimes(6);
    });
  });

  describe("キャンセルボタン", () => {
    it("処理中でなければ表示しない", () => {
      setReady();
      render(<ActionButtons />);

      expect(
        screen.queryByRole("button", { name: i18n.t("actions.cancel") }),
      ).not.toBeInTheDocument();
    });

    it("押すと idle に戻り、進捗表示が消える", async () => {
      setReady();
      const user = await start();
      await emit("processing-progress", makeProgress());

      await user.click(
        screen.getByRole("button", { name: i18n.t("actions.cancel") }),
      );

      const state = useAppStore.getState();
      expect(state.processingState).toBe("idle");
      expect(state.progress).toBeNull();
    });

    it("押すと購読をすべて解除する", async () => {
      setReady();
      const user = await start();

      await cancel(user);

      for (const [event, unlisten] of unlisteners) {
        expect(unlisten, `${event} が解除されていない`).toHaveBeenCalledTimes(
          1,
        );
      }
    });

    it("キャンセル後に完了イベントが来ても completed に戻らない", async () => {
      setReady();
      const user = await start();

      await cancel(user);
      // 購読解除の前に emit 済みだったイベントが遅れて届く状況を想定して、
      // 掴んだハンドラを直接叩く。
      await emit("processing-complete", makeStats());

      const state = useAppStore.getState();
      expect(state.processingState).toBe("idle");
      expect(state.batchStats).toBeNull();
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("キャンセル後に process_batch が戻ってきても completed に戻らない", async () => {
      setReady();
      const user = await start();

      await cancel(user);
      await act(async () => {
        finishInvoke(makeStats());
      });

      const state = useAppStore.getState();
      expect(state.processingState).toBe("idle");
      expect(state.batchStats).toBeNull();
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("キャンセル後に process_batch が失敗しても error 状態にしない", async () => {
      setReady();
      const user = await start();

      await cancel(user);
      await act(async () => {
        failInvoke(new Error("boom"));
      });

      const state = useAppStore.getState();
      expect(state.processingState).toBe("idle");
      expect(state.error).toBeNull();
    });

    it("キャンセル後に進捗イベントが来てもファイルの状態は動かない", async () => {
      setReady([makeFile("/photos/a.png")]);
      const user = await start();

      await cancel(user);
      await emit("processing-progress", makeProgress());

      const state = useAppStore.getState();
      expect(state.progress).toBeNull();
      expect(state.files[0].status).toBe("pending");
    });

    it("キャンセル後に個別結果イベントが来てもファイルの状態は動かない", async () => {
      setReady([makeFile("/photos/a.png")]);
      const user = await start();

      await cancel(user);
      await emit("processing-result", makeResult());

      expect(useAppStore.getState().files[0].status).toBe("pending");
    });

    it("キャンセルして再実行したあとに前回の完了が届いても、今回の実行を壊さない", async () => {
      setReady();
      const user = await start();
      const staleComplete = handlers.get("processing-complete");
      const staleFinish = finishInvoke;

      await cancel(user);

      // 2 回目の実行を始める。1 回目の購読とハンドラは別物に差し替わる。
      await user.click(startButton());
      await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

      // 1 回目の完了イベントと戻り値が、いまごろ届く。
      await act(async () => {
        staleComplete?.({ payload: makeStats({ successful_files: 99 }) });
        staleFinish(makeStats({ successful_files: 99 }));
      });

      const state = useAppStore.getState();
      expect(state.processingState).toBe("processing");
      expect(state.batchStats).toBeNull();
      expect(sendNotification).not.toHaveBeenCalled();
    });
  });
});
