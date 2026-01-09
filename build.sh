#!/bin/bash

# Configuration
# Run from current directory (repo)
MODULE_DIR="$(dirname "$(readlink -f "$0")")"
OUTPUT_DIR="$MODULE_DIR"

# Get timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M)

# Get Git Hash
HASH=""
if git -C "$MODULE_DIR" rev-parse --git-dir > /dev/null 2>&1; then
    if git -C "$MODULE_DIR" rev-parse HEAD > /dev/null 2>&1; then
        HASH=$(git -C "$MODULE_DIR" rev-parse --short HEAD)
    fi
fi

if [ -z "$HASH" ]; then
    HASH="nohash"
fi

# Get Version from module.prop
VERSION=$(grep "^version=" "$MODULE_DIR/module.prop" | cut -d= -f2)
VERSION_CODE=$(grep "^versionCode=" "$MODULE_DIR/module.prop" | cut -d= -f2)

# Construct Filename
ZIP_NAME="FloppyCompanion-${VERSION}-${HASH}-${TIMESTAMP}.zip"

# Build Zip
echo "Packaging $ZIP_NAME..."
cd "$MODULE_DIR"

# Zip contents of current directory
zip -r "$ZIP_NAME" . -x "*.git*" "build.sh" "*.zip"

echo "Done! Output: $MODULE_DIR/$ZIP_NAME"
