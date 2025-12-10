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
        // Pattern: word(s) followed by comma/space and company suffix
        // IMPORTANT: Exclude US state abbreviations (CO, CA, NY, TX, etc.) which are NOT company suffixes
        const usStateAbbreviations = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i;
        const hasStateAbbreviation = usStateAbbreviations.test(normalized);
        
        // Only check for company pattern if it doesn't contain a state abbreviation
        if (!hasStateAbbreviation) {
            const companyNamePattern = /^[\w\s&]+(?:,\s*)?(?:Inc|LLC|LLP|Ltd|Corp|Corporation|Company|Co\.|GmbH|AG|SARL|AB|ApS|BV|B\.V|KFT|a\.s|a\.s\.|SAS|S\.A\.S|Intl|International|Engineering|Software|Technologies|Tech|Solutions|Systems|Group|Enterprises|Ventures|Consulting|Consultants)\.?$/i;
            // Note: Changed "Co" to "Co\." to require period, avoiding false matches with state abbreviations
            if (companyNamePattern.test(normalized) && normalized.length < 60 && !normalized.match(/,\s*(USA|US|UK|Canada|Australia|Germany|France|Spain|Italy|Japan|China|India|Brazil|Mexico)/i)) {
                // Only skip if it looks like a company name (not too long, contains company suffix, and no country indicator)
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
        
        // Skip single-word entries that don't look like locations
        if (!normalized.includes(',') && !normalized.includes(' ') && normalized.length > 2 && normalized.length < 20) {
            const lowerNormalized = normalized.toLowerCase();
            if (!commonPlaceNames.has(lowerNormalized) && 
                !lowerNormalized.match(/^(san|saint|st|new|old|north|south|east|west|upper|lower|great|little|big|small|port|fort|mount|mt|lake|river|bay|beach|creek|valley|hill|hills|park|forest|woods|springs|falls|bridge|burg|ville|ton|town|city|port|ford|haven|field|ford|mill|mills|grove|wood|woods|brook|brooks|dale|dales|ridge|ridges|point|points|island|islands|isle|isles|cape|capes|head|heads|cliff|cliffs|bluff|bluffs|rock|rocks|stone|stones|peak|peaks|summit|summits|pass|passes|canyon|canyons|gorge|gorges|desert|deserts|oasis|oases|jungle|jungles|forest|forests|swamp|swamps|marsh|marshes|prairie|prairies|plain|plains|plateau|plateaus|mesa|mesas|butte|buttes|volcano|volcanoes|crater|craters|geyser|geysers|hotsprings|hot springs|glacier|glaciers|fjord|fjords|strait|straits|channel|channels|sound|sounds|gulf|gulfs|sea|seas|ocean|oceans|bay|bays|harbor|harbors|harbour|harbours|port|ports|dock|docks|pier|piers|wharf|wharves|marina|marinas|beach|beaches|shore|shores|coast|coasts|peninsula|peninsulas|isthmus|isthmuses|cape|capes|headland|headlands|promontory|promontories|cliff|cliffs|bluff|bluffs|escarpment|escarpments|ridge|ridges|spur|spurs|foothill|foothills|foothills|mountain|mountains|hill|hills|knoll|knolls|mound|mounds|hillock|hillocks|hummock|hummocks|drumlin|drumlins|esker|eskers|kame|kames|moraine|moraines|outwash|outwashes|till|tills|loess|loesses|sand|sands|gravel|gravels|clay|clays|silt|silts|mud|muds|peat|peats|marl|marls|chalk|chalks|limestone|limestones|sandstone|sandstones|shale|shales|slate|slates|granite|granites|basalt|basalts|gneiss|gneisses|schist|schists|marble|marbles|quartzite|quartzites|slate|slates|phyllite|phyllites|amphibolite|amphibolites|eclogite|eclogites|serpentinite|serpentinites|gabbro|gabbros|diorite|diorites|andesite|andesites|rhyolite|rhyolites|obsidian|obsidians|pumice|pumices|scoria|scorias|tuff|tuffs|breccia|breccias|conglomerate|conglomerates|sandstone|sandstones|siltstone|siltstones|mudstone|mudstones|claystone|claystones|shale|shales|limestone|limestones|dolomite|dolomites|chert|cherts|flint|flints|jasper|jaspers|agate|agates|onyx|onyxes|chalcedony|chalcedonies|opal|opals|quartz|quartzes|amethyst|amethysts|citrine|citrines|rose quartz|rose quartzes|smoky quartz|smoky quartzes|milky quartz|milky quartzes|rock crystal|rock crystals|clear quartz|clear quartzes|tiger eye|tiger eyes|cat eye|cat eyes|hawk eye|hawk eyes|bull eye|bull eyes|falcon eye|falcon eyes|eagle eye|eagle eyes|wolf eye|wolf eyes|bear eye|bear eyes|deer eye|deer eyes|elk eye|elk eyes|moose eye|moose eyes|bison eye|bison eyes|buffalo eye|buffalo eyes|antelope eye|antelope eyes|gazelle eye|gazelle eyes|impala eye|impala eyes|springbok eye|springbok eyes|oryx eye|oryx eyes|addax eye|addax eyes|scimitar eye|scimitar eyes|sable eye|sable eyes|roan eye|roan eyes|eland eye|eland eyes|kudu eye|kudu eyes|nyala eye|nyala eyes|bushbuck eye|bushbuck eyes|sitatunga eye|sitatunga eyes|waterbuck eye|waterbuck eyes|lechwe eye|lechwe eyes|puku eye|puku eyes|reedbuck eye|reedbuck eyes|mountain reedbuck eye|mountain reedbuck eyes|gray rhebok eye|gray rhebok eyes|vaal rhebok eye|vaal rhebok eyes|blesbok eye|blesbok eyes|bontebok eye|bontebok eyes|tsessebe eye|tsessebe eyes|topi eye|topi eyes|hartebeest eye|hartebeest eyes|kongoni eye|kongoni eyes|hirola eye|hirola eyes|damaliscus eye|damaliscus eyes|sassaby eye|sassaby eyes|korrigum eye|korrigum eyes|tiang eye|tiang eyes|topi eye|topi eyes|tsessebe eye|tsessebe eyes|bontebok eye|bontebok eyes|blesbok eye|blesbok eyes|vaal rhebok eye|vaal rhebok eyes|gray rhebok eye|gray rhebok eyes|mountain reedbuck eye|mountain reedbuck eyes|reedbuck eye|reedbuck eyes|puku eye|puku eyes|lechwe eye|lechwe eyes|waterbuck eye|waterbuck eyes|sitatunga eye|sitatunga eyes|bushbuck eye|bushbuck eyes|nyala eye|nyala eyes|kudu eye|kudu eyes|eland eye|eland eyes|roan eye|roan eyes|sable eye|sable eyes|scimitar eye|scimitar eyes|addax eye|addax eyes|oryx eye|oryx eyes|springbok eye|springbok eyes|impala eye|impala eyes|gazelle eye|gazelle eyes|antelope eye|antelope eyes|buffalo eye|buffalo eyes|bison eye|bison eyes|moose eye|moose eyes|elk eye|elk eyes|deer eye|deer eyes|bear eye|bear eyes|wolf eye|wolf eyes|eagle eye|eagle eyes|falcon eye|falcon eyes|bull eye|bull eyes|hawk eye|hawk eyes|cat eye|cat eyes|tiger eye|tiger eyes|clear quartz|clear quartzes|rock crystal|rock crystals|milky quartz|milky quartzes|smoky quartz|smoky quartzes|rose quartz|rose quartzes|citrine|citrines|amethyst|amethysts|quartz|quartzes|opal|opals|chalcedony|chalcedonies|onyx|onyxes|agate|agates|jasper|jaspers|flint|flints|chert|cherts|dolomite|dolomites|limestone|limestones|claystone|claystones|mudstone|mudstones|siltstone|siltstones|sandstone|sandstones|conglomerate|conglomerates|breccia|breccias|tuff|tuffs|scoria|scorias|pumice|pumices|obsidian|obsidians|rhyolite|rhyolites|andesite|andesites|diorite|diorites|gabbro|gabbros|serpentinite|serpentinites|eclogite|eclogites|amphibolite|amphibolites|phyllite|phyllites|slate|slates|quartzite|quartzites|marble|marbles|schist|schists|gneiss|gneisses|basalt|basalts|granite|granites|slate|slates|limestone|limestones|sandstone|sandstones|shale|shales|rock|rocks|stone|stones|peak|peaks|summit|summits|pass|passes|canyon|canyons|gorge|gorges|desert|deserts|oasis|oases|jungle|jungles|forest|forests|swamp|swamps|marsh|marshes|prairie|prairies|plain|plains|plateau|plateaus|mesa|mesas|butte|buttes|volcano|volcanoes|crater|craters|geyser|geysers|hotsprings|hot springs|glacier|glaciers|fjord|fjords|strait|straits|channel|channels|sound|sounds|gulf|gulfs|sea|seas|ocean|oceans|bay|bays|harbor|harbors|harbour|harbours|port|ports|dock|docks|pier|piers|wharf|wharves|marina|marinas|beach|beaches|shore|shores|coast|coasts|peninsula|peninsulas|isthmus|isthmuses|cape|capes|headland|headlands|promontory|promontories|cliff|cliffs|bluff|bluffs|escarpment|escarpments|ridge|ridges|spur|spurs|foothill|foothills|foothills|mountain|mountains|hill|hills|knoll|knolls|mound|mounds|hillock|hillocks|hummock|hummocks|drumlin|drumlins|esker|eskers|kame|kames|moraine|moraines|outwash|outwashes|till|tills|loess|loesses|sand|sands|gravel|gravels|clay|clays|silt|silts|mud|muds|peat|peats|marl|marls|chalk|chalks|limestone|limestones|sandstone|sandstones|shale|shales|slate|slates|granite|granites|basalt|basalts|gneiss|gneisses|schist|schists|marble|marbles|quartzite|quartzites|slate|slates|phyllite|phyllites|amphibolite|amphibolites|eclogite|eclogites|serpentinite|serpentinites|gabbro|gabbros|diorite|diorites|andesite|andesites|rhyolite|rhyolites|obsidian|obsidians|pumice|pumices|scoria|scorias|tuff|tuffs|breccia|breccias|conglomerate|conglomerates|sandstone|sandstones|siltstone|siltstones|mudstone|mudstones|claystone|claystones|shale|shales|limestone|limestones|dolomite|dolomites|chert|cherts|flint|flints|jasper|jaspers|agate|agates|onyx|onyxes|chalcedony|chalcedonies|opal|opals|quartz|quartzes|amethyst|amethysts|citrine|citrines|rose quartz|rose quartzes|smoky quartz|smoky quartzes|milky quartz|milky quartzes|rock crystal|rock crystals|clear quartz|clear quartzes|tiger eye|tiger eyes|cat eye|cat eyes|hawk eye|hawk eyes|bull eye|bull eyes|falcon eye|falcon eyes|eagle eye|eagle eyes|wolf eye|wolf eyes|bear eye|bear eyes|deer eye|deer eyes|elk eye|elk eyes|moose eye|moose eyes|bison eye|bison eyes|buffalo eye|buffalo eyes|antelope eye|antelope eyes|gazelle eye|gazelle eyes|impala eye|impala eyes|springbok eye|springbok eyes|oryx eye|oryx eyes|addax eye|addax eyes|scimitar eye|scimitar eyes|sable eye|sable eyes|roan eye|roan eyes|eland eye|eland eyes|kudu eye|kudu eyes|nyala eye|nyala eyes|bushbuck eye|bushbuck eyes|sitatunga eye|sitatunga eyes|waterbuck eye|waterbuck eyes|lechwe eye|lechwe eyes|puku eye|puku eyes|reedbuck eye|reedbuck eyes|mountain reedbuck eye|mountain reedbuck eyes|gray rhebok eye|gray rhebok eyes|vaal rhebok eye|vaal rhebok eyes|blesbok eye|blesbok eyes|bontebok eye|bontebok eyes|tsessebe eye|tsessebe eyes|topi eye|topi eyes|hartebeest eye|hartebeest eyes|kongoni eye|kongoni eyes|hirola eye|hirola eyes|damaliscus eye|damaliscus eyes|sassaby eye|sassaby eyes|korrigum eye|korrigum eyes|tiang eye|tiang eyes|topi eye|topi eyes|tsessebe eye|tsessebe eyes|bontebok eye|bontebok eyes|blesbok eye|blesbok eyes|vaal rhebok eye|vaal rhebok eyes|gray rhebok eye|gray rhebok eyes|mountain reedbuck eye|mountain reedbuck eyes|reedbuck eye|reedbuck eyes|puku eye|puku eyes|lechwe eye|lechwe eyes|waterbuck eye|waterbuck eyes|sitatunga eye|sitatunga eyes|bushbuck eye|bushbuck eyes|nyala eye|nyala eyes|kudu eye|kudu eyes|eland eye|eland eyes|roan eye|roan eyes|sable eye|sable eyes|scimitar eye|scimitar eyes|addax eye|addax eyes|oryx eye|oryx eyes|springbok eye|springbok eyes|impala eye|impala eyes|gazelle eye|gazelle eyes|antelope eye|antelope eyes|buffalo eye|buffalo eyes|bison eye|bison eyes|moose eye|moose eyes|elk eye|elk eyes|deer eye|deer eyes|bear eye|bear eyes|wolf eye|wolf eyes|eagle eye|eagle eyes|falcon eye|falcon eyes|bull eye|bull eyes|hawk eye|hawk eyes|cat eye|cat eyes|tiger eye|tiger eyes|clear quartz|clear quartzes|rock crystal|rock crystals|milky quartz|milky quartzes|smoky quartz|smoky quartzes|rose quartz|rose quartzes|citrine|citrines|amethyst|amethysts|quartz|quartzes|opal|opals|chalcedony|chalcedonies|onyx|onyxes|agate|agates|jasper|jaspers|flint|flints|chert|cherts|dolomite|dolomites|limestone|limestones|claystone|claystones|mudstone|mudstones|siltstone|siltstones|sandstone|sandstones|conglomerate|conglomerates|breccia|breccias|tuff|tuffs|scoria|scorias|pumice|pumices|obsidian|obsidians|rhyolite|rhyolites|andesite|andesites|diorite|diorites|gabbro|gabbros|serpentinite|serpentinites|eclogite|eclogites|amphibolite|amphibolites|phyllite|phyllites|slate|slates|quartzite|quartzites|marble|marbles|schist|schists|gneiss|gneisses|basalt|basalts|granite|granites|slate|slates|limestone|limestones|sandstone|sandstones|shale|shales|rock|rocks|stone|stones|peak|peaks|summit|summits|pass|passes|canyon|canyons|gorge|gorges|desert|deserts|oasis|oases|jungle|jungles|forest|forests|swamp|swamps|marsh|marshes|prairie|prairies|plain|plains|plateau|plateaus|mesa|mesas|butte|buttes|volcano|volcanoes|crater|craters|geyser|geysers|hotsprings|hot springs|glacier|glaciers|fjord|fjords|strait|straits|channel|channels|sound|sounds|gulf|gulfs|sea|seas|ocean|oceans|bay|bays|harbor|harbors|harbour|harbours|port|ports|dock|docks|pier|piers|wharf|wharves|marina|marinas|beach|beaches|shore|shores|coast|coasts|peninsula|peninsulas|isthmus|isthmuses|cape|capes|headland|headlands|promontory|promontories|cliff|cliffs|bluff|bluffs|escarpment|escarpments|ridge|ridges|spur|spurs|foothill|foothills|foothills|mountain|mountains|hill|hills|knoll|knolls|mound|mounds|hillock|hillocks|hummock|hummocks|drumlin|drumlins|esker|eskers|kame|kames|moraine|moraines|outwash|outwashes|till|tills|loess|loesses|sand|sands|gravel|gravels|clay|clays|silt|silts|mud|muds|peat|peats|marl|marls|chalk|chalks|limestone|limestones|sandstone|sandstones|shale|shales|slate|slates|granite|granites|basalt|basalts|gneiss|gneisses|schist|schists|marble|marbles|quartzite|quartzites|slate|slates|phyllite|phyllites|amphibolite|amphibolites|eclogite|eclogites|serpentinite|serpentinites|gabbro|gabbros|diorite|diorites|andesite|andesites|rhyolite|rhyolites|obsidian|obsidians|pumice|pumices|scoria|scorias|tuff|tuffs|breccia|breccias|conglomerate|conglomerates|sandstone|sandstones|siltstone|siltstones|mudstone|mudstones|claystone|claystones|shale|shales|limestone|limestones|dolomite|dolomites|chert|cherts|flint|flints|jasper|jaspers|agate|agates|onyx|onyxes|chalcedony|chalcedonies|opal|opals|quartz|quartzes|amethyst|amethysts|citrine|citrines|rose quartz|rose quartzes|smoky quartz|smoky quartzes|milky quartz|milky quartzes|rock crystal|rock crystals|clear quartz|clear quartzes|tiger eye|tiger eyes|cat eye|cat eyes|hawk eye|hawk eyes|bull eye|bull eyes|falcon eye|falcon eyes|eagle eye|eagle eyes|wolf eye|wolf eyes|bear eye|bear eyes|deer eye|deer eyes|elk eye|elk eyes|moose eye|moose eyes|bison eye|bison eyes|buffalo eye|buffalo eyes|antelope eye|antelope eyes|gazelle eye|gazelle eyes|impala eye|impala eyes|springbok eye|springbok eyes|oryx eye|oryx eyes|addax eye|addax eyes|scimitar eye|scimitar eyes|sable eye|sable eyes|roan eye|roan eyes|eland eye|eland eyes|kudu eye|kudu eyes|nyala eye|nyala eyes|bushbuck eye|bushbuck eyes|sitatunga eye|sitatunga eyes|waterbuck eye|waterbuck eyes|lechwe eye|lechwe eyes|puku eye|puku eyes|reedbuck eye|reedbuck eyes|mountain reedbuck eye|mountain reedbuck eyes|gray rhebok eye|gray rhebok eyes|vaal rhebok eye|vaal rhebok eyes|blesbok eye|blesbok eyes|bontebok eye|bontebok eyes|tsessebe eye|tsessebe eyes|topi eye|topi eyes|hartebeest eye|hartebeest eyes|kongoni eye|kongoni eyes|hirola eye|hirola eyes|damaliscus eye|damaliscus eyes|sassaby eye|sassaby eyes|korrigum eye|korrigum eyes|tiang eye|tiang eyes|topi eye|topi eyes|tsessebe eye|tsessebe eyes|bontebok eye|bontebok eyes|blesbok eye|blesbok eyes|vaal rhebok eye|vaal rhebok eyes|gray rhebok eye|gray rhebok eyes|mountain reedbuck eye|mountain reedbuck eyes|reedbuck eye|reedbuck eyes|puku eye|puku eyes|lechwe eye|lechwe eyes|waterbuck eye|waterbuck eyes|sitatunga eye|sitatunga eyes|bushbuck eye|bushbuck eyes|nyala eye|nyala eyes|kudu eye|kudu eyes|eland eye|eland eyes|roan eye|roan eyes|sable eye|sable eyes|scimitar eye|scimitar eyes|addax eye|addax eyes|oryx eye|oryx eyes|springbok eye|springbok eyes|impala eye|impala eyes|gazelle eye|gazelle eyes|antelope eye|antelope eyes|buffalo eye|buffalo eyes|bison eye|bison eyes|moose eye|moose eyes|elk eye|elk eyes|deer eye|deer eyes|bear eye|bear eyes|wolf eye|wolf eyes|eagle eye|eagle eyes|falcon eye|falcon eyes|bull eye|bull eyes|hawk eye|hawk eyes|cat eye|cat eyes|tiger eye|tiger eyes)$/i)) {
                console.log(`⚠️ Skipping geocoding for single-word non-location: "${normalized}"`);
                return null;
            }
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
     * Parse multiple locations from a string separated by |, \, or /
     * @param {string} locationString - Location string that may contain multiple locations
     * @returns {Array<string>} - Array of individual location strings
     */
    parseMultipleLocations(locationString) {
        if (!locationString || typeof locationString !== 'string') {
            return [];
        }

        // Split by common separators: |, \, /, or multiple spaces
        const separators = /[|\/\\]|,\s*and\s+/i;
        const locations = locationString
            .split(separators)
            .map(loc => loc.trim())
            .filter(loc => loc.length > 0);

        // If no separators found, return single location
        if (locations.length === 1) {
            return [locationString.trim()];
        }

        return locations;
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
                debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
                debugLogUrl(`   Reason: Geocoding location string "${normalizedLocation}" to lat/lng coordinates using Nominatim API`);

                const response = await fetchWithTimeout(url, {
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
     * Get geocoded location from cache only (no API calls)
     * @param {string} locationString - Location string to look up
     * @returns {Promise<Object|null>} - Geocoded data if found in cache, null otherwise
     */
    async getFromCache(locationString) {
        const normalizedLocation = this.normalizeLocationString(locationString);
        if (!normalizedLocation) {
            return null;
        }

        // Check in-memory cache first
        const cached = this.geocodeCache.get(normalizedLocation);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            // Check if this is a failed attempt marker
            if (cached.data && cached.data.failed === true) {
                return null;
            }
            return cached.data;
        }

        // Check IndexedDB cache
        if (window.indexedDBManager && window.indexedDBManager.isInitialized()) {
            const dbCached = await window.indexedDBManager.getLocation(normalizedLocation);
            if (dbCached) {
                // Check if this is a failed attempt marker
                if (dbCached.failed === true) {
                    return null;
                }
                // Update in-memory cache
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

