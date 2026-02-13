// Photo Capture System for DuoVerse
class PhotoCapture {
    constructor(videoElementId, canvasElementId, options = {}) {
        this.video = document.getElementById(videoElementId);
        this.canvas = document.getElementById(canvasElementId);
        this.stream = null;
        this.currentFilter = 'none';
        this.usingFrontCamera = options.usingFrontCamera !== false;
        this.roomId = options.roomId || null;
        this.filters = {
            none: 'none',
            brightness: 'brightness(1.5)',
            contrast: 'contrast(1.5)',
            glow: 'brightness(1.2) contrast(1.2) saturate(1.5)',
            blur: 'blur(3px)',
            grayscale: 'grayscale(1)',
            sepia: 'sepia(0.7)',
            invert: 'invert(0.8)',
            vintage: 'sepia(0.5) contrast(1.2) brightness(0.9)'
        };
        
        this.stickers = [];
        this.onCapture = options.onCapture || null;
    }

    // Initialize camera
    async initCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: this.usingFrontCamera ? 'user' : 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            
            return this.stream;
        } catch (error) {
            console.error('Error accessing camera:', error);
            throw error;
        }
    }

    // Switch camera
    async switchCamera() {
        this.usingFrontCamera = !this.usingFrontCamera;
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        
        return this.initCamera();
    }

    // Apply filter
    applyFilter(filterName) {
        if (this.filters[filterName]) {
            this.currentFilter = filterName;
            this.video.style.filter = this.filters[filterName];
        }
    }

    // Add sticker
    addSticker(emoji, x = null, y = null) {
        const sticker = {
            id: Date.now() + Math.random(),
            emoji: emoji,
            x: x || Math.random() * 80 + 10 + '%',
            y: y || Math.random() * 80 + 10 + '%',
            size: 50,
            rotation: 0
        };
        
        this.stickers.push(sticker);
        this.renderStickers();
        
        return sticker;
    }

    // Remove sticker
    removeSticker(stickerId) {
        this.stickers = this.stickers.filter(s => s.id !== stickerId);
        this.renderStickers();
    }

    // Render stickers
    renderStickers() {
        const overlay = document.getElementById('emoji-overlay');
        if (!overlay) return;
        
        overlay.innerHTML = this.stickers.map(sticker => `
            <div class="sticker" data-id="${sticker.id}"
                 style="position: absolute; 
                        left: ${sticker.x}; 
                        top: ${sticker.y}; 
                        font-size: ${sticker.size}px; 
                        transform: rotate(${sticker.rotation}deg);
                        cursor: move;
                        user-select: none;
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
                        transition: transform 0.2s;">
                ${sticker.emoji}
            </div>
        `).join('');
        
        // Make stickers draggable
        this.makeStickersDraggable();
    }

    // Make stickers draggable
    makeStickersDraggable() {
        const stickers = document.querySelectorAll('.sticker');
        
        stickers.forEach(sticker => {
            let isDragging = false;
            let startX, startY, startLeft, startTop;
            
            sticker.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
                const rect = sticker.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                
                sticker.style.cursor = 'grabbing';
                e.preventDefault();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                sticker.style.left = (startLeft + dx) + 'px';
                sticker.style.top = (startTop + dy) + 'px';
                
                // Update sticker position in array
                const stickerId = parseInt(sticker.dataset.id);
                const stickerData = this.stickers.find(s => s.id === stickerId);
                if (stickerData) {
                    stickerData.x = sticker.style.left;
                    stickerData.y = sticker.style.top;
                }
            });
            
            document.addEventListener('mouseup', () => {
                isDragging = false;
                sticker.style.cursor = 'move';
            });
            
            // Double click to remove
            sticker.addEventListener('dblclick', () => {
                const stickerId = parseInt(sticker.dataset.id);
                this.removeSticker(stickerId);
            });
        });
    }

    // Capture photo
    capture() {
        if (!this.video.videoWidth) return null;
        
        // Set canvas dimensions
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        const ctx = this.canvas.getContext('2d');
        
        // Apply filter
        ctx.filter = this.filters[this.currentFilter];
        
        // Draw video frame
        ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Draw stickers
        this.stickers.forEach(sticker => {
            const x = this.parsePosition(sticker.x, this.canvas.width);
            const y = this.parsePosition(sticker.y, this.canvas.height);
            
            ctx.font = `${sticker.size}px Arial`;
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 10;
            ctx.fillText(sticker.emoji, x, y);
        });
        
        // Reset shadow
        ctx.shadowBlur = 0;
        
        // Get image data
        const imageData = this.canvas.toDataURL('image/png');
        
        // Callback
        if (this.onCapture) {
            this.onCapture(imageData);
        }
        
        return imageData;
    }

    // Parse percentage position to pixel
    parsePosition(position, dimension) {
        if (typeof position === 'string' && position.includes('%')) {
            return (parseFloat(position) / 100) * dimension;
        }
        if (typeof position === 'string' && position.includes('px')) {
            return parseFloat(position);
        }
        return position;
    }

    // Save image to gallery
    async saveToGallery(imageData) {
        if (!this.roomId) return false;
        
        try {
            // Convert base64 to blob
            const response = await fetch(imageData);
            const blob = await response.blob();
            
            const formData = new FormData();
            formData.append('image', blob, 'capture.jpg');
            
            const uploadResponse = await fetch(`/api/upload-image/${this.roomId}`, {
                method: 'POST',
                body: formData
            });
            
            const data = await uploadResponse.json();
            return data.success;
        } catch (error) {
            console.error('Failed to save image:', error);
            return false;
        }
    }

    // Clear stickers
    clearStickers() {
        this.stickers = [];
        this.renderStickers();
    }

    // Reset camera
    reset() {
        this.currentFilter = 'none';
        this.video.style.filter = 'none';
        this.clearStickers();
    }

    // Stop camera
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}

// Initialize capture when page loads
document.addEventListener('DOMContentLoaded', function() {
    const cameraPreview = document.getElementById('camera-preview');
    if (cameraPreview) {
        const roomMeta = document.querySelector('meta[name="room-id"]');
        const roomId = roomMeta ? roomMeta.content : null;
        
        const capture = new PhotoCapture('camera-preview', 'filter-canvas', {
            roomId: roomId,
            usingFrontCamera: true
        });
        
        capture.initCamera();
        
        // Store in window for global access
        window.photoCapture = capture;
    }
});