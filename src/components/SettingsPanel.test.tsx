import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { useAppStore } from "../store/useAppStore";
import {
  DEFAULT_SAVED_WATERMARK,
  initialWatermark,
  loadSavedWatermark,
  WATERMARK_STORAGE_KEY,
} from "../store/watermarkSettings";
import type {
  FontList,
  ImageWatermark,
  ProcessingOptions,
  TextWatermark,
} from "../types";
import { SettingsPanel } from "./SettingsPanel";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const openDialog = vi.mocked(open);
const invokeMock = vi.mocked(invoke);

const FONT_LIST: FontList = {
  fonts: [
    { id: "Helvetica", family: "Helvetica" },
    { id: "HiraginoSans-W3", family: "Hiragino Sans" },
  ],
  default_font: "HiraginoSans-W3",
};

// Rust の list_fonts / find_missing_glyphs の代わり
let fontList: FontList | Error = FONT_LIST;
let missingGlyphs: string[] = [];

// zustand の store はモジュール単位のシングルトンなので、
// テストごとに初期状態へ戻す。
const initialState = useAppStore.getState();

beforeEach(async () => {
  useAppStore.setState(initialState, true);
  localStorage.clear();
  openDialog.mockReset();
  fontList = FONT_LIST;
  missingGlyphs = [];
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command) => {
    if (command === "list_fonts") {
      if (fontList instanceof Error) throw fontList;
      return fontList;
    }
    if (command === "find_missing_glyphs") return missingGlyphs;
    throw new Error(`unexpected command: ${command}`);
  });
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

  describe("ウォーターマーク", () => {
    const imageWatermark = (
      patch: Partial<ImageWatermark> = {},
    ): ImageWatermark => ({
      kind: "image",
      path: "",
      position: "center",
      margin_percent: 2,
      opacity: 50,
      scale_percent: 20,
      ...patch,
    });

    const textWatermark = (
      patch: Partial<TextWatermark> = {},
    ): TextWatermark => ({
      kind: "text",
      text: "© Example",
      font: "HiraginoSans-W3",
      color: "#ffffff",
      outline: null,
      position: "center",
      margin_percent: 2,
      opacity: 50,
      scale_percent: 20,
      ...patch,
    });

    // list_fonts の結果が反映されるまで待つ
    const renderWithFonts = async (
      options: Partial<ProcessingOptions> = {},
    ) => {
      const view = renderPanel(options);
      await act(async () => {});
      return view;
    };

    const enable = async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole("checkbox", { name: "Add watermark" }));

    const chooseImageKind = async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole("radio", { name: "Image" }));

    it("既定はオフで、詳細の欄は出ない", async () => {
      await renderWithFonts();

      expect(
        screen.getByRole("checkbox", { name: "Add watermark" }),
      ).not.toBeChecked();
      expect(currentOptions().watermark).toBeNull();
      expect(
        screen.queryByRole("group", { name: "Type" }),
      ).not.toBeInTheDocument();
    });

    it("有効にすると文字が既定で、フォントは既定フォントになる", async () => {
      const user = userEvent.setup();
      await renderWithFonts();

      await enable(user);

      expect(currentOptions().watermark).toEqual({
        kind: "text",
        text: "",
        font: "HiraginoSans-W3",
        color: "#ffffff",
        outline: null,
        position: "bottom_right",
        margin_percent: 2,
        opacity: 50,
        scale_percent: 20,
      });
      expect(screen.getByRole("radio", { name: "Text" })).toBeChecked();
      expect(
        screen.getByText("Enter text to start the conversion"),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Bottom right" })).toBeChecked();
    });

    it("無効に戻すと watermark が null になる", async () => {
      const user = userEvent.setup();
      await renderWithFonts();

      await enable(user);
      await enable(user);

      expect(currentOptions().watermark).toBeNull();
    });

    it("種類は文字か画像のどちらか一方で、切り替えても配置は保たれる", async () => {
      const user = userEvent.setup();
      await renderWithFonts({
        watermark: textWatermark({ position: "top_left", opacity: 70 }),
      });

      await chooseImageKind(user);

      expect(currentOptions().watermark).toEqual({
        kind: "image",
        path: "",
        position: "top_left",
        margin_percent: 2,
        opacity: 70,
        scale_percent: 20,
      });
      expect(screen.getByRole("radio", { name: "Text" })).not.toBeChecked();
      expect(
        screen.queryByRole("textbox", { name: "Text" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Choose PNG..." }),
      ).toBeInTheDocument();
    });

    it("画像から文字に戻すと、前の文字の設定が戻る", async () => {
      const user = userEvent.setup();
      await renderWithFonts({
        watermark: textWatermark({ text: "Keep me", color: "#ff0000" }),
      });

      await chooseImageKind(user);
      await user.click(screen.getByRole("radio", { name: "Text" }));

      expect(currentOptions().watermark).toMatchObject({
        kind: "text",
        text: "Keep me",
        color: "#ff0000",
        font: "HiraginoSans-W3",
      });
    });

    it("PNG に絞ったファイル選択ダイアログを開き、選んだパスが入る", async () => {
      const user = userEvent.setup();
      openDialog.mockResolvedValue("/tmp/logo.png");
      await renderWithFonts();
      await enable(user);
      await chooseImageKind(user);

      await user.click(screen.getByRole("button", { name: "Choose PNG..." }));

      expect(openDialog).toHaveBeenCalledWith({
        directory: false,
        multiple: false,
        filters: [{ name: "PNG", extensions: ["png"] }],
        title: "Choose PNG...",
      });
      expect(currentOptions().watermark).toMatchObject({
        kind: "image",
        path: "/tmp/logo.png",
      });
      expect(
        screen.getByRole("textbox", { name: "Watermark image (PNG)" }),
      ).toHaveValue("/tmp/logo.png");
      expect(
        screen.queryByText("Choose a PNG to start the conversion"),
      ).not.toBeInTheDocument();
    });

    it("ダイアログをキャンセルしてもパスは変わらない", async () => {
      const user = userEvent.setup();
      openDialog.mockResolvedValue(null);
      await renderWithFonts();
      await enable(user);
      await chooseImageKind(user);

      await user.click(screen.getByRole("button", { name: "Choose PNG..." }));

      expect(currentOptions().watermark).toMatchObject({ path: "" });
    });

    it("位置は 9 つの中から 1 つだけ選べる", async () => {
      const user = userEvent.setup();
      await renderWithFonts();
      await enable(user);

      const group = screen.getByRole("group", { name: "Position" });
      expect(
        within(group)
          .getAllByRole("radio")
          .map((r) => r.getAttribute("aria-label")),
      ).toEqual([
        "Top left",
        "Top center",
        "Top right",
        "Middle left",
        "Center",
        "Middle right",
        "Bottom left",
        "Bottom center",
        "Bottom right",
      ]);

      await user.click(screen.getByRole("radio", { name: "Top left" }));

      expect(currentOptions().watermark?.position).toBe("top_left");
      expect(
        within(group)
          .getAllByRole("radio")
          .filter((r) => (r as HTMLInputElement).checked),
      ).toHaveLength(1);
    });

    it.each([
      ["Size (% of image width)", "scale_percent", "1", "100", "35"],
      ["Opacity", "opacity", "1", "100", "70"],
      ["Margin (% of image width)", "margin_percent", "0", "20", "5"],
    ] as const)(
      "%s は範囲つきのスライダーで、数値として store に入る",
      async (name, key, min, max, value) => {
        const user = userEvent.setup();
        await renderWithFonts();
        await enable(user);

        const slider = screen.getByRole("slider", { name });
        expect(slider).toHaveAttribute("min", min);
        expect(slider).toHaveAttribute("max", max);

        fireEvent.change(slider, { target: { value } });

        expect(currentOptions().watermark?.[key]).toBe(Number(value));
        expect(screen.getByText(`${value}%`)).toBeInTheDocument();
      },
    );

    it("詳細を変えても他の設定は保たれる", async () => {
      const user = userEvent.setup();
      openDialog.mockResolvedValue("/tmp/logo.png");
      await renderWithFonts();
      await enable(user);
      await chooseImageKind(user);
      await user.click(screen.getByRole("button", { name: "Choose PNG..." }));

      fireEvent.change(screen.getByRole("slider", { name: "Opacity" }), {
        target: { value: "80" },
      });

      expect(currentOptions().watermark).toMatchObject({
        path: "/tmp/logo.png",
        opacity: 80,
        scale_percent: 20,
      });
    });

    describe("文字", () => {
      it("入力した文字が store に入り、空でなくなると注意書きが消える", async () => {
        const user = userEvent.setup();
        await renderWithFonts({ watermark: textWatermark({ text: "" }) });

        await user.type(screen.getByRole("textbox", { name: "Text" }), "© A");

        expect(currentOptions().watermark).toMatchObject({ text: "© A" });
        expect(
          screen.queryByText("Enter text to start the conversion"),
        ).not.toBeInTheDocument();
      });

      it("空白だけなら注意書きを出す", async () => {
        await renderWithFonts({ watermark: textWatermark({ text: "   " }) });

        expect(
          screen.getByText("Enter text to start the conversion"),
        ).toBeInTheDocument();
      });

      it("フォントはシステムフォントの一覧から選ぶ", async () => {
        const user = userEvent.setup();
        await renderWithFonts({ watermark: textWatermark() });

        const select = screen.getByRole("combobox", { name: "Font" });
        expect(
          within(select)
            .getAllByRole("option")
            .map((o) => [(o as HTMLOptionElement).value, o.textContent]),
        ).toEqual([
          ["Helvetica", "Helvetica"],
          ["HiraginoSans-W3", "Hiragino Sans (HiraginoSans-W3)"],
        ]);
        expect(select).toHaveValue("HiraginoSans-W3");

        await user.selectOptions(select, "Helvetica");

        expect(currentOptions().watermark).toMatchObject({
          font: "Helvetica",
        });
      });

      it("フォントを読み込めなければエラーを出し、選択欄は無効", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fontList = new Error("boom");
        await renderWithFonts({ watermark: textWatermark() });

        expect(
          screen.getByText("Could not load the system fonts"),
        ).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Font" })).toBeDisabled();
        vi.mocked(console.error).mockRestore();
      });

      it("色を変えると store に入る", async () => {
        await renderWithFonts({ watermark: textWatermark() });

        fireEvent.input(screen.getByLabelText("Color"), {
          target: { value: "#ff8800" },
        });

        expect(currentOptions().watermark).toMatchObject({
          color: "#ff8800",
        });
      });

      it("縁取りは任意で、色と太さ（1〜20%）を指定できる", async () => {
        const user = userEvent.setup();
        await renderWithFonts({ watermark: textWatermark() });

        expect(
          screen.queryByRole("slider", {
            name: "Outline width (% of font size)",
          }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("checkbox", { name: "Outline" }));

        expect(currentOptions().watermark).toMatchObject({
          outline: { color: "#000000", width_percent: 5 },
        });
        const slider = screen.getByRole("slider", {
          name: "Outline width (% of font size)",
        });
        expect(slider).toHaveAttribute("min", "1");
        expect(slider).toHaveAttribute("max", "20");

        fireEvent.change(slider, { target: { value: "12" } });
        fireEvent.input(screen.getByLabelText("Outline color"), {
          target: { value: "#112233" },
        });

        expect(currentOptions().watermark).toMatchObject({
          outline: { color: "#112233", width_percent: 12 },
        });

        await user.click(screen.getByRole("checkbox", { name: "Outline" }));

        expect(currentOptions().watermark).toMatchObject({ outline: null });
      });

      it("フォントに無い文字があれば警告する", async () => {
        missingGlyphs = ["あ", "😀"];
        await renderWithFonts({
          watermark: textWatermark({ text: "Aあ😀", font: "Helvetica" }),
        });

        expect(
          await screen.findByText(
            "This font cannot draw あ 😀. They will come out as boxes or blanks.",
          ),
        ).toBeInTheDocument();
        expect(invokeMock).toHaveBeenCalledWith("find_missing_glyphs", {
          font: "Helvetica",
          text: "Aあ😀",
        });
      });

      it("無い文字が無ければ警告しない", async () => {
        await renderWithFonts({ watermark: textWatermark() });

        await waitFor(() =>
          expect(invokeMock).toHaveBeenCalledWith(
            "find_missing_glyphs",
            expect.anything(),
          ),
        );
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
    });

    describe("設定の保存", () => {
      const saved = () =>
        JSON.parse(localStorage.getItem(WATERMARK_STORAGE_KEY) ?? "null");

      // 保存内容から起動し直したときの store を作る
      const relaunch = (stored: unknown) => {
        localStorage.setItem(WATERMARK_STORAGE_KEY, JSON.stringify(stored));
        useAppStore.getState().setOptions({ watermark: initialWatermark() });
      };

      it("変更は画像パスを除いて保存される", async () => {
        const user = userEvent.setup();
        openDialog.mockResolvedValue("/tmp/logo.png");
        await renderWithFonts({ watermark: textWatermark({ text: "Saved" }) });

        await chooseImageKind(user);
        await user.click(screen.getByRole("button", { name: "Choose PNG..." }));

        expect(saved()).toEqual({
          ...DEFAULT_SAVED_WATERMARK,
          enabled: true,
          kind: "image",
          position: "center",
          text: "Saved",
          font: "HiraginoSans-W3",
        });
        expect(JSON.stringify(saved())).not.toContain("/tmp/logo.png");
      });

      it("保存された設定で始まる", async () => {
        relaunch({
          ...DEFAULT_SAVED_WATERMARK,
          enabled: true,
          text: "Restored",
          font: "Helvetica",
          opacity: 30,
        });
        await renderWithFonts();

        expect(
          screen.getByRole("checkbox", { name: "Add watermark" }),
        ).toBeChecked();
        expect(screen.getByRole("textbox", { name: "Text" })).toHaveValue(
          "Restored",
        );
        expect(screen.getByRole("combobox", { name: "Font" })).toHaveValue(
          "Helvetica",
        );
        expect(currentOptions().watermark).toMatchObject({ opacity: 30 });
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });

      it("保存されたフォントが無ければ既定フォントに切り替えて通知する", async () => {
        const user = userEvent.setup();
        relaunch({
          ...DEFAULT_SAVED_WATERMARK,
          enabled: true,
          text: "Restored",
          font: "Gone-Font",
        });
        await renderWithFonts();

        expect(currentOptions().watermark).toMatchObject({
          font: "HiraginoSans-W3",
        });
        expect(screen.getByRole("status")).toHaveTextContent(
          'The saved font "Gone-Font" is not installed. Switched to "HiraginoSans-W3".',
        );
        expect(saved().font).toBe("HiraginoSans-W3");

        await user.click(screen.getByRole("button", { name: "Dismiss" }));

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });

      it("オフのままでも、無くなったフォントは切り替えて通知する", async () => {
        relaunch({
          ...DEFAULT_SAVED_WATERMARK,
          enabled: false,
          font: "Gone-Font",
        });
        await renderWithFonts();

        expect(currentOptions().watermark).toBeNull();
        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(loadSavedWatermark().font).toBe("HiraginoSans-W3");
      });

      it("フォント未設定なら黙って既定フォントにする", async () => {
        await renderWithFonts();

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(loadSavedWatermark().font).toBe("HiraginoSans-W3");
      });

      it("範囲外の値はその項目だけ既定値に戻る", async () => {
        relaunch({
          ...DEFAULT_SAVED_WATERMARK,
          enabled: true,
          text: "Restored",
          font: "Helvetica",
          opacity: 300,
          margin_percent: 5,
        });
        await renderWithFonts();

        expect(currentOptions().watermark).toMatchObject({
          text: "Restored",
          opacity: 50,
          margin_percent: 5,
        });
      });
    });

    it("処理中はすべて無効化される", async () => {
      useAppStore.setState({ processingState: "processing" });
      await renderWithFonts({
        watermark: textWatermark({
          outline: { color: "#000000", width_percent: 5 },
        }),
      });

      expect(
        screen.getByRole("checkbox", { name: "Add watermark" }),
      ).toBeDisabled();
      for (const radio of screen.getAllByRole("radio")) {
        expect(radio).toBeDisabled();
      }
      expect(screen.getByRole("textbox", { name: "Text" })).toBeDisabled();
      expect(screen.getByRole("combobox", { name: "Font" })).toBeDisabled();
      expect(screen.getByLabelText("Color")).toBeDisabled();
      expect(screen.getByRole("checkbox", { name: "Outline" })).toBeDisabled();
      expect(screen.getByLabelText("Outline color")).toBeDisabled();
      expect(screen.getByRole("slider", { name: "Opacity" })).toBeDisabled();
    });

    it("画像の種類でも処理中はすべて無効化される", async () => {
      useAppStore.setState({ processingState: "processing" });
      await renderWithFonts({
        watermark: imageWatermark({ path: "/tmp/logo.png" }),
      });

      expect(
        screen.getByRole("button", { name: "Choose PNG..." }),
      ).toBeDisabled();
      for (const radio of screen.getAllByRole("radio")) {
        expect(radio).toBeDisabled();
      }
    });

    it("日本語でもラベルが出る", async () => {
      await i18n.changeLanguage("ja");
      await renderWithFonts({
        watermark: textWatermark({
          text: "",
          outline: { color: "#000000", width_percent: 5 },
        }),
      });

      expect(
        screen.getByRole("checkbox", { name: "ウォーターマークを入れる" }),
      ).toBeChecked();
      expect(screen.getByRole("radio", { name: "文字" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "画像" })).not.toBeChecked();
      expect(screen.getByRole("textbox", { name: "文字" })).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: "フォント" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("色")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "縁取り" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("slider", {
          name: "縁取りの太さ（文字サイズに対する %）",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("変換を始めるには文字を入力してください"),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "中央" })).toBeChecked();
      expect(
        screen.getByRole("slider", { name: "不透明度" }),
      ).toBeInTheDocument();
    });

    it("日本語で画像の欄にもラベルが出る", async () => {
      await i18n.changeLanguage("ja");
      await renderWithFonts({ watermark: imageWatermark() });

      expect(
        screen.getByRole("button", { name: "PNG を選ぶ..." }),
      ).toBeInTheDocument();
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
