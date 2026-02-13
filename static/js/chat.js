// Chat System for DuoVerse
class ChatSystem {
    constructor(roomId, options = {}) {
        this.roomId = roomId;
        this.lastMessageId = 0;
        this.pollInterval = null;
        this.messageContainer = options.messageContainer || '#chat-messages';
        this.inputSelector = options.inputSelector || '#message-input';
        this.onNewMessage = options.onNewMessage || null;
        this.username = options.username || this.generateUsername();
        this.isPolling = false;
        this.pendingMessages = new Set(); // Track pending message IDs to prevent duplicate sends
        this.messageCache = new Set(); // Cache recent message IDs
        this.messageElementCache = new Set(); // NEW: Track displayed message elements by ID
        this.typingTimeout = null;
        this.isTyping = false;
        this.connectionStatus = 'connected';
        this.initialized = false; // NEW: Prevent double initialization
    }

    // Generate a random username
    generateUsername() {
        const adjectives = ['Happy', 'Lovely', 'Sweet', 'Kind', 'Bright'];
        const nouns = ['Star', 'Moon', 'Sun', 'Heart', 'Dream'];
        return adjectives[Math.floor(Math.random() * adjectives.length)] + 
               nouns[Math.floor(Math.random() * nouns.length)] + 
               Math.floor(Math.random() * 100);
    }

    // Start polling for messages - FIXED to prevent double polling
    startPolling() {
        if (this.isPolling) {
            console.log('Polling already active, skipping');
            return;
        }
        this.isPolling = true;
        console.log('Starting polling for room:', this.roomId);
        this.pollMessages();
        this.pollInterval = setInterval(() => this.pollMessages(), 2000);
    }

    // Stop polling
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            this.isPolling = false;
            console.log('Polling stopped');
        }
    }

    // Poll for new messages - FIXED to prevent duplicates more aggressively
    async pollMessages() {
        if (!this.isPolling) return;
        
        try {
            const response = await fetch(`/api/messages/${this.roomId}?since=${this.lastMessageId}`);
            const messages = await response.json();
            
            if (messages.length > 0) {
                console.log(`Received ${messages.length} new messages`);
                
                messages.forEach(msg => {
                    // Skip messages we've already displayed
                    if (this.messageElementCache.has(`msg-${msg.id}`)) {
                        console.log(`Skipping duplicate message ID: ${msg.id}`);
                        return;
                    }
                    
                    this.lastMessageId = Math.max(this.lastMessageId, msg.id);
                    this.displayMessage(msg);
                    this.messageElementCache.add(`msg-${msg.id}`);
                    
                    // Clean cache periodically
                    if (this.messageElementCache.size > 200) {
                        const cacheArray = Array.from(this.messageElementCache);
                        this.messageElementCache = new Set(cacheArray.slice(-100));
                    }
                });
            }
            
            this.updateConnectionStatus('connected');
        } catch (error) {
            console.error('Failed to poll messages:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    // Update connection status indicator
    updateConnectionStatus(status) {
        this.connectionStatus = status;
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.innerHTML = status === 'connected' ? '● Connected' : '○ Disconnected';
            statusEl.style.color = status === 'connected' ? '#4CAF50' : '#FF5252';
        }
    }

    // Send a message - FIXED to prevent duplicates
    async sendMessage(message, isImage = false) {
        if (!message || (typeof message === 'string' && !message.trim() && !isImage)) return;

        // Create a unique key for this message to prevent duplicate sends
        const messageContent = isImage ? message : message.trim();
        const messageKey = `send-${this.roomId}-${messageContent}-${Date.now()}`;
        
        // Check if this exact message was just sent
        if (this.pendingMessages.has(messageKey)) {
            console.log('Duplicate send prevented');
            return;
        }
        
        this.pendingMessages.add(messageKey);

        try {
            const response = await fetch(`/api/send-message/${this.roomId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender: this.username,
                    message: messageContent,
                    is_image: isImage
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                // Clear input immediately after successful send
                this.clearInput();
                
                // Add to message cache BEFORE the poll receives it
                if (data.message_id) {
                    this.messageElementCache.add(`msg-${data.message_id}`);
                    console.log(`Cached message ID: ${data.message_id}`);
                }
                
                return data;
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            if (typeof alertSystem !== 'undefined' && alertSystem.show) {
                alertSystem.show('Error', 'Failed to send message', 'error');
            }
        } finally {
            // Remove from pending after a delay to prevent rapid duplicate clicks
            setTimeout(() => {
                this.pendingMessages.delete(messageKey);
            }, 1000);
        }
    }

    // Display message in chat - FIXED to check by ID first
    displayMessage(message) {
        const container = document.querySelector(this.messageContainer);
        if (!container) return;

        // CRITICAL FIX: Check if we've already displayed this message by ID
        if (message.id && this.messageElementCache.has(`msg-${message.id}`)) {
            console.log(`Skipping already displayed message ID: ${message.id}`);
            return;
        }

        // Additional check: Look for existing message with same ID in DOM
        if (message.id) {
            const existingMsg = container.querySelector(`.message[data-message-id="${message.id}"]`);
            if (existingMsg) {
                console.log(`Message ID ${message.id} already exists in DOM`);
                this.messageElementCache.add(`msg-${message.id}`);
                return;
            }
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message fade-in';
        
        // Store message ID as data attribute for duplicate detection
        if (message.id) {
            messageDiv.setAttribute('data-message-id', message.id);
        }
        
        messageDiv.style.marginBottom = '15px';
        messageDiv.style.padding = '12px';
        messageDiv.style.background = 'rgba(255, 255, 255, 0.1)';
        messageDiv.style.borderRadius = '15px';
        messageDiv.style.maxWidth = '80%';
        messageDiv.style.wordWrap = 'break-word';

        // Different styling for own messages
        if (message.sender === this.username) {
            messageDiv.style.marginLeft = 'auto';
            messageDiv.style.background = 'rgba(77, 163, 255, 0.2)';
            messageDiv.style.border = '1px solid rgba(77, 163, 255, 0.3)';
        }

        const time = new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Add date divider if it's a new day
        this.addDateDividerIfNeeded(message.timestamp);

        if (message.is_image) {
            messageDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 5px;">
                    <strong style="color: var(--glow-color);">${this.escapeHtml(message.sender)}</strong>
                    <small style="color: rgba(255,255,255,0.5);">${time}</small>
                </div>
                <img src="${message.message}" alt="Shared image" 
                     style="max-width: 200px; border-radius: 10px; cursor: pointer;"
                     onclick="window.showPreview && window.showPreview('${message.message.replace(/'/g, "\\'")}')">
            `;
        } else {
            messageDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 5px;">
                    <strong style="color: var(--glow-color);">${this.escapeHtml(message.sender)}</strong>
                    <small style="color: rgba(255,255,255,0.5);">${time}</small>
                </div>
                <p style="margin: 0; color: white;">${this.escapeHtml(message.message)}</p>
            `;
        }

        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;

        // Add to cache
        if (message.id) {
            this.messageElementCache.add(`msg-${message.id}`);
        }

        // Callback
        if (this.onNewMessage) {
            this.onNewMessage(message);
        }
    }

    // Add date divider
    addDateDividerIfNeeded(timestamp) {
        const container = document.querySelector(this.messageContainer);
        if (!container) return;
        
        const messageDate = new Date(timestamp).toDateString();
        const lastDivider = container.querySelector('.chat-date-divider:last-child');
        
        if (!lastDivider || lastDivider.dataset.date !== messageDate) {
            const divider = document.createElement('div');
            divider.className = 'chat-date-divider';
            divider.dataset.date = messageDate;
            divider.innerHTML = `<span>${messageDate}</span>`;
            container.appendChild(divider);
        }
    }

    // Show typing indicator
    showTyping() {
        if (!this.isTyping) {
            this.isTyping = true;
            const indicator = document.getElementById('typing-indicator');
            if (indicator) {
                indicator.style.display = 'flex';
            }
        }
    }

    // Hide typing indicator
    hideTyping() {
        if (this.isTyping) {
            this.isTyping = false;
            const indicator = document.getElementById('typing-indicator');
            if (indicator) {
                indicator.style.display = 'none';
            }
        }
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Clear input field
    clearInput() {
        const input = document.querySelector(this.inputSelector);
        if (input) {
            input.value = '';
        }
    }

    // Upload and send image - FIXED to prevent duplicates
    async uploadAndSendImage(file) {
        if (!file) return;

        // Create unique key for this upload
        const uploadKey = `upload-${this.roomId}-${file.name}-${file.size}-${Date.now()}`;
        
        if (this.pendingMessages.has(uploadKey)) {
            console.log('Duplicate upload prevented');
            return;
        }
        
        this.pendingMessages.add(uploadKey);

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`/api/upload-image/${this.roomId}`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (data.success) {
                // Send the message with image path
                await this.sendMessage(data.image_path, true);
            }
        } catch (error) {
            console.error('Failed to upload image:', error);
            if (typeof alertSystem !== 'undefined' && alertSystem.show) {
                alertSystem.show('Error', 'Failed to upload image', 'error');
            }
        } finally {
            // Remove from pending after delay
            setTimeout(() => {
                this.pendingMessages.delete(uploadKey);
            }, 2000);
            
            // Clear file input
            const fileInput = document.getElementById('image-upload');
            if (fileInput) fileInput.value = '';
        }
    }

    // Load message history
    async loadHistory(limit = 50) {
        try {
            const response = await fetch(`/api/messages/${this.roomId}?since=0`);
            const messages = await response.json();
            
            const container = document.querySelector(this.messageContainer);
            if (container) {
                container.innerHTML = '';
            }
            
            this.messageCache.clear();
            this.messageElementCache.clear(); // Clear message cache
            this.lastMessageId = 0;
            
            // Display messages in order
            messages.slice(-limit).forEach(msg => {
                this.lastMessageId = Math.max(this.lastMessageId, msg.id);
                this.displayMessage(msg);
                
                // Cache message by ID
                if (msg.id) {
                    this.messageElementCache.add(`msg-${msg.id}`);
                }
            });
        } catch (error) {
            console.error('Failed to load message history:', error);
        }
    }

    // Clear chat
    clearChat() {
        const container = document.querySelector(this.messageContainer);
        if (container) {
            container.innerHTML = '';
        }
        this.lastMessageId = 0;
        this.messageCache.clear();
        this.messageElementCache.clear();
    }
}

// Emoji Picker (unchanged, keep as is)
class EmojiPicker {
    // ... (keep existing EmojiPicker code)
}

// FIXED: Only initialize if not already initialized
let chatSystemInstance = null;

// Initialize chat when page loads - with singleton pattern
document.addEventListener('DOMContentLoaded', function() {
    // Prevent double initialization
    if (window.chatSystem) {
        console.log('Chat system already initialized, skipping');
        return;
    }
    
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) {
        const roomMeta = document.querySelector('meta[name="room-id"]');
        const roomId = roomMeta ? roomMeta.content : null;
        