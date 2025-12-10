/**
 * Request Queue Manager - Manages concurrent API requests with rate limit awareness
 * Provides configurable concurrency limits per API endpoint and request queuing
 */
class RequestQueueManager {
    constructor() {
        // Default concurrency limits per API endpoint
        this.concurrencyLimits = {
            'github': 5,
            'osv': 15,
            'npm': 10,
            'pypi': 10,
            'cargo': 10,
            'gem': 10,
            'ecosystems': 10,
            'default': 10
        };
        
        // Active request queues per endpoint
        this.queues = {};
        
        // Rate limit tracking
        this.rateLimits = {};
        
        // Initialize queues for each endpoint
        Object.keys(this.concurrencyLimits).forEach(endpoint => {
            this.queues[endpoint] = {
                running: 0,
                waiting: [],
                concurrencyLimit: this.concurrencyLimits[endpoint]
            };
        });
    }

    /**
     * Set concurrency limit for an endpoint
     */
    setConcurrencyLimit(endpoint, limit) {
        if (!this.queues[endpoint]) {
            this.queues[endpoint] = {
                running: 0,
                waiting: [],
                concurrencyLimit: limit
            };
        } else {
            this.queues[endpoint].concurrencyLimit = limit;
        }
        this.concurrencyLimits[endpoint] = limit;
    }

    /**
     * Set rate limit information for an endpoint
     */
    setRateLimit(endpoint, remaining, resetTime) {
        this.rateLimits[endpoint] = {
            remaining: remaining,
            resetTime: resetTime,
            lastUpdate: Date.now()
        };
    }

    /**
     * Check if we should wait due to rate limits
     */
    async checkRateLimit(endpoint) {
        const rateLimit = this.rateLimits[endpoint];
        if (!rateLimit) return;
        
        // If we're out of requests, wait until reset time
        if (rateLimit.remaining <= 0) {
            const now = Date.now();
            const waitTime = rateLimit.resetTime * 1000 - now;
            if (waitTime > 0) {
                console.log(`⏳ Rate limit reached for ${endpoint}, waiting ${Math.ceil(waitTime / 1000)}s...`);
                await this.sleep(waitTime + 1000); // Add 1 second buffer
            }
        }
    }

    /**
     * Execute a request with queue management
     * @param {string} endpoint - API endpoint identifier (e.g., 'github', 'osv', 'npm')
     * @param {Function} requestFn - Async function that performs the actual request
     * @returns {Promise} - Result of the request function
     */
    async execute(endpoint, requestFn) {
        // Use default endpoint if not specified
        const queueKey = endpoint || 'default';
        const queue = this.queues[queueKey] || this.queues['default'];
        
        // Check rate limits before queuing
        await this.checkRateLimit(queueKey);
        
        return new Promise((resolve, reject) => {
            // Add to queue
            queue.waiting.push({
                requestFn,
                resolve,
                reject
            });
            
            // Process queue
            this.processQueue(queueKey);
        });
    }

    /**
     * Process the queue for an endpoint
     */
    async processQueue(endpoint) {
        const queue = this.queues[endpoint] || this.queues['default'];
        
        // Process waiting requests up to concurrency limit
        while (queue.waiting.length > 0 && queue.running < queue.concurrencyLimit) {
            const item = queue.waiting.shift();
            queue.running++;
            
            // Execute request
            this.executeRequest(item, endpoint)
                .then(result => {
                    queue.running--;
                    item.resolve(result);
                    // Process next item in queue
                    this.processQueue(endpoint);
                })
                .catch(error => {
                    queue.running--;
                    item.reject(error);
                    // Process next item in queue even on error
                    this.processQueue(endpoint);
                });
        }
    }

    /**
     * Execute a single request
     */
    async executeRequest(item, endpoint) {
        try {
            // Check rate limit again before executing
            await this.checkRateLimit(endpoint);
            
            // Execute the request function
            const result = await item.requestFn();
            
            return result;
        } catch (error) {
            // Handle rate limit errors
            if (error.status === 429 || error.status === 403) {
                // Update rate limit info if available in error
                if (error.resetTime) {
                    this.setRateLimit(endpoint, 0, error.resetTime);
                }
                // Retry after waiting
                await this.checkRateLimit(endpoint);
                return this.executeRequest(item, endpoint);
            }
            throw error;
        }
    }

    /**
     * Execute multiple requests in parallel (with concurrency limit)
     * @param {string} endpoint - API endpoint identifier
     * @param {Array<Function>} requestFns - Array of async functions
     * @param {Function} onProgress - Optional progress callback (processed, total)
     * @returns {Promise<Array>} - Array of results
     */
    async executeBatch(endpoint, requestFns, onProgress = null) {
        const results = new Array(requestFns.length);
        let processed = 0;
        
        // Execute all requests through the queue
        const promises = requestFns.map((requestFn, index) => 
            this.execute(endpoint, requestFn)
                .then(result => {
                    results[index] = result;
                    processed++;
                    if (onProgress) {
                        onProgress(processed, requestFns.length);
                    }
                    return result;
                })
                .catch(error => {
                    results[index] = { error: error.message };
                    processed++;
                    if (onProgress) {
                        onProgress(processed, requestFns.length);
                    }
                    return { error: error.message };
                })
        );
        
        await Promise.allSettled(promises);
        return results;
    }

    /**
     * Get queue statistics
     */
    getQueueStats() {
        const stats = {};
        Object.keys(this.queues).forEach(endpoint => {
            const queue = this.queues[endpoint];
            stats[endpoint] = {
                running: queue.running,
                waiting: queue.waiting.length,
                concurrencyLimit: queue.concurrencyLimit
            };
        });
        return stats;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in other modules
window.RequestQueueManager = RequestQueueManager;

// Create global instance
const requestQueueManager = new RequestQueueManager();
window.requestQueueManager = requestQueueManager;

