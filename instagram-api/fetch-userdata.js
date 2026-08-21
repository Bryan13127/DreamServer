/**
 * Instagram Graph API - Enhanced User Data Fetcher
 * Fetches Instagram business account details and metrics
 * 
 * Supports multiple credential sources:
 * 1. Environment variables (.env file)
 * 2. Command-line arguments
 * 3. Test mode with mock data
 * 
 * Usage:
 *   node fetch-userdata.js                    # Uses .env file
 *   node fetch-userdata.js --token ABC123     # Uses command-line token
 *   node fetch-userdata.js --test             # Uses mock test data
 *   node fetch-userdata.js --env .env.test    # Uses specific .env file
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

class Config {
  constructor() {
    this.parseArguments();
    this.loadCredentials();
    this.validateConfiguration();
  }

  parseArguments() {
    const args = process.argv.slice(2);
    this.testMode = args.includes('--test');
    this.verbose = args.includes('--verbose') || args.includes('-v');
    this.customEnvFile = null;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--env' && args[i + 1]) {
        this.customEnvFile = args[i + 1];
      } else if (args[i] === '--token' && args[i + 1]) {
        this.cliToken = args[i + 1];
      } else if (args[i] === '--account' && args[i + 1]) {
        this.cliAccountId = args[i + 1];
      }
    }
  }

  loadCredentials() {
    // Load custom env file if specified
    if (this.customEnvFile) {
      const customEnvPath = path.resolve(this.customEnvFile);
      if (fs.existsSync(customEnvPath)) {
        require('dotenv').config({ path: customEnvPath });
        this.log(`Loaded custom env file: ${customEnvPath}`);
      }
    }

    this.apiVersion = process.env.INSTAGRAM_API_VERSION || 'v18.0';
    this.apiUrl = `https://graph.instagram.com/${this.apiVersion}`;
    this.timeout = parseInt(process.env.API_TIMEOUT) || 5000;
    this.logLevel = process.env.LOG_LEVEL || 'info';

    // Credential priority: CLI args > Environment variables > Test data
    if (this.testMode) {
      this.accessToken = 'TEST_TOKEN_' + Date.now();
      this.businessAccountId = 'TEST_ACCOUNT_123456789';
      this.log('✅ Using TEST MODE with mock data', 'info');
    } else {
      this.accessToken = this.cliToken || process.env.INSTAGRAM_ACCESS_TOKEN;
      this.businessAccountId = this.cliAccountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    }
  }

  validateConfiguration() {
    if (!this.testMode) {
      if (!this.accessToken) {
        this.error('❌ INSTAGRAM_ACCESS_TOKEN not provided');
        this.printHelp();
        process.exit(1);
      }

      if (!this.businessAccountId) {
        this.error('❌ INSTAGRAM_BUSINESS_ACCOUNT_ID not provided');
        this.printHelp();
        process.exit(1);
      }

      if (this.accessToken.includes('your-') || this.accessToken.length < 20) {
        this.error('❌ Invalid or placeholder INSTAGRAM_ACCESS_TOKEN');
        this.printHelp();
        process.exit(1);
      }
    }
  }

  printHelp() {
    console.log(`
📖 Instagram API Fetcher - Usage

USAGE:
  node fetch-userdata.js [OPTIONS]

OPTIONS:
  --test              Use test mode with mock data (no API calls)
  --token TOKEN       Specify access token via CLI
  --account ID        Specify business account ID via CLI
  --env FILE          Load credentials from custom .env file
  --verbose, -v       Enable verbose logging

EXAMPLES:
  # Use .env file
  node fetch-userdata.js

  # Use test mode
  node fetch-userdata.js --test

  # Use CLI credentials
  node fetch-userdata.js --token YOUR_TOKEN --account YOUR_ACCOUNT_ID

  # Use custom env file
  node fetch-userdata.js --env .env.test

  # Verbose mode
  node fetch-userdata.js --verbose

GETTING CREDENTIALS:
  1. Visit: https://developers.facebook.com/
  2. Create/select an app
  3. Navigate to: Tools → Graph API Explorer
  4. Select your app
  5. Generate access token with these permissions:
     - instagram_business_profile_get_account_info
     - instagram_business_read_media
  6. Get your Business Account ID from the API response

CONFIGURATION:
  Create a .env file in this directory with:
    INSTAGRAM_ACCESS_TOKEN=your-token-here
    INSTAGRAM_BUSINESS_ACCOUNT_ID=your-account-id-here
    `);
  }

  log(message, level = 'info') {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.logLevel]) {
      console.log(message);
    }
  }

  error(message) {
    console.error(message);
  }
}

// ============================================================================
// MOCK DATA FOR TEST MODE
// ============================================================================

const MOCK_ACCOUNT_DATA = {
  id: 'TEST_ACCOUNT_123456789',
  username: 'test_instagram_account',
  name: 'Test Instagram Account',
  biography: 'This is a test account for API demonstration 🚀',
  website: 'https://developers.facebook.com/',
  profile_picture_url: 'https://platform-lookaside.fbsbx.com/platform/default_avatar.png',
  followers_count: 1234,
  follows_count: 567,
  media_count: 89
};

const MOCK_MEDIA_DATA = [
  {
    id: 'MEDIA_001',
    caption: 'Beautiful sunset at the beach 🌅 #instagram #travel',
    media_type: 'IMAGE',
    media_url: 'https://example.com/image1.jpg',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    like_count: 1543,
    comments_count: 89
  },
  {
    id: 'MEDIA_002',
    caption: 'Coffee time ☕ #morning #coffee',
    media_type: 'IMAGE',
    media_url: 'https://example.com/image2.jpg',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    like_count: 892,
    comments_count: 45
  },
  {
    id: 'MEDIA_003',
    caption: 'Weekend vibes 🎉',
    media_type: 'IMAGE',
    media_url: 'https://example.com/image3.jpg',
    timestamp: new Date(Date.now() - 259200000).toISOString(),
    like_count: 2156,
    comments_count: 127
  },
  {
    id: 'MEDIA_004',
    caption: 'Coding session with friends 💻',
    media_type: 'IMAGE',
    media_url: 'https://example.com/image4.jpg',
    timestamp: new Date(Date.now() - 345600000).toISOString(),
    like_count: 654,
    comments_count: 32
  },
  {
    id: 'MEDIA_005',
    caption: 'New project launch! 🚀',
    media_type: 'IMAGE',
    media_url: 'https://example.com/image5.jpg',
    timestamp: new Date(Date.now() - 432000000).toISOString(),
    like_count: 3421,
    comments_count: 198
  }
];

// ============================================================================
// API CLIENT
// ============================================================================

class InstagramAPIClient {
  constructor(config) {
    this.config = config;
  }

  async fetchAccountData() {
    this.config.log('📱 Fetching Instagram business account details...', 'info');

    if (this.config.testMode) {
      return MOCK_ACCOUNT_DATA;
    }

    try {
      const response = await axios({
        method: 'get',
        url: `${this.config.apiUrl}/${this.config.businessAccountId}`,
        params: {
          fields: 'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count',
          access_token: this.config.accessToken
        },
        headers: {
          'Accept': 'application/json'
        },
        timeout: this.config.timeout
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to fetch account data');
      throw error;
    }
  }

  async fetchMediaData() {
    this.config.log('📸 Fetching recent media...', 'info');

    if (this.config.testMode) {
      return MOCK_MEDIA_DATA;
    }

    try {
      const response = await axios({
        method: 'get',
        url: `${this.config.apiUrl}/${this.config.businessAccountId}/media`,
        params: {
          fields: 'id,caption,media_type,media_url,timestamp,like_count,comments_count',
          limit: 5,
          access_token: this.config.accessToken
        },
        timeout: this.config.timeout
      });

      return response.data.data || [];
    } catch (error) {
      this.handleError(error, 'Failed to fetch media data');
      throw error;
    }
  }

  handleError(error, context) {
    if (error.response) {
      console.error(`❌ ${context}`);
      console.error(`   Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`   Message: ${error.response.data.error?.message || 'Unknown error'}`);
      console.error('\n🔧 Troubleshooting:');
      console.error('   1. Verify INSTAGRAM_ACCESS_TOKEN is valid and not expired');
      console.error('   2. Verify INSTAGRAM_BUSINESS_ACCOUNT_ID is correct');
      console.error('   3. Ensure token has required permissions');
      console.error('   4. Visit: https://developers.facebook.com/docs/instagram-api/');
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ Network Error: Unable to reach Instagram API');
      console.error('   Check your internet connection');
    } else if (error.code === 'ECONNABORTED') {
      console.error('❌ Request Timeout: API took too long to respond');
      console.error(`   Timeout: ${this.config.timeout}ms`);
    } else {
      console.error(`❌ ${context}: ${error.message}`);
    }
  }
}

// ============================================================================
// OUTPUT FORMATTER
// ============================================================================

class OutputFormatter {
  static formatAccountDetails(account) {
    console.log('\n✅ Account Details Retrieved:\n');
    console.log('━'.repeat(50));
    console.log(`Username:        ${account.username || 'N/A'}`);
    console.log(`Name:            ${account.name || 'N/A'}`);
    console.log(`Bio:             ${account.biography || 'N/A'}`);
    console.log(`Website:         ${account.website || 'N/A'}`);
    console.log(`Followers:       ${account.followers_count || 'N/A'}`);
    console.log(`Following:       ${account.follows_count || 'N/A'}`);
    console.log(`Total Posts:     ${account.media_count || 'N/A'}`);
    console.log(`Account ID:      ${account.id}`);
    console.log('━'.repeat(50));
  }

  static formatMediaList(mediaList) {
    if (!mediaList || mediaList.length === 0) {
      console.log('\nNo recent media found.\n');
      return;
    }

    console.log('\n📺 Recent Posts:\n');
    mediaList.forEach((media, index) => {
      console.log(`Post ${index + 1}:`);
      console.log(`  Type:      ${media.media_type}`);
      console.log(`  Caption:   ${media.caption ? media.caption.substring(0, 60) + '...' : 'No caption'}`);
      console.log(`  Likes:     ${media.like_count}`);
      console.log(`  Comments:  ${media.comments_count}`);
      console.log(`  Posted:    ${new Date(media.timestamp).toLocaleString()}`);
      console.log('');
    });
  }

  static printSuccess() {
    console.log('✨ User details fetched successfully!\n');
  }

  static printTestModeNotice() {
    console.log('\n⚠️  TEST MODE ACTIVE - Using mock data for demonstration\n');
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main() {
  try {
    const config = new Config();

    if (config.testMode) {
      OutputFormatter.printTestModeNotice();
    }

    const client = new InstagramAPIClient(config);

    // Fetch data
    const accountData = await config.testMode
      ? MOCK_ACCOUNT_DATA
      : await client.fetchAccountData();

    const mediaData = await config.testMode
      ? MOCK_MEDIA_DATA
      : await client.fetchMediaData();

    // Format and display output
    OutputFormatter.formatAccountDetails(accountData);
    OutputFormatter.formatMediaList(mediaData);
    OutputFormatter.printSuccess();

    return {
      account: accountData,
      media: mediaData,
      timestamp: new Date().toISOString(),
      testMode: config.testMode
    };

  } catch (error) {
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}

module.exports = { Config, InstagramAPIClient, OutputFormatter };
