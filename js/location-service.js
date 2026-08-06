/**
 * Location Service - Geocodes location strings to lat/lng coordinates
 * Uses a static country/city resolver first, then Open-Meteo and Photon APIs
 * Caches results in IndexedDB for persistent storage
 */
class LocationService {
    constructor() {
        this.geocodeCache = new Map(); // In-memory cache for geocoded locations
        this.inFlightRequests = new Map(); // Track in-flight geocoding requests to prevent duplicates
        this.cacheExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days cache expiry
        // Country-keyed reuse cache: normalized location string → countryCode.
        this.countryByString = new Map();

        // Serial network queue — one geocode API call at a time to respect rate limits
        this._networkQueue = [];
        this._networkProcessing = false;

        // Provider state for multi-API failover (Open-Meteo → Photon)
        this.providers = [
            {
                id: 'open-meteo',
                minIntervalMs: 200,
                cooldownMs: 60000,
                lastRequestAt: 0,
                cooldownUntil: 0
            },
            {
                id: 'photon',
                minIntervalMs: 400,
                cooldownMs: 60000,
                lastRequestAt: 0,
                cooldownUntil: 0
            }
        ];
    }

    /**
     * Build a synthetic geocoded record for a country resolved via the static
     * country/state lookup table.
     */
    buildCountryOnlyGeocoded(countryCode, displayName) {
        const cd = (typeof window !== 'undefined') ? window.CountryData : null;
        if (!countryCode || !cd) return null;
        const centroid = cd.getCentroid(countryCode);
        if (!centroid) return null;
        return {
            lat: centroid.lat,
            lng: centroid.lng,
            displayName: displayName || cd.getCountryName(countryCode) || countryCode,
            countryCode: countryCode,
            country: cd.getCountryName(countryCode) || countryCode,
            source: 'static-country-table'
        };
    }

    /**
     * Build a synthetic geocoded record for a city resolved via the static city table.
     */
    buildCityOnlyGeocoded(cityResolved, displayName) {
        if (!cityResolved || !cityResolved.countryCode) return null;
        const cd = (typeof window !== 'undefined') ? window.CountryData : null;
        const countryCode = cityResolved.countryCode;
        return {
            lat: cityResolved.lat,
            lng: cityResolved.lng,
            displayName: displayName || cityResolved.country || countryCode,
            countryCode: countryCode,
            country: cityResolved.country || (cd && cd.getCountryName(countryCode)) || countryCode,
            source: 'static-city-table'
        };
    }

    /**
     * Cache a successful geocoding result in memory and IndexedDB.
     */
    async _cacheGeocodedResult(normalizedLocation, geocoded) {
        if (geocoded.countryCode) {
            this.countryByString.set(normalizedLocation, geocoded.countryCode);
        }
        this.geocodeCache.set(normalizedLocation, {
            data: geocoded,
            timestamp: Date.now()
        });
        if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
            await window.indexedDBManager.saveLocation(normalizedLocation, geocoded);
            console.log(`💾 Saved geocoded location "${normalizedLocation}" to IndexedDB cache`);
        }
    }

    /**
     * Cache a failed geocoding attempt to avoid repeated API calls.
     */
    async _cacheFailedGeocode(normalizedLocation) {
        const failedMarker = {
            failed: true,
            timestamp: Date.now()
        };
        this.geocodeCache.set(normalizedLocation, {
            data: failedMarker,
            timestamp: Date.now()
        });
        if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
            await window.indexedDBManager.saveLocation(normalizedLocation, failedMarker);
            console.log(`💾 Cached failed geocoding attempt for "${normalizedLocation}" to avoid retries`);
        }
    }

    /**
     * Persist a static resolver hit to caches (memory + IndexedDB best-effort).
     */
    _cacheStaticResult(normalizedLocation, synthesized, skipIndexedDBCheck) {
        if (synthesized.countryCode) {
            this.countryByString.set(normalizedLocation, synthesized.countryCode);
        }
        this.geocodeCache.set(normalizedLocation, {
            data: synthesized,
            timestamp: Date.now()
        });
        if (!skipIndexedDBCheck && window.indexedDBManager && window.indexedDBManager.isInitialized()) {
            window.indexedDBManager.saveLocation(normalizedLocation, synthesized).catch(() => {});
        }
    }

    /**
     * Wait until a provider slot is available (rate limit spacing + cooldown).
     */
    async _waitForProviderSlot(provider) {
        const now = Date.now();
        if (provider.cooldownUntil > now) {
            return false;
        }
        const elapsed = now - provider.lastRequestAt;
        if (elapsed < provider.minIntervalMs) {
            await this.sleep(provider.minIntervalMs - elapsed);
        }
        return true;
    }

    /**
     * Mark a provider as temporarily unavailable after rate-limit or server errors.
     */
    _markProviderCooldown(provider, status) {
        if (status === 429 || status === 503 || status === 502) {
            provider.cooldownUntil = Date.now() + provider.cooldownMs;
            console.warn(`⚠️ Geocoding provider ${provider.id} cooling down for ${provider.cooldownMs / 1000}s after HTTP ${status}`);
        }
    }

    /**
     * Geocode via Open-Meteo Geocoding API.
     */
    async _geocodeOpenMeteo(normalizedLocation, provider) {
        const params = new URLSearchParams({
            name: normalizedLocation,
            count: '1',
            language: 'en',
            format: 'json'
        });
        const url = `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
        debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
        debugLogUrl(`   Reason: Geocoding "${normalizedLocation}" via Open-Meteo`);

        const response = await fetchWithTimeout(url);
        provider.lastRequestAt = Date.now();

        if (!response.ok) {
            this._markProviderCooldown(provider, response.status);
            return { ok: false, status: response.status };
        }

        const data = await response.json();
        const result = data?.results?.[0];
        if (!result) {
            return { ok: false, status: 200, empty: true };
        }

        return {
            ok: true,
            geocoded: {
                lat: result.latitude,
                lng: result.longitude,
                displayName: result.name || normalizedLocation,
                countryCode: result.country_code ? String(result.country_code).toUpperCase() : null,
                country: result.country || null,
                source: 'open-meteo'
            }
        };
    }

    /**
     * Geocode via Photon (komoot) API.
     */
    async _geocodePhoton(normalizedLocation, provider) {
        const params = new URLSearchParams({
            q: normalizedLocation,
            limit: '1'
        });
        const url = `https://photon.komoot.io/api/?${params.toString()}`;
        debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
        debugLogUrl(`   Reason: Geocoding "${normalizedLocation}" via Photon`);

        const response = await fetchWithTimeout(url);
        provider.lastRequestAt = Date.now();

        if (!response.ok) {
            this._markProviderCooldown(provider, response.status);
            return { ok: false, status: response.status };
        }

        const data = await response.json();
        const feature = data?.features?.[0];
        if (!feature) {
            return { ok: false, status: 200, empty: true };
        }

        const coords = feature.geometry?.coordinates || [];
        const props = feature.properties || {};
        const countryCode = props.countrycode ? String(props.countrycode).toUpperCase() : null;

        return {
            ok: true,
            geocoded: {
                lat: coords[1],
                lng: coords[0],
                displayName: props.name || props.city || normalizedLocation,
                countryCode: countryCode,
                country: props.country || null,
                source: 'photon'
            }
        };
    }

    /**
     * Try each geocoding provider in order until one succeeds.
     */
    async _fetchFromProviders(normalizedLocation) {
        for (const provider of this.providers) {
            const slotAvailable = await this._waitForProviderSlot(provider);
            if (!slotAvailable) {
                console.log(`📍 Skipping provider ${provider.id} (cooldown active)`);
                continue;
            }

            let result;
            try {
                if (provider.id === 'open-meteo') {
                    result = await this._geocodeOpenMeteo(normalizedLocation, provider);
                } else if (provider.id === 'photon') {
                    result = await this._geocodePhoton(normalizedLocation, provider);
                } else {
                    continue;
                }
            } catch (error) {
                console.warn(`⚠️ Geocoding provider ${provider.id} failed for "${normalizedLocation}":`, error.message);
                continue;
            }

            if (result.ok && result.geocoded) {
                console.log(`   ✅ ${provider.id}: (${result.geocoded.lat}, ${result.geocoded.lng}), Country: ${result.geocoded.countryCode || 'N/A'}`);
                return result.geocoded;
            }

            if (result.empty) {
                console.log(`ℹ️ ${provider.id}: no results for "${normalizedLocation}"`);
                continue;
            }
        }

        return null;
    }

    /**
     * Enqueue a network geocode request (serial processing).
     */
    _enqueueNetworkGeocode(normalizedLocation) {
        return new Promise((resolve, reject) => {
            this._networkQueue.push({ normalizedLocation, resolve, reject });
            this._processNetworkQueue();
        });
    }

    /**
     * Process the serial network geocode queue.
     */
    async _processNetworkQueue() {
        if (this._networkProcessing) {
            return;
        }
        this._networkProcessing = true;

        while (this._networkQueue.length > 0) {
            const task = this._networkQueue.shift();
            try {
                const geocoded = await this._fetchFromProviders(task.normalizedLocation);
                if (geocoded) {
                    await this._cacheGeocodedResult(task.normalizedLocation, geocoded);
                    console.log(`✅ Geocoded "${task.normalizedLocation}" → ${geocoded.lat}, ${geocoded.lng} (${geocoded.source})`);
                    task.resolve(geocoded);
                } else {
                    await this._cacheFailedGeocode(task.normalizedLocation);
                    task.resolve(null);
                }
            } catch (error) {
                task.reject(error);
            }
        }

        this._networkProcessing = false;
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
        // Username patterns (starts with @ or contains @username)
        if (normalized.startsWith('@') || /\s@\w+/.test(normalized)) {
            console.log(`⚠️ Skipping geocoding for username-like string: "${normalized}"`);
            return null;
        }

        // URL patterns - expanded to catch more variations
        if (normalized.match(/^https?:\/\//i) || 
            normalized.match(/^www\./i) ||
            normalized.match(/\.(com|io|net|org|dev|me|co|ai|app|tech|cloud|online|site|website|blog|info|biz|xyz)(\/|$)/i) ||
            normalized.match(/^(blog|site|www|http|https):/i) ||
            normalized.match(/[a-z0-9-]+\.(com|io|net|org|dev|me|co|ai|app|tech|cloud|online|site|website|blog|info|biz|xyz)/i)) {
            console.log(`⚠️ Skipping geocoding for URL-like string: "${normalized}"`);
            return null;
        }

        // Email patterns
        if (normalized.includes('@') && normalized.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            console.log(`⚠️ Skipping geocoding for email-like string: "${normalized}"`);
            return null;
        }

        // Skip job titles and professional descriptions
        const jobTitlePatterns = [
            /^(freelancer|freelance|self-employed|funemployed|available for hire|hiring|looking for work)/i,
            /(engineer|developer|professor|prof|consultant|architect|designer|manager|director|cto|ceo|cfo|founder|co-founder|cofounder)\s*(at|@|v\s*@)/i,
            /\b(software|backend|frontend|full.?stack|devops|sre|qa|test|security|data|ml|ai)\s+(engineer|developer|architect|specialist|consultant|manager)/i,
            /teaching\s+(prof|professor|instructor|lecturer)/i,
            /mediawiki\s+developer/i,
            /\b(available|looking)\s+(for\s+)?hire/i
        ];
        if (jobTitlePatterns.some(pattern => pattern.test(normalized))) {
            console.log(`⚠️ Skipping geocoding for job title/professional description: "${normalized}"`);
            return null;
        }

        // Skip standalone company suffixes (not locations)
        const companySuffixes = /^(Inc|LLC|LLP|Ltd|Corp|Corporation|Company|Co|GmbH|AG|SARL|AB|ApS|BV|B\.V|KFT|a\.s|a\.s\.|SAS|S\.A\.S|Intl|International)$/i;
        if (companySuffixes.test(normalized)) {
            console.log(`⚠️ Skipping geocoding for company suffix: "${normalized}"`);
            return null;
        }

        // Skip company names ending with company suffixes (e.g., "Sideway Inc", "CFWare, LLC")
        const usStateAbbreviations = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i;
        const hasStateAbbreviation = usStateAbbreviations.test(normalized);
        
        if (!hasStateAbbreviation) {
            const companyNamePattern = /^[\w\s&]+(?:,\s*)?(?:Inc|LLC|LLP|Ltd|Corp|Corporation|Company|Co\.|GmbH|AG|SARL|AB|ApS|BV|B\.V|KFT|a\.s|a\.s\.|SAS|S\.A\.S|Intl|International|Engineering|Software|Technologies|Tech|Solutions|Systems|Group|Enterprises|Ventures|Consulting|Consultants)\.?$/i;
            if (companyNamePattern.test(normalized) && normalized.length < 60 && !normalized.match(/,\s*(USA|US|UK|Canada|Australia|Germany|France|Spain|Italy|Japan|China|India|Brazil|Mexico)/i)) {
            console.log(`⚠️ Skipping geocoding for company name: "${normalized}"`);
                return null;
            }
        }

        // Skip single character or symbol-only entries
        if (normalized.length === 1 || normalized === '#') {
            console.log(`⚠️ Skipping geocoding for single character/symbol: "${normalized}"`);
            return null;
        }

        // Skip abstract/fictional locations and non-geographic descriptions
        const abstractPatterns = [
            /^(empty\s+world|the\s+internets|the\s+bird\s+dimension|right\s+behind\s+you|inside\s+the\s+bid\s+ask\s+spread|the\s+open\s+web|dependency\s+heaven|the\s+fluid\s+project|the\s+witzend\s+group)$/i,
            /^(orion-cygnus\s+arm|solar\s+system|milky\s+way|outer\s+space|the\s+universe|planet\s+earth|earth)$/i,
            /^(0\s+sgx|3rd\s+planet|geocode\s+earth|geoflexible)/i,
            /\d+\s*(ft|feet|m|meters)\s+above\s+sea\s+level/i,
            /^(lenapehoking|stolen\s+chochenyo\s+ohlone\s+land)$/i,
            /^(left\s+bank\s+of\s+the\s+'90s|the\s+local\s+group)$/i,
            /^(green\s+card|eu\s+passport|us\s+green\s+card)/i
        ];
        if (abstractPatterns.some(pattern => pattern.test(normalized))) {
            console.log(`⚠️ Skipping geocoding for abstract/fictional location: "${normalized}"`);
            return null;
        }

        // Skip single-word entries that are likely company names or non-locations (unless they're common place names)
        const commonPlaceNames = new Set(['paris', 'london', 'berlin', 'tokyo', 'moscow', 'rome', 'madrid', 'vienna', 'amsterdam', 'brussels', 'copenhagen', 'stockholm', 'oslo', 'helsinki', 'dublin', 'lisbon', 'athens', 'warsaw', 'prague', 'budapest', 'bucharest', 'sofia', 'zagreb', 'belgrade', 'kiev', 'minsk', 'riga', 'tallinn', 'vilnius', 'reykjavik', 'valletta', 'nicosia', 'luxembourg', 'monaco', 'vaduz', 'andorra', 'san marino', 'vatican', 'new york', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville', 'san francisco', 'indianapolis', 'columbus', 'fort worth', 'charlotte', 'seattle', 'denver', 'washington', 'boston', 'el paso', 'detroit', 'nashville', 'memphis', 'portland', 'oklahoma city', 'las vegas', 'louisville', 'baltimore', 'milwaukee', 'albuquerque', 'tucson', 'fresno', 'sacramento', 'kansas city', 'mesa', 'atlanta', 'omaha', 'colorado springs', 'raleigh', 'virginia beach', 'miami', 'oakland', 'minneapolis', 'tulsa', 'cleveland', 'wichita', 'arlington', 'tampa', 'new orleans', 'honolulu', 'anaheim', 'santa ana', 'st. louis', 'riverside', 'corpus christi', 'lexington', 'pittsburgh', 'anchorage', 'stockton', 'cincinnati', 'st. paul', 'toledo', 'greensboro', 'newark', 'plano', 'henderson', 'lincoln', 'buffalo', 'jersey city', 'chula vista', 'fort wayne', 'orlando', 'st. petersburg', 'chandler', 'laredo', 'norfolk', 'durham', 'madison', 'lubbock', 'irvine', 'winston-salem', 'glendale', 'garland', 'hialeah', 'reno', 'chesapeake', 'gilbert', 'baton rouge', 'richmond', 'boise', 'san bernardino', 'spokane', 'birmingham', 'grand rapids', 'tacoma', 'fontana', 'fremont', 'rochester', 'oxnard', 'moreno valley', 'fayetteville', 'huntington beach', 'yonkers', 'glendale', 'aurora', 'montgomery', 'grand prairie', 'shreveport', 'akron', 'macon', 'little rock', 'augusta', 'columbus', 'amarillo', 'mobile', 'knoxville', 'shreveport', 'worcester', 'newport news', 'brownsville', 'overland park', 'santa clarita', 'providence', 'fort lauderdale', 'rancho cucamonga', 'ontario', 'vancouver', 'sioux falls', 'peoria', 'oakland', 'visalia', 'tempe', 'ontario', 'norman', 'erie', 'fargo', 'thousand oaks', 'el monte', 'concord', 'evansville', 'sterling heights', 'santa clara', 'topeka', 'savannah', 'simi valley', 'pembroke pines', 'vallejo', 'victoria', 'hartford', 'cedar rapids', 'coral springs', 'fayetteville', 'santa rosa', 'palmdale', 'corona', 'eugene', 'mcallen', 'independence', 'joliet', 'inland empire', 'south bend', 'elgin', 'fullerton', 'springfield', 'beaumont', 'peoria', 'lansing', 'ann arbor', 'carrollton', 'roseville', 'thornton', 'denton', 'surprise', 'mckinney', 'west valley city', 'richardson', 'killeen', 'frisco', 'allentown', 'olathe', 'hayward', 'carol stream', 'clarksville', 'lakewood', 'pomona', 'sunnyvale', 'escondido', 'pasadena', 'naperville', 'bellevue', 'hampton', 'mcallen', 'joliet', 'torrance', 'bridgeport', 'syracuse', 'paterson', 'fort wayne', 'elizabeth', 'charleston', 'mesquite', 'stamford', 'corpus christi', 'savannah', 'rockford', 'joliet', 'pembroke pines', 'moreno valley', 'huntington beach', 'glendale', 'santa clarita', 'grand prairie', 'overland park', 'peoria', 'ontario', 'sioux falls', 'elk grove', 'salem', 'corona', 'eugene', 'palmdale', 'salinas', 'springfield', 'pasadena', 'fort collins', 'hayward', 'pomona', 'cary', 'rockford', 'alexandria', 'escondido', 'mckinney', 'joliet', 'sunnyvale', 'torrance', 'bridgeport', 'lakewood', 'hollywood', 'paterson', 'naperville', 'syracuse', 'hampton', 'lakewood', 'pomona', 'torrance', 'bridgeport', 'syracuse', 'paterson', 'fort wayne', 'elizabeth', 'charleston', 'mesquite', 'stamford', 'corpus christi', 'savannah', 'rockford', 'joliet', 'pembroke pines', 'moreno valley', 'huntington beach', 'glendale', 'santa clarita', 'grand prairie', 'overland park', 'peoria', 'ontario', 'sioux falls', 'elk grove', 'salem', 'corona', 'eugene', 'palmdale', 'salinas', 'springfield', 'pasadena', 'fort collins', 'hayward', 'pomona', 'cary', 'rockford', 'alexandria', 'escondido', 'mckinney', 'joliet', 'sunnyvale', 'torrance', 'bridgeport', 'lakewood', 'hollywood', 'paterson', 'naperville', 'syracuse', 'hampton']);
        
        if (!normalized.includes(',') && !normalized.includes(' ') && normalized.length > 2 && normalized.length < 20) {
            const lowerNormalized = normalized.toLowerCase();
            if (!commonPlaceNames.has(lowerNormalized) && 
                !lowerNormalized.match(/^(san|saint|st|new|old|north|south|east|west|upper|lower|great|little|big|small|port|fort|mount|mt|lake|river|bay|beach|creek|valley|hill|hills|park|forest|woods|springs|falls|bridge|burg|ville|ton|town|city|port|ford|haven|field|ford|mill|mills|grove|wood|woods|brook|brooks|dale|dales|ridge|ridges|point|points|island|islands|isle|isles|cape|capes|head|heads|cliff|cliffs|bluff|bluffs|rock|rocks|stone|stones|peak|peaks|summit|summits|pass|passes|canyon|canyons|gorge|gorges|desert|deserts|oasis|oases|jungle|jungles|forest|forests|swamp|swamps|marsh|marshes|prairie|prairies|plain|plains|plateau|plateaus|mesa|mesas|butte|buttes|volcano|volcanoes|crater|craters|geyser|geysers|hotsprings|hot springs|glacier|glaciers|fjord|fjords|strait|straits|channel|channels|sound|sounds|gulf|gulfs|sea|seas|ocean|oceans|bay|bays|harbor|harbors|harbour|harbours|port|ports|dock|docks|pier|piers|wharf|wharves|marina|marinas|beach|beaches|shore|shores|coast|coasts|peninsula|peninsulas|isthmus|isthmuses|cape|capes|headland|headlands|promontory|promontories|cliff|cliffs|bluff|bluffs|escarpment|escarpments|ridge|ridges|spur|spurs|foothill|foothills|foothills|mountain|mountains|hill|hills|knoll|knolls|mound|mounds|hillock|hillocks|hummock|hummocks|drumlin|drumlins|esker|eskers|kame|kames|moraine|moraines|outwash|outwashes|till|tills|loess|loesses|sand|sands|gravel|gravels|clay|clays|silt|silts|mud|muds|peat|peats|marl|marls|chalk|chalks|limestone|limestones|sandstone|sandstones|shale|shales|slate|slates|granite|granites|basalt|basalts|gneiss|gneisses|schist|schists|marble|marbles|quartzite|quartzites|slate|slates|phyllite|phyllites|amphibolite|amphibolites|eclogite|eclogites|serpentinite|serpentinites|gabbro|gabbros|diorite|diorites|andesite|andesites|rhyolite|rhyolites|obsidian|obsidians|pumice|pumices|scoria|scorias|tuff|tuffs|breccia|breccias|conglomerate|conglomerates|sandstone|sandstones|siltstone|siltstones|mudstone|mudstones|claystone|claystones|shale|shales|limestone|limestones|dolomite|dolomites|chert|cherts|flint|flints|jasper|jaspers|agate|agates|onyx|onyxes|chalcedony|chalcedonies|opal|opals|quartz|quartzes|amethyst|amethysts|citrine|citrines|rose quartz|rose quartzes|smoky quartz|smoky quartzes|milky quartz|milky quartzes|rock crystal|rock crystals|clear quartz|clear quartzes|tiger eye|tiger eyes|cat eye|cat eyes|hawk eye|hawk eyes|bull eye|bull eyes|falcon eye|falcon eyes|eagle eye|eagle eyes|wolf eye|wolf eyes|bear eye|bear eyes|deer eye|deer eyes|elk eye|elk eyes|moose eye|moose eyes|bison eye|bison eyes|buffalo eye|buffalo eyes|antelope eye|antelope eyes|gazelle eye|gazelle eyes|impala eye|impala eyes|springbok eye|springbok eyes|oryx eye|oryx eyes|addax eye|addax eyes|scimitar eye|scimitar eyes|sable eye|sable eyes|roan eye|roan eyes|eland eye|eland eyes|kudu eye|kudu eyes|nyala eye|nyala eyes|bushbuck eye|bushbuck eyes|sitatunga eye|sitatunga eyes|waterbuck eye|waterbuck eyes|lechwe eye|lechwe eyes|puku eye|puku eyes|reedbuck eye|reedbuck eyes|mountain reedbuck eye|mountain reedbuck eyes|gray rhebok eye|gray rhebok eyes|vaal rhebok eye|vaal rhebok eyes|blesbok eye|blesbok eyes|bontebok eye|bontebok eyes|tsessebe eye|tsessebe eyes|topi eye|topi eyes|hartebeest eye|hartebeest eyes|kongoni eye|kongoni eyes|hirola eye|hirola eyes|damaliscus eye|damaliscus eyes|sassaby eye|sassaby eyes|korrigum eye|korrigum eyes|tiang eye|tiang eyes|topi eye|topi eyes|tsessebe eye|tsessebe eyes|bontebok eye|bontebok eyes|blesbok eye|blesbok eyes|vaal rhebok eye|vaal rhebok eyes|gray rhebok eye|gray rhebok eyes|mountain reedbuck eye|mountain reedbuck eyes|reedbuck eye|reedbuck eyes|puku eye|puku eyes|lechwe eye|lechwe eyes|waterbuck eye|waterbuck eyes|sitatunga eye|sitatunga eyes|bushbuck eye|bushbuck eyes|nyala eye|nyala eyes|kudu eye|kudu eyes|eland eye|eland eyes|roan eye|roan eyes|sable eye|sable eyes|scimitar eye|scimitar eyes|addax eye|addax eyes|oryx eye|oryx eyes|springbok eye|springbok eyes|impala eye|impala eyes|gazelle eye|gazelle eyes|antelope eye|antelope eyes|buffalo eye|buffalo eyes|bison eye|bison eyes|moose eye|moose eyes|elk eye|elk eyes|deer eye|deer eyes|bear eye|bear eyes|wolf eye|wolf eyes|eagle eye|eagle eyes|falcon eye|falcon eyes|bull eye|bull eyes|hawk eye|hawk eyes|cat eye|cat eyes|tiger eye|tiger eyes|clear quartz|clear quartzes|rock crystal|rock crystals|milky quartz|milky quartzes|smoky quartz|smoky quartzes|rose quartz|rose quartzes|citrine|citrines|amethyst|amethysts|quartz|quartzes|opal|opals|chalcedony|chalcedonies|onyx|onyxes|agate|agates|jasper|jaspers|flint|flints|chert|cherts|dolomite|dolomites|limestone|limestones|claystone|claystones|mudstone|mudstones|siltstone|siltstones|sandstone|sandstones|conglomerate|conglomerates|breccia|breccias|tuff|tuffs|scoria|scorias|pumice|pumices|obsidian|obsidians|rhyolite|rhyolites|andesite|andesites|diorite|diorites|gabbro|gabbros|serpentinite|serpentinites|eclogite|eclogites|amphibolite|amphibolites|phyllite|phyllites|slate|slates|quartzite|quartzites|marble|marbles|schist|schists|gneiss|gneisses|basalt|basalts|granite|granites|slate|slates|limestone|limestones|sandstone|sandstones|shale|shales|rock|rocks|stone|stones|peak|peaks|summit|summits|pass|passes|canyon|canyons|gorge|gorges|desert|deserts|oasis|oases|jungle|jungles|forest|forests|swamp|swamps|marsh|marshes|prairie|prairies|plain|plains|plateau|plateaus|mesa|mesas|butte|buttes|volcano|volcanoes|crater|craters|geyser|geysers|hotsprings|hot springs|glacier|glaciers|fjord|fjords|strait|straits|channel|channels|sound|sounds|gulf|gulfs|sea|seas|ocean|oceans|bay|bays|harbor|harbors|harbour|harbours|port|ports|dock|docks|pier|piers|wharf|wharves|marina|marinas|beach|beaches|shore|shores|coast|coasts|peninsula|peninsulas|isthmus|isthmuses|cape|capes|headland|headlands|promontory|promontories|cliff|cliffs|bluff|bluffs|escarpment|escarpments|ridge|ridges|spur|spurs|foothill|foothills|foothills|mountain|mountains|hill|hills|knoll|knolls|mound|mounds|hillock|hillocks|hummock|hummocks|drumlin|drumlins|esker|eskers|kame|kames|moraine|moraines|outwash|outwashes|till|tills|loess|loesses|sand|sands|gravel|gravels|clay|clays|silt|silts|mud|muds|peat|peats|marl|marls|chalk|chalks|limestone|limestones|sandstone|sandstones|shale|shales|slate|slates|granite|granites|basalt|basalts|gneiss|gneisses|schist|schists|marble|marbles|quartzite|quartzites|slate|slates|phyllite|phyllites|amphibolite|amphibolites|eclogite|eclogites|serpentinite|serpentinites|gabbro|gabbros|diorite|diorites|andesite|andesites|rhyolite|rhyolites|obsidian|obsidians|pumice|pumices|scoria|scorias|tuff|tuffs|breccia|breccias|conglomerate|conglomerates|sandstone|sandstones|siltstone|siltstones|mudstone|mudstones|claystone|claystones|shale|shales|limestone|limestones|dolomite|dolomites|chert|cherts|flint|flints|jasper|jaspers|agate|agates|onyx|onyxes|chalcedony|chalcedonies|opal|opals|quartz|quartzes|amethyst|amethysts|citrine|citrines|rose quartz|rose quartzes|smoky quartz|smoky quartzes|milky quartz|milky quartzes|rock crystal|rock crystals|clear quartz|clear quartzes|tiger eye|tiger eyes|cat eye|cat eyes|hawk eye|hawk eyes|bull eye|bull eyes|falcon eye|falcon eyes|eagle eye|eagle eyes|wolf eye|wolf eyes|bear eye|bear eyes|deer eye|deer eyes|elk eye|elk eyes|moose eye|moose eyes|bison eye|bison eyes|buffalo eye|buffalo eyes|antelope eye|antelope eyes|gazelle eye|gazelle eyes|impala eye|impala eyes|springbok eye|springbok eyes|oryx eye|oryx eyes|addax eye|addax eyes|scimitar eye|scimitar eyes|sable eye|sable eyes|roan eye|roan eyes|eland eye|eland eyes|kudu eye|kudu eyes|nyala eye|nyala eyes|bushbuck eye|bushbuck eyes|sitatunga eye|sitatunga eyes|waterbuck eye|waterbuck eyes|lechwe eye|lechwe eyes|puku eye|puku eyes|reedbuck eye|reedbuck eyes|mountain reedbuck eye|mountain reedbuck eyes|gray rhebok eye|gray rhebok eyes|vaal rhebok eye|vaal rhebok eyes|blesbok eye|blesbok eyes|bontebok eye|bontebok eyes|tsessebe eye|tsessebe eyes|topi eye|topi eyes|hartebeest eye|hartebeest eyes|kongoni eye|kongoni eyes|hirola eye|hirola eyes|damaliscus eye|damaliscus eyes|sassaby eye|sassaby eyes|korrigum eye|korrigum eyes|tiang eye|tiang eyes|topi eye|topi eyes|tsessebe eye|tsessebe eyes|bontebok eye|bontebok eyes|blesbok eye|blesbok eyes|vaal rhebok eye|vaal rhebok eyes|gray rhebok eye|gray rhebok eyes|mountain reedbuck eye|mountain reedbuck eyes|reedbuck eye|reedbuck eyes|puku eye|puku eyes|lechwe eye|lechwe eyes|waterbuck eye|waterbuck eyes|sitatunga eye|sitatunga eyes|bushbuck eye|bushbuck eyes|nyala eye|nyala eyes|kudu eye|kudu eyes|eland eye|eland eyes|roan eye|roan eyes|sable eye|sable eyes|scimitar eye|scimitar eyes|addax eye|addax eyes|oryx eye|oryx eyes|springbok eye|springbok eyes|impala eye|impala eyes|gazelle eye|gazelle eyes|antelope eye|antelope eyes|buffalo eye|buffalo eyes|bison eye|bison eyes|moose eye|moose eyes|elk eye|elk eyes|deer eye|deer eyes|bear eye|bear eyes|wolf eye|wolf eyes|eagle eye|eagle eyes|falcon eye|falcon eyes|bull eye|bull eyes|hawk eye|hawk eyes|cat eye|cat eyes|tiger eye|tiger eyes|clear quartz|clear quartzes|rock crystal|rock crystals|milky quartz|milky quartzes|smoky quartz|smoky quartzes|rose quartz|rose quartzes|citrine|citrines|amethyst|amethysts|quartz|quartzes|opal|opals|chalcedony|chalcedonies|onyx|onyxes|agate|agates|jasper|jaspers|flint|flints|chert|cherts|dolomite|dolomites|limestone|limestones|claystone|claystones|mudstone|mudstones|siltstone|siltstones|sandstone|sandstones|conglomerate|conglomerates|breccia|breccias|tuff|tuffs|scoria|scorias|pumice|pumices|obsidian|obsidians|rhyolite|rhyolites|andesite|andesites|diorite|diorites|gabbro|gabbros|serpentinite|serpentinites|eclogite|eclogites|amphibolite|amphibolites|phyllite|phyllites|slate|slates|quartzite|quartzites|marble|marbles|schist|schists|gneiss|gneisses|basalt|basalts|granite|granites|slate|slates|limestone|limestones|sandstone|sandstones|shale|shales|rock|rocks|stone|stones|peak|peaks|summit|summits|pass|passes|canyon|canyons|gorge|gorges|desert|deserts|oasis|oases|jungle|jungles|forest|forests|swamp|swamps|marsh|marshes|prairie|prairies|plain|plains|plateau|plateaus|mesa|mesas|butte|buttes|volcano|volcanoes|crater|craters|geyser|geysers|hotsprings|hot springs|glacier|glaciers|fjord|fjords|strait|straits|channel|channels|sound|sounds|gulf|gulfs|sea|seas|ocean|oceans|bay|bays|harbor|harbors|harbour|harbours|port|ports|dock|docks|pier|piers|wharf|wharves|marina|marinas|beach|beaches|shore|shores|coast|coasts|peninsula|peninsulas|isthmus|isthmuses|cape|capes|headland|headlands|promontory|promontories|cliff|cliffs|bluff|bluffs|escarpment|escarpments|ridge|ridges|spur|spurs|foothill|foothills|foothills|mountain|mountains|hill|hills|knoll|knolls|mound|mounds|hillock|hillocks|hummock|hummocks|drumlin|drumlins|esker|eskers|kame|kames|moraine|moraines|outwash|outwashes|till|tills|loess|loesses|sand|sands|gravel|gravels|clay|clays|silt|silts|mud|muds|peat|peats|marl|marls|chalk|chalks|limestone|limestones|sandstone|sandstones|shale|shales|slate|slates|granite|granites|basalt|basalts|gneiss|gneisses|schist|schists|marble|marbles|quartzite|quartzites|slate|slates|phyllite|phyllites|amphibolite|amphibolites|eclogite|eclogites|serpentinite|serpentinites|gabbro|gabbros|diorite|diorites|andesite|andesites|rhyolite|rhyolites|obsidian|obsidians|pumice|pumices|scoria|scorias|tuff|tuffs|breccia|breccias|conglomerate|conglomerates|sandstone|sandstones|siltstone|siltstones|mudstone|mudstones|claystone|claystones|shale|shales|limestone|limestones|dolomite|dolomites|chert|cherts|flint|flints|jasper|jaspers|agate|agates|onyx|onyxes|chalcedony|chalcedonies|opal|opals|quartz|quartzes|amethyst|amethysts|citrine|citrines|rose quartz|rose quartzes|smoky quartz|smoky quartzes|milky quartz|milky quartzes|rock crystal|rock crystals|clear quartz|clear quartzes|tiger eye|tiger eyes|cat eye|cat eyes|hawk eye|hawk eyes|bull eye|bull eyes|falcon eye|falcon eyes|eagle eye|eagle eyes|wolf eye|wolf eyes|bear eye|bear eyes|deer eye|deer eyes|elk eye|elk eyes|moose eye|moose eyes|bison eye|bison eyes|buffalo eye|buffalo eyes|antelope eye|antelope eyes|gazelle eye|gazelle eyes|impala eye|impala eyes|springbok eye|springbok eyes|oryx eye|oryx eyes|addax eye|addax eyes|scimitar eye|scimitar eyes|sable eye|sable eyes|roan eye|roan eyes|eland eye|eland eyes|kudu eye|kudu eyes|nyala eye|nyala eyes|bushbuck eye|bushbuck eyes|sitatunga eye|sitatunga eyes|waterbuck eye|waterbuck eyes|lechwe eye|lechwe eyes|puku eye|puku eyes|reedbuck eye|reedbuck eyes|mountain reedbuck eye|mountain reedbuck eyes|gray rhebok eye|gray rhebok eyes|vaal rhebok eye|vaal rhebok eyes|blesbok eye|blesbok eyes|bontebok eye|bontebok eyes|tsessebe eye|tsessebe eyes|topi eye|topi eyes|hartebeest eye|hartebeest eyes|kongoni eye|kongoni eyes|hirola eye|hirola eyes|damaliscus eye|damaliscus eyes|sassaby eye|sassaby eyes|korrigum eye|korrigum eyes|tiang eye|tiang eyes|topi eye|topi eyes|tsessebe eye|tsessebe eyes|bontebok eye|bontebok eyes|blesbok eye|blesbok eyes|vaal rhebok eye|vaal rhebok eyes|gray rhebok eye|gray rhebok eyes|mountain reedbuck eye|mountain reedbuck eyes|reedbuck eye|reedbuck eyes|puku eye|puku eyes|lechwe eye|lechwe eyes|waterbuck eye|waterbuck eyes|sitatunga eye|sitatunga eyes|bushbuck eye|bushbuck eyes|nyala eye|nyala eyes|kudu eye|kudu eyes|eland eye|eland eyes|roan eye|roan eyes|sable eye|sable eyes|scimitar eye|scimitar eyes|addax eye|addax eyes|oryx eye|oryx eyes|springbok eye|springbok eyes|impala eye|impala eyes|gazelle eye|gazelle eyes|antelope eye|antelope eyes|buffalo eye|buffalo eyes|bison eye|bison eyes|moose eye|moose eyes|elk eye|elk eyes|deer eye|deer eyes|bear eye|bear eyes|wolf eye|wolf eyes|eagle eye|eagle eyes|falcon eye|falcon eyes|bull eye|bull eyes|hawk eye|hawk eyes|cat eye|cat eyes|tiger eye|tiger eyes)$/i)) {
                console.log(`⚠️ Skipping geocoding for single-word non-location: "${normalized}"`);
                return null;
            }
        }

        // Clean up the location string first
        normalized = normalized
            .replace(/[↜→←⇒⇐↔]/g, ',')
            .replace(/,+/g, ',')
            .replace(/\.+$/, '')
            .replace(/^,+|,+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();

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

        if (normalized.length < 2 || normalized.length > 200) {
            console.log(`⚠️ Skipping geocoding for invalid length string: "${normalized}"`);
            return null;
        }

        if (!/[a-zA-Z]/.test(normalized)) {
            console.log(`⚠️ Skipping geocoding for non-text string: "${normalized}"`);
            return null;
        }

        return normalized;
    }

    /**
     * Parse multiple locations from a string separated by |, \, or /
     */
    parseMultipleLocations(locationString) {
        if (!locationString || typeof locationString !== 'string') {
            return [];
        }

        const separators = /[|\/\\]|,\s*and\s+/i;
        const locations = locationString
            .split(separators)
            .map(loc => loc.trim())
            .filter(loc => loc.length > 0);

        if (locations.length === 1) {
            return [locationString.trim()];
        }

        return locations;
    }

    /**
     * Geocode a location string to lat/lng coordinates
     */
    async geocode(locationString, skipCache = false, skipIndexedDBCheck = false) {
        const normalizedLocation = this.normalizeLocationString(locationString);
        if (!normalizedLocation) {
            return null;
        }

        // Static country fast-path
        if (window.CountryData) {
            const resolved = window.CountryData.resolveCountry(normalizedLocation);
            if (resolved && resolved.countryCode) {
                const synthesized = this.buildCountryOnlyGeocoded(resolved.countryCode, normalizedLocation);
                if (synthesized) {
                    this._cacheStaticResult(normalizedLocation, synthesized, skipIndexedDBCheck);
                    console.log(`📍 Static country resolver: "${normalizedLocation}" → ${resolved.countryCode} (no API call)`);
                    return synthesized;
                }
            }
        }

        // Static city fast-path (bare city names like "Bengaluru", "Tokyo")
        if (window.CityData) {
            const cityResolved = window.CityData.resolveCity(normalizedLocation);
            if (cityResolved && cityResolved.countryCode) {
                const synthesized = this.buildCityOnlyGeocoded(cityResolved, normalizedLocation);
                if (synthesized) {
                    this._cacheStaticResult(normalizedLocation, synthesized, skipIndexedDBCheck);
                    console.log(`📍 Static city resolver: "${normalizedLocation}" → ${cityResolved.countryCode} (no API call)`);
                    return synthesized;
                }
            }
        }

        // Check in-memory cache first
        if (!skipCache) {
            const cached = this.geocodeCache.get(normalizedLocation);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
                if (cached.data && cached.data.failed === true) {
                    console.log(`📍 Memory cache: Found failed geocoding attempt for "${normalizedLocation}" - skipping retry`);
                    return null;
                }
                if (cached.data?.countryCode) {
                    this.countryByString.set(normalizedLocation, cached.data.countryCode);
                }
                console.log(`📍 Memory cache: Found geocoded location for "${normalizedLocation}"`);
                return cached.data;
            }

            if (!skipIndexedDBCheck && window.indexedDBManager && window.indexedDBManager.isInitialized()) {
                const dbCached = await window.indexedDBManager.getLocation(normalizedLocation);
                if (dbCached) {
                    if (dbCached.failed === true) {
                        console.log(`📍 IndexedDB cache: Found failed geocoding attempt for "${normalizedLocation}" - skipping retry`);
                        this.geocodeCache.set(normalizedLocation, {
                            data: dbCached,
                            timestamp: Date.now()
                        });
                        return null;
                    }
                    console.log(`📍 IndexedDB cache: Found geocoded location for "${normalizedLocation}"`);
                    if (dbCached.countryCode) {
                        this.countryByString.set(normalizedLocation, dbCached.countryCode);
                    }
                    this.geocodeCache.set(normalizedLocation, {
                        data: dbCached,
                        timestamp: Date.now()
                    });
                    return dbCached;
                }
            }
        }

        // Dedupe concurrent requests for the same string
        if (this.inFlightRequests.has(normalizedLocation)) {
            console.log(`📍 Waiting for in-flight geocoding request for "${normalizedLocation}"`);
            return await this.inFlightRequests.get(normalizedLocation);
        }

        const geocodePromise = (async () => {
            try {
                return await this._enqueueNetworkGeocode(normalizedLocation);
            } catch (error) {
                console.warn(`⚠️ Geocoding failed for "${normalizedLocation}":`, error.message);
                return null;
            } finally {
                this.inFlightRequests.delete(normalizedLocation);
            }
        })();

        this.inFlightRequests.set(normalizedLocation, geocodePromise);
        return await geocodePromise;
    }

    /**
     * Get geocoded location from cache only (no API calls)
     */
    async getFromCache(locationString) {
        const normalizedLocation = this.normalizeLocationString(locationString);
        if (!normalizedLocation) {
            return null;
        }

        const cached = this.geocodeCache.get(normalizedLocation);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            if (cached.data && cached.data.failed === true) {
                return null;
            }
            return cached.data;
        }

        if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
            const dbCached = await window.indexedDBManager.getLocation(normalizedLocation);
            if (dbCached) {
                if (dbCached.failed === true) {
                    return null;
                }
                this.geocodeCache.set(normalizedLocation, {
                    data: dbCached,
                    timestamp: Date.now()
                });
                return dbCached;
            }
        }

        return null;
    }

    /**
     * Batch get locations from cache only (no API calls)
     */
    async batchGetFromCache(locations) {
        const results = new Map();
        
        const normalizedLocations = locations
            .map(loc => this.normalizeLocationString(loc))
            .filter(loc => loc !== null);
        
        const uniqueLocations = [...new Set(normalizedLocations)];
        
        if (uniqueLocations.length === 0) {
            return results;
        }
        
        if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
            const cachedResults = await window.indexedDBManager.batchGetLocations(uniqueLocations);
            
            cachedResults.forEach((geocoded, location) => {
                if (geocoded && geocoded.failed !== true) {
                    results.set(location, geocoded);
                    this.geocodeCache.set(location, {
                        data: geocoded,
                        timestamp: Date.now()
                    });
                }
            });
        }
        
        return results;
    }

    /**
     * Batch geocode multiple locations (loads from cache first, then fetches missing ones incrementally)
     */
    async batchGeocode(locations, onProgress = null, onNewLocation = null) {
        const results = new Map();
        
        const normalizedLocations = locations
            .map(loc => this.normalizeLocationString(loc))
            .filter(loc => loc !== null);
        
        const uniqueLocations = [...new Set(normalizedLocations)];
        let cachedCount = 0;
        
        if (uniqueLocations.length === 0) {
            console.log('ℹ️ No valid locations to geocode after normalization');
            return results;
        }
        
        console.log(`📍 Processing ${uniqueLocations.length} unique valid locations (${locations.length - normalizedLocations.length} invalid locations filtered out)`);

        if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
            console.log(`📍 Loading ${uniqueLocations.length} locations from IndexedDB cache...`);
            const cachedResults = await window.indexedDBManager.batchGetLocations(uniqueLocations);
            
            cachedResults.forEach((geocoded, location) => {
                if (geocoded) {
                    if (geocoded.failed === true) {
                        this.geocodeCache.set(location, {
                            data: geocoded,
                            timestamp: Date.now()
                        });
                        return;
                    }
                    results.set(location, geocoded);
                    this.geocodeCache.set(location, {
                        data: geocoded,
                        timestamp: Date.now()
                    });
                    cachedCount++;
                    
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

        const missingLocations = uniqueLocations.filter(loc => !results.has(loc));
        
        if (missingLocations.length > 0) {
            console.log(`📍 Fetching ${missingLocations.length} missing locations via geocoding API cascade (serial queue)...`);
            
            for (let i = 0; i < missingLocations.length; i++) {
                const location = missingLocations[i];
                const geocoded = await this.geocode(location, false, true);
                
                if (geocoded) {
                    results.set(location, geocoded);
                    
                    if (onNewLocation) {
                        onNewLocation(location, geocoded);
                    }
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
        this.countryByString.clear();
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

    /**
     * Resolve just a country code from a free-form location string, with no API calls.
     */
    resolveCountryNoApi(locationString) {
        const normalized = this.normalizeLocationString(locationString);
        if (!normalized) return null;
        if (this.countryByString.has(normalized)) {
            const code = this.countryByString.get(normalized);
            return {
                countryCode: code,
                country: (window.CountryData && window.CountryData.getCountryName(code)) || code
            };
        }
        if (window.CountryData) {
            const resolved = window.CountryData.resolveCountry(normalized);
            if (resolved) {
                this.countryByString.set(normalized, resolved.countryCode);
                return resolved;
            }
        }
        if (window.CityData) {
            const cityResolved = window.CityData.resolveCity(normalized);
            if (cityResolved) {
                this.countryByString.set(normalized, cityResolved.countryCode);
                return {
                    countryCode: cityResolved.countryCode,
                    country: cityResolved.country
                };
            }
        }
        const cached = this.geocodeCache.get(normalized);
        if (cached?.data?.countryCode) {
            this.countryByString.set(normalized, cached.data.countryCode);
            return {
                countryCode: cached.data.countryCode,
                country: cached.data.country || (window.CountryData && window.CountryData.getCountryName(cached.data.countryCode)) || cached.data.countryCode
            };
        }
        return null;
    }
}

// Export for use in other modules
window.LocationService = LocationService;
