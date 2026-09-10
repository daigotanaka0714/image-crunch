import { open } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { useAppStore } from "../store/useAppStore";
import type { ProcessingOptions } from "../types";
import { SettingsPanel } from "./SettingsPanel";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const openDialog = vi.mocked(open);

// zustand の store はモジュール単位のシングルトンなので、
// テストごとに初期状態へ戻す。
const initialState = useAppStore.getState();

beforeEach(async () => {
  useAppStore.setState(initialState, true);
  openDialog.mockReset();
  await i18n.changeLanguage("en");
});

// マウント時点の options が resizeEnabled の初期値になるため、
// store を先に整えてから描画する。
function renderPanel(options: Partial<ProcessingOptions> = {}) {
  if (Object.keys(options).length > 0) {
    useAppStore.getState().setOptions(options);
  }
  return render(<SettingsPanel />);
}

const currentOptions = () => useAppStore.getState().options;

describe("SettingsPanel", () => {
  describe("出力形式", () => {
    it("対応する 6 形式が定義順に並ぶ", () => {
      renderPanel();

      const select = screen.getByRole("combobox", { name: "Output Format" });
      const options = within(select).getAllByRole("option");

      expect(options.map((o) => o.textContent)).toEqual([
        "WEBP",
        "JPEG",
        "PNG",
        "GIF",
        "BMP",
        "TIFF",
      ]);
    });

    it("表示は大文字でも store に渡る値は小文字のまま", async () => {
      const user = userEvent.setup();
      renderPanel();

      const select = screen.getByRole("combobox", { name: "Output Format" });
      // 見た目（PNG）と値（png）がずれると Rust 側の形式判定が黙って壊れる
      expect(
        within(select)
          .getAllByRole("option")
          .map((o) => (o as HTMLOptionElement).value),
      ).toEqual(["webp", "jpeg", "png", "gif", "bmp", "tiff"]);

      await user.selectOptions(select, "png");

      expect(currentOptions().format).toBe("png");
    });

    it("初期値は store の format（webp）が選ばれている", () => {
      renderPanel();

      expect(
        screen.getByRole("combobox", { name: "Output Format" }),
      ).toHaveValue("webp");
    });
  });

  describe("品質", () => {
    it("現在値をパーセント表示する", () => {
      renderPanel({ quality: 65 });

      expect(screen.getByText("65%")).toBeInTheDocument();
    });

    it("スライダーの範囲は 1〜100", () => {
      renderPanel();

      const slider = screen.getByRole("slider", { name: "Quality" });
      expect(slider).toHaveAttribute("min", "1");
      expect(slider).toHaveAttribute("max", "100");
    });

    it("動かすと数値（文字列ではなく）として store に入る", () => {
      renderPanel();

      fireEvent.change(screen.getByRole("slider", { name: "Quality" }), {
        target: { value: "35" },
      });

      // "35" のまま渡すと Rust 側の u8 デシリアライズで落ちる
      expect(currentOptions().quality).toBe(35);
      expect(screen.getByText("35%")).toBeInTheDocument();
    });
  });

  describe("リサイズ", () => {
    it("width も height も null なら無効で、幅・高さの欄は出ない", () => {
      renderPanel();

      expect(
        screen.getByRole("checkbox", { name: "Enable resize" }),
      ).not.toBeChecked();
      expect(
        screen.queryByRole("spinbutton", { name: "Width" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("spinbutton", { name: "Height" }),
      ).not.toBeInTheDocument();
    });

    it.each([
      ["width", { width: 800 }],
      ["height", { height: 600 }],
    ])(
      "マウント時に %s が入っていれば有効な状態で始まる",
      (_label, options) => {
        renderPanel(options);

        expect(
          screen.getByRole("checkbox", { name: "Enable resize" }),
        ).toBeChecked();
        expect(
          screen.getByRole("spinbutton", { name: "Width" }),
        ).toBeInTheDocument();
      },
    );

    it("有効にすると幅・高さの欄が出るが、store はまだ null のまま", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("checkbox", { name: "Enable resize" }));

      expect(screen.getByRole("spinbutton", { name: "Width" })).toHaveValue(
        null,
      );
      expect(currentOptions().width).toBeNull();
      expect(currentOptions().height).toBeNull();
    });

    it("無効にすると width と height が null に戻る", async () => {
      const user = userEvent.setup();
      renderPanel({ width: 800, height: 600 });

      await user.click(screen.getByRole("checkbox", { name: "Enable resize" }));

      expect(currentOptions().width).toBeNull();
      expect(currentOptions().height).toBeNull();
      expect(
        screen.queryByRole("spinbutton", { name: "Width" }),
      ).not.toBeInTheDocument();
    });

    it("いったん無効にして戻しても、元の値は復元されない", async () => {
      const user = userEvent.setup();
      renderPanel({ width: 800, height: 600 });

      const toggle = screen.getByRole("checkbox", { name: "Enable resize" });
      await user.click(toggle);
      await user.click(toggle);

      expect(currentOptions().width).toBeNull();
      expect(screen.getByRole("spinbutton", { name: "Width" })).toHaveValue(
        null,
      );
    });

    it("幅・高さは数値として store に入る", async () => {
      const user = userEvent.setup();
      renderPanel({ width: 800 });

      await user.type(
        screen.getByRole("spinbutton", { name: "Height" }),
        "600",
      );

      expect(currentOptions().height).toBe(600);
    });

    it("幅を空にすると null になる（0 や NaN にはしない）", async () => {
      const user = userEvent.setup();
      renderPanel({ width: 800 });

      await user.clear(screen.getByRole("spinbutton", { name: "Width" }));

      expect(currentOptions().width).toBeNull();
    });

    it("0 を入れると store には 0 が入るが入力欄は空に見える", () => {
      renderPanel({ width: 800 });

      fireEvent.change(screen.getByRole("spinbutton", { name: "Width" }), {
        target: { value: "0" },
      });

      // 現状の実装（value={options.width || ""}）の振る舞い。
      // 0 が falsy なので表示だけが消え、store には 0 が残る。
      expect(currentOptions().width).toBe(0);
      expect(screen.getByRole("spinbutton", { name: "Width" })).toHaveValue(
        null,
      );
    });

    it("描画後に store の width が変わってもチェックボックスは追従しない", () => {
      renderPanel();

      useAppStore.getState().setOptions({ width: 1024 });

      // resizeEnabled は useState の初期値のみで決まる現状の振る舞い
      expect(
        screen.getByRole("checkbox", { name: "Enable resize" }),
      ).not.toBeChecked();
      expect(currentOptions().width).toBe(1024);
    });
  });

  describe("メタデータ", () => {
    it("初期状態では「削除」が選ばれている", () => {
      renderPanel();

      expect(
        screen.getByRole("radio", { name: "Remove metadata" }),
      ).toBeChecked();
      expect(
        screen.getByRole("radio", { name: "Keep metadata" }),
      ).not.toBeChecked();
    });

    it("「保持」を選ぶと keep_metadata が true になる", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("radio", { name: "Keep metadata" }));

      expect(currentOptions().keep_metadata).toBe(true);
      expect(
        screen.getByRole("radio", { name: "Remove metadata" }),
      ).not.toBeChecked();
    });

    it("「削除」に戻すと keep_metadata が false になる", async () => {
      const user = userEvent.setup();
      renderPanel({ keep_metadata: true });

      await user.click(screen.getByRole("radio", { name: "Remove metadata" }));

      expect(currentOptions().keep_metadata).toBe(false);
    });
  });

  describe("圧縮方式", () => {
    it("初期状態ではロッシーが選ばれている", () => {
      renderPanel();

      expect(screen.getByRole("radio", { name: "Lossy" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Lossless" })).not.toBeChecked();
    });

    it("ロスレスを選ぶと compression が lossless になる", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("radio", { name: "Lossless" }));

      expect(currentOptions().compression).toBe("lossless");
      expect(screen.getByRole("radio", { name: "Lossy" })).not.toBeChecked();
    });

    it("メタデータと圧縮方式は独立して切り替わる", async () => {
      const user = userEvent.setup();
      renderPanel();

      // ラジオに name が無いので、片方の操作でもう片方が外れないことを確かめる
      await user.click(screen.getByRole("radio", { name: "Lossless" }));
      await user.click(screen.getByRole("radio", { name: "Keep metadata" }));

      expect(currentOptions().compression).toBe("lossless");
      expect(currentOptions().keep_metadata).toBe(true);
      expect(screen.getByRole("radio", { name: "Lossless" })).toBeChecked();
      expect(
        screen.getByRole("radio", { name: "Keep metadata" }),
      ).toBeChecked();
    });
  });

  describe("出力先フォルダ", () => {
    it("store の outputDir を読み取り専用で表示する", () => {
      useAppStore.setState({ outputDir: "/tmp/out" });
      renderPanel();

      const input = screen.getByRole("textbox", { name: "Output Directory" });
      expect(input).toHaveValue("/tmp/out");
      // 手入力ではなくダイアログ経由でしか変えられない
      expect(input).toHaveAttribute("readonly");
    });

    it("キーボードで打ち込んでも outputDir は変わらない", async () => {
      const user = userEvent.setup();
      useAppStore.setState({ outputDir: "/tmp/out" });
      renderPanel();

      const input = screen.getByRole("textbox", { name: "Output Directory" });
      await user.type(input, "/typed/path");

      expect(useAppStore.getState().outputDir).toBe("/tmp/out");
      expect(input).toHaveValue("/tmp/out");
    });

    it("change イベントを直接起こしても outputDir は変わらない", () => {
      useAppStore.setState({ outputDir: "/tmp/out" });
      renderPanel();

      // readOnly な input に onChange を付け直すと、ここが落ちる。
      // 出力先は必ずフォルダ選択ダイアログ経由で入る値であって、
      // 未検証の文字列が store（＝Rust の create_dir_all）に流れてはいけない。
      fireEvent.change(
        screen.getByRole("textbox", { name: "Output Directory" }),
        { target: { value: "/forced/path" } },
      );

      expect(useAppStore.getState().outputDir).toBe("/tmp/out");
    });

    it("ボタンを押すとフォルダ選択ダイアログを開く", async () => {
      const user = userEvent.setup();
      openDialog.mockResolvedValue("/tmp/selected");
      renderPanel();

      await user.click(screen.getByRole("button", { name: /Select/ }));

      expect(openDialog).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Select...",
      });
      expect(useAppStore.getState().outputDir).toBe("/tmp/selected");
    });

    it("キャンセル（null）のときは outputDir を変えない", async () => {
      const user = userEvent.setup();
      openDialog.mockResolvedValue(null);
      useAppStore.setState({ outputDir: "/tmp/before" });
      renderPanel();

      await user.click(screen.getByRole("button", { name: /Select/ }));

      expect(useAppStore.getState().outputDir).toBe("/tmp/before");
    });

    it("複数選択（配列）が返っても outputDir を変えない", async () => {
      const user = userEvent.setup();
      openDialog.mockResolvedValue(["/tmp/a", "/tmp/b"]);
      useAppStore.setState({ outputDir: "/tmp/before" });
      renderPanel();

      await user.click(screen.getByRole("button", { name: /Select/ }));

      expect(useAppStore.getState().outputDir).toBe("/tmp/before");
    });

    it("ダイアログが失敗しても落ちず、outputDir も変わらない", async () => {
      const user = userEvent.setup();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      openDialog.mockRejectedValue(new Error("dialog unavailable"));
      useAppStore.setState({ outputDir: "/tmp/before" });
      renderPanel();

      await user.click(screen.getByRole("button", { name: /Select/ }));

      expect(useAppStore.getState().outputDir).toBe("/tmp/before");
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe("処理中", () => {
    it("すべての入力が無効化される", () => {
      useAppStore.setState({ processingState: "processing" });
      renderPanel({ width: 800, height: 600 });

      expect(
        screen.getByRole("combobox", { name: "Output Format" }),
      ).toBeDisabled();
      expect(screen.getByRole("slider", { name: "Quality" })).toBeDisabled();
      expect(
        screen.getByRole("checkbox", { name: "Enable resize" }),
      ).toBeDisabled();
      expect(screen.getByRole("spinbutton", { name: "Width" })).toBeDisabled();
      expect(screen.getByRole("spinbutton", { name: "Height" })).toBeDisabled();
      expect(
        screen.getByRole("textbox", { name: "Output Directory" }),
      ).toBeDisabled();
      for (const radio of screen.getAllByRole("radio")) {
        expect(radio).toBeDisabled();
      }
      expect(screen.getByRole("button", { name: /Select/ })).toBeDisabled();
    });

    it("フォルダ選択ボタンを押してもダイアログは開かない", async () => {
      const user = userEvent.setup();
      useAppStore.setState({ processingState: "processing" });
      renderPanel();

      await user.click(screen.getByRole("button", { name: /Select/ }));

      expect(openDialog).not.toHaveBeenCalled();
    });

    it("processing 以外（completed）では無効化されない", () => {
      useAppStore.setState({ processingState: "completed" });
      renderPanel();

      expect(
        screen.getByRole("combobox", { name: "Output Format" }),
      ).toBeEnabled();
      expect(screen.getByRole("button", { name: /Select/ })).toBeEnabled();
    });
  });

  it("日本語に切り替えるとラベルも日本語になる", async () => {
    await i18n.changeLanguage("ja");
    renderPanel({ width: 800 });

    expect(screen.getByText("設定")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "出力形式" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "品質" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "リサイズを有効にする" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "幅" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "メタデータを保持" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "ロスレス" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "出力先フォルダ" }),
    ).toBeInTheDocument();
  });
});
