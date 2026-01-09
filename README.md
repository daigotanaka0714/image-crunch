# Image Crunch

<p align="center">
  <img src="./public/icon.png" alt="Image Crunch" width="128" height="128">
</p>

<p align="center">
  A powerful desktop application for batch image optimization and format conversion.
</p>

<p align="center">
  <a href="https://github.com/daigotanaka0714/image-crunch/releases">
    <img src="https://img.shields.io/github/v/release/daigotanaka0714/image-crunch" alt="Release">
  </a>
  <a href="https://github.com/daigotanaka0714/image-crunch/actions/workflows/ci.yml">
    <img src="https://github.com/daigotanaka0714/image-crunch/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/daigotanaka0714/image-crunch" alt="License">
  </a>
</p>

## Features

- **Batch Processing** - Process hundreds of images at once
- **Drag & Drop** - Simply drop files or folders
- **Format Conversion** - Convert between JPEG, PNG, GIF, BMP, TIFF, and WebP
- **Customizable Options**
  - Quality adjustment (0-100%)
  - Resize (width/height)
  - Metadata preservation
  - Lossy/Lossless compression
- **Statistics** - View reduction rates (overall, average, median)
- **Desktop Notifications** - Get notified when processing completes
- **Multi-language** - English and Japanese support
- **Cross-platform** - macOS and Windows

## Installation

### For Users

No build required! Download the installer for your platform from the [Releases](https://github.com/daigotanaka0714/image-crunch/releases) page.

| Platform | File | Notes |
|----------|------|-------|
| macOS (Apple Silicon) | `Image.Crunch_*_aarch64.dmg` | For M1/M2/M3 Macs |
| macOS (Intel) | `Image.Crunch_*_x64.dmg` | For Intel Macs |
| Windows | `Image.Crunch_*_x64-setup.exe` | Installer |
| Windows | `Image.Crunch_*_x64.msi` | MSI package |

### For Developers

If you want to modify or contribute to the project, see the [Development](#development) section below.

## Usage

1. **Add Images** - Drag and drop images or folders into the drop zone
2. **Configure Settings**
   - Select output format (WebP recommended)
   - Adjust quality (80% is a good balance)
   - Enable resize if needed
   - Choose metadata and compression options
3. **Select Output Directory** - Choose where to save converted images
4. **Start Conversion** - Click "Start Conversion" and watch the progress

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later)
- [pnpm](https://pnpm.io/) (v9 or later)
- [Rust](https://www.rust-lang.org/tools/install)

#### macOS

```bash
# Install Xcode Command Line Tools
xcode-select --install
```

#### Windows

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.

### Build from Source

```bash
# Clone the repository
git clone https://github.com/daigotanaka0714/image-crunch.git
cd image-crunch

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Scripts

```bash
# Start development server
pnpm tauri dev

# Build for production
pnpm tauri build

# TypeScript build
pnpm build

# Switch to dev icons (with DEV ribbon)
pnpm icons:dev

# Switch to production icons
pnpm icons:prod
```

## Tech Stack

- **Framework**: [Tauri](https://tauri.app/) v2
- **Backend**: Rust
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **i18n**: react-i18next

## Project Structure

```
image-crunch/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── i18n/               # Internationalization
│   ├── store/              # Zustand store
│   └── types/              # TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri commands
│   │   ├── image/          # Image processing
│   │   └── utils/          # Utilities
│   ├── icons/              # App icons
│   ├── capabilities/       # Tauri permissions
│   └── tauri.conf.json     # Tauri configuration
├── public/                 # Static assets
├── scripts/                # Build scripts
└── .github/
    └── workflows/          # CI/CD workflows
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - Desktop app framework
- [image-rs](https://github.com/image-rs/image) - Rust image processing library
- [webp](https://crates.io/crates/webp) - WebP encoding library
