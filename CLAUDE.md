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

## エージェントの完了条件

作業が「終わった」と言えるのは、次の3つをすべて満たしたときだけ。

1. `./bin/agent-check` が `STATUS: PASS` を返している
2. 変更が依頼された範囲に収まっている
3. main ではないブランチから PR を作成している

### 禁止事項

- **main への直接 push は禁止。** 必ずブランチを切って PR を作る。
- **マージは行わない。** `git merge` / `gh pr merge` / `wt merge` はすべて禁止。
  PR のレビューとマージは人間が行う。
- **`bin/agent-check` を「通すために」書き換えない。** ゲートを緩める変更は、
  それ自体を独立した PR として提案し、理由を説明すること。
- ルールを off にして lint を通さない。指摘は直す。

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

CI（`.github/workflows/ci.yml`）は同じ検査を行う。
**片方だけを変更しないこと。** ローカルと CI がずれると、
エージェントは「CI は通るのに手元が赤い」状態で迷走する。

### 並列作業

worktree を使って複数のエージェントを同時に走らせる場合:

- 同じファイルを触るタスクを同時に出さない
- 各エージェントは自分の worktree で `bin/agent-check` を通してから PR を作る
- `wt step copy-ignored` は使わない（`.config/wt.toml` のコメント参照）
