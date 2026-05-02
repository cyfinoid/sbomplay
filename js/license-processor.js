/**
 * License Processor - Handles license compliance and legal insight analysis
 */
class LicenseProcessor {
    constructor() {
        // License categorization and risk assessment
        this.licenseCategories = {
            // Permissive licenses (low risk)
            permissive: {
                licenses: [
                    'MIT', 'MIT-0', 'MIT-CMU',
                    'Apache-2.0', 'Apache-1.1', 'Apache-1.0',
                    'BSD-2-Clause', 'BSD-3-Clause', 'BSD-2-Clause-Views', 'BSD-3-Clause-Modification', '0BSD',
                    'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Zlib', 'BSL-1.0', 'Ruby',
                    'Python-2.0', 'Python-2.0.1', 'PSF-2.0', 'CNRI-Python',
                    'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'OFL-1.1', 'BlueOak-1.0.0', 'AFL-2.1',
                    'CDDL-1.0', 'CDDL-1.1',
                    'Unicode-DFS-2016', 'bzip2-1.0.6', 'ImageMagick', 'curl',
                    // Additional SPDX-recognised permissive identifiers commonly seen in SBOMs
                    'HPND', 'HPND-sell-variant', 'ZPL-2.0', 'ZPL-2.1',
                    'Artistic-1.0', 'Artistic-1.0-Perl', 'Artistic-2.0',
                    // OSI-approved permissive licenses from PyPI classifiers
                    'AAL', 'Intel', 'OGTSL', 'RSCPL', 'NCSA', 'VSL-1.0', 'W3C-20150513', 'Xnet',
                    'LicenseRef-scancode-public-domain', 'LicenseRef-scancode-other-permissive', 'LicenseRef-scancode-jsr-107-jcache-spec-2013'
                ],
                risk: 'low',
                description: 'Permissive licenses that allow commercial use with minimal restrictions'
            },
            // Lesser GPL licenses (medium risk - more permissive than GPL but still copyleft)
            lgpl: {
                licenses: [
                    'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
                    'LGPL-2.0-only', 'LGPL-2.0-or-later',
                    'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later'
                ],
                risk: 'medium',
                description: 'Lesser GPL licenses that are more permissive than GPL but still have some copyleft requirements'
            },
            // Copyleft licenses (medium-high risk)
            copyleft: {
                licenses: [
                    'GPL-2.0', 'GPL-3.0',
                    'GPL-1.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later',
                    'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
                    'MPL-1.0', 'MPL-1.1', 'MPL-2.0',
                    'EPL-2.0', 'EPL-1.0',
                    'GPL-2.0-only WITH Classpath-exception-2.0',
                    // OSI-approved copyleft licenses from PyPI classifiers
                    'Nokia', 'CECILL-2.1', 'CPL-1.0', 'EUPL-1.0', 'EUPL-1.1', 'EUPL-1.2',
                    'IPL-1.0', 'Motosoto', 'NGPL', 'Sleepycat', 'SPL-1.0'
                ],
                risk: 'high',
                description: 'Copyleft licenses that may require source code disclosure'
            },
            // Proprietary/Commercial licenses (medium risk)
            proprietary: {
                licenses: ['Commercial', 'Proprietary', 'Custom', 'Aladdin'],
                risk: 'medium',
                description: 'Commercial or proprietary licenses with usage restrictions'
            },
            // Custom / pasted license text (medium risk - needs manual legal review)
            // SBOMs sometimes shove an entire copyright header or license body into
            // the licenseDeclared field. We bucket those into 'custom' so they're
            // visible and reviewable instead of being lost in 'unknown'.
            custom: {
                licenses: [],
                risk: 'medium',
                description: 'Custom or pasted license text requiring manual legal review'
            },
            // Unknown/Unspecified licenses (high risk)
            unknown: {
                licenses: [
                    'NOASSERTION', 'UNKNOWN', 'NONE', '',
                    'LicenseRef-scancode-unknown-license-reference', 'LicenseRef-scancode-unknown-spdx',
                    'LicenseRef-scancode-alliance-open-media-patent-1.0'
                ],
                risk: 'high',
                description: 'Unknown or unspecified licenses requiring investigation'
            }
        };

        // License compatibility matrix
        // Note: For complex licenses (AND/OR), compatibility is checked component-by-component
        this.compatibilityMatrix = {
            // Permissive licenses are generally compatible with each other
            'MIT': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD', 'CDDL-1.0', 'CDDL-1.1'],
            'MIT-0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'Apache-2.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD', 'CDDL-1.0', 'CDDL-1.1'],
            'BSD-2-Clause': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'BSD-3-Clause': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'ISC': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'Unlicense': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'CC0-1.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'WTFPL': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'Ruby': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'Python-2.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'PSF-2.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            '0BSD': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'CDDL-1.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'CDDL-1.0', 'CDDL-1.1'],
            'CDDL-1.1': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'CDDL-1.0', 'CDDL-1.1'],
            
            // Copyleft licenses have more restrictions
            'GPL-2.0': ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-3.0': ['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-1.0-or-later': ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-2.0-only': ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-2.0-or-later': ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-3.0-only': ['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-3.0-or-later': ['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'AGPL-3.0': ['AGPL-3.0'],
            'LGPL-2.1': ['LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-2.1-only': ['LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-2.1-or-later': ['LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-2.0-only': ['LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-2.0-or-later': ['LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-3.0': ['LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-3.0-only': ['LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-3.0-or-later': ['LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'MPL-2.0': ['MPL-2.0', 'MPL-1.1', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0'],
            'MPL-1.1': ['MPL-2.0', 'MPL-1.1', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0'],
            'EPL-2.0': ['EPL-2.0', 'EPL-1.0', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'EPL-1.0': ['EPL-2.0', 'EPL-1.0', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby']
        };

        // License family groupings for bulk review
        this.licenseFamilies = {
            'MIT Family': ['MIT', 'MIT-0', 'MIT-CMU', 'ISC', 'Unlicense'],
            'BSD Family': ['BSD-2-Clause', 'BSD-3-Clause', 'BSD-4-Clause', 'BSD-2-Clause-Views', 'BSD-3-Clause-Modification', '0BSD', 'NCSA'],
            'Apache Family': ['Apache-1.0', 'Apache-1.1', 'Apache-2.0'],
            'GPL Family': ['GPL-1.0-or-later', 'GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later', 'AGPL-1.0', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later'],
            'LGPL Family': ['LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later'],
            'MPL Family': ['MPL-1.0', 'MPL-1.1', 'MPL-2.0'],
            'EPL Family': ['EPL-1.0', 'EPL-2.0', 'CPL-1.0', 'IPL-1.0'],
            'EUPL Family': ['EUPL-1.0', 'EUPL-1.1', 'EUPL-1.2'],
            'CeCILL Family': ['CECILL-2.1', 'CECILL-B', 'CECILL-C'],
            'Python Family': ['Python-2.0', 'Python-2.0.1', 'PSF-2.0', 'CNRI-Python'],
            'CDDL Family': ['CDDL-1.0', 'CDDL-1.1', 'SPL-1.0'],
            'Boost Family': ['BSL-1.0'],
            'W3C Family': ['W3C', 'W3C-20150513'],
            'CC Family': ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-4.0'],
            'Artistic Family': ['Artistic-1.0', 'Artistic-1.0-Perl', 'Artistic-2.0'],
            'Zope Family': ['ZPL-2.0', 'ZPL-2.1'],
            'HPND Family': ['HPND', 'HPND-sell-variant'],
            'Commercial': ['Commercial', 'Proprietary', 'Custom', 'Aladdin'],
            'Unknown': ['NOASSERTION', 'UNKNOWN', 'NONE', '', 'LicenseRef-scancode-unknown-license-reference', 'LicenseRef-scancode-unknown-spdx', 'LicenseRef-scancode-alliance-open-media-patent-1.0']
        };

        // Variant -> canonical SPDX ID (lowercase keys for case-insensitive O(1) lookup)
        // Covers PyPI classifiers, npm/Cargo loose forms, Apache Software License, BSD License,
        // Expat/MIT/X11, LGPLv*, GPLv*, GNU GPL prose, Public domain, ISC license, HPND, ZPL,
        // Artistic, PSFL, etc.
        this._licenseVariantMap = new Map([
            // MIT family
            ['mit', 'MIT'],
            ['mit license', 'MIT'],
            ['mit-license', 'MIT'],
            ['mit/x11', 'MIT'],
            ['x11', 'MIT'],
            ['x11 license', 'MIT'],
            ['expat', 'MIT'],
            ['expat license', 'MIT'],
            ['expat (mit/x11)', 'MIT'],
            ['mit/x11 (expat)', 'MIT'],

            // BSD family
            ['bsd', 'BSD-3-Clause'],
            ['bsd license', 'BSD-3-Clause'],
            ['new bsd', 'BSD-3-Clause'],
            ['new bsd license', 'BSD-3-Clause'],
            ['modified bsd', 'BSD-3-Clause'],
            ['modified bsd license', 'BSD-3-Clause'],
            ['revised bsd', 'BSD-3-Clause'],
            ['revised bsd license', 'BSD-3-Clause'],
            ['bsd-3', 'BSD-3-Clause'],
            ['bsd-3-clause', 'BSD-3-Clause'],
            ['bsd 3-clause', 'BSD-3-Clause'],
            ['bsd 3-clause license', 'BSD-3-Clause'],
            ['3-clause bsd', 'BSD-3-Clause'],
            ['3-clause bsd license', 'BSD-3-Clause'],
            ['three-clause bsd', 'BSD-3-Clause'],
            ['bsd-2', 'BSD-2-Clause'],
            ['bsd-2-clause', 'BSD-2-Clause'],
            ['bsd 2-clause', 'BSD-2-Clause'],
            ['bsd 2-clause license', 'BSD-2-Clause'],
            ['2-clause bsd', 'BSD-2-Clause'],
            ['2-clause bsd license', 'BSD-2-Clause'],
            ['simplified bsd', 'BSD-2-Clause'],
            ['simplified bsd license', 'BSD-2-Clause'],
            ['freebsd', 'BSD-2-Clause'],
            ['freebsd license', 'BSD-2-Clause'],
            ['bsd-derived', 'BSD-3-Clause'],
            ['bsd derived', 'BSD-3-Clause'],
            ['0bsd', '0BSD'],
            ['zero clause bsd', '0BSD'],

            // Apache family
            ['apache', 'Apache-2.0'],
            ['apache 2', 'Apache-2.0'],
            ['apache 2.0', 'Apache-2.0'],
            ['apache-2', 'Apache-2.0'],
            ['apache-2.0', 'Apache-2.0'],
            ['apache license', 'Apache-2.0'],
            ['apache license 2', 'Apache-2.0'],
            ['apache license 2.0', 'Apache-2.0'],
            ['apache license, version 2', 'Apache-2.0'],
            ['apache license, version 2.0', 'Apache-2.0'],
            ['apache license version 2.0', 'Apache-2.0'],
            ['apache software license', 'Apache-2.0'],
            ['apache software license 2.0', 'Apache-2.0'],
            ['apache modified', 'Apache-2.0'],
            ['apache (modified)', 'Apache-2.0'],
            ['apache 1', 'Apache-1.0'],
            ['apache 1.0', 'Apache-1.0'],
            ['apache-1.0', 'Apache-1.0'],
            ['apache 1.1', 'Apache-1.1'],
            ['apache-1.1', 'Apache-1.1'],

            // ISC
            ['isc', 'ISC'],
            ['isc license', 'ISC'],
            ['isc license (iscl)', 'ISC'],
            ['iscl', 'ISC'],

            // GPL
            // Note: bare 'gpl' / 'gnu gpl' is ambiguous about version; we map to
            // GPL-3.0-or-later (the most common modern interpretation in PyPI/setup.py).
            ['gpl', 'GPL-3.0-or-later'],
            ['gnu gpl', 'GPL-3.0-or-later'],
            ['gnu general public license', 'GPL-3.0-or-later'],
            ['gpl-2', 'GPL-2.0'],
            ['gplv2', 'GPL-2.0'],
            ['gpl 2', 'GPL-2.0'],
            ['gpl-2.0', 'GPL-2.0'],
            ['gpl 2.0', 'GPL-2.0'],
            ['gnu gpl v2', 'GPL-2.0'],
            ['gnu gpl version 2', 'GPL-2.0'],
            ['gnu general public license v2', 'GPL-2.0'],
            ['gnu general public license version 2', 'GPL-2.0'],
            ['gpl-2-only', 'GPL-2.0-only'],
            ['gpl-2.0-only', 'GPL-2.0-only'],
            ['gplv2 only', 'GPL-2.0-only'],
            ['gplv2+', 'GPL-2.0-or-later'],
            ['gpl 2+', 'GPL-2.0-or-later'],
            ['gpl-2+', 'GPL-2.0-or-later'],
            ['gpl-2-or-later', 'GPL-2.0-or-later'],
            ['gpl-2.0-or-later', 'GPL-2.0-or-later'],
            ['gnu general public license v2 or later (gplv2+)', 'GPL-2.0-or-later'],
            ['gnu general public license v2 or later', 'GPL-2.0-or-later'],
            ['gnu gplv2 (with foss license exception)', 'GPL-2.0-or-later'],
            ['gpl-3', 'GPL-3.0'],
            ['gplv3', 'GPL-3.0'],
            ['gpl 3', 'GPL-3.0'],
            ['gpl-3.0', 'GPL-3.0'],
            ['gpl 3.0', 'GPL-3.0'],
            ['gpl v3', 'GPL-3.0'],
            ['gnu gpl v3', 'GPL-3.0'],
            ['gnu gpl version 3', 'GPL-3.0'],
            ['gnu general public license v3', 'GPL-3.0'],
            ['gnu general public license v3 (gplv3)', 'GPL-3.0'],
            ['gnu-general public license v3 (gplv3)', 'GPL-3.0'],
            ['gpl-3-only', 'GPL-3.0-only'],
            ['gpl-3.0-only', 'GPL-3.0-only'],
            ['gplv3 only', 'GPL-3.0-only'],
            ['gplv3+', 'GPL-3.0-or-later'],
            ['gpl 3+', 'GPL-3.0-or-later'],
            ['gpl-3+', 'GPL-3.0-or-later'],
            ['gpl-3-or-later', 'GPL-3.0-or-later'],
            ['gpl-3.0-or-later', 'GPL-3.0-or-later'],
            ['gnu general public license v3 or later', 'GPL-3.0-or-later'],

            // LGPL
            ['lgpl', 'LGPL-3.0-or-later'],
            ['gnu lgpl', 'LGPL-3.0-or-later'],
            ['gnu lesser general public license', 'LGPL-3.0-or-later'],
            ['gnu lesser general public license (lgpl)', 'LGPL-3.0-or-later'],
            ['lesser general public license', 'LGPL-3.0-or-later'],
            ['lgpl with exceptions', 'LGPL-3.0-or-later'],
            ['lgpl-2', 'LGPL-2.1'],
            ['lgplv2', 'LGPL-2.1'],
            ['lgpl 2', 'LGPL-2.1'],
            ['lgpl 2.0', 'LGPL-2.0-only'],
            ['lgpl-2.0', 'LGPL-2.0-only'],
            ['lgpl-2.0-only', 'LGPL-2.0-only'],
            ['lgpl-2.0-or-later', 'LGPL-2.0-or-later'],
            ['lgpl 2.1', 'LGPL-2.1'],
            ['lgpl-2.1', 'LGPL-2.1'],
            ['lgplv2.1', 'LGPL-2.1'],
            ['lgpl-2.1-only', 'LGPL-2.1-only'],
            ['lgpl-2.1-or-later', 'LGPL-2.1-or-later'],
            ['lgplv2+', 'LGPL-2.1-or-later'],
            ['lgpl-2+', 'LGPL-2.1-or-later'],
            ['lgpl-3', 'LGPL-3.0'],
            ['lgpl 3', 'LGPL-3.0'],
            ['lgplv3', 'LGPL-3.0'],
            ['lgpl 3.0', 'LGPL-3.0'],
            ['lgpl-3.0', 'LGPL-3.0'],
            ['lgpl-3-only', 'LGPL-3.0-only'],
            ['lgpl-3.0-only', 'LGPL-3.0-only'],
            ['lgplv3+', 'LGPL-3.0-or-later'],
            ['lgpl 3+', 'LGPL-3.0-or-later'],
            ['lgpl-3+', 'LGPL-3.0-or-later'],
            ['lgpl-3-or-later', 'LGPL-3.0-or-later'],
            ['lgpl-3.0-or-later', 'LGPL-3.0-or-later'],

            // AGPL
            ['agpl', 'AGPL-3.0-or-later'],
            ['agpl-3', 'AGPL-3.0'],
            ['agpl 3', 'AGPL-3.0'],
            ['agpl-3.0', 'AGPL-3.0'],
            ['agplv3', 'AGPL-3.0'],
            ['gnu agpl', 'AGPL-3.0-or-later'],
            ['agpl-3-only', 'AGPL-3.0-only'],
            ['agpl-3.0-only', 'AGPL-3.0-only'],
            ['agpl-3-or-later', 'AGPL-3.0-or-later'],
            ['agpl-3.0-or-later', 'AGPL-3.0-or-later'],
            ['agplv3+', 'AGPL-3.0-or-later'],
            ['agpl-3+', 'AGPL-3.0-or-later'],

            // MPL
            ['mpl', 'MPL-2.0'],
            ['mozilla public license', 'MPL-2.0'],
            ['mpl-1', 'MPL-1.0'],
            ['mpl 1', 'MPL-1.0'],
            ['mpl-1.0', 'MPL-1.0'],
            ['mpl 1.1', 'MPL-1.1'],
            ['mpl-1.1', 'MPL-1.1'],
            ['mpl 2', 'MPL-2.0'],
            ['mpl-2', 'MPL-2.0'],
            ['mpl 2.0', 'MPL-2.0'],
            ['mpl-2.0', 'MPL-2.0'],

            // EPL
            ['epl', 'EPL-2.0'],
            ['eclipse public license', 'EPL-2.0'],
            ['eclipse public license 1.0', 'EPL-1.0'],
            ['eclipse public license 2.0', 'EPL-2.0'],
            ['epl-1.0', 'EPL-1.0'],
            ['epl-2', 'EPL-2.0'],
            ['epl-2.0', 'EPL-2.0'],

            // CDDL
            ['cddl', 'CDDL-1.1'],
            ['cddl-1.0', 'CDDL-1.0'],
            ['cddl-1.1', 'CDDL-1.1'],
            ['common development and distribution license', 'CDDL-1.1'],

            // EUPL
            ['eupl', 'EUPL-1.2'],
            ['eupl-1.0', 'EUPL-1.0'],
            ['eupl-1.1', 'EUPL-1.1'],
            ['eupl-1.2', 'EUPL-1.2'],
            ['eupl 1.0', 'EUPL-1.0'],
            ['eupl 1.1', 'EUPL-1.1'],
            ['eupl 1.2', 'EUPL-1.2'],

            // Boost
            ['boost', 'BSL-1.0'],
            ['boost-1.0', 'BSL-1.0'],
            ['bsl-1.0', 'BSL-1.0'],
            ['boost software license', 'BSL-1.0'],
            ['boost software license 1.0', 'BSL-1.0'],

            // Zlib
            ['zlib', 'Zlib'],
            ['zlib license', 'Zlib'],
            ['zlib/libpng', 'Zlib'],

            // Public domain / Unlicense
            ['unlicense', 'Unlicense'],
            ['the unlicense', 'Unlicense'],
            ['public domain', 'LicenseRef-scancode-public-domain'],
            ['public-domain', 'LicenseRef-scancode-public-domain'],
            ['publicdomain', 'LicenseRef-scancode-public-domain'],

            // CC0 / CC-BY
            ['cc0', 'CC0-1.0'],
            ['cc0-1.0', 'CC0-1.0'],
            ['creative commons zero', 'CC0-1.0'],
            ['creative commons cc0 1.0', 'CC0-1.0'],
            ['cc-by-3.0', 'CC-BY-3.0'],
            ['cc-by-4.0', 'CC-BY-4.0'],
            ['cc-by-sa-4.0', 'CC-BY-SA-4.0'],

            // WTFPL
            ['wtfpl', 'WTFPL'],

            // Python / PSF
            ['psf', 'Python-2.0'],
            ['psfl', 'Python-2.0'],
            ['psf-2.0', 'PSF-2.0'],
            ['psf license', 'Python-2.0'],
            ['python', 'Python-2.0'],
            ['python license', 'Python-2.0'],
            ['python software foundation license', 'Python-2.0'],
            ['python-2.0', 'Python-2.0'],
            ['python-2.0.1', 'Python-2.0.1'],

            // Ruby
            ['ruby', 'Ruby'],
            ['ruby license', 'Ruby'],

            // Artistic
            ['artistic', 'Artistic-2.0'],
            ['artistic license', 'Artistic-2.0'],
            ['artistic license 1.0', 'Artistic-1.0'],
            ['artistic license 2.0', 'Artistic-2.0'],
            ['artistic-1.0', 'Artistic-1.0'],
            ['artistic-2.0', 'Artistic-2.0'],

            // Zope (ZPL)
            ['zpl', 'ZPL-2.1'],
            ['zpl-2.0', 'ZPL-2.0'],
            ['zpl-2.1', 'ZPL-2.1'],
            ['zope public license', 'ZPL-2.1'],

            // HPND
            ['hpnd', 'HPND'],
            ['historical permission notice and disclaimer', 'HPND'],

            // Aladdin
            ['aladdin', 'Aladdin'],
            ['aladdin free public license', 'Aladdin'],

            // OFL
            ['ofl', 'OFL-1.1'],
            ['ofl-1.1', 'OFL-1.1'],
            ['sil open font license', 'OFL-1.1'],

            // Generic
            ['proprietary', 'Proprietary'],
            ['commercial', 'Commercial']
        ]);
    }

    /**
     * Normalize a license string to a canonical SPDX identifier (or expression)
     * when possible.
     *
     * Pipeline:
     *  1. Trim and short-circuit on empty / sentinels (NOASSERTION, UNKNOWN, NONE).
     *  2. Resolve SPDX trailing '+' operator (e.g. GPL-2.0+ -> GPL-2.0-or-later).
     *  3. Whole-string lookup against `_licenseVariantMap` (case-insensitive).
     *  4. Whole-string lookup of a 'cleaned' form (parentheses stripped, double
     *     spaces collapsed) for cases like "Apache License 2.0  (the "License")".
     *  5. Try to convert non-SPDX separators ('/', ',', ' -or- ', ' -and- ') into
     *     a standard SPDX 'A OR B' / 'A AND B' expression when each component is
     *     itself a recognised license (so 'LGPL/MIT' -> 'LGPL-3.0-or-later OR MIT'
     *     but 'Apache License, Version 2.0' is left for step 3 to handle).
     *  6. Return the input as-is otherwise (likely already a valid SPDX id, or
     *     genuinely unknown).
     *
     * @param {string} license - License string to normalize
     * @returns {string} - Normalized license name
     */
    normalizeLicenseName(license) {
        if (!license || typeof license !== 'string') {
            return license || 'Unknown';
        }

        const trimmed = license.trim();
        if (!trimmed) return 'Unknown';

        // Sentinel "no info" tokens: don't try to normalise these.
        if (/^(noassertion|unknown|none|n\/a)$/i.test(trimmed)) {
            return trimmed;
        }

        // 1. Handle SPDX trailing '+' operator (GPL-2.0+ -> GPL-2.0-or-later, etc.)
        const plusNormalized = this._normalizeSpdxPlus(trimmed);
        const stage1 = plusNormalized || trimmed;

        // 2. Whole-string variant lookup (case-insensitive O(1) Map lookup).
        const directHit = this._lookupVariant(stage1);
        if (directHit) return directHit;

        // 3. Try a 'cleaned' form: strip surrounding/inline parentheticals and
        //    collapse whitespace, then look up again.
        const cleaned = stage1
            .replace(/\s*\([^)]*\)\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (cleaned && cleaned !== stage1) {
            const cleanedHit = this._lookupVariant(cleaned);
            if (cleanedHit) return cleanedHit;
        }

        // 4. Try to interpret non-SPDX separators as multi-license expressions.
        const multi = this._normalizeMultiLicenseSeparators(stage1);
        if (multi) return multi;

        // 5. Fall through unchanged (likely already a valid SPDX id, or unknown).
        return stage1;
    }

    /**
     * Lookup a license string against `_licenseVariantMap` case-insensitively.
     * Returns the canonical SPDX id, or null if not found.
     * @param {string} license
     * @returns {string|null}
     */
    _lookupVariant(license) {
        if (!license || typeof license !== 'string') return null;
        const key = license.trim().toLowerCase();
        return this._licenseVariantMap.has(key)
            ? this._licenseVariantMap.get(key)
            : null;
    }

    /**
     * Normalize SPDX trailing '+' operator (e.g. 'GPL-2.0+' -> 'GPL-2.0-or-later',
     * 'LGPL-3.0+' -> 'LGPL-3.0-or-later', 'AGPL-3+' -> 'AGPL-3.0-or-later').
     * Returns the normalized string, or null if no '+' suffix matched.
     * @param {string} license
     * @returns {string|null}
     */
    _normalizeSpdxPlus(license) {
        // Only apply to known families that use the '+' convention.
        const m = license.match(/^(LGPL|AGPL|GPL|EPL|MPL|GFDL|EUPL|CDDL|CECILL|Apache)-(\d+)(?:\.(\d+))?\+$/i);
        if (!m) return null;
        const family = m[1].toUpperCase() === 'APACHE' ? 'Apache' : m[1].toUpperCase();
        const major = m[2];
        const minor = m[3] != null ? m[3] : '0';
        return `${family}-${major}.${minor}-or-later`;
    }

    /**
     * Try to interpret non-SPDX separators as a multi-license expression.
     * Only succeeds when every component is itself a recognised license; this
     * prevents false splits on things like 'Apache License, Version 2.0' where
     * 'Version 2.0' is not a license.
     *
     * '/' and ',' are interpreted as OR (PyPI/setup.py convention).
     * ' -or- ' / ' -and- ' / ' or ' / ' and ' are interpreted as their plain
     * meaning. Standard SPDX ' AND '/' OR ' is left untouched (handled by
     * parseLicense directly).
     *
     * @param {string} license
     * @returns {string|null} normalized expression or null
     */
    _normalizeMultiLicenseSeparators(license) {
        if (!license || typeof license !== 'string') return null;

        // Already a standard SPDX expression.
        if (/\s+(AND|OR)\s+/.test(license)) return null;

        const tryWith = (parts, joiner) => {
            if (!parts || parts.length < 2) return null;
            const normalized = [];
            for (const raw of parts) {
                const piece = raw.trim();
                if (!piece || piece.length > 60) return null;
                const hit = this._lookupVariant(piece);
                if (!hit) return null;
                normalized.push(hit);
            }
            return normalized.join(` ${joiner} `);
        };

        // ' -or- ' / ' -and- ' (used by some PyPI metadata, e.g. 'MIT -or- Apache License 2.0')
        if (/\s-or-\s/i.test(license)) {
            const r = tryWith(license.split(/\s-or-\s/i), 'OR');
            if (r) return r;
        }
        if (/\s-and-\s/i.test(license)) {
            const r = tryWith(license.split(/\s-and-\s/i), 'AND');
            if (r) return r;
        }

        // ' or ' / ' and ' (lowercase prose, e.g. 'MIT or Apache 2.0')
        if (/\s+or\s+/i.test(license)) {
            const r = tryWith(license.split(/\s+or\s+/i), 'OR');
            if (r) return r;
        }
        if (/\s+and\s+/i.test(license)) {
            const r = tryWith(license.split(/\s+and\s+/i), 'AND');
            if (r) return r;
        }

        // '/' as OR — but skip LicenseRef-* / URL-bearing strings.
        if (license.includes('/') && !/^licenseref-/i.test(license) && !/https?:\/\//i.test(license)) {
            const r = tryWith(license.split('/'), 'OR');
            if (r) return r;
        }

        // ',' as OR (e.g. 'BSD, Public Domain') — skip strings that look like
        // 'License, Version X.Y' constructs.
        if (license.includes(',') && !/,\s*version\s+\d/i.test(license)) {
            const r = tryWith(license.split(','), 'OR');
            if (r) return r;
        }

        return null;
    }

    /**
     * Detect strings that look like a pasted copyright/license body rather than
     * a license name. SBOMs sometimes shove the entire LICENSE file content into
     * the licenseDeclared field; we surface those into the 'custom' bucket so
     * they're visible and reviewable instead of getting lost in 'unknown'.
     * @param {string} license
     * @returns {boolean}
     */
    _isLicenseTextBody(license) {
        if (!license || typeof license !== 'string') return false;
        const trimmed = license.trim();
        if (!trimmed) return false;

        // Very long → almost certainly text body.
        if (trimmed.length > 120) return true;

        // Separator banner line (e.g. '======== The Kiwi license ========')
        if (/^={3,}/.test(trimmed)) return true;

        // 'Copyright ...' followed by enough text to be a notice rather than
        // just a license name reference.
        if (/^copyright\b/i.test(trimmed) && trimmed.length > 30) return true;
        if (/^\(c\)\s/i.test(trimmed) && trimmed.length > 30) return true;

        // Numbered legal clause (typical of PSF / Python license).
        if (/^\d+\.\s+(this\s+)?license\s+agreement/i.test(trimmed)) return true;

        // 'License agreement for ...' (matplotlib-style)
        if (/^license\s+agreement\s+for\b/i.test(trimmed)) return true;

        // BSD-style 'Redistribution and use ...' intro.
        if (/redistribution\s+and\s+use/i.test(trimmed) && trimmed.length > 30) return true;

        return false;
    }

    /**
     * Heuristic categorization fallback for license names that don't exactly
     * match an SPDX id and didn't normalize to one. Uses lowercase contains-checks.
     * Order matters: AGPL must come before LGPL, which must come before GPL.
     * Returns { category, risk, description } or null when no signal is found.
     * @param {string} license
     * @returns {{category: string, risk: string, description: string}|null}
     */
    _heuristicCategorize(license) {
        if (!license || typeof license !== 'string') return null;
        const s = license.toLowerCase();

        // Strong copyleft signals (order matters: AGPL > LGPL > GPL).
        if (/\bagpl\b|affero/.test(s)) {
            return { category: 'copyleft', risk: 'high', description: 'Pattern-matched as AGPL-family copyleft' };
        }
        if (/\blgpl\b|lesser\s+general\s+public/.test(s)) {
            return { category: 'lgpl', risk: 'medium', description: 'Pattern-matched as LGPL-family' };
        }
        if (/\bgpl\b|general\s+public\s+license/.test(s)) {
            return { category: 'copyleft', risk: 'high', description: 'Pattern-matched as GPL-family copyleft' };
        }

        // Other copyleft families.
        if (/\bmpl\b|mozilla\s+public/.test(s)) {
            return { category: 'copyleft', risk: 'high', description: 'Pattern-matched as MPL-family copyleft' };
        }
        if (/\bepl\b|eclipse\s+public/.test(s)) {
            return { category: 'copyleft', risk: 'high', description: 'Pattern-matched as EPL-family copyleft' };
        }
        if (/\beupl\b/.test(s)) {
            return { category: 'copyleft', risk: 'high', description: 'Pattern-matched as EUPL copyleft' };
        }
        if (/\bcecill\b/.test(s)) {
            return { category: 'copyleft', risk: 'high', description: 'Pattern-matched as CeCILL copyleft' };
        }

        // Proprietary / commercial.
        if (/\bproprietary\b|\bcommercial\b|\baladdin\b|non-commercial/.test(s)) {
            return { category: 'proprietary', risk: 'medium', description: 'Pattern-matched as proprietary/commercial' };
        }

        // Permissive families.
        if (/\bmit\b|\bbsd\b|\bisc\b|\bapache\b|\bzlib\b|unlicense|\bcc0\b|\bwtfpl\b|\bexpat\b|\bx11\b|public\s+domain|\bpsf\b|\bpsfl\b|python\s+license|python\s+software\s+foundation|\bartistic\b|\bzpl\b|zope\s+public|\bhpnd\b|\bofl\b|sil\s+open\s+font|\bbsl\b|boost\s+software/.test(s)) {
            return { category: 'permissive', risk: 'low', description: 'Pattern-matched as permissive license' };
        }

        return null;
    }

    /**
     * Parse and categorize license information from SBOM package
     */
    parseLicense(pkg) {
        const licenseInfo = {
            license: null,
            category: 'unknown',
            risk: 'high',
            description: 'Unknown license requiring investigation',
            copyright: null,
            isCompatible: true,
            warnings: []
        };

        // Check if pkg is defined and has the required properties
        if (!pkg) {
            licenseInfo.warnings.push('No package information available');
            return licenseInfo;
        }

        // Extract license information (check licenseConcluded first, then licenseDeclared)
        let licenseValue = null;
        if (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') {
            licenseValue = pkg.licenseConcluded;
        } else if (pkg.licenseDeclared && pkg.licenseDeclared !== 'NOASSERTION') {
            licenseValue = pkg.licenseDeclared;
        }

        // Detect pasted copyright/license text bodies before we try to normalize.
        // SBOMs sometimes shove the entire LICENSE file content into licenseDeclared;
        // surface those into the 'custom' bucket for legal review instead of
        // dropping them silently into 'unknown'.
        if (licenseValue && this._isLicenseTextBody(licenseValue)) {
            licenseInfo.license = licenseValue;
            licenseInfo.category = 'custom';
            licenseInfo.risk = 'medium';
            licenseInfo.description = this.licenseCategories.custom.description;
            licenseInfo.warnings.push('License field contains copyright/license text body — needs manual review');
            if (pkg.copyrightText && pkg.copyrightText !== 'NOASSERTION') {
                licenseInfo.copyright = pkg.copyrightText;
            }
            return licenseInfo;
        }

        // Normalize variants up front (BSD -> BSD-3-Clause, GPLv2+ -> GPL-2.0-or-later,
        // 'Apache Software License' -> Apache-2.0, 'MIT/X11' -> MIT, 'LGPL/MIT' -> 'LGPL-3.0-or-later OR MIT', etc.)
        // so the existing AND/OR + exact-match logic below can do its job.
        const rawLicenseValue = licenseValue;
        if (licenseValue) {
            const normalized = this.normalizeLicenseName(licenseValue);
            if (normalized && normalized !== licenseValue) {
                licenseInfo.warnings.push(`Normalized license "${licenseValue}" → "${normalized}"`);
                licenseValue = normalized;
            }
        }

        // Detect dual licenses (e.g., "MIT AND Apache-2.0", "GPL-2.0 OR GPL-3.0")
        const isDualLicense = licenseValue && (licenseValue.includes(' AND ') || licenseValue.includes(' OR '));
        let dualLicenseInfo = null;
        if (isDualLicense) {
            const parts = licenseValue.split(/\s+(AND|OR)\s+/i);
            const licenses = [];
            const operators = [];
            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                    licenses.push(parts[i].trim());
                } else {
                    operators.push(parts[i].trim().toUpperCase());
                }
            }
            dualLicenseInfo = {
                licenses: licenses,
                operators: operators,
                fullText: licenseValue
            };
        }
        
        if (licenseValue) {
            licenseInfo.license = licenseValue;
            
            // Check for complex licenses (AND/OR combinations) first
            if (licenseInfo.license.includes(' AND ') || licenseInfo.license.includes(' OR ')) {
                licenseInfo.warnings.push('Complex license combination detected');
                
                // For complex licenses, try to categorize based on the most restrictive component
                const components = this.parseComplexLicense(licenseInfo.license);
                let hasCopyleft = false;
                let hasPermissive = false;
                let hasLgpl = false;
                let hasProprietary = false;
                
                for (const component of components) {
                    // Check each component against license categories
                    let componentFound = false;
                    for (const [category, info] of Object.entries(this.licenseCategories)) {
                        // Check exact match first
                        if (info.licenses.includes(component)) {
                            componentFound = true;
                            if (category === 'copyleft') {
                                hasCopyleft = true;
                            } else if (category === 'lgpl') {
                                hasLgpl = true;
                            } else if (category === 'permissive') {
                                hasPermissive = true;
                            } else if (category === 'proprietary') {
                                hasProprietary = true;
                            }
                            break;
                        }
                    }
                    
                    // If not found by exact match, try partial matching for known license patterns
                    if (!componentFound) {
                        const compLower = component.toLowerCase();
                        // Check for GPL variants
                        if (compLower.includes('gpl-') && !compLower.includes('lgpl')) {
                            hasCopyleft = true;
                        }
                        // Check for LGPL variants
                        else if (compLower.includes('lgpl-')) {
                            hasLgpl = true;
                        }
                        // Check for MPL variants
                        else if (compLower.includes('mpl-')) {
                            hasCopyleft = true;
                        }
                        // Check for EPL variants
                        else if (compLower.includes('epl-')) {
                            hasCopyleft = true;
                        }
                        // Check for AGPL variants
                        else if (compLower.includes('agpl-')) {
                            hasCopyleft = true;
                        }
                        // Check for common permissive patterns
                        else if (compLower.includes('mit') || compLower.includes('bsd') || 
                                 compLower.includes('apache') || compLower.includes('isc') ||
                                 compLower.includes('python-') || compLower.includes('psf-') ||
                                 compLower.includes('cc-by') || compLower.includes('ofl-') ||
                                 compLower.includes('0bsd') || compLower.includes('cddl-') ||
                                 compLower.includes('unlicense') || compLower.includes('wtfpl') ||
                                 compLower.includes('cc0-') || compLower.includes('ruby') ||
                                 compLower.includes('blueoak') || compLower.includes('afl-') ||
                                 compLower.includes('public-domain') || compLower.includes('other-permissive')) {
                            hasPermissive = true;
                        }
                    }
                }
                
                // For dual licenses, classify under least restrictive
                // AND licenses: must comply with both, so use most restrictive
                // OR licenses: can choose either, so use least restrictive
                const isAndLicense = licenseInfo.license.includes(' AND ');
                const isOrLicense = licenseInfo.license.includes(' OR ');
                
                // Store dual license info
                licenseInfo.isDualLicense = true;
                licenseInfo.dualLicenseInfo = dualLicenseInfo;
                
                // Set risk and category based on least restrictive (for OR) or most restrictive (for AND)
                if (isOrLicense) {
                    // OR license: use least restrictive (most permissive)
                    if (hasPermissive && !hasCopyleft && !hasLgpl) {
                        licenseInfo.category = 'permissive';
                        licenseInfo.risk = 'low';
                        licenseInfo.description = `Dual license (OR): ${dualLicenseInfo.licenses.join(' OR ')} - Choose least restrictive`;
                    } else if (hasLgpl && !hasCopyleft) {
                        licenseInfo.category = 'lgpl';
                        licenseInfo.risk = 'medium';
                        licenseInfo.description = `Dual license (OR): ${dualLicenseInfo.licenses.join(' OR ')} - Choose least restrictive`;
                    } else if (hasCopyleft) {
                        // Even with OR, if copyleft is an option, it's still risky
                        licenseInfo.category = 'copyleft';
                        licenseInfo.risk = 'high';
                        licenseInfo.description = `Dual license (OR): ${dualLicenseInfo.licenses.join(' OR ')} - Copyleft option available`;
                    }
                } else if (isAndLicense) {
                    // AND license: must comply with both, so use most restrictive
                    if (hasCopyleft) {
                        licenseInfo.category = 'copyleft';
                        licenseInfo.risk = 'high';
                        licenseInfo.description = `Dual license (AND): ${dualLicenseInfo.licenses.join(' AND ')} - Must comply with both`;
                    } else if (hasLgpl) {
                        licenseInfo.category = 'lgpl';
                        licenseInfo.risk = 'medium';
                        licenseInfo.description = `Dual license (AND): ${dualLicenseInfo.licenses.join(' AND ')} - Must comply with both`;
                    } else if (hasPermissive) {
                        licenseInfo.category = 'permissive';
                        licenseInfo.risk = 'low';
                        licenseInfo.description = `Dual license (AND): ${dualLicenseInfo.licenses.join(' AND ')} - Must comply with both`;
                    }
                } else {
                    // Fallback (shouldn't happen, but just in case)
                if (hasCopyleft) {
                    licenseInfo.category = 'copyleft';
                    licenseInfo.risk = 'high';
                    licenseInfo.description = 'Complex license with copyleft components';
                } else if (hasLgpl) {
                    licenseInfo.category = 'lgpl';
                    licenseInfo.risk = 'medium';
                    licenseInfo.description = 'Complex license with LGPL components';
                } else if (hasProprietary) {
                    licenseInfo.category = 'proprietary';
                    licenseInfo.risk = 'medium';
                    licenseInfo.description = 'Complex license with proprietary components';
                } else if (hasPermissive) {
                    licenseInfo.category = 'permissive';
                    licenseInfo.risk = 'low';
                    licenseInfo.description = 'Complex license with permissive components';
                } else {
                    licenseInfo.category = 'unknown';
                    licenseInfo.risk = 'high';
                    licenseInfo.description = 'Complex license combination requiring investigation';
                    }
                }
            } else {
                // Simple license - categorize normally
                let matched = false;
                for (const [category, info] of Object.entries(this.licenseCategories)) {
                    if (info.licenses.includes(licenseInfo.license)) {
                        licenseInfo.category = category;
                        licenseInfo.risk = info.risk;
                        licenseInfo.description = info.description;
                        matched = true;
                        break;
                    }
                }

                // Heuristic fallback: catch the long tail of names that are
                // recognisable but not exact SPDX ids (LGPLv3, GNU GPL, ZPL-2.1,
                // PSFL, Artistic License, etc.). We only reach this when both
                // normalization and exact-match failed.
                if (!matched) {
                    const heuristic = this._heuristicCategorize(licenseInfo.license);
                    if (heuristic) {
                        licenseInfo.category = heuristic.category;
                        licenseInfo.risk = heuristic.risk;
                        licenseInfo.description = heuristic.description;
                        licenseInfo.warnings.push('Categorised by name pattern, not exact SPDX match');
                    } else {
                        // Truly unknown — leave the default category/risk and add a warning.
                        licenseInfo.warnings.push(`Unrecognised license string: "${rawLicenseValue || licenseInfo.license}"`);
                    }
                }
            }
        } else {
            licenseInfo.warnings.push('No license information available');
        }

        // Extract copyright information
        if (pkg.copyrightText && pkg.copyrightText !== 'NOASSERTION') {
            licenseInfo.copyright = pkg.copyrightText;
        }

        return licenseInfo;
    }

    /**
     * Check for license conflicts in a repository
     */
    checkLicenseConflicts(dependencies) {
        const conflicts = [];
        const licenses = new Map();

        // Collect all licenses
        dependencies.forEach(dep => {
            const licenseInfo = this.parseLicense(dep.originalPackage);
            if (licenseInfo.license) {
                if (!licenses.has(licenseInfo.license)) {
                    licenses.set(licenseInfo.license, []);
                }
                licenses.get(licenseInfo.license).push(dep);
            }
        });

        // Check for incompatible license combinations
        const licenseList = Array.from(licenses.keys());
        for (let i = 0; i < licenseList.length; i++) {
            for (let j = i + 1; j < licenseList.length; j++) {
                const license1 = licenseList[i];
                const license2 = licenseList[j];
                
                // Debug specific case
                if ((license1 === 'MIT' && license2 === 'LGPL-2.1') || 
                    (license1 === 'LGPL-2.1' && license2 === 'MIT')) {
                    console.log('🔍 Debugging MIT vs LGPL-2.1 compatibility');
                    this.debugLicenseCompatibility(license1, license2);
                }
                
                if (!this.areLicensesCompatible(license1, license2)) {
                    conflicts.push({
                        type: 'incompatible_licenses',
                        licenses: [license1, license2],
                        dependencies: [
                            ...licenses.get(license1),
                            ...licenses.get(license2)
                        ],
                        severity: 'high',
                        description: `Incompatible licenses detected: ${license1} and ${license2}`
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Check if two licenses are compatible
     */
    areLicensesCompatible(license1, license2) {
        // Same license is always compatible
        if (license1 === license2) {
            return true;
        }

        // Handle complex license expressions
        if (license1.includes(' AND ') || license1.includes(' OR ') ||
            license2.includes(' AND ') || license2.includes(' OR ')) {
            return this.areComplexLicensesCompatible(license1, license2);
        }

        // Check compatibility matrix - check both directions
        if (this.compatibilityMatrix[license1] && this.compatibilityMatrix[license1].includes(license2)) {
            return true;
        }
        if (this.compatibilityMatrix[license2] && this.compatibilityMatrix[license2].includes(license1)) {
            return true;
        }

        // For licenses not in the matrix, use a more permissive approach
        // Only flag as incompatible if we know they conflict
        const knownIncompatiblePairs = [
            ['GPL-2.0', 'GPL-3.0'], // Different GPL versions
            ['GPL-2.0', 'AGPL-3.0'], // GPL vs AGPL
            ['GPL-3.0', 'AGPL-3.0'], // GPL vs AGPL
            ['LGPL-2.1', 'LGPL-3.0'], // Different LGPL versions
            ['MPL-1.0', 'MPL-2.0'], // Different MPL versions
            ['Apache-1.0', 'Apache-2.0'], // Different Apache versions
        ];

        // Check if this is a known incompatible pair
        for (const [lic1, lic2] of knownIncompatiblePairs) {
            if ((license1 === lic1 && license2 === lic2) || 
                (license1 === lic2 && license2 === lic1)) {
                return false;
            }
        }

        // For unknown combinations, assume compatible (more permissive)
        // This prevents false positives for common permissive licenses
        return true;
    }

    /**
     * Debug method to test license compatibility
     */
    debugLicenseCompatibility(license1, license2) {
        console.log(`🔍 Debugging license compatibility: ${license1} vs ${license2}`);
        
        // Check if licenses exist in matrix
        console.log(`License1 in matrix:`, this.compatibilityMatrix[license1] ? 'Yes' : 'No');
        console.log(`License2 in matrix:`, this.compatibilityMatrix[license2] ? 'Yes' : 'No');
        
        if (this.compatibilityMatrix[license1]) {
            console.log(`License1 compatible with:`, this.compatibilityMatrix[license1]);
        }
        if (this.compatibilityMatrix[license2]) {
            console.log(`License2 compatible with:`, this.compatibilityMatrix[license2]);
        }
        
        const result = this.areLicensesCompatible(license1, license2);
        console.log(`Compatibility result:`, result);
        return result;
    }

    /**
     * Check compatibility for complex license expressions
     */
    areComplexLicensesCompatible(license1, license2) {
        // Parse complex licenses into individual components
        const components1 = this.parseComplexLicense(license1);
        const components2 = this.parseComplexLicense(license2);

        // For AND combinations, all components must be compatible
        if (license1.includes(' AND ') && license2.includes(' AND ')) {
            // Both are AND combinations - check if all components are compatible
            for (const comp1 of components1) {
                for (const comp2 of components2) {
                    if (!this.areLicensesCompatible(comp1, comp2)) {
                        return false; // Any incompatibility makes the whole combination incompatible
                    }
                }
            }
            return true; // All components are compatible
        } else if (license1.includes(' AND ')) {
            // License1 is AND combination, license2 is simple
            // All components of license1 must be compatible with license2
            for (const comp1 of components1) {
                if (!this.areLicensesCompatible(comp1, license2)) {
                    return false;
                }
            }
            return true;
        } else if (license2.includes(' AND ')) {
            // License2 is AND combination, license1 is simple
            // All components of license2 must be compatible with license1
            for (const comp2 of components2) {
                if (!this.areLicensesCompatible(license1, comp2)) {
                    return false;
                }
            }
            return true;
        } else {
            // Both are OR combinations or simple licenses
            // Check if any component from license1 is compatible with any component from license2
            for (const comp1 of components1) {
                for (const comp2 of components2) {
                    if (this.areLicensesCompatible(comp1, comp2)) {
                        return true; // At least one combination is compatible
                    }
                }
            }
            return false; // No compatible combinations found
        }
    }

    /**
     * Parse complex license expression into individual licenses
     */
    parseComplexLicense(licenseExpression) {
        // Handle WITH clauses (e.g., "GPL-2.0-only WITH Classpath-exception-2.0")
        // Split by WITH first, then by AND/OR
        let mainExpression = licenseExpression;
        const withMatch = licenseExpression.match(/^(.+?)\s+WITH\s+(.+)$/i);
        if (withMatch) {
            mainExpression = withMatch[1].trim(); // Use the part before WITH
        }
        
        // Split by AND/OR and clean up
        const components = mainExpression
            .split(/\s+(?:AND|OR)\s+/i)
            .map(comp => comp.trim())
            .filter(comp => comp.length > 0);

        // Handle special cases and normalize
        return components.map(comp => {
            // Remove parentheses if present
            comp = comp.replace(/^\(|\)$/g, '').trim();
            
            // Handle version suffixes like "-only", "-or-later" - keep as-is
            if (comp.includes('-only') || comp.includes('-or-later')) {
                return comp;
            }
            
            // Handle language-specific licenses
            if (comp === 'Ruby') {
                return 'Ruby';
            }
            
            // Handle LicenseRef-scancode references
            if (comp.startsWith('LicenseRef-scancode-')) {
                // Check if it's a known permissive reference
                if (comp.includes('public-domain') || comp.includes('other-permissive') || comp.includes('jsr-')) {
                    return comp; // Will be recognized as permissive
                }
                // Unknown references will remain unknown
                return comp;
            }

            return comp;
        });
    }

    /**
     * Group dependencies by license families
     */
    groupByLicenseFamily(dependencies) {
        const families = new Map();

        dependencies.forEach(dep => {
            const licenseInfo = this.parseLicense(dep.originalPackage);
            let family = 'Unknown';

            // Find the family for this license
            for (const [familyName, licenses] of Object.entries(this.licenseFamilies)) {
                if (licenses.includes(licenseInfo.license)) {
                    family = familyName;
                    break;
                }
            }

            if (!families.has(family)) {
                families.set(family, []);
            }
            families.get(family).push({
                ...dep,
                licenseInfo
            });
        });

        return families;
    }

    /**
     * Generate license compliance report
     */
    generateComplianceReport(dependencies) {
        const report = {
            summary: {
                totalDependencies: dependencies.length,
                licensedDependencies: 0,
                unlicensedDependencies: 0,
                riskBreakdown: {
                    low: 0,
                    medium: 0,
                    high: 0
                },
                categoryBreakdown: {
                    permissive: 0,
                    copyleft: 0,
                    proprietary: 0,
                    unknown: 0
                }
            },
            conflicts: [],
            recommendations: [],
            licenseFamilies: new Map(),
            highRiskDependencies: []
        };

        // Process each dependency
        dependencies.forEach(dep => {
            const licenseInfo = this.parseLicense(dep.originalPackage);
            
            if (licenseInfo.license && licenseInfo.license !== 'NOASSERTION') {
                report.summary.licensedDependencies++;
                report.summary.riskBreakdown[licenseInfo.risk]++;
                report.summary.categoryBreakdown[licenseInfo.category]++;
                
                if (licenseInfo.risk === 'high') {
                    report.highRiskDependencies.push({
                        name: dep.name,
                        version: dep.version,
                        license: licenseInfo.license,
                        category: licenseInfo.category,
                        warnings: licenseInfo.warnings
                    });
                }
            } else {
                report.summary.unlicensedDependencies++;
            }
        });

        // Check for conflicts
        report.conflicts = this.checkLicenseConflicts(dependencies);

        // Group by license families
        report.licenseFamilies = this.groupByLicenseFamily(dependencies);

        // Generate recommendations
        if (report.summary.unlicensedDependencies > 0) {
            report.recommendations.push({
                type: 'warning',
                priority: 'high',
                message: `${report.summary.unlicensedDependencies} dependencies lack license information`
            });
        }

        if (report.highRiskDependencies.length > 0) {
            report.recommendations.push({
                type: 'warning',
                priority: 'medium',
                message: `${report.highRiskDependencies.length} high-risk licenses detected`
            });
        }

        if (report.conflicts.length > 0) {
            report.recommendations.push({
                type: 'error',
                priority: 'high',
                message: `${report.conflicts.length} license conflicts detected`
            });
        }

        return report;
    }

    /**
     * Get license statistics for visualization
     */
    getLicenseStats(dependencies) {
        const stats = {
            byCategory: {
                permissive: 0,
                lgpl: 0,
                copyleft: 0,
                proprietary: 0,
                custom: 0,
                unknown: 0
            },
            byRisk: {
                low: 0,
                medium: 0,
                high: 0
            },
            byLicense: new Map(),
            topLicenses: []
        };

        dependencies.forEach(dep => {
            const licenseInfo = this.parseLicense(dep.originalPackage);
            
            if (licenseInfo.license && licenseInfo.license !== 'NOASSERTION') {
                if (stats.byCategory[licenseInfo.category] !== undefined) {
                    stats.byCategory[licenseInfo.category]++;
                } else {
                    stats.byCategory.unknown++;
                }
                stats.byRisk[licenseInfo.risk]++;
                
                if (!stats.byLicense.has(licenseInfo.license)) {
                    stats.byLicense.set(licenseInfo.license, 0);
                }
                stats.byLicense.set(licenseInfo.license, stats.byLicense.get(licenseInfo.license) + 1);
            } else {
                stats.byCategory.unknown++;
                stats.byRisk.high++;
            }
        });

        // Get top licenses
        stats.topLicenses = Array.from(stats.byLicense.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([license, count]) => ({ license, count }));

        return stats;
    }

    /**
     * Check if a dependency license is compatible with the consuming repo's license.
     * Returns true if compatible, false if incompatible, null if unknown/indeterminate.
     *
     * The second arg is the license of the host/consumer repo this dep is consumed
     * by — historically called `repositoryLicense` (matched the dep field of the
     * same name); renamed to `consumerRepoLicense` in line with the dep-field
     * rename, to make the semantic ("license of the repo consuming this dep") clear.
     *
     * @param {string} dependencyLicense - The dependency's own license (SPDX identifier)
     * @param {string} consumerRepoLicense - The consuming repo's license (SPDX identifier)
     * @returns {boolean|null} - true if compatible, false if incompatible, null if unknown
     */
    isDependencyCompatibleWithRepository(dependencyLicense, consumerRepoLicense) {
        // If consumer repo license is not available, we can't determine compatibility
        if (!consumerRepoLicense) {
            return null;
        }

        // If dependency license is not available, it's a concern regardless
        if (!dependencyLicense || dependencyLicense === 'NOASSERTION') {
            return false;
        }

        // Same license is always compatible
        if (dependencyLicense === consumerRepoLicense) {
            return true;
        }

        // Check compatibility using the existing compatibility matrix
        // If repository is GPL and dependency is GPL, they're compatible
        if (this.areLicensesCompatible(dependencyLicense, consumerRepoLicense)) {
            return true;
        }

        // Special case: If consumer repo is GPL-licensed, GPL dependencies are compatible
        const repoIsGPL = consumerRepoLicense.toLowerCase().includes('gpl') && 
                          !consumerRepoLicense.toLowerCase().includes('lgpl') &&
                          !consumerRepoLicense.toLowerCase().includes('agpl');
        const depIsGPL = dependencyLicense.toLowerCase().includes('gpl') && 
                         !dependencyLicense.toLowerCase().includes('lgpl') &&
                         !dependencyLicense.toLowerCase().includes('agpl');
        
        if (repoIsGPL && depIsGPL) {
            return true; // GPL dependencies are compatible with GPL repositories
        }

        // Special case: If consumer repo is LGPL-licensed, LGPL and GPL dependencies are compatible
        const repoIsLGPL = consumerRepoLicense.toLowerCase().includes('lgpl');
        const depIsLGPL = dependencyLicense.toLowerCase().includes('lgpl');
        
        if (repoIsLGPL && (depIsLGPL || depIsGPL)) {
            return true; // LGPL/GPL dependencies are compatible with LGPL repositories
        }

        // If consumer repo is permissive (MIT, Apache, BSD, etc.), all dependencies are generally compatible
        // But copyleft dependencies might still be flagged for awareness
        const repoIsPermissive = this.licenseCategories.permissive.licenses.includes(consumerRepoLicense);
        if (repoIsPermissive) {
            // Permissive licenses can use any dependency, but we still want to flag copyleft for awareness
            // Return true for compatibility, but the risk assessment will still flag copyleft
            return true;
        }

        // For other cases, use the compatibility matrix
        return this.areLicensesCompatible(dependencyLicense, consumerRepoLicense);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LicenseProcessor;
} else {
    window.LicenseProcessor = LicenseProcessor;
} 