// PWA Installation Handler
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67+ from automatically showing prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show install button on intro page only
    const installBtn = document.getElementById('install-app');
    if (installBtn && window.location.pathname === '/') {
        installBtn.style.display = 'block';
        
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            
            // Show the install prompt
            deferredPrompt.prompt();
            
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            
            // Clear the saved prompt
            deferredPrompt = null;
            
            // Hide the install button
            installBtn.style.display = 'none';
        });
    }
});

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registered:', registration);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}

// Handle app installed
window.addEventListener('appinstalled', (evt) => {
    console.log('App was installed');
    
    // Hide install button
    const installBtn = document.getElementById('install-app');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
    
    // Show success message
    if (typeof alertSystem !== 'undefined') {
        alertSystem.show('Success', 'App installed successfully!', 'success');
    }
});