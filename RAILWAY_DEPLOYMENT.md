# Railway Deployment Guide for SBOM Play

This guide will walk you through deploying the SBOM Play web application on Railway.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: Your code should be in a GitHub repository
3. **Railway CLI** (optional): Install for local development

## Deployment Steps

### Step 1: Prepare Your Repository

Ensure your repository contains all the necessary files:

```
sbomplay/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── Procfile              # Railway process definition
├── runtime.txt           # Python version specification
├── railway.json          # Railway configuration
├── .dockerignore         # Docker ignore file
├── templates/            # HTML templates
├── static/              # Static assets
└── utils/               # Utility modules
```

### Step 2: Connect to Railway

1. **Login to Railway Dashboard**
   - Go to [railway.app](https://railway.app)
   - Sign in with your GitHub account

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

3. **Configure Deployment**
   - Railway will automatically detect it's a Python project
   - The `Procfile` will tell Railway how to run the app
   - The `railway.json` provides additional configuration

### Step 3: Environment Variables (Recommended)

Railway will automatically set the `PORT` environment variable. For better performance, consider adding:

1. Go to your project in Railway Dashboard
2. Navigate to "Variables" tab
3. Add the following environment variables:

#### GitHub Token (Recommended)
- **Variable Name**: `GITHUB_TOKEN`
- **Value**: Your GitHub Personal Access Token
- **Purpose**: Increases rate limit from 60 to 5000 requests/hour

To create a GitHub token:
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with `public_repo` scope
3. Copy the token and add it to Railway environment variables

#### Optional Variables
- **FLASK_ENV**: Set to `production` for production environment
- **FLASK_DEBUG**: Set to `False` for production

### Step 4: Deploy

1. **Automatic Deployment**
   - Railway will automatically deploy when you push to your main branch
   - You can also trigger manual deployments from the dashboard

2. **Monitor Deployment**
   - Check the "Deployments" tab for build logs
   - Monitor the "Logs" tab for runtime logs

### Step 5: Access Your Application

1. **Get Your URL**
   - Railway will provide a URL like `https://your-app-name.railway.app`
   - You can also set up a custom domain

2. **Test Your Application**
   - Visit the URL to ensure it's working
   - Test the GitHub organization analysis feature

## Configuration Files Explained

### Procfile
```
web: python app.py
```
Tells Railway to run `python app.py` as a web process.

### runtime.txt
```
python-3.11.7
```
Specifies the Python version to use.

### railway.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "python app.py",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- **builder**: Uses Nixpacks for building
- **startCommand**: How to start the application
- **healthcheckPath**: Path to check if app is healthy
- **restartPolicy**: Automatic restart on failure

### .dockerignore
Excludes unnecessary files from the deployment to optimize build time and image size.

## Production Considerations

### Database
- The SQLite database will be created fresh on each deployment
- For persistent data, consider using Railway's PostgreSQL service
- You can modify `utils/database.py` to use PostgreSQL instead

### Environment Variables
- `PORT`: Automatically set by Railway
- `FLASK_ENV`: Set to `production` for production
- `FLASK_DEBUG`: Set to `False` for production

### Scaling
- Railway automatically scales based on traffic
- You can configure scaling in the Railway dashboard
- Monitor usage in the "Metrics" tab

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check that all dependencies are in `requirements.txt`
   - Ensure Python version in `runtime.txt` is supported
   - Review build logs in Railway dashboard

2. **Runtime Errors**
   - Check application logs in Railway dashboard
   - Ensure all required files are present
   - Verify environment variables are set correctly

3. **Database Issues**
   - SQLite database is created automatically
   - Check file permissions if using custom database path
   - Consider using Railway's PostgreSQL for production

### Debugging

1. **View Logs**
   - Go to Railway dashboard → Your project → Logs
   - Check both build and runtime logs

2. **Local Testing**
   - Test locally with: `python app.py`
   - Ensure all dependencies are installed

3. **Environment Variables**
   - Check that `PORT` is being set correctly
   - Verify any custom environment variables

## Monitoring and Maintenance

### Health Checks
- Railway automatically checks `/` endpoint
- Application should return 200 OK for health checks

### Logs
- Monitor logs in Railway dashboard
- Set up log aggregation if needed

### Updates
- Push changes to GitHub to trigger automatic deployment
- Monitor deployment status in Railway dashboard

## Cost Optimization

### Railway Pricing
- Free tier available for development
- Pay-as-you-go pricing for production
- Monitor usage in Railway dashboard

### Optimization Tips
- Use `.dockerignore` to reduce build size
- Minimize dependencies in `requirements.txt`
- Use efficient database queries
- Implement caching where appropriate

## Security Considerations

### Environment Variables
- Never commit sensitive data to Git
- Use Railway's environment variables for secrets
- Rotate API keys regularly

### Dependencies
- Keep dependencies updated
- Monitor for security vulnerabilities
- Use `pip-audit` to check for issues

## Support

### Railway Support
- [Railway Documentation](https://docs.railway.app/)
- [Railway Discord](https://discord.gg/railway)
- [Railway GitHub](https://github.com/railwayapp)

### Application Support
- Check the main README for application-specific issues
- Review logs for error messages
- Test locally before deploying

---

**Your SBOM Play application is now ready for production deployment on Railway!** 