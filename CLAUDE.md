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
