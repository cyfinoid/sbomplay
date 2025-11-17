/**
 * Plausible Analytics initialization
 * Extracted from inline scripts to support file:// protocol compatibility
 */

// Initialize Plausible analytics queue
window.plausible = window.plausible || function() { 
    (window.plausible.q = window.plausible.q || []).push(arguments) 
};

