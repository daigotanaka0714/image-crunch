#!/bin/bash

# Generate development icons with a "DEV" ribbon overlay
# Requires ImageMagick

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ICONS_DIR="$PROJECT_DIR/src-tauri/icons"
DEV_ICONS_DIR="$PROJECT_DIR/src-tauri/icons-dev"

# Create dev icons directory if it doesn't exist
mkdir -p "$DEV_ICONS_DIR"

# Function to add ribbon to an icon
add_ribbon() {
    local input="$1"
    local output="$2"
    local size="$3"

    # Calculate ribbon dimensions based on icon size
    local ribbon_height=$((size / 4))
    local font_size=$((size / 6))
    local ribbon_y=$((size - ribbon_height))

    convert "$input" \
        -fill "rgba(239, 68, 68, 0.9)" \
        -draw "polygon 0,$ribbon_y $size,$ribbon_y $size,$size 0,$size" \
        -fill white \
        -font "Helvetica-Bold" \
        -pointsize "$font_size" \
        -gravity South \
        -annotate +0+$((ribbon_height / 4)) "DEV" \
        "$output"
}

echo "Generating development icons with DEV ribbon..."

# Generate PNG icons with ribbon
for icon in "$ICONS_DIR"/*.png; do
    filename=$(basename "$icon")

    # Get image dimensions
    size=$(identify -format "%w" "$icon" 2>/dev/null || echo "0")

    if [ "$size" -gt 0 ]; then
        echo "Processing $filename (${size}x${size})..."
        add_ribbon "$icon" "$DEV_ICONS_DIR/$filename" "$size"
    fi
done

# Generate .icns for macOS (requires iconutil)
if command -v iconutil &> /dev/null; then
    echo "Generating icon.icns..."

    ICONSET_DIR="$DEV_ICONS_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"

    # Create iconset with various sizes
    convert "$DEV_ICONS_DIR/icon.png" -resize 16x16 "$ICONSET_DIR/icon_16x16.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 32x32 "$ICONSET_DIR/icon_16x16@2x.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 32x32 "$ICONSET_DIR/icon_32x32.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 64x64 "$ICONSET_DIR/icon_32x32@2x.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 128x128 "$ICONSET_DIR/icon_128x128.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 256x256 "$ICONSET_DIR/icon_128x128@2x.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 256x256 "$ICONSET_DIR/icon_256x256.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 512x512 "$ICONSET_DIR/icon_256x256@2x.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 512x512 "$ICONSET_DIR/icon_512x512.png" 2>/dev/null || true
    convert "$DEV_ICONS_DIR/icon.png" -resize 1024x1024 "$ICONSET_DIR/icon_512x512@2x.png" 2>/dev/null || true

    iconutil -c icns "$ICONSET_DIR" -o "$DEV_ICONS_DIR/icon.icns"
    rm -rf "$ICONSET_DIR"
fi

# Generate .ico for Windows
if command -v convert &> /dev/null; then
    echo "Generating icon.ico..."
    convert "$DEV_ICONS_DIR/icon.png" \
        -define icon:auto-resize=256,128,64,48,32,16 \
        "$DEV_ICONS_DIR/icon.ico"
fi

echo "Development icons generated in $DEV_ICONS_DIR"
