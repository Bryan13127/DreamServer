#!/bin/bash

# Instagram API Integration for Kali Linux
# This script sets up and runs Instagram API integration on Kali Linux
# Requires: Node.js, npm, curl

set -e

echo "🔓 Kali Linux - Instagram API Setup"
echo "===================================="
echo ""

# Check if running on Kali
if ! grep -qi "kali" /etc/os-release 2>/dev/null; then
    echo "⚠️  Warning: This doesn't appear to be Kali Linux"
    echo "   Proceeding anyway..."
fi
echo ""

# Update system packages
echo "📦 Updating package lists..."
sudo apt-get update -y > /dev/null 2>&1 || true
echo "✅ Package lists updated"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "📥 Installing Node.js..."
    sudo apt-get install -y nodejs npm
    echo "✅ Node.js installed"
else
    echo "✅ Node.js already installed: $(node --version)"
fi
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "📥 Installing npm..."
    sudo apt-get install -y npm
    echo "✅ npm installed"
else
    echo "✅ npm already installed: $(npm --version)"
fi
echo ""

# Create instagram-api directory if it doesn't exist
if [ ! -d "instagram-api" ]; then
    echo "📁 Creating instagram-api directory..."
    mkdir -p instagram-api
    cd instagram-api
else
    echo "✅ instagram-api directory exists"
    cd instagram-api
fi
echo ""

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# Instagram Graph API Credentials
# Get your access token from: https://developers.facebook.com/
INSTAGRAM_ACCESS_TOKEN=your-access-token-here
INSTAGRAM_BUSINESS_ACCOUNT_ID=your-business-account-id-here
EOF
    echo "✅ .env file created"
    echo "⚠️  IMPORTANT: Edit .env and add your Instagram API credentials"
else
    echo "✅ .env file already exists"
fi
echo ""

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install axios dotenv --save > /dev/null 2>&1
echo "✅ Dependencies installed"
echo ""

# Create the main script if it doesn't exist
if [ ! -f "fetch-userdata.js" ]; then
    echo "📝 Creating fetch-userdata.js..."
    cat > fetch-userdata.js << 'EOF'
require('dotenv').config();
const axios = require('axios');

const INSTAGRAM_API_VERSION = 'v18.0';
const INSTAGRAM_GRAPH_API_URL = `https://graph.instagram.com/${INSTAGRAM_API_VERSION}`;
const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

if (!accessToken) {
  console.error('❌ Error: INSTAGRAM_ACCESS_TOKEN not found in .env file');
  process.exit(1);
}

if (!businessAccountId) {
  console.error('❌ Error: INSTAGRAM_BUSINESS_ACCOUNT_ID not found in .env file');
  process.exit(1);
}

async function fetchUserData() {
  try {
    console.log('📱 Fetching Instagram business account details...\n');

    const accountResponse = await axios({
      method: 'get',
      url: `${INSTAGRAM_GRAPH_API_URL}/${businessAccountId}`,
      params: {
        fields: 'id,username,name,biography,website,profile_picture_url,followers_count,follows_count',
        access_token: accessToken
      },
      headers: {
        'Accept': 'application/json'
      }
    });

    const accountData = accountResponse.data;
    console.log('✅ Account Details Retrieved:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Username:        ${accountData.username || 'N/A'}`);
    console.log(`Name:            ${accountData.name || 'N/A'}`);
    console.log(`Bio:             ${accountData.biography || 'N/A'}`);
    console.log(`Website:         ${accountData.website || 'N/A'}`);
    console.log(`Followers:       ${accountData.followers_count || 'N/A'}`);
    console.log(`Following:       ${accountData.follows_count || 'N/A'}`);
    console.log(`Account ID:      ${accountData.id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📸 Fetching recent media...\n');
    const mediaResponse = await axios({
      method: 'get',
      url: `${INSTAGRAM_GRAPH_API_URL}/${businessAccountId}/media`,
      params: {
        fields: 'id,caption,media_type,media_url,timestamp,like_count,comments_count',
        limit: 5,
        access_token: accessToken
      }
    });

    if (mediaResponse.data.data && mediaResponse.data.data.length > 0) {
      console.log('Recent Posts:\n');
      mediaResponse.data.data.forEach((media, index) => {
        console.log(`Post ${index + 1}:`);
        console.log(`  Type:      ${media.media_type}`);
        console.log(`  Caption:   ${media.caption ? media.caption.substring(0, 50) + '...' : 'No caption'}`);
        console.log(`  Likes:     ${media.like_count}`);
        console.log(`  Comments:  ${media.comments_count}`);
        console.log(`  Posted:    ${new Date(media.timestamp).toLocaleString()}\n`);
      });
    } else {
      console.log('No recent media found.\n');
    }

    console.log('✨ User details fetched successfully.');
    return {
      account: accountData,
      media: mediaResponse.data.data
    };

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.statusText);
      console.error('Message:', error.response.data.error?.message || 'Unknown error');
      console.error('\nTroubleshooting:');
      console.error('1. Verify INSTAGRAM_ACCESS_TOKEN is valid and not expired');
      console.error('2. Verify INSTAGRAM_BUSINESS_ACCOUNT_ID is correct');
      console.error('3. Check token has required permissions');
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ Network Error: Unable to reach Instagram API');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

fetchUserData();
EOF
    echo "✅ fetch-userdata.js created"
else
    echo "✅ fetch-userdata.js already exists"
fi
echo ""

# Make the main script executable
chmod +x fetch-userdata.js 2>/dev/null || true

echo "🎉 Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Edit .env file with your credentials:"
echo "   nano .env"
echo ""
echo "2. Run the script:"
echo "   node fetch-userdata.js"
echo ""
echo "3. Or use npm:"
echo "   npm start"
echo ""
echo "📖 To get credentials:"
echo "   - Visit: https://developers.facebook.com/"
echo "   - Create/select an app"
echo "   - Go to Tools → Graph API Explorer"
echo "   - Generate access token with instagram_business_profile_get_account_info permission"
echo ""
