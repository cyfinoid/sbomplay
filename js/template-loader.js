/**
 * Template Loader - Handles loading and rendering of HTML templates
 * Supports simple variable substitution, conditionals, loops, and escaping
 */
class TemplateLoader {
    constructor() {
        this.cache = new Map();
        this.templatePath = 'js/templates/';
    }

    /**
     * Load a template file (with caching)
     */
    async loadTemplate(templateName) {
        // Check cache first
        if (this.cache.has(templateName)) {
            return this.cache.get(templateName);
        }

        // Fetch template
        try {
            const response = await fetch(`${this.templatePath}${templateName}`);
            if (!response.ok) {
                throw new Error(`Failed to load template ${templateName}: ${response.status} ${response.statusText}`);
            }
            const template = await response.text();
            
            // Cache it
            this.cache.set(templateName, template);
            return template;
        } catch (error) {
            console.error(`Error loading template ${templateName}:`, error);
            throw error;
        }
    }

    /**
     * Escape HTML entities
     */
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Escape quotes for HTML attributes
     */
    escapeQuotes(text) {
        if (text === null || text === undefined) return '';
        return String(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Get nested property value using dot notation
     */
    getNestedValue(obj, path) {
        if (!path) return obj;
        const parts = path.split('.');
        let value = obj;
        for (const part of parts) {
            if (value === null || value === undefined) return undefined;
            value = value[part];
        }
        return value;
    }

    /**
     * Evaluate a condition
     */
    evaluateCondition(value) {
        if (value === null || value === undefined || value === false || value === '') {
            return false;
        }
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        if (typeof value === 'object') {
            return Object.keys(value).length > 0;
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        return true;
    }

    /**
     * Render a template with data
     */
    async renderTemplate(templateName, data = {}) {
        // Load template
        const template = await this.loadTemplate(templateName);

        // Process template
        return this.renderString(template, data);
    }

    /**
     * Render a template string with data (for nested templates)
     */
    renderString(template, data = {}) {
        let result = template;

        // Remove comments first
        result = result.replace(/\{\{!--[\s\S]*?--\}\}/g, '');

        // Process each blocks (loops)
        result = this.processEachBlocks(result, data);

        // Process if blocks (conditionals)
        result = this.processIfBlocks(result, data);

        // Process variable substitutions
        result = this.processVariables(result, data);

        return result;
    }

    /**
     * Process {{#each array}}...{{/each}} blocks
     */
    processEachBlocks(template, data) {
        const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
        let result = template;

        result = result.replace(eachRegex, (match, arrayPath, block) => {
            const array = this.getNestedValue(data, arrayPath.trim());
            
            if (!Array.isArray(array) || array.length === 0) {
                return '';
            }

            return array.map((item, index) => {
                // Create context with item and index
                const context = {
                    ...data,
                    '@index': index,
                    '@first': index === 0,
                    '@last': index === array.length - 1,
                    ...item
                };
                
                // If item is an object, merge its properties
                if (typeof item === 'object' && item !== null) {
                    Object.assign(context, item);
                } else {
                    // If item is primitive, make it available as 'this'
                    context.this = item;
                }

                return this.renderString(block, context);
            }).join('');
        });

        return result;
    }

    /**
     * Process {{#if condition}}...{{/if}} blocks
     */
    processIfBlocks(template, data) {
        const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
        let result = template;

        result = result.replace(ifRegex, (match, conditionPath, trueBlock, falseBlock) => {
            const condition = this.getNestedValue(data, conditionPath.trim());
            const evaluated = this.evaluateCondition(condition);
            
            if (evaluated) {
                return this.renderString(trueBlock, data);
            } else if (falseBlock) {
                return this.renderString(falseBlock, data);
            }
            return '';
        });

        return result;
    }

    /**
     * Process variable substitutions {{variable}}, {{variable|escape}}, {{variable|quote}}
     */
    processVariables(template, data) {
        const varRegex = /\{\{([^}|]+)(?:\|([^}]+))?\}\}/g;
        let result = template;

        result = result.replace(varRegex, (match, varPath, modifier) => {
            const value = this.getNestedValue(data, varPath.trim());
            
            if (value === null || value === undefined) {
                return '';
            }

            // Apply modifiers
            if (modifier) {
                const mod = modifier.trim();
                if (mod === 'escape') {
                    return this.escapeHtml(value);
                } else if (mod === 'quote') {
                    return this.escapeQuotes(value);
                }
            }

            return String(value);
        });

        return result;
    }

    /**
     * Clear the template cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Preload multiple templates
     */
    async preloadTemplates(templateNames) {
        const promises = templateNames.map(name => this.loadTemplate(name));
        await Promise.all(promises);
    }
}

// Create global instance
window.TemplateLoader = TemplateLoader;
window.templateLoader = new TemplateLoader();

