#!/bin/bash
set -e

echo "Building Note Taker (Swift version)..."

# Build the app
swift build -c release

# Create app bundle
APP_NAME="Note Taker.app"
BUILD_DIR=".build/release"
APP_DIR="$BUILD_DIR/$APP_NAME"

mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Copy executable
cp "$BUILD_DIR/NoteTaker" "$APP_DIR/Contents/MacOS/"

# Copy Info.plist
cp Info.plist "$APP_DIR/Contents/"

echo "Build complete! App bundle created at: $APP_DIR"
echo ""
echo "To run the app:"
echo "  open \"$APP_DIR\""
echo ""
echo "To install:"
echo "  cp -r \"$APP_DIR\" /Applications/"
