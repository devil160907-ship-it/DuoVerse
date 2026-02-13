// Main JavaScript for DuoVerse
document.addEventListener('DOMContentLoaded', function() {
    // Initialize stars background if not present
    if (!document.querySelector('.stars')) {
        createStars();
    }
    
    // Initialize glass morphism effects
    initGlassEffects();
    
    // Handle responsive navigation
    initResponsiveNav();
});

// Create animated stars background
function createStars() {
    const starsContainer = document.querySelector('.stars');
    if (!starsContainer) return;
    
    for (let i = 0; i < 150; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.width = star.style.height = Math.random() * 3 + 1 + 'px';
        star.style.animationDelay = Math.random() * 3 + 's';
        star.style.animationDuration = Math.random() * 2 + 1 + 's';
        starsContainer.appendChild(star);
    }
}

// Glass morphism effects
function initGlassEffects() {
    const glassPanels = document.querySelectorAll('.glass-panel');
    
    glassPanels.forEach(panel => {
        panel.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;
            
            this.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });
        
        panel.addEventListener('mouseleave', function() {
            this.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
        });
    });
}

// Responsive navigation
function initResponsiveNav() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    
    const menuButton = document.createElement('button');
    menuButton.className = 'menu-toggle control-btn';
    menuButton.innerHTML = '☰';
    menuButton.style.display = 'none';
    
    nav.insertBefore(menuButton, nav.firstChild);
    
    function checkWidth() {
        if (window.innerWidth <= 768) {
            menuButton.style.display = 'block';
            nav.classList.add('mobile-nav');
        } else {
            menuButton.style.display = 'none';
            nav.classList.remove('mobile-nav');
        }
    }
    
    checkWidth();
    window.addEventListener('resize', checkWidth);
    
    menuButton.addEventListener('click', function() {
        nav.classList.toggle('nav-open');
    });
}

// Form validation utilities
const FormValidator = {
    validateDate(dateString) {
        const date = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date >= today;
    },
    
    validateTime(timeString) {
        const time = timeString.split(':');
        return time.length === 2 && !isNaN(time[0]) && !isNaN(time[1]);
    },
    
    validateDOBFormat(password) {
        return /^\d{8}$/.test(password);
    },
    
    sanitizeInput(input) {
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }
};

// Loading spinner
function showLoading() {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.position = 'fixed';
    spinner.style.top = '50%';
    spinner.style.left = '50%';
    spinner.style.transform = 'translate(-50%, -50%)';
    spinner.style.zIndex = '9999';
    spinner.id = 'global-spinner';
    
    document.body.appendChild(spinner);
}

function hideLoading() {
    const spinner = document.getElementById('global-spinner');
    if (spinner) {
        spinner.remove();
    }
}

// Copy to clipboard utility
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
    }
}

// Share utility
async function shareContent(title, text, url) {
    if (navigator.share) {
        try {
            await navigator.share({ title, text, url });
            return true;
        } catch (err) {
            console.log('Share cancelled');
            return false;
        }
    } else {
        return false;
    }
}

// Date formatting
function formatDate(dateString) {
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// Time remaining calculator
function getTimeRemaining(targetDateTime) {
    const total = Date.parse(targetDateTime) - Date.parse(new Date());
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));
    
    return { total, days, hours, minutes, seconds };
}

// Network status checker
function checkNetworkStatus() {
    if (!navigator.onLine) {
        alertSystem.show(
            'No Internet Connection',
            'You are currently offline. Some features may be unavailable.',
            'warning'
        );
    }
}

window.addEventListener('online', () => {
    alertSystem.show('Back Online', 'Your internet connection has been restored.', 'success');
});

window.addEventListener('offline', checkNetworkStatus);

// Export utilities
window.DuoVerse = {
    createStars,
    initGlassEffects,
    FormValidator,
    showLoading,
    hideLoading,
    copyToClipboard,
    shareContent,
    formatDate,
    getTimeRemaining,
    checkNetworkStatus
};