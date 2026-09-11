# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
pnpm install

# Run in development mode (starts both Vite dev server and Tauri)
pnpm tauri dev

# Build for production
pnpm tauri build

# Type checking
pnpm tsc --noEmit

# Run Rust tests
cd src-tauri && cargo test

# Run Rust clippy
cd src-tauri && cargo clippy
```

## Architecture

Image Crunch is a Tauri v2 desktop app for batch image optimization and format conversion.

### Frontend (React + TypeScript)
- **Entry**: `src/main.tsx` → `src/App.tsx`
- **State**: Zustand store in `src/store/useAppStore.ts` manages files, processing options, progress, and results
- **Components**: `src/components/` - DropZone, FileList, SettingsPanel, ResultsPanel, ActionButtons, LanguageSwitcher
- **i18n**: `src/i18n/` with English and Japanese locales

### Backend (Rust)
- **Entry**: `src-tauri/src/lib.rs` registers Tauri commands
- **Commands**: `src-tauri/src/commands/image_commands.rs` exposes 4 Tauri commands:
  - `get_image_files` - Scan paths for supported images
  - `get_image_info` - Get image dimensions and metadata
  - `process_single_image` - Process one image
  - `process_batch` - Parallel batch processing with progress events
- **Image Processing**: `src-tauri/src/image/processor.rs` handles resize and format conversion using `image` and `webp` crates
- **Formats**: `src-tauri/src/image/formats.rs` defines supported input/output formats (JPEG, PNG, GIF, BMP, TIFF, WebP)

### Frontend-Backend Communication
- Frontend calls Rust via `@tauri-apps/api` invoke
- Rust emits `processing-progress` and `processing-complete` events during batch processing
- TypeScript types in `src/types/index.ts` mirror Rust structs for type safety

### Key Dependencies
- **Rust**: `image` (image processing), `webp` (WebP encoding), `rayon` (parallel processing), `walkdir` (directory traversal)
- **Frontend**: `react-dropzone` (file drops), `zustand` (state), `react-i18next` (i18n), `tailwindcss` (styling)

## コミュニケーション基準

### 事実と推測の区別
技術的な事実を述べる際は厳守：
- **確認済み**: コードやドキュメントで直接確認 → そのまま述べてよい
- **推測**: ログやコンテキストから推測 → 「推測ですが...」と明記
- **未確認**: 確認手段がない → 「未確認ですが...」と明記

**禁止**: 推測を確定事実として提示すること

### 外部サービス連携時のルール
1. **接続確認を最初に行う**
2. **失敗は即時報告**
3. **サイレント失敗の禁止**

### タスク進行ルール
- 1ステップずつ進め、各ステップの完了を確認
- 複数ステップのタスクでは中間結果を報告
- ブロッカーは推測で進めずユーザーに相談
- セッション終了前に進捗と残作業を明示

### カスタムコマンド
- `/bugfix` - 体系的なバグ調査・修正ワークフロー
- `/investigate` - コードベースの網羅的調査

## このリポジトリ固有のこと

### ゲートの中身

| ステージ | コマンド | 対象 |
|---|---|---|
| lint | `biome check .` | 書式 + lint（Prettier / ESLint は使わない） |
| typecheck | `tsc --noEmit` | 型 |
| test | `vitest run` | フロントのテスト |
| build | `vite build` | フロントのビルド |
| rustfmt | `cargo fmt --check` | src-tauri に差分があるときだけ |
| clippy | `cargo clippy --all-targets -- -D warnings` | 同上 |
| rusttest | `cargo test` | 同上 |

`NODE_ENV` はステージ単位で指定している。スクリプト全体で固定しないこと
（理由は `bin/agent-check` 冒頭のコメントを参照）。
加えて `vite.config.ts` が vitest 実行時に `NODE_ENV=test` を強制するので、
`pnpm test` を直接叩いた場合も同じ結果になる。

### バージョンの固定

ツールのバージョンは**1か所にだけ**書く。CI とローカルで別々に指定しない。

| 対象 | 唯一の出どころ | CI 側 |
|---|---|---|
| Node | `.node-version` | `node-version-file: '.node-version'` |
| pnpm | `package.json` の `packageManager` | `pnpm/action-setup`（`version:` を書かない） |

過去に CI 側へ pnpm 9 / Node 20 を直接書いていたため、ローカルの
pnpm 12 / Node 22 とずれて CI だけが落ちた。値を2か所に持たせないこと。

CI（`.github/workflows/ci.yml`）は同じ検査を行う。
**片方だけを変更しないこと。** ローカルと CI がずれると、
エージェントは「CI は通るのに手元が赤い」状態で迷走する。

<!-- daigo-lab-ops:completion-criteria:start -->
<!-- 自動生成。daigo-lab-ops/docs/completion-criteria.md が唯一の出どころ。
     ここを手で編集しない。`lab sync` で作り直す。 -->

## エージェントの完了条件

### Definition of done

1. This repository's `bin/agent-check` returns `STATUS: PASS`
2. The change stays within what was asked for
3. The PR is opened from a branch other than main / master

### Do not

- **Never push directly to the default branch.** Always branch and open a PR.
- **Never merge.** `git merge` and `gh pr merge` are a human's job.
- **Never edit the gate to make it pass.** If the gate needs to be relaxed,
  propose that as its own PR and explain why.
- **Never silence a lint rule to get green.** Fix what it reports.

### When opening a PR

- Do not put a Claude session URL (`claude.ai/code/session_...`) or a
  `Claude-Session:` line in the PR body or in any commit message
- **Always name the repository and include the URL when referring to a PR.**
  `#24` alone does not identify anything when several repositories are in play
- Never use `--delete-branch` on a stacked PR: deleting the base branch makes
  GitHub auto-close the PR stacked on top of it

<!-- daigo-lab-ops:completion-criteria:end -->
