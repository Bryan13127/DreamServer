/**
 * Instagram Graph API - User Data Fetcher
 * Fetches Instagram business account details and metrics
 * 
 * Setup:
 * 1. npm install dotenv axios
 * 2. Create .env file with INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID
 * 3. Run: node fetch-userdata.js
 */

require('dotenv').config();
const axios = require('axios');

// Configuration
const INSTAGRAM_API_VERSION = 'v18.0';
const INSTAGRAM_GRAPH_API_URL = `https://graph.instagram.com/${INSTAGRAM_API_VERSION}`;
const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

// Validation
if (!accessToken) {
  console.error('❌ Error: INSTAGRAM_ACCESS_TOKEN not found in .env file');
  console.error('   Please set INSTAGRAM_ACCESS_TOKEN environment variable');
  process.exit(1);
}

if (!businessAccountId) {
  console.error('❌ Error: INSTAGRAM_BUSINESS_ACCOUNT_ID not found in .env file');
  console.error('   Please set INSTAGRAM_BUSINESS_ACCOUNT_ID environment variable');
  process.exit(1);
}

/**
 * Fetch Instagram Business Account Details
 */
async function fetchUserData() {
  try {
    console.log('📱 Fetching Instagram business account details...\n');

    // Fetch account basic info
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

    // Fetch recent media
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
      console.error('3. Check token has required permissions: instagram_business_profile_get_account_info');
      console.error('4. Visit: https://developers.facebook.com/docs/instagram-api/reference/user');
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ Network Error: Unable to reach Instagram API');
      console.error('   Check your internet connection');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

// Run the function
fetchUserData();
