import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

// このテストは「描画されること」自体が検査対象でもある。
// ホストプロセス由来の NODE_ENV=production が漏れていると React が
// production ビルドに解決され、act() が使えず render() が丸ごと落ちる。
// bin/agent-check が NODE_ENV=test を渡していれば、ここは安定して通る。

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("LanguageSwitcher", () => {
  it("英語のときは切り替え先として日本語を表示する", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: /日本語/ })).toBeInTheDocument();
  });

  it("クリックすると言語が切り替わり、表示も入れ替わる", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: /日本語/ }));

    expect(i18n.language).toBe("ja");
    expect(screen.getByRole("button", { name: /English/ })).toBeInTheDocument();
  });

  it("もう一度クリックすると英語に戻る", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: /日本語/ }));
    await user.click(screen.getByRole("button", { name: /English/ }));

    expect(i18n.language).toBe("en");
  });
});
