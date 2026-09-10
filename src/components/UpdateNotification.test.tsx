import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import en from "../i18n/locales/en.json";
import ja from "../i18n/locales/ja.json";
import { UpdateNotification } from "./UpdateNotification";

// Tauri の API は jsdom では動かないので、境界ごとモックする。
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const openUrlMock = vi.mocked(openUrl);

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});

describe("UpdateNotification", () => {
  it("更新チェックが失敗したらエラーを表示する", async () => {
    invokeMock.mockRejectedValue("GitHub API returned status: 403");

    render(<UpdateNotification />);

    expect(
      await screen.findByText(i18n.t("update.checkFailed")),
    ).toBeInTheDocument();
  });

  it("エラー表示は閉じられる", async () => {
    invokeMock.mockRejectedValue("Failed to fetch release info: timeout");
    const user = userEvent.setup();

    render(<UpdateNotification />);
    const message = await screen.findByText(i18n.t("update.checkFailed"));

    await user.click(
      screen.getByRole("button", { name: i18n.t("update.dismiss") }),
    );

    expect(message).not.toBeInTheDocument();
  });

  it("更新があるときは従来どおり案内とダウンロードを出す", async () => {
    invokeMock.mockResolvedValue({
      update_available: true,
      current_version: "0.2.1",
      latest_version: "0.3.0",
      release_url: "https://example.test/releases/v0.3.0",
      release_notes: null,
    });
    const user = userEvent.setup();

    render(<UpdateNotification />);

    expect(
      await screen.findByText(i18n.t("update.available")),
    ).toBeInTheDocument();
    expect(screen.getByText("v0.2.1 → v0.3.0")).toBeInTheDocument();
    expect(screen.queryByText(i18n.t("update.checkFailed"))).toBeNull();

    await user.click(
      screen.getByRole("button", { name: i18n.t("update.download") }),
    );
    expect(openUrlMock).toHaveBeenCalledWith(
      "https://example.test/releases/v0.3.0",
    );
  });

  it("失敗時の文言は日本語でも出る", async () => {
    invokeMock.mockRejectedValue("GitHub API returned status: 403");
    await i18n.changeLanguage("ja");

    render(<UpdateNotification />);

    expect(await screen.findByText(ja.update.checkFailed)).toBeInTheDocument();
  });

  it("失敗時の文言は両方の言語に存在する", () => {
    // 片方の locale に入れ忘れるとキー名がそのまま画面に出る。
    expect(en.update.checkFailed).toBeTruthy();
    expect(ja.update.checkFailed).toBeTruthy();
    expect(ja.update.checkFailed).not.toBe(en.update.checkFailed);
  });

  it("更新が無いときは何も出さない", async () => {
    invokeMock.mockResolvedValue({
      update_available: false,
      current_version: "0.2.1",
      latest_version: "0.2.1",
      release_url: "https://example.test/releases/v0.2.1",
      release_notes: null,
    });

    const { container } = render(<UpdateNotification />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("check_for_updates");
    });
    expect(container).toBeEmptyDOMElement();
  });
});
