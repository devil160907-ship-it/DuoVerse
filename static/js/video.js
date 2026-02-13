// YouTube Watch Together Manager
class YouTubeTogether {
    constructor(roomId, apiKey) {
        this.roomId = roomId;
        this.apiKey = apiKey;
        this.player = null;
        this.isSyncing = false;
        this.pollInterval = null;
        this.isPlayerReady = false;
        this.playlist = [];
        this.currentVideoId = null;
        this.videoTitle = '';
        this.volume = 100;
        this.updateTimer = null;
        
        console.log('YouTubeTogether initialized for room:', roomId);
        
        // Initialize YouTube API
        this.initYouTubeAPI();
    }

    // Initialize YouTube API
    initYouTubeAPI() {
        gapi.load('client', () => {
            gapi.client.init({
                apiKey: this.apiKey,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
            }).then(() => {
                console.log('YouTube API initialized');
            }).catch(error => {
                console.error('YouTube API init failed:', error);
            });
        });
    }

    // Create YouTube player
    createPlayer(elementId, videoId = '') {
        if (!window.YT) {
            console.error('YouTube IFrame API not loaded');
            return;
        }

        this.player = new YT.Player(elementId, {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'autoplay': 0,
                'controls': 1,
                'enablejsapi': 1,
                'rel': 0,
                'modestbranding': 1,
                'cc_load_policy': 0,
                'iv_load_policy': 3
            },
            events: {
                'onReady': this.onPlayerReady.bind(this),
                'onStateChange': this.onPlayerStateChange.bind(this),
                'onError': this.onPlayerError.bind(this)
            }
        });
    }

    // Player ready event
    onPlayerReady(event) {
        console.log('YouTube player ready');
        this.isPlayerReady = true;
        this.loadSessionState();
        this.startSyncPolling();
        this.startTimeUpdateTimer();
        
        // Setup volume control
        const volumeSlider = document.getElementById('youtube-volume');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value);
                this.setVolume(volume);
            });
        }
        
        // Setup play/pause button
        const playPauseBtn = document.getElementById('youtube-play-pause');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        }
        
        // Setup stop button
        const stopBtn = document.getElementById('youtube-stop');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopVideo());
        }
        
        // Setup search
        const searchBtn = document.getElementById('youtube-search-btn');
        const searchInput = document.getElementById('youtube-search-input');
        if (searchBtn && searchInput) {
            searchBtn.addEventListener('click', () => this.searchVideos(searchInput.value));
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchVideos(searchInput.value);
                }
            });
        }
    }

    // Player state change event
    onPlayerStateChange(event) {
        if (this.isSyncing) return;
        
        const state = event.data;
        const currentTime = this.player.getCurrentTime();
        
        // Update play/pause button text
        const playPauseBtn = document.getElementById('youtube-play-pause');
        if (playPauseBtn) {
            if (state === YT.PlayerState.PLAYING) {
                playPauseBtn.innerHTML = '<span class="icon">⏸️</span><span class="text">Pause</span>';
            } else {
                playPauseBtn.innerHTML = '<span class="icon">▶️</span><span class="text">Play</span>';
            }
        }
        
        // Sync with server
        if (state === YT.PlayerState.PLAYING) {
            this.syncPlayState(true, currentTime);
        } else if (state === YT.PlayerState.PAUSED) {
            this.syncPlayState(false, currentTime);
        } else if (state === YT.PlayerState.ENDED) {
            this.playNext();
        }
    }

    // Player error event
    onPlayerError(event) {
        console.error('YouTube player error:', event.data);
        let errorMessage = 'Video playback error';
        
        switch(event.data) {
            case 2:
                errorMessage = 'Invalid video ID';
                break;
            case 5:
                errorMessage = 'HTML5 player error';
                break;
            case 100:
                errorMessage = 'Video not found';
                break;
            case 101:
            case 150:
                errorMessage = 'Video embedding disabled';
                break;
        }
        
        if (typeof alertSystem !== 'undefined') {
            alertSystem.show('YouTube Error', errorMessage, 'error');
        }
    }

    // Load session state from server
    async loadSessionState() {
        try {
            const response = await fetch(`/api/youtube/session/${this.roomId}`);
            const data = await response.json();
            
            if (data.video_id) {
                this.currentVideoId = data.video_id;
                this.videoTitle = data.video_title || '';
                this.volume = data.volume || 100;
                
                this.player.loadVideoById(data.video_id);
                this.player.seekTo(data.current_time || 0);
                this.player.setVolume(this.volume);
                
                const volumeSlider = document.getElementById('youtube-volume');
                if (volumeSlider) volumeSlider.value = this.volume;
                
                if (data.is_playing) {
                    this.player.playVideo();
                } else {
                    this.player.pauseVideo();
                }
            }
            
            if (data.playlist) {
                this.playlist = data.playlist;
                this.renderPlaylist();
            }
        } catch (error) {
            console.error('Failed to load YouTube session:', error);
        }
    }

    // Start polling for sync
    startSyncPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        
        this.pollInterval = setInterval(async () => {
            if (!this.isPlayerReady || this.isSyncing) return;
            
            try {
                const response = await fetch(`/api/youtube/session/${this.roomId}`);
                const data = await response.json();
                
                if (data.video_id && data.video_id !== this.currentVideoId) {
                    this.isSyncing = true;
                    this.currentVideoId = data.video_id;
                    this.videoTitle = data.video_title || '';
                    this.player.loadVideoById(data.video_id);
                    this.player.seekTo(data.current_time || 0);
                    this.isSyncing = false;
                }
                
                const currentTime = this.player.getCurrentTime();
                const serverTime = data.current_time || 0;
                
                // Sync if time difference is more than 2 seconds
                if (Math.abs(currentTime - serverTime) > 2 && data.is_playing) {
                    this.isSyncing = true;
                    this.player.seekTo(serverTime);
                    this.isSyncing = false;
                }
                
                // Sync play state
                const playerState = this.player.getPlayerState();
                if (playerState === YT.PlayerState.PLAYING && !data.is_playing) {
                    this.player.pauseVideo();
                } else if (playerState !== YT.PlayerState.PLAYING && data.is_playing) {
                    this.player.playVideo();
                }
                
            } catch (error) {
                console.error('Failed to sync YouTube state:', error);
            }
        }, 3000);
    }

    // Start time update timer
    startTimeUpdateTimer() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        this.updateTimer = setInterval(() => {
            if (this.isPlayerReady && this.player && this.player.getCurrentTime) {
                const currentTime = this.player.getCurrentTime();
                const duration = this.player.getDuration() || 0;
                const timeDisplay = document.getElementById('youtube-time');
                
                if (timeDisplay) {
                    timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
                }
            }
        }, 500);
    }

    // Format time (seconds to MM:SS)
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Sync play state to server
    async syncPlayState(isPlaying, currentTime) {
        try {
            await fetch('/api/youtube/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: this.roomId,
                    is_playing: isPlaying,
                    current_time: currentTime
                })
            });
        } catch (error) {
            console.error('Failed to sync play state:', error);
        }
    }

    // Toggle play/pause
    togglePlayPause() {
        if (!this.player) return;
        
        const state = this.player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            this.player.pauseVideo();
        } else {
            this.player.playVideo();
        }
    }

    // Stop video
    stopVideo() {
        if (!this.player) return;
        this.player.stopVideo();
        this.syncPlayState(false, 0);
    }

    // Set volume
    setVolume(volume) {
        if (!this.player) return;
        
        this.volume = volume;
        this.player.setVolume(volume);
        
        fetch('/api/youtube/volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: this.roomId,
                volume: volume
            })
        }).catch(error => console.error('Failed to sync volume:', error));
    }

    // Load video
    async loadVideo(videoId, videoTitle = '') {
        if (!this.player) return;
        
        try {
            this.player.loadVideoById(videoId);
            this.currentVideoId = videoId;
            this.videoTitle = videoTitle;
            
            await fetch('/api/youtube/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: this.roomId,
                    video_id: videoId,
                    video_title: videoTitle
                })
            });
            
            // Add to playlist
            await this.addToPlaylist(videoId, videoTitle);
            
        } catch (error) {
            console.error('Failed to load video:', error);
        }
    }

    // Search YouTube videos
    async searchVideos(query) {
        if (!query.trim()) return;
        
        const resultsContainer = document.getElementById('youtube-search-results');
        const resultsList = document.getElementById('search-results-list');
        
        if (!resultsContainer || !resultsList) return;
        
        resultsContainer.style.display = 'block';
        resultsList.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center; padding: 10px;">Searching...</p>';
        
        try {
            const response = await gapi.client.youtube.search.list({
                part: 'snippet',
                q: query,
                maxResults: 8,
                type: 'video',
                videoEmbeddable: 'true'
            });
            
            const videos = response.result.items;
            
            if (videos.length === 0) {
                resultsList.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center; padding: 10px;">No videos found</p>';
                return;
            }
            
            resultsList.innerHTML = videos.map(video => {
                const videoId = video.id.videoId;
                const title = video.snippet.title;
                const thumbnail = video.snippet.thumbnails.default.url;
                const channel = video.snippet.channelTitle;
                
                return `
                    <div class="search-result-item" style="display: flex; gap: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.3s ease;"
                         onclick="window.youtubeTogether.loadVideo('${videoId}', '${title.replace(/'/g, "\\'")}')">
                        <img src="${thumbnail}" style="width: 60px; height: 45px; object-fit: cover; border-radius: 5px;">
                        <div style="flex: 1;">
                            <h5 style="color: white; margin-bottom: 3px; font-size: 0.9rem;">${title}</h5>
                            <p style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">${channel}</p>
                        </div>
                        <button style="background: none; border: none; color: var(--glow-color); cursor: pointer;" onclick="event.stopPropagation(); window.youtubeTogether.addToPlaylist('${videoId}', '${title.replace(/'/g, "\\'")}')">
                            ➕
                        </button>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('YouTube search failed:', error);
            resultsList.innerHTML = '<p style="color: rgba(255,69,58,0.8); text-align: center; padding: 10px;">Search failed. Please try again.</p>';
        }
    }

    // Add to playlist
    async addToPlaylist(videoId, videoTitle) {
        try {
            const response = await fetch('/api/youtube/add-to-playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: this.roomId,
                    video_id: videoId,
                    video_title: videoTitle
                })
            });
            
            const data = await response.json();
            if (data.playlist) {
                this.playlist = data.playlist;
                this.renderPlaylist();
                
                if (typeof alertSystem !== 'undefined') {
                    alertSystem.show('Added to Playlist', 'Video added to playlist', 'success');
                }
            }
            
        } catch (error) {
            console.error('Failed to add to playlist:', error);
        }
    }

    // Remove from playlist
    async removeFromPlaylist(videoId) {
        try {
            await fetch('/api/youtube/remove-from-playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: this.roomId,
                    video_id: videoId
                })
            });
            
            this.playlist = this.playlist.filter(v => v.id !== videoId);
            this.renderPlaylist();
            
        } catch (error) {
            console.error('Failed to remove from playlist:', error);
        }
    }

    // Play next in playlist
    playNext() {
        if (this.playlist.length > 0) {
            const currentIndex = this.playlist.findIndex(v => v.id === this.currentVideoId);
            const nextIndex = (currentIndex + 1) % this.playlist.length;
            const nextVideo = this.playlist[nextIndex];
            
            if (nextVideo) {
                this.loadVideo(nextVideo.id, nextVideo.title);
            }
        }
    }

    // Render playlist UI
    renderPlaylist() {
        const container = document.getElementById('youtube-playlist');
        if (!container) return;
        
        if (this.playlist.length === 0) {
            container.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center; padding: 20px;">No videos in playlist</p>';
            return;
        }
        
        container.innerHTML = this.playlist.map((video, index) => `
            <div class="playlist-item" style="display: flex; align-items: center; gap: 10px; padding: 10px; background: ${video.id === this.currentVideoId ? 'rgba(77, 163, 255, 0.2)' : 'rgba(255,255,255,0.05)'}; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.3s ease; border-left: ${video.id === this.currentVideoId ? '3px solid var(--glow-color)' : 'none'};"
                 onclick="window.youtubeTogether.loadVideo('${video.id}', '${video.title.replace(/'/g, "\\'")}')">
                <span style="color: var(--glow-color); font-weight: bold;">${index + 1}</span>
                <div style="flex: 1;">
                    <h5 style="color: white; margin-bottom: 3px; font-size: 0.9rem;">${video.title}</h5>
                    <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem;">Added ${new Date(video.added_at).toLocaleTimeString()}</p>
                </div>
                <button style="background: none; border: none; color: rgba(255,69,58,0.8); cursor: pointer; padding: 5px;" 
                        onclick="event.stopPropagation(); window.youtubeTogether.removeFromPlaylist('${video.id}')">
                    🗑️
                </button>
            </div>
        `).join('');
    }

    // Clean up
    destroy() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        if (this.player) {
            this.player.destroy();
        }
    }
}

// WebRTC Video Handler
class VideoChat {
    constructor(localVideoId, remoteVideoId) {
        this.localVideo = document.getElementById(localVideoId);
        this.remoteVideo = document.getElementById(remoteVideoId);
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ]
        };
    }

    // FIXED: Initialize local stream with front camera by default
    async initLocalStream(videoEnabled = true, audioEnabled = true) {
        try {
            // Always default to front camera ('user') for meetings
            // This ensures self-view shows you correctly
            const videoConstraints = videoEnabled ? {
                facingMode: 'user', // Force front camera for self view
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } : false;
            
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: audioEnabled
            });
            
            if (this.localVideo) {
                this.localVideo.srcObject = this.localStream;
                // Ensure video plays
                this.localVideo.play().catch(e => console.error('Error playing local video:', e));
            }
            
            return this.localStream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            
            // Fallback: Try with default constraints if facingMode fails
            if (videoEnabled) {
                try {
                    console.log('Retrying with default video constraints...');
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: audioEnabled
                    });
                    
                    if (this.localVideo) {
                        this.localVideo.srcObject = this.localStream;
                    }
                    
                    return this.localStream;
                } catch (fallbackError) {
                    console.error('Fallback also failed:', fallbackError);
                    throw fallbackError;
                }
            }
            
            throw error;
        }
    }

    // FIXED: Switch camera between front and back
    async switchCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                // Get current facing mode and switch it
                const currentFacingMode = videoTrack.getSettings().facingMode;
                const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
                
                console.log(`Switching camera from ${currentFacingMode} to ${newFacingMode}`);
                
                try {
                    const newStream = await navigator.mediaDevices.getUserMedia({
                        video: { 
                            facingMode: newFacingMode,
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        }
                    });
                    
                    const newVideoTrack = newStream.getVideoTracks()[0];
                    
                    // Stop old track
                    videoTrack.stop();
                    this.localStream.removeTrack(videoTrack);
                    this.localStream.addTrack(newVideoTrack);
                    
                    // Update peer connection
                    const sender = this.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) {
                        await sender.replaceTrack(newVideoTrack);
                    }
                    
                    // Update local video
                    this.localVideo.srcObject = this.localStream;
                    
                    console.log(`Camera switched to ${newFacingMode}`);
                    
                    // Update button text
                    this.updateCameraButtonState(true);
                    
                } catch (error) {
                    console.error('Failed to switch camera:', error);
                    throw error;
                }
            }
        }
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }
        
        this.peerConnection.ontrack = (event) => {
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
                this.remoteVideo.srcObject = this.remoteStream;
            }
            event.streams[0].getTracks().forEach(track => {
                this.remoteStream.addTrack(track);
            });
            
            // Ensure remote video plays
            this.remoteVideo.play().catch(e => console.error('Error playing remote video:', e));
        };
        
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendIceCandidate(event.candidate);
            }
        };
        
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);
        };
        
        return this.peerConnection;
    }

    async createOffer() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        return offer;
    }

    async createAnswer() {
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        return answer;
    }

    async setRemoteDescription(sdp) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async addIceCandidate(candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    sendIceCandidate(candidate) {
        // In a real implementation, send via signaling server
        console.log('ICE candidate:', candidate);
        // TODO: Implement signaling server to exchange ICE candidates
    }

    // FIXED: Toggle audio with better UI feedback
    toggleAudio() {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            
            const micBtn = document.getElementById('toggle-mic');
            if (micBtn) {
                const isEnabled = audioTracks[0]?.enabled;
                micBtn.innerHTML = isEnabled 
                    ? '<span class="icon">🎤</span><span class="text">Mute</span>'
                    : '<span class="icon">🎤</span><span class="text">Unmute</span>';
                micBtn.classList.toggle('muted', !isEnabled);
            }
        }
    }

    // FIXED: Toggle video with better UI feedback
    toggleVideo() {
        if (this.localStream) {
            const videoTracks = this.localStream.getVideoTracks();
            videoTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            
            const cameraBtn = document.getElementById('toggle-camera');
            if (cameraBtn) {
                const isEnabled = videoTracks[0]?.enabled;
                cameraBtn.innerHTML = isEnabled
                    ? '<span class="icon">📷</span><span class="text">Stop Camera</span>'
                    : '<span class="icon">📷</span><span class="text">Start Camera</span>';
                cameraBtn.classList.toggle('off', !isEnabled);
            }
        }
    }

    // FIXED: Update camera button state
    updateCameraButtonState(isFrontCamera) {
        const switchBtn = document.getElementById('toggle-camera');
        if (switchBtn) {
            // We're reusing the toggle-camera button for switch functionality
            // Add a camera switch indicator
            const icon = isFrontCamera ? '📷' : '📸';
            switchBtn.innerHTML = `<span class="icon">${icon}</span><span class="text">Switch</span>`;
        }
    }

    // Close and cleanup
    close() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.localStream = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localVideo) {
            this.localVideo.srcObject = null;
        }
        
        if (this.remoteVideo) {
            this.remoteVideo.srcObject = null;
        }
    }
}

// Initialize WebRTC
function initWebRTC(isHost) {
    // Check if already initialized
    if (window.videoChatInstance) {
        console.log('WebRTC already initialized, cleaning up...');
        window.videoChatInstance.close();
    }
    
    const videoChat = new VideoChat('localVideo', 'remoteVideo');
    window.videoChatInstance = videoChat;
    
    videoChat.initLocalStream(true, true).then(() => {
        if (isHost) {
            videoChat.createPeerConnection();
        }
        
        // Setup button listeners
        const micBtn = document.getElementById('toggle-mic');
        if (micBtn) {
            // Remove existing listeners to prevent duplicates
            const newMicBtn = micBtn.cloneNode(true);
            micBtn.parentNode.replaceChild(newMicBtn, micBtn);
            newMicBtn.addEventListener('click', () => videoChat.toggleAudio());
        }
        
        const cameraBtn = document.getElementById('toggle-camera');
        if (cameraBtn) {
            // Remove existing listeners to prevent duplicates
            const newCameraBtn = cameraBtn.cloneNode(true);
            cameraBtn.parentNode.replaceChild(newCameraBtn, cameraBtn);
            
            // Single click toggles video on/off
            newCameraBtn.addEventListener('click', () => videoChat.toggleVideo());
            
            // Double click switches camera
            newCameraBtn.addEventListener('dblclick', (e) => {
                e.preventDefault();
                videoChat.switchCamera();
            });
            
            // Set initial camera state
            videoChat.updateCameraButtonState(true);
        }
        
        console.log('WebRTC initialized successfully');
    }).catch(error => {
        console.error('Failed to initialize WebRTC:', error);
        if (typeof alertSystem !== 'undefined') {
            alertSystem.show('Camera Error', 'Unable to access camera. Please check permissions.', 'error');
        }
    });
    
    return videoChat;
}

// Export for global use
window.YouTubeTogether = YouTubeTogether;
window.VideoChat = VideoChat;
window.initWebRTC = initWebRTC;