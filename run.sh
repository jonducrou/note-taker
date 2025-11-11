#!/bin/bash

# Note Taker App Runner Script
# Usage: ./run.sh [dev|prod|help]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

print_usage() {
    echo "Note Taker App Runner"
    echo ""
    echo "Usage: ./run.sh [option]"
    echo ""
    echo "Options:"
    echo "  dev     Run in development mode with hot reload"
    echo "  prod    Run the built production app"
    echo "  help    Show this help message"
    echo ""
    echo "Default: Run production app if available, otherwise development mode"
}

run_dev() {
    echo "🚀 Starting Note Taker in development mode..."
    npm run dev
}

run_prod() {
    echo "🛑 Stopping any running Note Taker instances..."
    killall "Note Taker" 2>/dev/null || true
    sleep 1

    echo "💿 Unmounting any mounted DMG volumes..."
    hdiutil info | grep -i "note taker" | grep "/Volumes/" | awk -F'\t' '{print $NF}' | while read volume; do
        hdiutil detach "$volume" 2>/dev/null || true
    done

    echo "🧹 Cleaning previous builds..."
    rm -rf dist/ release/

    echo "🗑️  Cleaning build caches..."
    rm -rf node_modules/.cache 2>/dev/null || true
    rm -rf .vite 2>/dev/null || true

    echo "🔨 Building latest version..."
    npm run build

    echo "📦 Creating distribution package..."
    npm run dist

    local app_path="./release/mac-arm64/Note Taker.app"
    local dmg_path="./release/Note Taker-$(node -p "require('./package.json').version")-arm64.dmg"

    # If DMG creation failed with electron-builder, try manual creation
    if [ -d "$app_path" ] && [ ! -f "$dmg_path" ]; then
        echo "💿 electron-builder DMG failed, creating DMG manually..."
        cd release
        hdiutil create -volname "Note Taker" -srcfolder "mac-arm64/Note Taker.app" -ov -format UDZO "$(basename "$dmg_path")" 2>&1 | grep -E "created:|error"
        cd ..

        if [ -f "$dmg_path" ]; then
            echo "✅ DMG created successfully: $dmg_path"
        else
            echo "⚠️  DMG creation failed, but .app bundle is available"
        fi
    fi

    if [ -d "$app_path" ]; then
        echo "📱 Launching Note Taker production app..."
        open "$app_path"
    else
        echo "❌ Production app not found at: $app_path"
        echo "📝 Try running in development mode: ./run.sh dev"
        exit 1
    fi
}

# Parse command line arguments
case "${1:-}" in
    "dev")
        run_dev
        ;;
    "prod")
        run_prod
        ;;
    "help"|"-h"|"--help")
        print_usage
        ;;
    "")
        # Default behavior - try production first, fall back to dev
        if [ -d "./release/mac-arm64/Note Taker.app" ]; then
            echo "🎯 Using production build (use './run.sh dev' for development mode)"
            run_prod
        else
            echo "🔧 Production build not found, starting development mode..."
            run_dev
        fi
        ;;
    *)
        echo "❌ Unknown option: $1"
        echo ""
        print_usage
        exit 1
        ;;
esac