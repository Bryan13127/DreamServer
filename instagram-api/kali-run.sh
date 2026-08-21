#!/bin/bash

# Instagram API - Kali Linux Quick Start
# One-liner setup and run for Kali systems

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔓 Kali Linux - Instagram API Fetcher"
echo "======================================"
echo ""

# Ensure dependencies
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo "Installing Node.js and npm..."
    sudo apt-get update && sudo apt-get install -y nodejs npm
fi

# Install npm packages
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install axios dotenv
fi

# Check for .env
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env 2>/dev/null || cat > .env << 'EOF'
INSTAGRAM_ACCESS_TOKEN=your-token-here
INSTAGRAM_BUSINESS_ACCOUNT_ID=your-id-here
EOF
    echo "❌ Please edit .env with your credentials first!"
    echo "   nano .env"
    exit 1
fi

# Run the fetcher
echo "Starting Instagram API Fetcher..."
echo ""
node fetch-userdata.js
