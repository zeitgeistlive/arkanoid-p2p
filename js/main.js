/**
 * Arkanoid P2P - Main Entry Point
 * Orchestrates game engine, networking, levels, and UI
 * Cooperative multiplayer Arkanoid with WebRTC
 */

// ============================================================================
// APPLICATION STATES
// ============================================================================

const APP_STATES = {
    LOADING: 'loading',
    MENU: 'menu',
    ROOM: 'room',
    CONNECTING: 'connecting',
    WAITING: 'waiting',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game_over',
    VICTORY: 'victory',
    ERROR: 'error'
};

// ============================================================================
// MAIN APPLICATION CLASS
// ============================================================================

class ArkanoidP2P {
    constructor() {
        // Core components (imported from other modules)
        this.network = null;
        this.game = null;
        this.levels = null;
        this.ui = null;
        
        // Performance monitoring
        this.perfMonitor = null;
        this.mobileScaler = null;
        this.debouncedUIUpdate = null;
        
        // Application state
        this.state = APP_STATES.LOADING;
        this.previousState = null;
        
        // Game state
        this.isHost = false;
        this.roomCode = null;
        this.playerNum = 1; // 1 for host (bottom), 2 for guest (top)
        
        // Timing
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.accumulatedTime = 0;
        this.fixedTimeStep = 1000 / 60; // 60 FPS physics
        
        // Network timing
        this.lastStateUpdate = 0;
        this.stateUpdateInterval = 1000 / 20; // 20Hz state sync
        this.networkTickAccumulator = 0;
        
        // Input state
        this.localInput = { x: 0.5, fire: false }; // Normalized paddle position (0-1)
        this.remoteInput = { x: 0.5, fire: false };
        this.pendingInputs = []; // For guest reconciliation
        
        // Game configuration
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas?.getContext('2d');
        
        // Cleanup tracking
        this.eventListeners = [];
        this.requestId = null;
        
        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
        this.handleResize = this.handleResize.bind(this);
        
        console.log('[Main] Arkanoid P2P initialized');
    }
    
    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    
    async init() {
        console.log('[Main] Initializing...');
        
        try {
            // Initialize performance monitoring
            if (typeof PerformanceMonitor !== 'undefined') {
                this.perfMonitor = new PerformanceMonitor();
                this.mobileScaler = new MobilePerformanceScaler(this.perfMonitor.getDeviceTier());
                
                // Create debounced UI updater
                this.debouncedUIUpdate = new DebouncedUpdater((gameState) => {
                    this.ui?.updateGameUI(gameState);
                }, 32); // Update UI at most at 30fps
            }
            
            // Initialize canvas
            this.setupCanvas();
            
            // Initialize modules
            this.network = new NetworkModule();
            this.levels = new LevelManager();
            this.game = new Game(this.canvas);
            this.ui = new UIController();
            
            // Set up performance monitoring for game module
            if (typeof setPerformanceMonitors === 'function') {
                setPerformanceMonitors(this.perfMonitor, this.mobileScaler);
            }
            
            // Set up lazy level loading
            if (typeof LazyLevelLoader !== 'undefined') {
                const lazyLoader = new LazyLevelLoader();
                this.levels.setLazyLoader(lazyLoader);
                
                // Preload first few levels during idle time
                this.levels.preloadUpcomingLevels(3);
            }
            
            // Setup UI callbacks
            this.setupUICallbacks();
            
            // Setup network event handlers
            this.setupNetworkHandlers();
            
            // Setup game event handlers
            this.setupGameHandlers();
            
            // Setup input handlers
            this.setupInputHandlers();
            
            // Window resize handling
            window.addEventListener('resize', this.handleResize);
            
            // Mark initialization complete
            this.transitionTo(APP_STATES.MENU);
            
            // Start game loop
            this.requestId = requestAnimationFrame(this.gameLoop);
            
            console.log('[Main] Initialization complete');
        } catch (error) {
            console.error('[Main] Initialization failed:', error);
            this.handleError('Failed to initialize game', error);
        }
    }
    
    setupCanvas() {
        if (!this.canvas) {
            console.error('[Main] Canvas not found');
            return;
        }
        
        // Set initial size
        this.resizeCanvas();
        
        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        this.ctx.scale(dpr, dpr);
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        this.canvas.width = GAME_CONFIG.canvas.width;
        this.canvas.height = GAME_CONFIG.canvas.height;
        
        // CSS display size
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }
    
    handleResize() {
        if (this.canvas) {
            this.resizeCanvas();
        }
    }
    
    // ============================================================================
    // UI CALLBACKS
    // ============================================================================
    
    setupUICallbacks() {
        if (!this.ui) return;
        
        // Navigation
        this.ui.on('createRoom', () => this.createRoom());
        this.ui.on('joinRoom', (code) => this.joinRoom(code));
        this.ui.on('leaveRoom', () => this.leaveRoom());
        this.ui.on('startGame', () => this.startGame());
        
        // Game controls
        this.ui.on('pause', () => this.pauseGame());
        this.ui.on('resume', () => this.resumeGame());
        this.ui.on('restart', () => this.restartGame());
        this.ui.on('returnToMenu', () => this.returnToMenu());
        
        // Settings
        this.ui.on('settingsChanged', (settings) => this.applySettings(settings));
    }
    
    // ============================================================================
    // NETWORK EVENT HANDLERS
    // ============================================================================
    
    setupNetworkHandlers() {
        if (!this.network) return;
        
        // Connection established
        this.network.on('connect', (data) => {
            console.log('[Main] Connected:', data);
            this.onNetworkConnect(data);
        });
        
        // Disconnection
        this.network.on('disconnect', (data) => {
            console.log('[Main] Disconnected:', data);
            this.onNetworkDisconnect(data);
        });
        
        // Message received
        this.network.on('message', (message) => {
            this.onNetworkMessage(message);
        });
        
        // Error
        this.network.on('error', (error) => {
            console.error('[Main] Network error:', error);
            this.handleError('Network error', error);
        });
    }
    
    // ============================================================================
    // GAME EVENT HANDLERS
    // ============================================================================
    
    setupGameHandlers() {
        if (!this.game) return;
        
        // Ball missed (out of bounds)
        this.game.on('ball_miss', (data) => {
            this.onBallMiss(data);
        });
        
        // Block destroyed
        this.game.on('block_destroyed', (data) => {
            this.onBlockDestroyed(data);
        });
        
        // Level complete
        this.game.on('level_complete', () => {
            this.onLevelComplete();
        });
        
        // Game over
        this.game.on('game_over', (data) => {
            this.onGameOver(data);
        });
        
        // Power-up collected
        this.game.on('powerup_collected', (data) => {
            this.onPowerUpCollected(data);
        });
        
        // Ball launched
        this.game.on('ball_launched', () => {
            // Sync ball state immediately
            if (this.isHost) {
                this.sendGameState();
            }
        });
    }
    
    // ============================================================================
    // INPUT HANDLING
    // ============================================================================
    
    setupInputHandlers() {
        if (!this.canvas) return;
        
        // Mouse movement
        this.canvas.addEventListener('mousemove', (e) => {
            this.handleMouseInput(e);
        });
        
        // Touch input
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleTouchInput(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouchInput(e);
            // Also trigger fire on touch
            this.handleInputAction('fire');
        }, { passive: false });
        
        // Click to fire/launch
        this.canvas.addEventListener('mousedown', () => {
            this.handleInputAction('fire');
        });
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardInput(e, true);
        });
        
        document.addEventListener('keyup', (e) => {
            this.handleKeyboardInput(e, false);
        });
        
        // Pause key
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' || e.code === 'KeyP') {
                this.togglePause();
            }
        });
    }
    
    handleMouseInput(e) {
        if (this.state !== APP_STATES.PLAYING) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        
        const x = (e.clientX - rect.left) * scaleX;
        const normalizedX = x / GAME_CONFIG.canvas.width;
        
        this.setLocalInput({ x: clamp(normalizedX, 0, 1) });
    }
    
    handleTouchInput(e) {
        if (this.state !== APP_STATES.PLAYING) return;
        
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        
        const x = (touch.clientX - rect.left) * scaleX;
        const normalizedX = x / GAME_CONFIG.canvas.width;
        
        this.setLocalInput({ x: clamp(normalizedX, 0, 1) });
    }
    
    keyboardState = {
        left: false,
        right: false
    };
    
    handleKeyboardInput(e, isDown) {
        if (this.state !== APP_STATES.PLAYING) return;
        
        const speed = 0.02; // Movement per frame
        
        switch (e.code) {
            case 'ArrowLeft':
            case 'KeyA':
                this.keyboardState.left = isDown;
                if (isDown) {
                    this.setLocalInput({ x: clamp(this.localInput.x - speed, 0, 1) });
                }
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.keyboardState.right = isDown;
                if (isDown) {
                    this.setLocalInput({ x: clamp(this.localInput.x + speed, 0, 1) });
                }
                break;
            case 'Space':
                if (isDown) {
                    this.handleInputAction('fire');
                }
                break;
        }
    }
    
    handleInputAction(action) {
        if (this.state !== APP_STATES.PLAYING) return;
        
        if (action === 'fire') {
            this.localInput.fire = true;
            
            // If guest, send input immediately to host
            if (!this.isHost && this.network) {
                this.network.send({
                    type: MESSAGE_TYPES.INPUT,
                    input: this.localInput,
                    timestamp: Date.now()
                });
            }
            
            // Reset fire after one frame
            setTimeout(() => {
                this.localInput.fire = false;
            }, 50);
        }
    }
    
    setLocalInput(input) {
        this.localInput = { ...this.localInput, ...input };
        
        // Send input to remote if guest
        if (!this.isHost && this.network && this.state === APP_STATES.PLAYING) {
            this.pendingInputs.push({
                input: { ...this.localInput },
                timestamp: Date.now()
            });
            
            this.network.send({
                type: MESSAGE_TYPES.INPUT,
                input: this.localInput,
                timestamp: Date.now()
            });
        }
    }
    
    setRemoteInput(input) {
        this.remoteInput = { ...this.remoteInput, ...input };
    }
    
    // ============================================================================
    // ROOM MANAGEMENT
    // ============================================================================
    
    async createRoom() {
        try {
            this.transitionTo(APP_STATES.CONNECTING);
            this.isHost = true;
            this.playerNum = 1;
            
            const roomCode = await this.network.createRoom();
            this.roomCode = roomCode;
            
            this.ui?.showRoomCode(roomCode);
            this.transitionTo(APP_STATES.WAITING);
            
            console.log('[Main] Room created:', roomCode);
        } catch (error) {
            console.error('[Main] Failed to create room:', error);
            this.handleError('Failed to create room', error);
        }
    }
    
    async joinRoom(code) {
        try {
            this.transitionTo(APP_STATES.CONNECTING);
            this.isHost = false;
            this.playerNum = 2;
            
            await this.network.joinRoom(code);
            this.roomCode = code;
            
            console.log('[Main] Joined room:', code);
        } catch (error) {
            console.error('[Main] Failed to join room:', error);
            this.handleError('Failed to join room', error);
        }
    }
    
    leaveRoom() {
        this.cleanup();
        this.transitionTo(APP_STATES.MENU);
    }
    
    // ============================================================================
    // GAME FLOW
    // ============================================================================
    
    startGame() {
        if (!this.game) return;
        
        // Load first level (levels are 1-indexed)
        const levelData = this.levels.getLevel(1);
        this.game.loadLevel(levelData);
        
        // Reset input states
        this.localInput = { x: 0.5, fire: false };
        this.remoteInput = { x: 0.5, fire: false };
        
        // Set player roles in game engine
        this.game.setPlayerRole(this.isHost, this.playerNum);
        
        this.transitionTo(APP_STATES.PLAYING);
        this.lastFrameTime = performance.now();
        
        console.log('[Main] Game started');
    }
    
    pauseGame() {
        if (this.state === APP_STATES.PLAYING) {
            this.transitionTo(APP_STATES.PAUSED);
        }
    }
    
    resumeGame() {
        if (this.state === APP_STATES.PAUSED) {
            this.transitionTo(APP_STATES.PLAYING);
            this.lastFrameTime = performance.now();
        }
    }
    
    togglePause() {
        if (this.state === APP_STATES.PLAYING) {
            this.pauseGame();
        } else if (this.state === APP_STATES.PAUSED) {
            this.resumeGame();
        }
    }
    
    restartGame() {
        this.game.reset();
        this.startGame();
    }
    
    returnToMenu() {
        this.cleanup();
        this.transitionTo(APP_STATES.MENU);
    }
    
    // ============================================================================
    // NETWORK EVENTS
    // ============================================================================
    
    onNetworkConnect(data) {
        this.isHost = data.isHost;
        this.playerNum = this.isHost ? 1 : 2;
        
        if (this.isHost) {
            // Host waits for game to start
            this.ui?.showStartButton();
        } else {
            // Guest waits for host to start
            this.ui?.showWaitingMessage('Waiting for host to start...');
        }
    }
    
    onNetworkDisconnect(data) {
        const errorMsg = data?.reason === 'peer_disconnected' 
            ? 'Opponent disconnected' 
            : 'Connection failed';
        
        this.ui?.showError(errorMsg);
        this.transitionTo(APP_STATES.MENU);
    }
    
    onNetworkMessage(message) {
        switch (message.type) {
            case MESSAGE_TYPES.INIT:
                // Initial handshake complete
                if (!this.isHost) {
                    this.ui?.showWaitingMessage('Connected! Waiting for host...');
                    this.sendAck();
                }
                break;
                
            case MESSAGE_TYPES.STATE:
                // Host state update
                if (!this.isHost) {
                    this.applyRemoteState(message.data);
                }
                break;
                
            case MESSAGE_TYPES.INPUT:
                // Guest input
                if (this.isHost) {
                    this.setRemoteInput(message.input);
                }
                break;
                
            case MESSAGE_TYPES.LEVEL_COMPLETE:
                this.handleRemoteLevelComplete(message);
                break;
                
            case MESSAGE_TYPES.GAME_OVER:
                this.handleRemoteGameOver(message);
                break;
                
            case MESSAGE_TYPES.BONUS:
                this.handleRemoteBonus(message);
                break;
        }
    }
    
    sendAck() {
        this.network?.send({
            type: MESSAGE_TYPES.INIT,
            ack: true,
            timestamp: Date.now()
        });
    }
    
    // ============================================================================
    // GAME EVENTS
    // ============================================================================
    
    onBallMiss(data) {
        // Update lives
        const lives = this.game.getLives();
        this.ui?.updateLives(lives);
        
        // Sync with remote
        if (this.isHost && this.state === APP_STATES.PLAYING) {
            this.sendGameState();
        }
        
        // Check game over
        if (lives.player1 <= 0 && lives.player2 <= 0) {
            this.onGameOver({ reason: 'out_of_lives' });
        }
    }
    
    onBlockDestroyed(data) {
        // Update score
        const score = this.game.getScore();
        this.ui?.updateScore(score);
        
        // Check for level complete
        if (this.game.allBlocksDestroyed()) {
            this.onLevelComplete();
        } else if (this.isHost) {
            // Sync state periodically after significant events
            this.sendGameState();
        }
    }
    
    onLevelComplete() {
        const nextLevelIndex = this.levels.currentLevel + 1;
        
        if (nextLevelIndex >= LevelManager.TOTAL_LEVELS) {
            // All levels complete - victory!
            this.transitionTo(APP_STATES.VICTORY);
            this.network?.send({
                type: MESSAGE_TYPES.LEVEL_COMPLETE,
                victory: true
            });
        } else {
            // Advance to next level
            LevelManager.currentLevel = nextLevelIndex;
            const levelData = this.levels.getLevel(nextLevelIndex);
            
            // Notify remote
            this.network?.send({
                type: MESSAGE_TYPES.LEVEL_COMPLETE,
                level: nextLevelIndex
            });
            
            // Load next level after short delay
            setTimeout(() => {
                this.game.loadLevel(levelData);
                this.ui?.showLevelStart(nextLevelIndex + 1, levelData.name);
            }, 1000);
        }
    }
    
    onGameOver(data) {
        this.transitionTo(APP_STATES.GAME_OVER);
        this.network?.send({
            type: MESSAGE_TYPES.GAME_OVER,
            ...data
        });
    }
    
    onPowerUpCollected(data) {
        // Update UI
        this.ui?.showPowerUpMessage(data.type);
        
        // Sync with remote
        if (this.isHost) {
            this.network?.send({
                type: MESSAGE_TYPES.BONUS,
                ...data
            });
        }
    }
    
    // ============================================================================
    // STATE SYNCHRONIZATION
    // ============================================================================
    
    sendGameState() {
        if (!this.isHost || !this.game) return;
        
        const state = this.game.getFullState();
        this.network?.send({
            type: MESSAGE_TYPES.STATE,
            data: state,
            timestamp: Date.now()
        });
        
        this.lastStateUpdate = Date.now();
    }
    
    applyRemoteState(state) {
        if (this.isHost || !this.game) return;
        
        // Apply state reconciliation
        this.game.reconcileState(state);
        
        // Remove acknowledged inputs from pending queue
        if (state.lastProcessedInput) {
            this.pendingInputs = this.pendingInputs.filter(
                input => input.timestamp > state.lastProcessedInput
            );
        }
    }
    
    // ============================================================================
    // GAME LOOP
    // ============================================================================
    
    gameLoop(currentTime) {
        // Calculate delta time
        this.deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        
        // Cap delta time to prevent huge jumps
        const dt = Math.min(this.deltaTime, 100);
        
        // Update performance monitor
        if (this.perfMonitor) {
            this.perfMonitor.update(dt);
        }
        
        // Update
        this.update(dt);
        
        // Render
        this.render();
        
        // Schedule next frame
        this.requestId = requestAnimationFrame(this.gameLoop);
    }
    
    update(dt) {
        // Handle keyboard continuous input
        this.updateKeyboardInput();
        
        // Network updates
        if (this.state === APP_STATES.PLAYING) {
            this.updateNetwork(dt);
        }
        
        // Game updates
        if (this.state === APP_STATES.PLAYING && this.game) {
            // Convert ms to seconds for game engine
            const dtSeconds = dt / 1000;
            
            // Set both paddle positions
            if (this.isHost) {
                this.game.setPaddlePosition(1, this.localInput.x);
                this.game.setPaddlePosition(2, this.remoteInput.x);
                this.game.setInput(2, this.remoteInput.fire);
            } else {
                this.game.setPaddlePosition(1, this.remoteInput.x);
                this.game.setPaddlePosition(2, this.localInput.x);
                this.game.setInput(2, this.localInput.fire);
            }
            
            // Update game
            this.game.update(dtSeconds);
        }
    }
    
    updateKeyboardInput() {
        if (this.state !== APP_STATES.PLAYING) return;
        
        const speed = 0.03;
        if (this.keyboardState.left) {
            this.setLocalInput({ x: clamp(this.localInput.x - speed, 0, 1) });
        }
        if (this.keyboardState.right) {
            this.setLocalInput({ x: clamp(this.localInput.x + speed, 0, 1) });
        }
    }
    
    updateNetwork(dt) {
        this.networkTickAccumulator += dt;
        
        // Host sends state at 20Hz
        if (this.isHost && this.networkTickAccumulator >= this.stateUpdateInterval) {
            this.sendGameState();
            this.networkTickAccumulator = 0;
        }
    }
    
    render() {
        if (!this.ctx || !this.canvas) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render game if playing or paused
        if ((this.state === APP_STATES.PLAYING || this.state === APP_STATES.PAUSED) && this.game) {
            this.game.render(this.ctx);
        }
        
        // Render UI overlay based on state
        this.renderUI();
    }
    
    renderUI() {
        switch (this.state) {
            case APP_STATES.LOADING:
                this.ui?.drawLoadingScreen(this.ctx);
                break;
            case APP_STATES.MENU:
                this.ui?.drawMenu(this.ctx);
                break;
            case APP_STATES.PAUSED:
                this.ui?.drawPauseOverlay(this.ctx);
                break;
            case APP_STATES.GAME_OVER:
                this.ui?.drawGameOverScreen(this.ctx, this.game?.getScore());
                break;
            case APP_STATES.VICTORY:
                this.ui?.drawVictoryScreen(this.ctx, this.game?.getScore());
                break;
        }
    }
    
    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================
    
    transitionTo(newState) {
        console.log(`[Main] Transition: ${this.state} -> ${newState}`);
        this.previousState = this.state;
        this.state = newState;
        
        // Notify UI
        this.ui?.onStateChange(newState, this.previousState);
        
        // State-specific actions
        switch (newState) {
            case APP_STATES.PLAYING:
                this.lastFrameTime = performance.now();
                break;
            case APP_STATES.MENU:
                this.cleanupGame();
                break;
        }
    }
    
    // ============================================================================
    // CLEANUP
    // ============================================================================
    
    cleanup() {
        console.log('[Main] Cleaning up...');
        
        // Stop game loop
        if (this.requestId) {
            cancelAnimationFrame(this.requestId);
            this.requestId = null;
        }
        
        // Disconnect network
        this.network?.disconnect?.();
        
        // Cleanup game
        this.cleanupGame();
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        
        console.log('[Main] Cleanup complete');
    }
    
    cleanupGame() {
        this.game?.reset?.();
        this.pendingInputs = [];
        this.localInput = { x: 0.5, fire: false };
        this.remoteInput = { x: 0.5, fire: false };
    }
    
    // ============================================================================
    // ERROR HANDLING
    // ============================================================================
    
    handleError(message, error) {
        console.error('[Main] Error:', message, error);
        this.ui?.showError(message);
        this.transitionTo(APP_STATES.ERROR);
    }
    
    applySettings(settings) {
        // Apply game settings
        if (settings.sound !== undefined) {
            this.game?.setSoundEnabled(settings.sound);
        }
        if (settings.particles !== undefined) {
            this.game?.setParticlesEnabled(settings.particles);
        }
    }
    
    // Remote event handlers
    handleRemoteLevelComplete(message) {
        if (message.victory) {
            this.transitionTo(APP_STATES.VICTORY);
        } else if (message.level !== undefined) {
            LevelManager.currentLevel = message.level;
            const levelData = this.levels.getLevel(message.level);
            this.game.loadLevel(levelData);
        }
    }
    
    handleRemoteGameOver(message) {
        this.transitionTo(APP_STATES.GAME_OVER);
    }
    
    handleRemoteBonus(message) {
        // Apply remote bonus if needed
        this.game?.applyExternalBonus?.(message);
    }
}

// ============================================================================
// GLOBAL HELPERS
// ============================================================================

// Expose to window for debugging
window.ArkanoidP2P = ArkanoidP2P;

// ============================================================================
// ENTRY POINT
// ============================================================================

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Main] DOM loaded, initializing Arkanoid P2P...');
    
    const game = new ArkanoidP2P();
    game.init();
    
    // Store global reference
    window.arkanoidGame = game;
    
    // Handle page unload
    window.addEventListener('beforeunload', () => {
        game.cleanup();
    });
});

// Handle visibility change (pause when tab is hidden)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.arkanoidGame?.state === APP_STATES.PLAYING) {
        window.arkanoidGame.pauseGame();
    }
});

console.log('[Main] main.js loaded');
