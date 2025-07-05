# Railway Quick Start Guide

## 🚀 Deploy SBOM Play to Railway in 5 Minutes

### Step 1: Prepare Your Code
```bash
# Run the deployment checker
./deploy.sh

# Commit your changes
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

### Step 2: Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. Wait for deployment (2-3 minutes)

### Step 3: Access Your App
- Railway will provide a URL like: `https://your-app-name.railway.app`
- Test the health endpoint: `https://your-app-name.railway.app/health`
- Your app is now live! 🎉

## 📋 Configuration Files

| File | Purpose |
|------|---------|
| `Procfile` | Tells Railway how to run the app |
| `runtime.txt` | Specifies Python version |
| `railway.json` | Railway-specific configuration |
| `requirements.txt` | Python dependencies |
| `.dockerignore` | Optimizes build size |

## 🔧 Key Features

- **Automatic Deployment**: Deploys on every push to main branch
- **Health Checks**: Monitors `/health` endpoint
- **Auto-scaling**: Scales based on traffic
- **Logs**: View logs in Railway dashboard
- **Custom Domains**: Add your own domain
- **GitHub API Integration**: Rate limit monitoring and token support

## 🆘 Troubleshooting

### Build Fails?
- Check Railway logs
- Ensure all files are committed
- Verify Python version in `runtime.txt`

### App Won't Start?
- Check application logs
- Verify `PORT` environment variable
- Test locally first: `python app.py`

### GitHub API Issues?
- Check rate limit status on dashboard
- Add `GITHUB_TOKEN` environment variable for higher limits
- Monitor API usage in application logs

### Database Issues?
- SQLite database is created automatically
- For production, consider PostgreSQL

## 📊 Monitoring

- **Logs**: Railway dashboard → Your project → Logs
- **Metrics**: Railway dashboard → Your project → Metrics
- **Health**: Visit `/health` endpoint

## 💰 Cost

- **Free Tier**: Available for development
- **Pay-as-you-go**: For production usage
- **Monitor**: Check usage in Railway dashboard

---

**Your SBOM Play app is now ready for the world! 🌍** 