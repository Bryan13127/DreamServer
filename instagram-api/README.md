# Instagram API Integration

This module provides a clean, corrected implementation for fetching Instagram business account data using the modern Instagram Graph API.

## Prerequisites

- Node.js (v14 or higher)
- npm
- Instagram Business Account
- Facebook Developer Account with Instagram API access

## Installation

### 1. Quick Setup

```bash
# From the instagram-api directory
bash setup.sh
```

Or manually:

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2. Get Your Credentials

#### Get Instagram Access Token:
1. Visit [Facebook Developers](https://developers.facebook.com/)
2. Create an app or use existing one
3. Go to Tools → Graph API Explorer
4. Select your app and generate an access token with these permissions:
   - `instagram_business_profile_get_account_info`
   - `instagram_business_read_media`

#### Get Your Business Account ID:
1. Make a Graph API call: `GET /me?fields=id`
2. Your ID will be returned in the response

### 3. Configure Credentials

Edit `.env` file:

```env
INSTAGRAM_ACCESS_TOKEN=your-long-access-token-here
INSTAGRAM_BUSINESS_ACCOUNT_ID=your-account-id-here
```

## Usage

### Fetch User Data

```bash
npm start
```

### Expected Output

```
📱 Fetching Instagram business account details...

✅ Account Details Retrieved:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Username:        @yourprofile
Name:            Your Name
Bio:             Your bio here
Website:         https://yoursite.com
Followers:       1,234
Following:       567
Account ID:      123456789
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📸 Fetching recent media...

Recent Posts:

Post 1:
  Type:      IMAGE
  Caption:   This is a sample caption...
  Likes:     42
  Comments:  5
  Posted:    8/21/2026, 10:30:45 AM

✨ User details fetched successfully.
```

## Troubleshooting

### "INSTAGRAM_ACCESS_TOKEN not found in .env file"
- Make sure `.env` file exists in the `instagram-api` directory
- Verify the token is not expired
- Get a new token from Facebook Developer Portal

### "API Error: 400 Bad Request"
- Check that `INSTAGRAM_BUSINESS_ACCOUNT_ID` is correct
- Verify the account is a Business account (not a personal account)
- Ensure your access token has the required permissions

### "API Error: 401 Unauthorized"
- Your access token has expired or is invalid
- Generate a new token from the Graph API Explorer
- Verify the token has required permissions

### Network timeout errors
- Check your internet connection
- Instagram API may be temporarily unavailable (rare)
- Try again in a few moments

## Key Differences from Original Code

✅ **Fixed Issues:**
- Correct Instagram Graph API v18.0 endpoint
- Proper error handling with helpful messages
- Environment variable validation before API calls
- Removed invalid syntax and incomplete Promise chains
- Added detailed field selection for API requests
- Cross-platform compatible setup script

✅ **Improvements:**
- Shows account metrics (followers, following)
- Displays recent posts with engagement metrics
- Color-coded console output for better readability
- Comprehensive troubleshooting guide
- Proper async/await error handling
- Exit codes for CI/CD integration

## API Fields Available

You can expand the `fields` parameter in `fetch-userdata.js` to include:

- `ig_username` - Instagram username
- `biography` - Bio text
- `website` - Website URL
- `profile_picture_url` - Profile picture
- `followers_count` - Follower count
- `follows_count` - Following count
- `media_count` - Total media count
- `ig_id` - Legacy IG ID

See [Instagram API Reference](https://developers.facebook.com/docs/instagram-api/reference/user) for more fields.

## Security Notes

- Never commit `.env` file to version control
- Never hardcode access tokens
- Use `.env.example` as a template
- Keep access tokens private
- Regenerate tokens periodically
- Use role-based access tokens when possible

## References

- [Instagram Graph API Docs](https://developers.facebook.com/docs/instagram-api)
- [Facebook Developer Portal](https://developers.facebook.com/)
- [Instagram Business Account Setup](https://www.instagram.com/business/help/1576916776027625)
