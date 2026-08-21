# Kali Linux Usage Guide

## Quick Setup

```bash
# Download and run the setup script
cd ~/DreamServer/instagram-api
bash kali-setup.sh
```

Or manually:

```bash
# Update packages
sudo apt-get update
sudo apt-get install -y nodejs npm

# Install dependencies
npm install axios dotenv

# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env
```

## Running on Kali

### Option 1: Using the quick-start script
```bash
bash kali-run.sh
```

### Option 2: Direct execution
```bash
node fetch-userdata.js
```

### Option 3: Using npm
```bash
npm start
```

## Kali-Specific Notes

### Auto-Start on Boot (Optional)
Add to crontab:
```bash
crontab -e
```

Add this line to run every 6 hours:
```
0 */6 * * * cd /path/to/instagram-api && node fetch-userdata.js >> instagram-api.log 2>&1
```

### Running in Background
```bash
# Run in background with nohup
nohup node fetch-userdata.js > output.log 2>&1 &

# View logs
tail -f output.log
```

### Using screen/tmux (Terminal Multiplexing)
```bash
# With screen
screen -S instagram-api
bash kali-run.sh
# Press Ctrl+A then D to detach

# Reattach later
screen -r instagram-api
```

```bash
# With tmux
tmux new-session -d -s instagram-api
tmux send-keys -t instagram-api "cd ~/DreamServer/instagram-api && bash kali-run.sh" Enter
# List sessions
tmux ls
```

### Troubleshooting on Kali

**Issue: Node.js not found**
```bash
sudo apt-get install -y nodejs npm
node --version
```

**Issue: Permission denied**
```bash
chmod +x kali-setup.sh kali-run.sh
chmod +x fetch-userdata.js
```

**Issue: Network connectivity**
```bash
# Test connection to Instagram API
curl -s https://graph.instagram.com/v18.0/me \
  -H "Authorization: Bearer YOUR_TOKEN" | head -20
```

**Issue: Old Node.js version**
```bash
# Install newer version via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Security on Kali

### 1. Protect your .env file
```bash
chmod 600 .env
# Only owner can read/write
```

### 2. Check file permissions
```bash
ls -la .env
# Should show: -rw------- (600)
```

### 3. Don't commit .env to git
```bash
# Add to .gitignore
echo ".env" >> .gitignore
```

### 4. Use separate tokens for different purposes
- Development token (limited permissions)
- Production token (full permissions)
- Monitor token expiration

### 5. Rotate tokens periodically
```bash
# Regenerate on Facebook Developer Portal
# Update .env with new token
# Restart the application
```

## Output Example

```
🔓 Kali Linux - Instagram API Fetcher
======================================

📱 Fetching Instagram business account details...

✅ Account Details Retrieved:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Username:        @myprofile
Name:            My Name
Bio:             My bio here
Website:         https://mysite.com
Followers:       1,234
Following:       567
Account ID:      123456789
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📸 Fetching recent media...

Recent Posts:

Post 1:
  Type:      IMAGE
  Caption:   First post caption...
  Likes:     42
  Comments:  5
  Posted:    8/21/2026, 10:30:45 AM

✨ User details fetched successfully.
```

## Advanced: Using as Kali Tool

To add as a permanent Kali tool:

```bash
# Copy to /opt
sudo cp -r ~/DreamServer/instagram-api /opt/instagram-api

# Create symlink
sudo ln -s /opt/instagram-api/kali-run.sh /usr/local/bin/instagram-api

# Now run from anywhere
instagram-api
```

## Integration with Other Kali Tools

### With Burp Suite
Monitor Instagram API calls in Burp:
1. Configure Node.js proxy settings
2. Run script through Burp interceptor
3. Analyze API requests/responses

### With Metasploit
Integrate Instagram data for OSINT:
```ruby
# Add custom Metasploit module to parse Instagram data
# See: /usr/share/metasploit-framework/modules/
```

### With Recon-ng
```bash
recon-ng
# Use workspace to store Instagram findings
```

## References

- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)
- [Kali Linux Documentation](https://www.kali.org/docs/)
- [Node.js on Kali](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions)
