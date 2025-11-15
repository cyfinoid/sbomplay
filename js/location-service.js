/**
 * Location Service - Geocodes location strings to lat/lng coordinates
 * Uses Nominatim (OpenStreetMap) API for geocoding
 * Caches results in IndexedDB for persistent storage
 */
class LocationService {
    constructor() {
        this.baseUrl = 'https://nominatim.openstreetmap.org/search';
        this.geocodeCache = new Map(); // In-memory cache for geocoded locations
        this.inFlightRequests = new Map(); // Track in-flight geocoding requests to prevent duplicates
        this.cacheExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days cache expiry
        this.rateLimitDelay = 1000; // 1 second between Nominatim requests (their requirement)
    }

    /**
     * Validate and normalize a location string
     * @param {string} locationString - Raw location string
     * @returns {string|null} - Normalized location string or null if invalid
     */
    normalizeLocationString(locationString) {
        if (!locationString || typeof locationString !== 'string') {
            return null;
        }

        let normalized = locationString.trim();
        if (!normalized) {
            return null;
        }

        // Skip obvious non-location strings
        // Username patterns (starts with @)
        if (normalized.startsWith('@')) {
            console.log(`⚠️ Skipping geocoding for username-like string: "${normalized}"`);
            return null;
        }

        // URL patterns
        if (normalized.match(/^https?:\/\//i) || normalized.match(/^www\./i)) {
            console.log(`⚠️ Skipping geocoding for URL-like string: "${normalized}"`);
            return null;
        }

        // Email patterns
        if (normalized.includes('@') && normalized.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            console.log(`⚠️ Skipping geocoding for email-like string: "${normalized}"`);
            return null;
        }

        // Clean up the location string first
        // Remove special characters that might confuse geocoding (but keep commas, spaces, hyphens)
        normalized = normalized
            // Remove arrows and other special symbols (↜, →, ←, etc.)
            .replace(/[↜→←⇒⇐↔]/g, ',')
            // Remove multiple consecutive commas
            .replace(/,+/g, ',')
            // Remove trailing periods (unless it's an abbreviation)
            .replace(/\.+$/, '')
            // Remove leading/trailing commas
            .replace(/^,+|,+$/g, '')
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            .trim();

        // Remove fake/joke location parts (but keep valid parts before them)
        // Split by comma and filter out fake parts
        const fakeLocationPatterns = [
            /^milky\s*way$/i,
            /^earth$/i,
            /^planet\s*earth$/i,
            /^the\s*universe$/i,
            /^outer\s*space$/i,
            /^universe$/i
        ];
        
        const parts = normalized.split(',').map(p => p.trim()).filter(p => p);
        const validParts = parts.filter(part => {
            // Check if this part matches any fake pattern
            const isFake = fakeLocationPatterns.some(pattern => pattern.test(part));
            if (isFake) {
                console.log(`⚠️ Removing fake location part: "${part}"`);
                return false;
            }
            return true;
        });
        
        if (validParts.length === 0) {
            console.log(`⚠️ Skipping geocoding - all parts were fake: "${normalized}"`);
            return null;
        }
        
        normalized = validParts.join(', ').trim();

        // Skip if too short or too long (likely invalid)
        if (normalized.length < 2 || normalized.length > 200) {
            console.log(`⚠️ Skipping geocoding for invalid length string: "${normalized}"`);
            return null;
        }

        // Skip if it's just numbers or special characters
        if (!/[a-zA-Z]/.test(normalized)) {
            console.log(`⚠️ Skipping geocoding for non-text string: "${normalized}"`);
            return null;
        }

        return normalized;
    }

    /**
     * Geocode a location string to lat/lng coordinates
     * @param {string} locationString - Location string (e.g., "San Francisco, CA" or "London, UK")
     * @param {boolean} skipCache - If true, skip cache and force fresh geocoding
     * @param {boolean} skipIndexedDBCheck - If true, skip IndexedDB check (optimization when already checked)
     * @returns {Promise<Object|null>} - {lat: number, lng: number, displayName: string} or null
     */
    async geocode(locationString, skipCache = false, skipIndexedDBCheck = false) {
        // Normalize and validate location string
        const normalizedLocation = this.normalizeLocationString(locationString);
        if (!normalizedLocation) {
            return null;
        }

        // Check in-memory cache first
        if (!skipCache) {
            const cached = this.geocodeCache.get(normalizedLocation);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
                // Check if this is a failed attempt marker
                if (cached.data && cached.data.failed === true) {
                    console.log(`📍 Memory cache: Found failed geocoding attempt for "${normalizedLocation}" - skipping retry`);
                    return null;
                }
                console.log(`📍 Memory cache: Found geocoded location for "${normalizedLocation}"`);
                return cached.data;
            }

            // Check IndexedDB cache (unless already checked)
            if (!skipIndexedDBCheck && window.indexedDBManager && window.indexedDBManager.isInitialized()) {
                const dbCached = await window.indexedDBManager.getLocation(normalizedLocation);
                if (dbCached) {
                    // Check if this is a failed attempt marker
                    if (dbCached.failed === true) {
                        console.log(`📍 IndexedDB cache: Found failed geocoding attempt for "${normalizedLocation}" - skipping retry`);
                        // Update in-memory cache
                        this.geocodeCache.set(normalizedLocation, {
                            data: dbCached,
                            timestamp: Date.now()
                        });
                        return null;
                    }
                    console.log(`📍 IndexedDB cache: Found geocoded location for "${normalizedLocation}"`);
                    // Update in-memory cache
                    this.geocodeCache.set(normalizedLocation, {
                        data: dbCached,
                        timestamp: Date.now()
                    });
                    return dbCached;
                }
            }
        }

        // Check if there's already an in-flight request for this location
        if (this.inFlightRequests.has(normalizedLocation)) {
            console.log(`📍 Waiting for in-flight geocoding request for "${normalizedLocation}"`);
            return await this.inFlightRequests.get(normalizedLocation);
        }

        // Create promise for this geocoding request and store it
        const geocodePromise = (async () => {
            try {
                // Use Nominatim API with proper user agent (required by their ToS)
                const params = new URLSearchParams({
                    q: normalizedLocation,
                    format: 'json',
                    limit: 1,
                    addressdetails: 1
                });

                const url = `${this.baseUrl}?${params.toString()}`;
                console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                console.log(`   Reason: Geocoding location string "${normalizedLocation}" to lat/lng coordinates using Nominatim API`);

                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'SBOM Play - Open Source Supply Chain Analysis Tool (https://github.com/cyfinoid/sbomplay)'
                    }
                });

                if (!response.ok) {
                    console.warn(`⚠️ Geocoding API returned ${response.status} for "${normalizedLocation}"`);
                    console.log(`   ❌ Response: Status ${response.status} ${response.statusText}`);
                    return null;
                }

                const data = await response.json();
                if (!data || data.length === 0) {
                    console.log(`ℹ️ No geocoding results for "${normalizedLocation}"`);
                    console.log(`   ✅ Response: Status ${response.status}, Extracted: No geocoding results`);
                    
                    // Cache the "no results" response to avoid repeated API calls
                    const failedMarker = {
                        failed: true,
                        timestamp: Date.now()
                    };
                    this.geocodeCache.set(normalizedLocation, {
                        data: failedMarker,
                        timestamp: Date.now()
                    });
                    
                    // Save failed attempt to IndexedDB to persist across sessions
                    if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
                        await window.indexedDBManager.saveLocation(normalizedLocation, failedMarker);
                        console.log(`💾 Cached failed geocoding attempt for "${normalizedLocation}" to avoid retries`);
                    }
                    
                    return null;
                }

                const result = data[0];
                const geocoded = {
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon),
                    displayName: result.display_name || normalizedLocation,
                    countryCode: result.address?.country_code?.toUpperCase() || null,
                    country: result.address?.country || null
                };
                
                console.log(`   ✅ Response: Status ${response.status}, Extracted: Coordinates (${geocoded.lat}, ${geocoded.lng}), Display name: "${geocoded.displayName}", Country: ${geocoded.countryCode || 'N/A'}`);

                // Cache the result in memory
                this.geocodeCache.set(normalizedLocation, {
                    data: geocoded,
                    timestamp: Date.now()
                });

                // Save to IndexedDB for persistent storage
                // This ensures the location is cached for future sessions
                if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
                    await window.indexedDBManager.saveLocation(normalizedLocation, geocoded);
                    console.log(`💾 Saved geocoded location "${normalizedLocation}" to IndexedDB cache`);
                }

                console.log(`✅ Geocoded "${normalizedLocation}" → ${geocoded.lat}, ${geocoded.lng}`);
                return geocoded;
            } catch (error) {
                console.warn(`⚠️ Geocoding failed for "${normalizedLocation}":`, error.message);
                return null;
            } finally {
                // Remove from in-flight requests when done
                this.inFlightRequests.delete(normalizedLocation);
            }
        })();

        // Store the promise so concurrent requests can wait for it
        this.inFlightRequests.set(normalizedLocation, geocodePromise);
        
        return await geocodePromise;
    }

    /**
     * Batch geocode multiple locations (loads from cache first, then fetches missing ones incrementally)
     * @param {Array<string>} locations - Array of location strings
     * @param {Function} onProgress - Optional progress callback (processed, total)
     * @param {Function} onNewLocation - Optional callback when a new location is geocoded (location, geocoded)
     * @returns {Promise<Map>} - Map of location string -> geocoded data
     */
    async batchGeocode(locations, onProgress = null, onNewLocation = null) {
        const results = new Map();
        
        // Normalize and filter locations first
        const normalizedLocations = locations
            .map(loc => this.normalizeLocationString(loc))
            .filter(loc => loc !== null); // Remove invalid locations
        
        const uniqueLocations = [...new Set(normalizedLocations)];
        let cachedCount = 0; // Initialize cachedCount at function scope
        
        if (uniqueLocations.length === 0) {
            console.log('ℹ️ No valid locations to geocode after normalization');
            return results;
        }
        
        console.log(`📍 Processing ${uniqueLocations.length} unique valid locations (${locations.length - normalizedLocations.length} invalid locations filtered out)`);

        // Step 1: Load all from IndexedDB cache first (fast, no API calls)
        if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
            console.log(`📍 Loading ${uniqueLocations.length} locations from IndexedDB cache...`);
            const cachedResults = await window.indexedDBManager.batchGetLocations(uniqueLocations);
            
            cachedResults.forEach((geocoded, location) => {
                if (geocoded) {
                    // Skip failed markers (they're cached to avoid retries, but shouldn't be used)
                    if (geocoded.failed === true) {
                        // Still cache it in memory to avoid retries
                        this.geocodeCache.set(location, {
                            data: geocoded,
                            timestamp: Date.now()
                        });
                        return;
                    }
                    results.set(location, geocoded);
                    // Update in-memory cache
                    this.geocodeCache.set(location, {
                        data: geocoded,
                        timestamp: Date.now()
                    });
                    cachedCount++;
                    
                    // Notify callback for cached locations too (for immediate map display)
                    if (onNewLocation) {
                        onNewLocation(location, geocoded);
                    }
                }
            });
            
            console.log(`📍 Loaded ${cachedCount}/${uniqueLocations.length} locations from cache`);
            
            if (onProgress) {
                onProgress(cachedCount, uniqueLocations.length);
            }
        }

        // Step 2: Fetch missing locations incrementally (one at a time to respect rate limits)
        const missingLocations = uniqueLocations.filter(loc => !results.has(loc));
        
        if (missingLocations.length > 0) {
            console.log(`📍 Fetching ${missingLocations.length} missing locations from Nominatim API (incremental, rate-limited)...`);
            
            for (let i = 0; i < missingLocations.length; i++) {
                const location = missingLocations[i];
                // Skip IndexedDB check since we already checked it in Step 1
                // This prevents redundant IndexedDB queries
                const geocoded = await this.geocode(location, false, true); // skipIndexedDBCheck = true
                
                if (geocoded) {
                    results.set(location, geocoded);
                    
                    // Notify callback if provided (for incremental map updates)
                    if (onNewLocation) {
                        onNewLocation(location, geocoded);
                    }
                }
                
                // Rate limiting: wait 1 second between requests (Nominatim requirement)
                if (i < missingLocations.length - 1) {
                    await this.sleep(this.rateLimitDelay);
                }
                
                if (onProgress) {
                    onProgress(cachedCount + i + 1, uniqueLocations.length);
                }
            }
        }
        
        return results;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clear geocoding cache
     */
    clearCache() {
        this.geocodeCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.geocodeCache.size,
            entries: Array.from(this.geocodeCache.keys())
        };
    }
}

// Export for use in other modules
window.LocationService = LocationService;

