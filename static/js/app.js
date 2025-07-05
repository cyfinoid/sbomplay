// SBOM Play - Minimal JavaScript

// Simple form validation
function validateOrgName() {
    const orgName = document.getElementById('org_name');
    const submitBtn = document.querySelector('button[type="submit"]');
    
    if (orgName && submitBtn) {
        orgName.addEventListener('input', function() {
            const value = this.value.trim();
            if (value.length > 0) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('btn-secondary');
                submitBtn.classList.add('btn-primary');
            } else {
                submitBtn.disabled = true;
                submitBtn.classList.remove('btn-primary');
                submitBtn.classList.add('btn-secondary');
            }
        });
    }
}

// Simple page refresh for progress updates
function refreshPage() {
    location.reload();
}

// Initialize minimal functionality
document.addEventListener('DOMContentLoaded', function() {
    validateOrgName();
    
    // Add refresh button functionality
    const refreshBtn = document.querySelector('[data-refresh]');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshPage);
    }
}); 