import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import { isWatermarkReady } from "../store/watermarkSettings";
import type { BatchStats, ProcessingResult, ProgressUpdate } from "../types";
import { PlayIcon, SpinnerIcon, XIcon } from "./Icons";

export function ActionButtons() {
  const { t } = useTranslation();
  const {
    files,
    options,
    outputDir,
    processingState,
    progress,
    setProcessingState,
    setProgress,
    setBatchStats,
    setError,
    updateFileStatus,
    markFileProcessing,
    clearProcessingStatuses,
    resetFileStatuses,
  } = useAppStore();

  const isProcessing = processingState === "processing";
  // 最初のファイルが終わるまでは progress が無いので、件数も塗りも出さない
  const shownProgress = isProcessing ? progress : null;
  const progressPercent = shownProgress
    ? Math.min(100, Math.max(0, shownProgress.percent))
    : 0;
  const canStart =
    files.length > 0 &&
    outputDir &&
    isWatermarkReady(options.watermark) &&
    !isProcessing;

  // 実行ごとの通し番号。開始で 1 つ進み、キャンセルでも 1 つ進む。
  // 各ハンドラは自分が始まったときの番号を覚えていて、番号がずれたら
  // 「もう自分の実行ではない」と判断して store に触らない。
  // これでキャンセル後や次の実行の開始後に遅れて届いたイベント・戻り値が
  // 現在の状態を上書きするのを防ぐ。
  const runIdRef = useRef(0);
  // 現在の実行の購読解除。キャンセル時にも handleStart の finally でも
  // 呼ばれるので、二重に呼ばれても平気なようにしてある。
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Send desktop notification
  const sendCompletionNotification = async (stats: BatchStats) => {
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === "granted";
      }

      if (permissionGranted) {
        const body = t("notification.body", {
          count: stats.successful_files,
          reduction: stats.overall_reduction_percent.toFixed(1),
        });
        sendNotification({
          title: "Image Crunch",
          body,
        });
      }
    } catch (error) {
      console.error("Failed to send notification:", error);
    }
  };

  const handleStart = async () => {
    if (!canStart) {
      if (files.length === 0) {
        setError(t("errors.noFiles"));
      } else if (!outputDir) {
        setError(t("errors.noOutputDir"));
      }
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    // この実行がまだ「現在の実行」かどうか。キャンセルや次の実行の開始で false になる。
    const isCurrentRun = () => runIdRef.current === runId;

    setProcessingState("processing");
    setError(null);
    setBatchStats(null);
    resetFileStatuses();

    const unlistenStarted = await listen<string>(
      "processing-started",
      (event) => {
        if (!isCurrentRun()) return;
        markFileProcessing(event.payload);
      },
    );

    // Sent after each file finishes; drives the overall progress only
    const unlistenProgress = await listen<ProgressUpdate>(
      "processing-progress",
      (event) => {
        if (!isCurrentRun()) return;
        setProgress(event.payload);
      },
    );

    // Listen for individual file results
    const unlistenResult = await listen<ProcessingResult>(
      "processing-result",
      (event) => {
        if (!isCurrentRun()) return;
        const result = event.payload;
        if (result.success) {
          updateFileStatus(result.original_path, "completed", {
            outputPath: result.output_path,
            outputSize: result.output_size,
            reductionPercent: result.reduction_percent,
          });
        } else {
          updateFileStatus(result.original_path, "error", {
            error: result.error || t("errors.unknown"),
          });
        }
      },
    );

    // 完了の反映は 1 回だけ。processing-complete イベントと process_batch の
    // 戻り値のどちらが先に届いても、先着だけを採用する。
    let completionHandled = false;
    const handleCompletion = (stats: BatchStats) => {
      // キャンセル済み・別の実行が始まったあとの完了は捨てる。
      // これが無いと、キャンセルで idle に戻したあと完了イベントや
      // process_batch の戻り値が届いた時点で completed に戻ってしまう。
      if (!isCurrentRun()) return;
      if (completionHandled) return;
      completionHandled = true;
      setBatchStats(stats);
      setProcessingState("completed");
      // Send desktop notification
      sendCompletionNotification(stats);
    };

    // Listen for completion
    const unlistenComplete = await listen<BatchStats>(
      "processing-complete",
      (event) => {
        handleCompletion(event.payload);
      },
    );

    // 購読解除はキャンセルと finally の両方から呼ばれうるので、1 回だけ効くようにする。
    let unsubscribed = false;
    const unsubscribe = () => {
      if (unsubscribed) return;
      unsubscribed = true;
      unlistenStarted();
      unlistenProgress();
      unlistenResult();
      unlistenComplete();
    };
    unsubscribeRef.current = unsubscribe;

    try {
      const inputPaths = files.map((f) => f.path);
      const stats = await invoke<BatchStats>("process_batch", {
        inputPaths,
        outputDir,
        options,
      });
      // イベントが届かなくても戻り値で完了させる。これが無いと
      // processing のまま抜けられず、開始ボタンが押せなくなる。
      handleCompletion(stats);
    } catch (error) {
      console.error("Processing failed:", error);
      // キャンセル後に届いた失敗も、現在の表示には反映しない。
      if (isCurrentRun()) {
        setError(`${t("errors.processingFailed")}: ${String(error)}`);
        setProcessingState("error");
      }
    } finally {
      unsubscribe();
      if (isCurrentRun()) {
        setProgress(null);
        unsubscribeRef.current = null;
      }
    }
  };

  // キャンセルは「表示上の中断」であって、処理そのものは止まらない。
  //
  // Rust 側の process_batch は rayon で全ファイルを処理しきるまで戻らず、
  // 中断させる手段（中断フラグや専用コマンド）を持っていない。
  // つまりこのボタンを押しても、バックグラウンドでの変換は最後まで走り、
  // 出力ファイルも書き出される。止まるのは画面の表示だけ。
  //
  // ここでできるのは、その実行の結果を画面に反映させないことだけ。
  // 実行番号を進めて古い実行のハンドラと戻り値を無効化し、購読も解除する。
  // 実際に処理を止めるには Rust 側に中断の仕組みを入れる必要がある。
  const handleCancel = () => {
    runIdRef.current += 1;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setProcessingState("idle");
    setProgress(null);
    // Their results will no longer arrive
    clearProcessingStatuses();
  };

  return (
    <div className="flex gap-4 pt-2">
      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        className={`
          relative overflow-hidden
          flex-1 py-3.5 px-6 rounded-xl font-semibold
          flex items-center justify-center gap-2.5
          transition-all duration-200 ease-out
          ${
            canStart
              ? "text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]"
              : isProcessing
                ? "text-indigo-700 bg-slate-200 cursor-not-allowed shadow-none"
                : "text-white bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
          }
        `}
      >
        {shownProgress && (
          <span
            aria-hidden="true"
            data-testid="progress-fill"
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-400/50 to-violet-400/50 transition-[width] duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        )}
        {isProcessing ? (
          <span className="relative flex items-center gap-2.5">
            <SpinnerIcon className="w-5 h-5 animate-spin" />
            <span>
              {shownProgress
                ? t("actions.processingProgress", {
                    current: shownProgress.current,
                    total: shownProgress.total,
                    percent: Math.floor(progressPercent),
                  })
                : t("actions.processing")}
            </span>
          </span>
        ) : (
          <>
            <PlayIcon className="w-5 h-5" />
            <span>{t("actions.start")}</span>
          </>
        )}
      </button>

      {isProcessing && (
        <button
          type="button"
          onClick={handleCancel}
          className="
            flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white
            bg-gradient-to-r from-rose-500 to-pink-500
            hover:from-rose-600 hover:to-pink-600
            shadow-lg shadow-rose-500/25 hover:shadow-xl hover:shadow-rose-500/30
            transition-all duration-200 ease-out
            hover:scale-[1.02] active:scale-[0.98]
            animate-fadeIn
          "
        >
          <XIcon className="w-5 h-5" />
          <span>{t("actions.cancel")}</span>
        </button>
      )}
    </div>
  );
}
