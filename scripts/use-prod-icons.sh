#!/bin/bash

# Switch to production icons
# This restores the original icons (without ribbon)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ICONS_DIR="$PROJECT_DIR/src-tauri/icons"
PROD_ICONS_DIR="$PROJECT_DIR/src-tauri/icons-prod"

if [ -d "$PROD_ICONS_DIR" ]; then
    echo "Restoring production icons..."
    cp "$PROD_ICONS_DIR"/*.png "$ICONS_DIR/"
    cp "$PROD_ICONS_DIR/icon.icns" "$ICONS_DIR/"
    cp "$PROD_ICONS_DIR/icon.ico" "$ICONS_DIR/"
    echo "Production icons are now active"
else
    echo "Production icons backup not found. Icons are already production versions."
fi
