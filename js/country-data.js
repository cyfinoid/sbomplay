/**
 * Country Data - Static lookup tables for country resolution and map centroids.
 *
 * Powers the country-only visualization on the authors page and is also used by
 * LocationService to short-circuit Nominatim calls whenever a location string ends
 * with a recognizable country, country alias, or US state. Together these tables
 * eliminate the vast majority of geocoding round-trips against Nominatim's strict
 * 1 req/sec rate limit.
 *
 * Exposes a single global, `window.CountryData`, which provides:
 *   - resolveCountry(rawString)          → { countryCode, country } | null
 *   - getCentroid(countryCode)           → { lat, lng } | null
 *   - getCountryName(countryCode)        → string | null
 */
(function (global) {
    // ISO 3166-1 alpha-2 → display name + centroid (lat/lng)
    // Centroids are coarse country-level geographic centers, intentionally rounded to
    // 2 decimal places. They are used purely for visual map markers — sub-degree
    // precision is unnecessary because the authors map renders one marker per country.
    const COUNTRIES = {
        AD: { name: 'Andorra', lat: 42.51, lng: 1.52 },
        AE: { name: 'United Arab Emirates', lat: 23.42, lng: 53.85 },
        AF: { name: 'Afghanistan', lat: 33.94, lng: 67.71 },
        AG: { name: 'Antigua and Barbuda', lat: 17.06, lng: -61.80 },
        AI: { name: 'Anguilla', lat: 18.22, lng: -63.07 },
        AL: { name: 'Albania', lat: 41.15, lng: 20.17 },
        AM: { name: 'Armenia', lat: 40.07, lng: 45.04 },
        AO: { name: 'Angola', lat: -11.20, lng: 17.87 },
        AQ: { name: 'Antarctica', lat: -75.25, lng: -0.07 },
        AR: { name: 'Argentina', lat: -38.42, lng: -63.62 },
        AS: { name: 'American Samoa', lat: -14.27, lng: -170.13 },
        AT: { name: 'Austria', lat: 47.52, lng: 14.55 },
        AU: { name: 'Australia', lat: -25.27, lng: 133.78 },
        AW: { name: 'Aruba', lat: 12.52, lng: -69.97 },
        AX: { name: 'Åland Islands', lat: 60.18, lng: 19.92 },
        AZ: { name: 'Azerbaijan', lat: 40.14, lng: 47.58 },
        BA: { name: 'Bosnia and Herzegovina', lat: 43.92, lng: 17.68 },
        BB: { name: 'Barbados', lat: 13.19, lng: -59.54 },
        BD: { name: 'Bangladesh', lat: 23.68, lng: 90.36 },
        BE: { name: 'Belgium', lat: 50.50, lng: 4.47 },
        BF: { name: 'Burkina Faso', lat: 12.24, lng: -1.56 },
        BG: { name: 'Bulgaria', lat: 42.73, lng: 25.49 },
        BH: { name: 'Bahrain', lat: 25.93, lng: 50.64 },
        BI: { name: 'Burundi', lat: -3.37, lng: 29.92 },
        BJ: { name: 'Benin', lat: 9.31, lng: 2.32 },
        BL: { name: 'Saint Barthélemy', lat: 17.90, lng: -62.83 },
        BM: { name: 'Bermuda', lat: 32.32, lng: -64.76 },
        BN: { name: 'Brunei', lat: 4.54, lng: 114.73 },
        BO: { name: 'Bolivia', lat: -16.29, lng: -63.59 },
        BQ: { name: 'Caribbean Netherlands', lat: 12.18, lng: -68.24 },
        BR: { name: 'Brazil', lat: -14.24, lng: -51.93 },
        BS: { name: 'Bahamas', lat: 25.03, lng: -77.40 },
        BT: { name: 'Bhutan', lat: 27.51, lng: 90.43 },
        BV: { name: 'Bouvet Island', lat: -54.42, lng: 3.41 },
        BW: { name: 'Botswana', lat: -22.33, lng: 24.68 },
        BY: { name: 'Belarus', lat: 53.71, lng: 27.95 },
        BZ: { name: 'Belize', lat: 17.19, lng: -88.50 },
        CA: { name: 'Canada', lat: 56.13, lng: -106.35 },
        CC: { name: 'Cocos Islands', lat: -12.16, lng: 96.87 },
        CD: { name: 'Democratic Republic of the Congo', lat: -4.04, lng: 21.76 },
        CF: { name: 'Central African Republic', lat: 6.61, lng: 20.94 },
        CG: { name: 'Republic of the Congo', lat: -0.23, lng: 15.83 },
        CH: { name: 'Switzerland', lat: 46.82, lng: 8.23 },
        CI: { name: 'Côte d\u2019Ivoire', lat: 7.54, lng: -5.55 },
        CK: { name: 'Cook Islands', lat: -21.24, lng: -159.78 },
        CL: { name: 'Chile', lat: -35.68, lng: -71.54 },
        CM: { name: 'Cameroon', lat: 7.37, lng: 12.35 },
        CN: { name: 'China', lat: 35.86, lng: 104.20 },
        CO: { name: 'Colombia', lat: 4.57, lng: -74.30 },
        CR: { name: 'Costa Rica', lat: 9.75, lng: -83.75 },
        CU: { name: 'Cuba', lat: 21.52, lng: -77.78 },
        CV: { name: 'Cape Verde', lat: 16.00, lng: -24.01 },
        CW: { name: 'Curaçao', lat: 12.17, lng: -68.99 },
        CX: { name: 'Christmas Island', lat: -10.45, lng: 105.69 },
        CY: { name: 'Cyprus', lat: 35.13, lng: 33.43 },
        CZ: { name: 'Czechia', lat: 49.82, lng: 15.47 },
        DE: { name: 'Germany', lat: 51.17, lng: 10.45 },
        DJ: { name: 'Djibouti', lat: 11.83, lng: 42.59 },
        DK: { name: 'Denmark', lat: 56.26, lng: 9.50 },
        DM: { name: 'Dominica', lat: 15.41, lng: -61.37 },
        DO: { name: 'Dominican Republic', lat: 18.74, lng: -70.16 },
        DZ: { name: 'Algeria', lat: 28.03, lng: 1.66 },
        EC: { name: 'Ecuador', lat: -1.83, lng: -78.18 },
        EE: { name: 'Estonia', lat: 58.60, lng: 25.01 },
        EG: { name: 'Egypt', lat: 26.82, lng: 30.80 },
        EH: { name: 'Western Sahara', lat: 24.22, lng: -12.89 },
        ER: { name: 'Eritrea', lat: 15.18, lng: 39.78 },
        ES: { name: 'Spain', lat: 40.46, lng: -3.75 },
        ET: { name: 'Ethiopia', lat: 9.15, lng: 40.49 },
        FI: { name: 'Finland', lat: 61.92, lng: 25.75 },
        FJ: { name: 'Fiji', lat: -16.58, lng: 179.41 },
        FK: { name: 'Falkland Islands', lat: -51.80, lng: -59.52 },
        FM: { name: 'Micronesia', lat: 7.43, lng: 150.55 },
        FO: { name: 'Faroe Islands', lat: 61.89, lng: -6.91 },
        FR: { name: 'France', lat: 46.23, lng: 2.21 },
        GA: { name: 'Gabon', lat: -0.80, lng: 11.61 },
        GB: { name: 'United Kingdom', lat: 55.38, lng: -3.44 },
        GD: { name: 'Grenada', lat: 12.26, lng: -61.60 },
        GE: { name: 'Georgia', lat: 42.32, lng: 43.36 },
        GF: { name: 'French Guiana', lat: 3.93, lng: -53.13 },
        GG: { name: 'Guernsey', lat: 49.46, lng: -2.59 },
        GH: { name: 'Ghana', lat: 7.95, lng: -1.02 },
        GI: { name: 'Gibraltar', lat: 36.14, lng: -5.35 },
        GL: { name: 'Greenland', lat: 71.71, lng: -42.60 },
        GM: { name: 'Gambia', lat: 13.44, lng: -15.31 },
        GN: { name: 'Guinea', lat: 9.95, lng: -9.70 },
        GP: { name: 'Guadeloupe', lat: 16.27, lng: -61.55 },
        GQ: { name: 'Equatorial Guinea', lat: 1.65, lng: 10.27 },
        GR: { name: 'Greece', lat: 39.07, lng: 21.82 },
        GS: { name: 'South Georgia', lat: -54.43, lng: -36.59 },
        GT: { name: 'Guatemala', lat: 15.78, lng: -90.23 },
        GU: { name: 'Guam', lat: 13.44, lng: 144.79 },
        GW: { name: 'Guinea-Bissau', lat: 11.80, lng: -15.18 },
        GY: { name: 'Guyana', lat: 4.86, lng: -58.93 },
        HK: { name: 'Hong Kong', lat: 22.32, lng: 114.17 },
        HM: { name: 'Heard Island and McDonald Islands', lat: -53.08, lng: 73.50 },
        HN: { name: 'Honduras', lat: 15.20, lng: -86.24 },
        HR: { name: 'Croatia', lat: 45.10, lng: 15.20 },
        HT: { name: 'Haiti', lat: 18.97, lng: -72.29 },
        HU: { name: 'Hungary', lat: 47.16, lng: 19.50 },
        ID: { name: 'Indonesia', lat: -0.79, lng: 113.92 },
        IE: { name: 'Ireland', lat: 53.41, lng: -8.24 },
        IL: { name: 'Israel', lat: 31.05, lng: 34.85 },
        IM: { name: 'Isle of Man', lat: 54.24, lng: -4.55 },
        IN: { name: 'India', lat: 20.59, lng: 78.96 },
        IO: { name: 'British Indian Ocean Territory', lat: -6.34, lng: 71.88 },
        IQ: { name: 'Iraq', lat: 33.22, lng: 43.68 },
        IR: { name: 'Iran', lat: 32.43, lng: 53.69 },
        IS: { name: 'Iceland', lat: 64.96, lng: -19.02 },
        IT: { name: 'Italy', lat: 41.87, lng: 12.57 },
        JE: { name: 'Jersey', lat: 49.21, lng: -2.13 },
        JM: { name: 'Jamaica', lat: 18.11, lng: -77.30 },
        JO: { name: 'Jordan', lat: 30.59, lng: 36.24 },
        JP: { name: 'Japan', lat: 36.20, lng: 138.25 },
        KE: { name: 'Kenya', lat: -0.02, lng: 37.91 },
        KG: { name: 'Kyrgyzstan', lat: 41.20, lng: 74.77 },
        KH: { name: 'Cambodia', lat: 12.57, lng: 104.99 },
        KI: { name: 'Kiribati', lat: -3.37, lng: -168.73 },
        KM: { name: 'Comoros', lat: -11.88, lng: 43.87 },
        KN: { name: 'Saint Kitts and Nevis', lat: 17.36, lng: -62.78 },
        KP: { name: 'North Korea', lat: 40.34, lng: 127.51 },
        KR: { name: 'South Korea', lat: 35.91, lng: 127.77 },
        KW: { name: 'Kuwait', lat: 29.31, lng: 47.48 },
        KY: { name: 'Cayman Islands', lat: 19.51, lng: -80.57 },
        KZ: { name: 'Kazakhstan', lat: 48.02, lng: 66.92 },
        LA: { name: 'Laos', lat: 19.86, lng: 102.50 },
        LB: { name: 'Lebanon', lat: 33.85, lng: 35.86 },
        LC: { name: 'Saint Lucia', lat: 13.91, lng: -60.98 },
        LI: { name: 'Liechtenstein', lat: 47.17, lng: 9.56 },
        LK: { name: 'Sri Lanka', lat: 7.87, lng: 80.77 },
        LR: { name: 'Liberia', lat: 6.43, lng: -9.43 },
        LS: { name: 'Lesotho', lat: -29.61, lng: 28.23 },
        LT: { name: 'Lithuania', lat: 55.17, lng: 23.88 },
        LU: { name: 'Luxembourg', lat: 49.82, lng: 6.13 },
        LV: { name: 'Latvia', lat: 56.88, lng: 24.60 },
        LY: { name: 'Libya', lat: 26.34, lng: 17.23 },
        MA: { name: 'Morocco', lat: 31.79, lng: -7.09 },
        MC: { name: 'Monaco', lat: 43.75, lng: 7.41 },
        MD: { name: 'Moldova', lat: 47.41, lng: 28.37 },
        ME: { name: 'Montenegro', lat: 42.71, lng: 19.37 },
        MF: { name: 'Saint Martin', lat: 18.08, lng: -63.05 },
        MG: { name: 'Madagascar', lat: -18.77, lng: 46.87 },
        MH: { name: 'Marshall Islands', lat: 7.13, lng: 171.18 },
        MK: { name: 'North Macedonia', lat: 41.61, lng: 21.75 },
        ML: { name: 'Mali', lat: 17.57, lng: -3.99 },
        MM: { name: 'Myanmar', lat: 21.91, lng: 95.96 },
        MN: { name: 'Mongolia', lat: 46.86, lng: 103.85 },
        MO: { name: 'Macao', lat: 22.20, lng: 113.54 },
        MP: { name: 'Northern Mariana Islands', lat: 17.33, lng: 145.38 },
        MQ: { name: 'Martinique', lat: 14.64, lng: -61.02 },
        MR: { name: 'Mauritania', lat: 21.01, lng: -10.94 },
        MS: { name: 'Montserrat', lat: 16.74, lng: -62.19 },
        MT: { name: 'Malta', lat: 35.94, lng: 14.38 },
        MU: { name: 'Mauritius', lat: -20.35, lng: 57.55 },
        MV: { name: 'Maldives', lat: 3.20, lng: 73.22 },
        MW: { name: 'Malawi', lat: -13.25, lng: 34.30 },
        MX: { name: 'Mexico', lat: 23.63, lng: -102.55 },
        MY: { name: 'Malaysia', lat: 4.21, lng: 101.98 },
        MZ: { name: 'Mozambique', lat: -18.67, lng: 35.53 },
        NA: { name: 'Namibia', lat: -22.96, lng: 18.49 },
        NC: { name: 'New Caledonia', lat: -20.90, lng: 165.62 },
        NE: { name: 'Niger', lat: 17.61, lng: 8.08 },
        NF: { name: 'Norfolk Island', lat: -29.04, lng: 167.95 },
        NG: { name: 'Nigeria', lat: 9.08, lng: 8.68 },
        NI: { name: 'Nicaragua', lat: 12.87, lng: -85.21 },
        NL: { name: 'Netherlands', lat: 52.13, lng: 5.29 },
        NO: { name: 'Norway', lat: 60.47, lng: 8.47 },
        NP: { name: 'Nepal', lat: 28.39, lng: 84.12 },
        NR: { name: 'Nauru', lat: -0.52, lng: 166.93 },
        NU: { name: 'Niue', lat: -19.05, lng: -169.87 },
        NZ: { name: 'New Zealand', lat: -40.90, lng: 174.89 },
        OM: { name: 'Oman', lat: 21.51, lng: 55.92 },
        PA: { name: 'Panama', lat: 8.54, lng: -80.78 },
        PE: { name: 'Peru', lat: -9.19, lng: -75.02 },
        PF: { name: 'French Polynesia', lat: -17.68, lng: -149.41 },
        PG: { name: 'Papua New Guinea', lat: -6.31, lng: 143.96 },
        PH: { name: 'Philippines', lat: 12.88, lng: 121.77 },
        PK: { name: 'Pakistan', lat: 30.38, lng: 69.35 },
        PL: { name: 'Poland', lat: 51.92, lng: 19.15 },
        PM: { name: 'Saint Pierre and Miquelon', lat: 46.94, lng: -56.27 },
        PN: { name: 'Pitcairn Islands', lat: -24.70, lng: -127.44 },
        PR: { name: 'Puerto Rico', lat: 18.22, lng: -66.59 },
        PS: { name: 'Palestine', lat: 31.95, lng: 35.23 },
        PT: { name: 'Portugal', lat: 39.40, lng: -8.22 },
        PW: { name: 'Palau', lat: 7.51, lng: 134.58 },
        PY: { name: 'Paraguay', lat: -23.44, lng: -58.44 },
        QA: { name: 'Qatar', lat: 25.35, lng: 51.18 },
        RE: { name: 'Réunion', lat: -21.12, lng: 55.54 },
        RO: { name: 'Romania', lat: 45.94, lng: 24.97 },
        RS: { name: 'Serbia', lat: 44.02, lng: 21.01 },
        RU: { name: 'Russia', lat: 61.52, lng: 105.32 },
        RW: { name: 'Rwanda', lat: -1.94, lng: 29.87 },
        SA: { name: 'Saudi Arabia', lat: 23.89, lng: 45.08 },
        SB: { name: 'Solomon Islands', lat: -9.65, lng: 160.16 },
        SC: { name: 'Seychelles', lat: -4.68, lng: 55.49 },
        SD: { name: 'Sudan', lat: 12.86, lng: 30.22 },
        SE: { name: 'Sweden', lat: 60.13, lng: 18.64 },
        SG: { name: 'Singapore', lat: 1.35, lng: 103.82 },
        SH: { name: 'Saint Helena', lat: -24.14, lng: -10.03 },
        SI: { name: 'Slovenia', lat: 46.15, lng: 14.99 },
        SJ: { name: 'Svalbard and Jan Mayen', lat: 77.55, lng: 23.67 },
        SK: { name: 'Slovakia', lat: 48.67, lng: 19.70 },
        SL: { name: 'Sierra Leone', lat: 8.46, lng: -11.78 },
        SM: { name: 'San Marino', lat: 43.94, lng: 12.46 },
        SN: { name: 'Senegal', lat: 14.50, lng: -14.45 },
        SO: { name: 'Somalia', lat: 5.15, lng: 46.20 },
        SR: { name: 'Suriname', lat: 3.92, lng: -56.03 },
        SS: { name: 'South Sudan', lat: 6.88, lng: 31.31 },
        ST: { name: 'São Tomé and Príncipe', lat: 0.19, lng: 6.61 },
        SV: { name: 'El Salvador', lat: 13.79, lng: -88.90 },
        SX: { name: 'Sint Maarten', lat: 18.04, lng: -63.07 },
        SY: { name: 'Syria', lat: 34.80, lng: 38.99 },
        SZ: { name: 'Eswatini', lat: -26.52, lng: 31.47 },
        TC: { name: 'Turks and Caicos Islands', lat: 21.69, lng: -71.80 },
        TD: { name: 'Chad', lat: 15.45, lng: 18.73 },
        TF: { name: 'French Southern Territories', lat: -49.28, lng: 69.35 },
        TG: { name: 'Togo', lat: 8.62, lng: 0.82 },
        TH: { name: 'Thailand', lat: 15.87, lng: 100.99 },
        TJ: { name: 'Tajikistan', lat: 38.86, lng: 71.28 },
        TK: { name: 'Tokelau', lat: -8.97, lng: -171.86 },
        TL: { name: 'Timor-Leste', lat: -8.87, lng: 125.73 },
        TM: { name: 'Turkmenistan', lat: 38.97, lng: 59.56 },
        TN: { name: 'Tunisia', lat: 33.89, lng: 9.54 },
        TO: { name: 'Tonga', lat: -21.18, lng: -175.20 },
        TR: { name: 'Türkiye', lat: 38.96, lng: 35.24 },
        TT: { name: 'Trinidad and Tobago', lat: 10.69, lng: -61.22 },
        TV: { name: 'Tuvalu', lat: -7.11, lng: 177.65 },
        TW: { name: 'Taiwan', lat: 23.70, lng: 120.96 },
        TZ: { name: 'Tanzania', lat: -6.37, lng: 34.89 },
        UA: { name: 'Ukraine', lat: 48.38, lng: 31.17 },
        UG: { name: 'Uganda', lat: 1.37, lng: 32.29 },
        US: { name: 'United States', lat: 37.09, lng: -95.71 },
        UY: { name: 'Uruguay', lat: -32.52, lng: -55.77 },
        UZ: { name: 'Uzbekistan', lat: 41.38, lng: 64.59 },
        VA: { name: 'Vatican City', lat: 41.90, lng: 12.45 },
        VC: { name: 'Saint Vincent and the Grenadines', lat: 13.25, lng: -61.20 },
        VE: { name: 'Venezuela', lat: 6.42, lng: -66.59 },
        VG: { name: 'British Virgin Islands', lat: 18.42, lng: -64.64 },
        VI: { name: 'U.S. Virgin Islands', lat: 18.34, lng: -64.90 },
        VN: { name: 'Vietnam', lat: 14.06, lng: 108.28 },
        VU: { name: 'Vanuatu', lat: -15.38, lng: 166.96 },
        WF: { name: 'Wallis and Futuna', lat: -13.77, lng: -177.16 },
        WS: { name: 'Samoa', lat: -13.76, lng: -172.10 },
        XK: { name: 'Kosovo', lat: 42.60, lng: 20.90 },
        YE: { name: 'Yemen', lat: 15.55, lng: 48.52 },
        YT: { name: 'Mayotte', lat: -12.83, lng: 45.17 },
        ZA: { name: 'South Africa', lat: -30.56, lng: 22.94 },
        ZM: { name: 'Zambia', lat: -13.13, lng: 27.85 },
        ZW: { name: 'Zimbabwe', lat: -19.02, lng: 29.15 }
    };

    // Aliases / alternative names → canonical alpha-2 code.
    // All keys are stored lowercased for case-insensitive matching.
    // Includes alpha-3 codes, common short forms, and frequent typos seen in
    // GitHub user "location" fields.
    const ALIASES = {
        // United States
        'us': 'US', 'usa': 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'u.s.a': 'US',
        'united states': 'US', 'united states of america': 'US', 'america': 'US',
        // United Kingdom
        'uk': 'GB', 'u.k.': 'GB', 'u.k': 'GB', 'great britain': 'GB',
        'united kingdom': 'GB', 'gbr': 'GB', 'britain': 'GB', 'england': 'GB',
        'scotland': 'GB', 'wales': 'GB', 'northern ireland': 'GB',
        // Common alpha-3 codes
        'arg': 'AR', 'aus': 'AU', 'aut': 'AT', 'bel': 'BE', 'bgr': 'BG',
        'bra': 'BR', 'can': 'CA', 'che': 'CH', 'chl': 'CL', 'chn': 'CN',
        'col': 'CO', 'cze': 'CZ', 'deu': 'DE', 'dnk': 'DK', 'egy': 'EG',
        'esp': 'ES', 'est': 'EE', 'fin': 'FI', 'fra': 'FR', 'grc': 'GR',
        'hkg': 'HK', 'hrv': 'HR', 'hun': 'HU', 'idn': 'ID', 'ind': 'IN',
        'irl': 'IE', 'irn': 'IR', 'isl': 'IS', 'isr': 'IL', 'ita': 'IT',
        'jpn': 'JP', 'kor': 'KR', 'lka': 'LK', 'ltu': 'LT', 'lva': 'LV',
        'mex': 'MX', 'mys': 'MY', 'nld': 'NL', 'nor': 'NO', 'nzl': 'NZ',
        'pak': 'PK', 'phl': 'PH', 'pol': 'PL', 'prt': 'PT', 'rou': 'RO',
        'rus': 'RU', 'sgp': 'SG', 'svk': 'SK', 'svn': 'SI', 'swe': 'SE',
        'tha': 'TH', 'tur': 'TR', 'twn': 'TW', 'ukr': 'UA', 'ury': 'UY',
        'vnm': 'VN', 'zaf': 'ZA',
        // Common alternate spellings / informal names
        'czech republic': 'CZ', 'czechia': 'CZ',
        'south korea': 'KR', 'republic of korea': 'KR', 'korea': 'KR',
        'north korea': 'KP',
        'russia': 'RU', 'russian federation': 'RU',
        'türkiye': 'TR', 'turkiye': 'TR', 'turkey': 'TR',
        'iran': 'IR', 'islamic republic of iran': 'IR',
        'syria': 'SY', 'syrian arab republic': 'SY',
        'vietnam': 'VN', 'viet nam': 'VN',
        'macau': 'MO', 'macao': 'MO',
        'cote d\u2019ivoire': 'CI', 'cote d\'ivoire': 'CI', 'ivory coast': 'CI',
        'cabo verde': 'CV', 'cape verde': 'CV',
        'eswatini': 'SZ', 'swaziland': 'SZ',
        'myanmar': 'MM', 'burma': 'MM',
        'congo': 'CG', 'republic of the congo': 'CG',
        'democratic republic of the congo': 'CD', 'dr congo': 'CD', 'drc': 'CD',
        'palestine': 'PS', 'palestinian territory': 'PS',
        'taiwan': 'TW', 'republic of china': 'TW',
        'china': 'CN', 'people\'s republic of china': 'CN', 'prc': 'CN', 'mainland china': 'CN',
        'uae': 'AE', 'emirates': 'AE',
        'holland': 'NL', 'the netherlands': 'NL',
        'bosnia': 'BA',
        'macedonia': 'MK', 'republic of macedonia': 'MK',
        'east timor': 'TL', 'timor leste': 'TL',
        'são tomé': 'ST', 'sao tome': 'ST',
        'south georgia and the south sandwich islands': 'GS',
        'guinea bissau': 'GW',
        'saint vincent': 'VC', 'st vincent': 'VC',
        'saint kitts': 'KN', 'st kitts': 'KN',
        'saint lucia': 'LC', 'st lucia': 'LC',
        'trinidad': 'TT', 'tobago': 'TT'
    };

    // US state abbreviations and full names → US.
    // Also covers DC and US territories that share the US country code in geocoding output.
    const US_STATES = {
        // Abbreviations
        al: true, ak: true, az: true, ar: true, ca: true, co: true, ct: true,
        de: true, fl: true, ga: true, hi: true, id: true, il: true, in: true,
        ia: true, ks: true, ky: true, la: true, me: true, md: true, ma: true,
        mi: true, mn: true, ms: true, mo: true, mt: true, ne: true, nv: true,
        nh: true, nj: true, nm: true, ny: true, nc: true, nd: true, oh: true,
        ok: true, or: true, pa: true, ri: true, sc: true, sd: true, tn: true,
        tx: true, ut: true, vt: true, va: true, wa: true, wv: true, wi: true,
        wy: true, dc: true,
        // Full names
        alabama: true, alaska: true, arizona: true, arkansas: true, california: true,
        colorado: true, connecticut: true, delaware: true, florida: true, georgia: true,
        hawaii: true, idaho: true, illinois: true, indiana: true, iowa: true,
        kansas: true, kentucky: true, louisiana: true, maine: true, maryland: true,
        massachusetts: true, michigan: true, minnesota: true, mississippi: true,
        missouri: true, montana: true, nebraska: true, nevada: true,
        'new hampshire': true, 'new jersey': true, 'new mexico': true, 'new york': true,
        'north carolina': true, 'north dakota': true, ohio: true, oklahoma: true,
        oregon: true, pennsylvania: true, 'rhode island': true, 'south carolina': true,
        'south dakota': true, tennessee: true, texas: true, utah: true, vermont: true,
        virginia: true, washington: true, 'west virginia': true, wisconsin: true,
        wyoming: true, 'district of columbia': true
    };

    // Build a fast lowercased name → alpha-2 lookup combining canonical names + aliases.
    const NAME_TO_CODE = {};
    Object.keys(COUNTRIES).forEach((code) => {
        NAME_TO_CODE[COUNTRIES[code].name.toLowerCase()] = code;
        NAME_TO_CODE[code.toLowerCase()] = code;
    });
    Object.keys(ALIASES).forEach((alias) => {
        NAME_TO_CODE[alias.toLowerCase()] = ALIASES[alias];
    });

    /**
     * Normalize a candidate string for lookup.
     * Strips trailing punctuation and surrounding whitespace, lowercases,
     * and folds repeated whitespace into a single space.
     */
    function normalizeSegment(s) {
        if (!s || typeof s !== 'string') return '';
        return s
            .toLowerCase()
            .replace(/[\s.\u00A0]+/g, ' ')
            .replace(/^[\s,'"]+|[\s,'".!?;:]+$/g, '')
            .trim();
    }

    /**
     * Try to resolve a country from a free-form location string.
     *
     * Strategy (in order, all O(1) lookups, no network):
     *   1. Look at the trailing comma-separated segment — most "City, Country" or
     *      "City, ST, USA" patterns terminate with a country name/code or a US state.
     *   2. If the trailing segment is a US state (e.g. "California" or "CA"), return US.
     *   3. If the trailing segment matches a country alias, use it.
     *   4. As a fallback, also test the *second-to-last* segment (handles
     *      "Berlin, Germany, Europe" style strings).
     *   5. As a final fallback, test the full normalized string against the alias map
     *      (covers single-token inputs like "USA" or "Germany").
     *
     * @param {string} rawString
     * @returns {{countryCode: string, country: string} | null}
     */
    function resolveCountry(rawString) {
        if (!rawString || typeof rawString !== 'string') return null;

        const parts = rawString.split(',').map((p) => normalizeSegment(p)).filter(Boolean);
        if (parts.length === 0) return null;

        const tryMatch = (segment) => {
            if (!segment) return null;
            // Strip a trailing zip-code-like number ("CA 94110") so the state still matches.
            const stateLike = segment.replace(/\s+\d{4,6}$/, '');
            if (US_STATES[stateLike]) {
                return { countryCode: 'US', country: COUNTRIES.US.name };
            }
            if (NAME_TO_CODE[segment]) {
                const code = NAME_TO_CODE[segment];
                return { countryCode: code, country: COUNTRIES[code]?.name || segment };
            }
            // Also try without internal punctuation/parentheticals (e.g. "Germany (DE)" → "germany").
            const stripped = segment.replace(/\s*\(.*?\)\s*/g, '').trim();
            if (stripped && stripped !== segment && NAME_TO_CODE[stripped]) {
                const code = NAME_TO_CODE[stripped];
                return { countryCode: code, country: COUNTRIES[code]?.name || stripped };
            }
            return null;
        };

        // 1) trailing segment
        let match = tryMatch(parts[parts.length - 1]);
        if (match) return match;

        // 2) second-to-last segment (covers "Berlin, Germany, Europe")
        if (parts.length >= 2) {
            match = tryMatch(parts[parts.length - 2]);
            if (match) return match;
        }

        // 3) full normalized input
        const full = normalizeSegment(rawString);
        match = tryMatch(full);
        if (match) return match;

        return null;
    }

    /**
     * Get the centroid for a country code, or null if unknown.
     * @param {string} countryCode - ISO 3166-1 alpha-2 (case-insensitive)
     */
    function getCentroid(countryCode) {
        if (!countryCode) return null;
        const upper = String(countryCode).toUpperCase();
        const country = COUNTRIES[upper];
        if (!country) return null;
        return { lat: country.lat, lng: country.lng };
    }

    /**
     * Get the canonical display name for a country code.
     * @param {string} countryCode - ISO 3166-1 alpha-2 (case-insensitive)
     */
    function getCountryName(countryCode) {
        if (!countryCode) return null;
        const upper = String(countryCode).toUpperCase();
        return COUNTRIES[upper]?.name || null;
    }

    /**
     * Returns true if the supplied code is a known ISO 3166-1 alpha-2.
     */
    function isKnownCountry(countryCode) {
        if (!countryCode) return false;
        return Boolean(COUNTRIES[String(countryCode).toUpperCase()]);
    }

    global.CountryData = {
        resolveCountry,
        getCentroid,
        getCountryName,
        isKnownCountry,
        // Exposed for debugging/testing — do not mutate.
        _COUNTRIES: COUNTRIES
    };
})(typeof window !== 'undefined' ? window : globalThis);
