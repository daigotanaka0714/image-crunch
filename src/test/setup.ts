import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 各テストの後に DOM を片付ける（テスト間で描画が残らないようにする）
afterEach(() => {
  cleanup();
});
