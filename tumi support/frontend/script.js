/**
 * TumiCodes Support System - Frontend JavaScript
 * Handles page navigation, API calls, and WebSocket connection
 */

class TumiSupportSystem {
    constructor() {
        this.userId = null;
        this.ws = null;
        this.isConnected = false;
        this.isTyping = false;
        this.typingTimeout = null;
        
        this.init();
    }

    init() {
        // Check which page we're on and initialize accordingly
        const path = window.location.pathname;
        
        if (path.includes('index.html') || path === '/') {
            this.initHomePage();
        } else if (path.includes('loading.html') || path.includes('/loading')) {
            this.initLoadingPage();
        } else if (path.includes('chat.html') || path.includes('/chat')) {
            this.initChatPage();
        }
        
        // Initialize particles on home page
        if (path.includes('index.html') || path === '/') {
            this.initParticles();
        }
    }

    initHomePage() {
        const supportBtn = document.getElementById('supportBtn');
        if (supportBtn) {
            supportBtn.addEventListener('click', () => this.startSupportSession());
        }
    }

    initLoadingPage() {
        // Get session data from localStorage or URL params
        const urlParams = new URLSearchParams(window.location.search);
        this.userId = urlParams.get('userId') || localStorage.getItem('tumi_userId');
        
        if (!this.userId) {
            // No session found, redirect to home
            this.showNotification('No active session found', 'error');
            setTimeout(() => window.location.href = '/', 2000);
            return;
        }
        
        // Start checking session status
        this.checkSessionStatus();
    }

    initChatPage() {
        this.userId = localStorage.getItem('tumi_userId');
        
        if (!this.userId) {
            this.showNotification('Session expired', 'error');
            setTimeout(() => window.location.href = '/', 2000);
            return;
        }
        
        this.setupWebSocket();
        this.setupChatEventListeners();
        this.updateConnectionStatus(false);
    }

    async startSupportSession() {
        try {
            this.showNotification('Starting support session...', 'success');
            
            const response = await fetch('/api/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Store user ID
                this.userId = data.userId;
                localStorage.setItem('tumi_userId', this.userId);
                
                if (data.status === 'connected') {
                    // Go directly to chat
                    window.location.href = `/chat?userId=${this.userId}`;
                } else {
                    // Go to loading/queue screen
                    window.location.href = `/loading?userId=${this.userId}&position=${data.position}`;
                }
            } else {
                throw new Error(data.error || 'Failed to start session');
            }
        } catch (error) {
            console.error('Error starting session:', error);
            this.showNotification('Failed to start session. Please try again.', 'error');
        }
    }

    async checkSessionStatus() {
        if (!this.userId) return;
        
        try {
            const response = await fetch(`/api/queue-status`);
            const data = await response.json();
            
            if (data.success) {
                this.updateQueueDisplay(data);
                
                // Check if this user is now active
                if (data.active === this.userId) {
                    // Move to chat page
                    setTimeout(() => {
                        window.location.href = `/chat?userId=${this.userId}`;
                    }, 1500);
                }
            }
            
            // Continue checking every 5 seconds
            setTimeout(() => this.checkSessionStatus(), 5000);
        } catch (error) {
            console.error('Error checking status:', error);
            setTimeout(() => this.checkSessionStatus(), 10000);
        }
    }

    updateQueueDisplay(data) {
        const positionElement = document.getElementById('queuePosition');
        const queueSizeElement = document.getElementById('queueSize');
        const statusElement = document.getElementById('connectionStatus');
        
        if (data.active === this.userId) {
            if (statusElement) {
                statusElement.textContent = 'Connecting you to support...';
            }
            return;
        }
        
        // Find user's position in queue
        const position = data.queue.indexOf(this.userId) + 1;
        
        if (positionElement && position > 0) {
            positionElement.textContent = position;
        }
        
        if (queueSizeElement) {
            queueSizeElement.textContent = data.queueSize;
        }
        
        if (statusElement && position === 1) {
            statusElement.textContent = 'You are next in line...';
        }
    }

    setupWebSocket() {
        // Create WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.updateConnectionStatus(true);
            
            // Send activation request
            this.sendWebSocketMessage({
                type: 'request_activation',
                userId: this.userId
            });
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            this.updateConnectionStatus(false);
            
            // Try to reconnect after 3 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    this.setupWebSocket();
                }
            }, 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'connected':
                this.showNotification('Connected to support team!', 'success');
                this.addMessage('system', 'Connected to TumiCodes Support Team');
                break;
                
            case 'support_message':
                this.addMessage('support', data.text, data.timestamp);
                break;
                
            case 'session_end':
                this.showNotification('Chat ended: ' + data.reason, 'warning');
                this.addMessage('system', 'Chat session ended');
                
                // Redirect to home after 3 seconds
                setTimeout(() => {
                    localStorage.removeItem('tumi_userId');
                    window.location.href = '/';
                }, 3000);
                break;
                
            case 'queue_update':
                // Update queue info if we're still in queue
                this.updateQueueInfo(data.position, data.queueSize);
                break;
                
            case 'queue_advance':
                this.showNotification('You are next in line!', 'success');
                break;
                
            case 'message_status':
                if (data.status === 'sent') {
                    // Message was delivered to support
                    console.log('Message delivered at:', data.timestamp);
                }
                break;
        }
    }

    sendWebSocketMessage(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    setupChatEventListeners() {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const endChatButton = document.getElementById('endChatButton');
        
        if (sendButton) {
            sendButton.addEventListener('click', () => this.sendMessage());
        }
        
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            // Typing indicator
            messageInput.addEventListener('input', () => {
                if (!this.isTyping) {
                    this.isTyping = true;
                    this.sendTypingIndicator();
                }
                
                clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(() => {
                    this.isTyping = false;
                }, 1000);
            });
        }
        
        if (endChatButton) {
            endChatButton.addEventListener('click', () => this.endChat());
        }
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message || !this.isConnected) return;
        
        // Add to UI immediately
        this.addMessage('user', message);
        
        // Send via WebSocket
        this.sendWebSocketMessage({
            type: 'chat',
            text: message,
            userId: this.userId,
            timestamp: new Date().toISOString()
        });
        
        // Clear input
        messageInput.value = '';
        messageInput.focus();
    }

    sendTypingIndicator() {
        if (this.isConnected) {
            this.sendWebSocketMessage({
                type: 'typing',
                userId: this.userId
            });
        }
    }

    async endChat() {
        if (confirm('Are you sure you want to end the chat?')) {
            try {
                const response = await fetch('/api/end', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ userId: this.userId })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.showNotification('Chat ended successfully', 'success');
                    localStorage.removeItem('tumi_userId');
                    
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 2000);
                }
            } catch (error) {
                console.error('Error ending chat:', error);
                this.showNotification('Error ending chat', 'error');
            }
        }
    }

    addMessage(sender, content, timestamp = null) {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = `message message-${sender}`;
        
        const time = timestamp ? new Date(timestamp) : new Date();
        const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.innerHTML = `
            <div class="message-content">${this.escapeHtml(content)}</div>
            <div class="message-time">${timeString}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Remove typing indicator if present
        this.hideTypingIndicator();
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;
        
        // Remove existing typing indicator
        this.hideTypingIndicator();
        
        const typingElement = document.createElement('div');
        typingElement.className = 'typing-indicator';
        typingElement.id = 'typingIndicator';
        typingElement.innerHTML = `
            <span>Support is typing</span>
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        messagesContainer.appendChild(typingElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        const statusIndicator = document.getElementById('statusIndicator');
        
        if (statusElement) {
            statusElement.textContent = connected ? 'Connected' : 'Connecting...';
        }
        
        if (statusIndicator) {
            statusIndicator.style.background = connected ? '#4cc9f0' : '#f8961e';
        }
    }

    updateQueueInfo(position, queueSize) {
        // This would be used if we show queue info in chat
        console.log(`Queue: Position ${position}, Size: ${queueSize}`);
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => {
            setTimeout(() => notification.remove(), 100);
        });
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    initParticles() {
        // Only load particles.js if it exists
        if (typeof particlesJS !== 'undefined') {
            particlesJS('particles-js', {
                particles: {
                    number: { value: 80, density: { enable: true, value_area: 800 } },
                    color: { value: "#4cc9f0" },
                    shape: { type: "circle" },
                    opacity: { value: 0.5, random: true },
                    size: { value: 3, random: true },
                    line_linked: {
                        enable: true,
                        distance: 150,
                        color: "#4361ee",
                        opacity: 0.2,
                        width: 1
                    },
                    move: {
                        enable: true,
                        speed: 2,
                        direction: "none",
                        random: true,
                        straight: false,
                        out_mode: "out",
                        bounce: false
                    }
                },
                interactivity: {
                    detect_on: "canvas",
                    events: {
                        onhover: { enable: true, mode: "repulse" },
                        onclick: { enable: true, mode: "push" }
                    }
                }
            });
        }
    }
}

// Initialize the system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.tumiSupport = new TumiSupportSystem();
});