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
    echo "🧹 Cleaning previous builds..."
    rm -rf dist/ release/

    echo "🔨 Building latest version..."
    npm run build

    echo "📦 Creating distribution package..."
    npm run dist

    local app_path="./release/mac-arm64/Note Taker.app"

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