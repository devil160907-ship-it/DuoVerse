const CACHE_NAME = 'duoverse-v2';
const urlsToCache = [
    '/',
    '/setup',
    '/offline.html',
    '/static/css/style.css',
    '/static/js/alert.js',
    '/static/js/pwa.js',
    '/static/js/main.js',
    '/static/js/chat.js',
    '/static/js/video.js',
    '/static/js/capture.js',
    '/static/js/gallery.js',
    '/manifest.json',
    '/static/icons/icon-72x72.png',
    '/static/icons/icon-96x96.png',
    '/static/icons/icon-128x128.png',
    '/static/icons/icon-144x144.png',
    '/static/icons/icon-152x152.png',
    '/static/icons/icon-192x192.png',
    '/static/icons/icon-384x384.png',
    '/static/icons/icon-512x512.png'
];

// Install event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Fetch event with offline.html fallback
self.addEventListener('fetch', event => {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // Clone the request
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest)
                    .then(response => {
                        // Check if valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(error => {
                        console.log('Fetch failed:', error);
                        
                        // If the request is for a page, show offline page
                        if (event.request.mode === 'navigate') {
                            return caches.match('/offline.html').then(offlineResponse => {
                                if (offlineResponse) {
                                    return offlineResponse;
                                }
                                // If offline.html isn't cached, return a simple offline response
                                return new Response(
                                    `<!DOCTYPE html>
                                    <html>
                                        <head>
                                            <title>Offline - DuoVerse</title>
                                            <meta charset="UTF-8">
                                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                            <style>
                                                body { 
                                                    margin: 0; 
                                                    padding: 20px; 
                                                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                                                    background: linear-gradient(135deg, #0B1221, #0F1B3D);
                                                    color: white;
                                                    display: flex;
                                                    align-items: center;
                                                    justify-content: center;
                                                    min-height: 100vh;
                                                }
                                                .offline-message {
                                                    text-align: center;
                                                    padding: 40px;
                                                    background: rgba(255,255,255,0.1);
                                                    backdrop-filter: blur(10px);
                                                    border-radius: 20px;
                                                    border: 1px solid rgba(255,255,255,0.2);
                                                }
                                                h1 { color: #4DA3FF; margin-bottom: 20px; }
                                                p { color: rgba(255,255,255,0.9); line-height: 1.6; }
                                            </style>
                                        </head>
                                        <body>
                                            <div class="offline-message">
                                                <h1>📴 You're Offline</h1>
                                                <p>Please check your internet connection and try again.</p>
                                                <button onclick="window.location.reload()" 
                                                        style="background: #4DA3FF; 
                                                               color: white; 
                                                               border: none; 
                                                               padding: 12px 24px; 
                                                               border-radius: 25px; 
                                                               margin-top: 20px;
                                                               cursor: pointer;
                                                               font-weight: 600;">
                                                    Retry Connection
                                                </button>
                                            </div>
                                        </body>
                                    </html>`,
                                    {
                                        status: 503,
                                        statusText: 'Service Unavailable',
                                        headers: new Headers({
                                            'Content-Type': 'text/html'
                                        })
                                    }
                                );
                            });
                        }
                        
                        // For other resources, return a simple offline response
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({
                                'Content-Type': 'text/plain'
                            })
                        });
                    });
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Background sync for offline messages
self.addEventListener('sync', event => {
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
    if (event.tag === 'sync-images') {
        event.waitUntil(syncImages());
    }
});

async function syncMessages() {
    try {
        const db = await openDB();
        const offlineMessages = await db.getAll('offline-messages');
        
        for (const message of offlineMessages) {
            try {
                const response = await fetch(`/api/send-message/${message.roomId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(message.data)
                });
                
                if (response.ok) {
                    await db.delete('offline-messages', message.id);
                }
            } catch (error) {
                console.error('Failed to sync message:', error);
            }
        }
    } catch (error) {
        console.error('Failed to sync messages:', error);
    }
}

async function syncImages() {
    try {
        const db = await openDB();
        const offlineImages = await db.getAll('offline-images');
        
        for (const image of offlineImages) {
            try {
                const formData = new FormData();
                formData.append('image', image.blob, image.filename);
                
                const response = await fetch(`/api/upload-image/${image.roomId}`, {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    await db.delete('offline-images', image.id);
                }
            } catch (error) {
                console.error('Failed to sync image:', error);
            }
        }
    } catch (error) {
        console.error('Failed to sync images:', error);
    }
}

// IndexedDB for offline storage
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('DuoVerseOffline', 2);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('offline-messages')) {
                db.createObjectStore('offline-messages', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('offline-images')) {
                db.createObjectStore('offline-images', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('offline-pages')) {
                db.createObjectStore('offline-pages', { keyPath: 'url' });
            }
        };
    });
}

// Cache offline page on install
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});