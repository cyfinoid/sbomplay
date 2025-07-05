# Persistent Analysis Strategy

## Overview

SBOM Play now uses a **persistent analysis strategy** that can process unlimited repositories by intelligently handling GitHub API rate limits.

## How It Works

### Rate Limit Handling
- **Automatic Waiting**: When rate limit is hit, the system waits for the reset time
- **Persistent Processing**: Continues processing after rate limit resets
- **Adaptive Delays**: Adjusts delays based on remaining rate limit
- **No Early Stopping**: Processes all repositories regardless of rate limits

### Adaptive Delays
```python
# Normal operation: 0.1s delay between requests
time.sleep(0.1)

# When rate limit is low (≤20 remaining): 0.5s delay
time.sleep(0.5)

# When rate limit is very low (≤20 remaining): 2.0s delay
time.sleep(2.0)
```

### Rate Limit Monitoring
- **Every 20 repositories**: Check rate limit status
- **Every 5 repositories**: Adjust delays based on remaining requests
- **Real-time feedback**: Shows remaining requests and wait times

## Benefits

### ✅ **Unlimited Processing**
- Can process **hundreds of repositories** over time
- **No artificial limits** on organization size
- **Persistent across rate limit cycles**

### ✅ **Intelligent Timing**
- **Adaptive delays** prevent hitting rate limits
- **Automatic waiting** when limits are reached
- **Optimal throughput** while respecting API limits

### ✅ **User Experience**
- **Clear feedback** about rate limit status
- **Progress continues** even during waits
- **No manual intervention** required

## Rate Limit Scenarios

### Without GitHub Token (60 requests/hour)
```
Hour 1: Process 60 repositories → Wait for reset
Hour 2: Process 60 repositories → Wait for reset
Hour 3: Process 60 repositories → Continue...
```

### With GitHub Token (5,000 requests/hour)
```
Hour 1: Process 500+ repositories → Continue
Hour 2: Process 500+ repositories → Continue
Hour 3: Process 500+ repositories → Continue...
```

## Processing Timeline

### Small Organization (50 repos)
- **Duration**: ~5-10 minutes
- **Rate limits**: 0-1 waits
- **Efficiency**: High

### Medium Organization (200 repos)
- **Duration**: ~20-40 minutes
- **Rate limits**: 2-4 waits
- **Efficiency**: Good

### Large Organization (1000+ repos)
- **Duration**: 2-4 hours
- **Rate limits**: 15-20 waits
- **Efficiency**: Steady

## User Feedback

### During Processing
```
⏳ Rate limit low (15 remaining). Adding 2.0s delay...
⚠️  Rate limit running low: 5 requests remaining. Will wait for reset if needed.
⏳ Rate limit exceeded. Waiting 1800 seconds for reset...
✅ Rate limit reset. Continuing...
```

### Progress Page
- Shows current repository being processed
- Displays rate limit status
- Indicates persistent analysis approach
- No artificial stopping

## Configuration

### Environment Variables
```bash
# Optional: GitHub token for higher limits
export GITHUB_TOKEN=your_token_here

# Optional: Custom delays
export SBOM_DELAY_NORMAL=0.5
export SBOM_DELAY_LOW=2.0
```

### Adaptive Behavior
- **Automatic detection** of rate limit status
- **Dynamic adjustment** of delays
- **Persistent retry** on rate limit hits
- **Graceful handling** of network issues

## Best Practices

### For Large Organizations
1. **Set a GitHub token** for higher rate limits
2. **Start analysis** and let it run
3. **Monitor progress** via the web interface
4. **Be patient** - large orgs take time

### For Development
1. **Use small organizations** for testing
2. **Monitor logs** for rate limit behavior
3. **Test with and without tokens**

## Troubleshooting

### Analysis Seems Stuck
- Check logs for rate limit messages
- Look for "Waiting for reset" messages
- Verify network connectivity

### Slow Progress
- Normal for large organizations
- Rate limits cause natural delays
- Progress will continue after resets

### Rate Limit Errors
- System automatically handles these
- No manual intervention needed
- Analysis will resume after reset

## Conclusion

The persistent analysis strategy ensures that **no repository is left unprocessed** due to rate limits. The system intelligently manages API usage while providing clear feedback about the process.

**Key Benefits:**
- ✅ **Unlimited scalability**
- ✅ **Automatic rate limit handling**
- ✅ **Clear user feedback**
- ✅ **No manual intervention required** 