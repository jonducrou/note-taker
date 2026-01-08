#!/bin/bash
set -e

# Build DMG for Note Taker
# Usage: ./scripts/build-dmg.sh

cd "$(dirname "$0")/.."

VERSION=$(grep -A1 'CFBundleShortVersionString' NoteTaker/Info.plist | grep string | sed 's/.*<string>\(.*\)<\/string>.*/\1/')
APP_NAME="Note Taker"
BUNDLE_ID="com.jonducrou.NoteTaker"

echo "Building Note Taker v${VERSION}..."

# Clean previous builds
rm -rf .build/release/NoteTaker.app
rm -rf dist

# Build release
swift build -c release

# Create app bundle structure
APP_DIR=".build/release/${APP_NAME}.app"
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# Copy binary
cp .build/release/NoteTaker "${APP_DIR}/Contents/MacOS/${APP_NAME}"

# Create Info.plist
cat > "${APP_DIR}/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright 2026. All rights reserved.</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>Note Taker uses the microphone for real-time speech transcription during note-taking.</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Note Taker uses speech recognition to transcribe your voice into text notes.</string>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
EOF

# Copy icon if exists
if [ -f "../assets/app-icon.icns" ]; then
    cp "../assets/app-icon.icns" "${APP_DIR}/Contents/Resources/AppIcon.icns"
fi

# Create PkgInfo
echo -n "APPL????" > "${APP_DIR}/Contents/PkgInfo"

echo "App bundle created at ${APP_DIR}"

# Create dist directory
mkdir -p dist

# Create DMG
DMG_NAME="NoteTaker-${VERSION}.dmg"
DMG_PATH="dist/${DMG_NAME}"

echo "Creating DMG..."

# Create temporary DMG directory
DMG_TEMP="dist/dmg-temp"
rm -rf "${DMG_TEMP}"
mkdir -p "${DMG_TEMP}"

# Copy app to temp directory
cp -R "${APP_DIR}" "${DMG_TEMP}/"

# Create symlink to Applications
ln -s /Applications "${DMG_TEMP}/Applications"

# Create DMG
hdiutil create -volname "${APP_NAME}" -srcfolder "${DMG_TEMP}" -ov -format UDZO "${DMG_PATH}"

# Clean up
rm -rf "${DMG_TEMP}"

echo ""
echo "DMG created: ${DMG_PATH}"
echo "Size: $(du -h "${DMG_PATH}" | cut -f1)"
