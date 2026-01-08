# Image Crunch

A powerful desktop application for batch image optimization and format conversion. Convert images to WebP and other formats with ease.

![Image Crunch](./docs/screenshot.png)

## Features

- 🖼️ **Batch Processing** - Process hundreds of images at once
- 📁 **Drag & Drop** - Simply drop files or folders
- 🔄 **Format Conversion** - Convert between JPEG, PNG, GIF, BMP, TIFF, and WebP
- ⚙️ **Customizable Options**
  - Quality adjustment (0-100%)
  - Resize (width/height)
  - Metadata preservation
  - Lossy/Lossless compression
- 📊 **Statistics** - View reduction rates (overall, average, median)
- 🌍 **Multi-language** - English and Japanese support
- 💻 **Cross-platform** - macOS, Windows, and Linux

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)

#### macOS

```bash
# Install Xcode Command Line Tools
xcode-select --install
```

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
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

## Usage

1. **Add Images** - Drag and drop images or folders into the drop zone
2. **Configure Settings**
   - Select output format (WebP recommended)
   - Adjust quality (80% is a good balance)
   - Enable resize if needed
   - Choose metadata and compression options
3. **Select Output Directory** - Choose where to save converted images
4. **Start Conversion** - Click "Start Conversion" and watch the progress

## Tech Stack

- **Backend**: Rust
- **Framework**: Tauri v2
- **Frontend**: React + TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **i18n**: react-i18next

## Development

```bash
# Start development server
pnpm tauri dev

# Type checking
pnpm tsc --noEmit

# Build
pnpm tauri build
```

## Project Structure

```
image-crunch/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # Custom hooks
│   ├── i18n/               # Internationalization
│   ├── store/              # Zustand store
│   └── types/              # TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri commands
│   │   ├── image/          # Image processing
│   │   └── utils/          # Utilities
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing framework
- [image-rs](https://github.com/image-rs/image) - Rust image processing library
- [webp](https://crates.io/crates/webp) - WebP encoding library
