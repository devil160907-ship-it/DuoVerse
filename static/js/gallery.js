// Gallery System for DuoVerse
class GallerySystem {
    constructor(roomId, options = {}) {
        this.roomId = roomId;
        this.password = null;
        this.images = [];
        this.gridSelector = options.gridSelector || '#gallery-grid';
        this.passwordScreenSelector = options.passwordScreenSelector || '#password-screen';
        this.galleryContentSelector = options.galleryContentSelector || '#gallery-content';
        this.emptyGallerySelector = options.emptyGallerySelector || '#empty-gallery';
        this.onImageLoaded = options.onImageLoaded || null;
        this.onImageDeleted = options.onImageDeleted || null;
    }

    // Unlock gallery with password
    async unlock(password) {
        this.password = password;
        return this.loadImages();
    }

    // Load images from server
    async loadImages() {
        try {
            const response = await fetch(`/api/gallery-images/${this.roomId}?password=${this.password}`);
            
            if (response.status === 401) {
                throw new Error('Invalid password');
            }
            
            this.images = await response.json();
            this.render();
            
            return this.images;
        } catch (error) {
            console.error('Failed to load gallery:', error);
            throw error;
        }
    }

    // Render gallery grid
    render() {
        const grid = document.querySelector(this.gridSelector);
        const passwordScreen = document.querySelector(this.passwordScreenSelector);
        const galleryContent = document.querySelector(this.galleryContentSelector);
        const emptyGallery = document.querySelector(this.emptyGallerySelector);
        
        if (!grid) return;
        
        // Hide password screen, show gallery
        if (passwordScreen) passwordScreen.style.display = 'none';
        if (galleryContent) galleryContent.style.display = 'block';
        
        if (this.images.length === 0) {
            if (emptyGallery) emptyGallery.style.display = 'block';
            grid.style.display = 'none';
            return;
        }
        
        if (emptyGallery) emptyGallery.style.display = 'none';
        grid.style.display = 'grid';
        
        grid.innerHTML = this.images.map(image => this.createGalleryItem(image)).join('');
        
        // Add event listeners to delete buttons
        grid.querySelectorAll('.delete-image').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const imageId = btn.dataset.imageId;
                this.deleteImage(parseInt(imageId));
            });
        });
        
        // Callback
        if (this.onImageLoaded) {
            this.onImageLoaded(this.images);
        }
    }

    // Create gallery item HTML
    createGalleryItem(image) {
        const date = new Date(image.created_at).toLocaleDateString();
        
        return `
            <div class="gallery-item fade-in" data-id="${image.id}">
                <img src="${image.path}" alt="Gallery image" 
                     loading="lazy"
                     onclick="window.gallerySystem.showPreview('${image.path}')">
                <button class="delete-image" data-image-id="${image.id}">
                    🗑️
                </button>
                <div class="image-date" style="position: absolute; bottom: 10px; left: 10px; 
                            background: rgba(0,0,0,0.6); color: white; padding: 4px 8px; 
                            border-radius: 5px; font-size: 12px;">
                    ${date}
                </div>
            </div>
        `;
    }

    // Delete image
    async deleteImage(imageId) {
        return new Promise((resolve, reject) => {
            alertSystem.confirm(
                'Delete Image',
                'Are you sure you want to delete this image?',
                async () => {
                    try {
                        const response = await fetch(`/api/delete-image/${imageId}`, {
                            method: 'DELETE'
                        });
                        
                        if (response.ok) {
                            // Remove from array
                            this.images = this.images.filter(img => img.id !== imageId);
                            
                            // Remove from DOM with animation
                            const item = document.querySelector(`.gallery-item[data-id="${imageId}"]`);
                            if (item) {
                                item.style.animation = 'fadeOut 0.3s ease';
                                setTimeout(() => {
                                    item.remove();
                                    this.checkEmpty();
                                }, 300);
                            }
                            
                            // Callback
                            if (this.onImageDeleted) {
                                this.onImageDeleted(imageId);
                            }
                            
                            alertSystem.show('Success', 'Image deleted successfully', 'success');
                            resolve(true);
                        }
                    } catch (error) {
                        console.error('Failed to delete image:', error);
                        alertSystem.show('Error', 'Failed to delete image', 'error');
                        reject(error);
                    }
                },
                () => {
                    resolve(false);
                }
            );
        });
    }

    // Check if gallery is empty
    checkEmpty() {
        const grid = document.querySelector(this.gridSelector);
        const emptyGallery = document.querySelector(this.emptyGallerySelector);
        
        if (this.images.length === 0) {
            if (grid) grid.style.display = 'none';
            if (emptyGallery) emptyGallery.style.display = 'block';
        }
    }

    // Show fullscreen preview
    showPreview(imagePath) {
        const modal = document.getElementById('preview-modal');
        const previewImage = document.getElementById('preview-image');
        
        if (modal && previewImage) {
            previewImage.src = imagePath;
            modal.style.display = 'flex';
            
            // Close on click outside
            modal.onclick = (e) => {
                if (e.target === modal) {
                    this.hidePreview();
                }
            };
            
            // Keyboard escape
            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    this.hidePreview();
                    document.removeEventListener('keydown', keyHandler);
                }
            };
            
            document.addEventListener('keydown', keyHandler);
        }
    }

    // Hide preview
    hidePreview() {
        const modal = document.getElementById('preview-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Download image
    async downloadImage(imagePath) {
        try {
            const response = await fetch(imagePath);
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `duoverse-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            return true;
        } catch (error) {
            console.error('Failed to download image:', error);
            return false;
        }
    }

    // Toggle password visibility
    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    }

    // Clear gallery
    clearGallery() {
        this.images = [];
        this.render();
    }
}

// Initialize gallery when page loads
document.addEventListener('DOMContentLoaded', function() {
    const galleryContainer = document.getElementById('gallery-grid');
    if (galleryContainer) {
        const roomMeta = document.querySelector('meta[name="room-id"]');
        const roomId = roomMeta ? roomMeta.content : null;
        
        if (roomId) {
            const gallery = new GallerySystem(roomId);
            window.gallerySystem = gallery;
            
            // Password toggle
            const toggleBtn = document.getElementById('toggle-password');
            if (toggleBtn) {
                toggleBtn.addEventListener('change', function() {
                    gallery.togglePasswordVisibility('gallery-password');
                });
            }
            
            // Unlock button
            const unlockBtn = document.getElementById('unlock-gallery');
            if (unlockBtn) {
                unlockBtn.addEventListener('click', async () => {
                    const passwordInput = document.getElementById('gallery-password');
                    const password = passwordInput.value;
                    
                    if (!password) {
                        alertSystem.show('Error', 'Please enter the gallery password', 'error');
                        return;
                    }
                    
                    try {
                        await gallery.unlock(password);
                    } catch (error) {
                        alertSystem.show('Error', 'Incorrect password', 'error');
                    }
                });
            }
            
            // Enter key on password input
            const passwordInput = document.getElementById('gallery-password');
            if (passwordInput) {
                passwordInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        unlockBtn.click();
                    }
                });
            }
        }
    }
});

// Add CSS animation for fade out
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(0.8); }
    }
    
    .gallery-item {
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    
    .gallery-item:hover {
        transform: scale(1.05);
        box-shadow: 0 0 30px rgba(77, 163, 255, 0.5);
    }
    
    .image-date {
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    
    .gallery-item:hover .image-date {
        opacity: 1;
    }
`;
document.head.appendChild(style);