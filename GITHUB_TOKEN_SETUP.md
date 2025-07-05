# GitHub Token Setup Guide

## Why Use a GitHub Token?

The GitHub API has different rate limits for authenticated vs unauthenticated requests:

| Authentication | Rate Limit | Use Case |
|----------------|------------|----------|
| **Unauthenticated** | 60 requests/hour | Small organizations, testing |
| **Authenticated** | 5000 requests/hour | Large organizations, production |

## Creating a GitHub Token

### Step 1: Generate Token
1. Go to [GitHub Settings](https://github.com/settings)
2. Navigate to **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. Click **Generate new token (classic)**
4. Give it a descriptive name like "SBOM Play API Access"

### Step 2: Set Permissions
Select the following scopes:
- ✅ **public_repo** (for public repository access)
- ✅ **read:org** (for organization repository listing)

### Step 3: Copy Token
- Copy the generated token immediately (you won't see it again)
- Store it securely

## Adding Token to Railway

### Method 1: Railway Dashboard
1. Go to your Railway project dashboard
2. Navigate to **Variables** tab
3. Add new variable:
   - **Name**: `GITHUB_TOKEN`
   - **Value**: Your copied token
4. Save the variable

### Method 2: Railway CLI
```bash
railway variables set GITHUB_TOKEN=your_token_here
```

## Local Development

### Method 1: Environment Variable
```bash
export GITHUB_TOKEN=your_token_here
python app.py
```

### Method 2: .env File
Create a `.env` file in your project root:
```
GITHUB_TOKEN=your_token_here
```

## Verification

After adding the token:

1. **Check Dashboard**: The GitHub API Status card should show "Authenticated: Yes"
2. **Rate Limit**: Should show "5000" instead of "60"
3. **Status**: Should show "Authenticated (5000 req/hour)"

## Security Best Practices

### Token Security
- ✅ Store tokens securely (never commit to Git)
- ✅ Use minimal required permissions
- ✅ Rotate tokens regularly
- ✅ Monitor token usage

### Environment Variables
- ✅ Use Railway's environment variables
- ✅ Never hardcode tokens in code
- ✅ Use different tokens for different environments

## Troubleshooting

### Token Not Working?
1. **Check Permissions**: Ensure token has `public_repo` scope
2. **Verify Variable**: Check Railway dashboard for correct variable name
3. **Restart App**: Redeploy to pick up new environment variables
4. **Check Logs**: Look for authentication errors in Railway logs

### Rate Limit Still Low?
1. **Verify Token**: Check if token is being read correctly
2. **Check Scopes**: Ensure token has required permissions
3. **Wait**: Rate limits reset hourly

### Common Errors
- **401 Unauthorized**: Invalid or expired token
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Organization doesn't exist or is private

## Monitoring Usage

### Railway Dashboard
- Monitor API calls in Railway logs
- Check for rate limit warnings
- Track application performance

### Application Dashboard
- View current rate limit status
- Monitor remaining API calls
- Check authentication status

## Cost Considerations

### Free Tier Limits
- **GitHub API**: 5000 requests/hour (authenticated)
- **Railway**: Check current pricing at railway.app
- **Storage**: SQLite database included

### Optimization Tips
- Cache API responses when possible
- Batch requests where feasible
- Monitor usage to avoid hitting limits

---

**With a GitHub token, your SBOM Play application can handle much larger organizations efficiently! 🚀** 