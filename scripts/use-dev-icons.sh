#!/bin/bash

# Switch to development icons
# This copies dev icons (with ribbon) to the main icons directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ICONS_DIR="$PROJECT_DIR/src-tauri/icons"
DEV_ICONS_DIR="$PROJECT_DIR/src-tauri/icons-dev"
PROD_ICONS_DIR="$PROJECT_DIR/src-tauri/icons-prod"

# Backup production icons if not already backed up
if [ ! -d "$PROD_ICONS_DIR" ]; then
    echo "Backing up production icons..."
    cp -r "$ICONS_DIR" "$PROD_ICONS_DIR"
fi

# Copy dev icons
echo "Switching to development icons..."
cp "$DEV_ICONS_DIR"/*.png "$ICONS_DIR/"
cp "$DEV_ICONS_DIR/icon.icns" "$ICONS_DIR/"
cp "$DEV_ICONS_DIR/icon.ico" "$ICONS_DIR/"

echo "Development icons are now active"
