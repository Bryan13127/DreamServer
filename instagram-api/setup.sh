#!/bin/bash

# Instagram API Setup Script
# This script sets up the Instagram API integration for DreamServer

set -e

echo "🚀 Setting up Instagram API Integration..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created"
    echo "⚠️  Please edit .env and add your Instagram API credentials"
else
    echo "✅ .env file already exists"
fi
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your Instagram API credentials:"
echo "   - INSTAGRAM_ACCESS_TOKEN: Get from https://developers.facebook.com/"
echo "   - INSTAGRAM_BUSINESS_ACCOUNT_ID: Your Instagram business account ID"
echo ""
echo "2. Run the script:"
echo "   npm start"
echo ""
