/**
 * Arkanoid P2P - Main Entry Point
 * Orchestrates game engine, networking, levels, and UI
 * Cooperative multiplayer Arkanoid with WebRTC
 * 
     * ITERATION 11: Progression System
     * - Achievement system (first win, combo master, speed demon)
     * - LocalStorage high scores and player statistics
     * - Tutorial overlay for first-time players
     * - Level unlock progression
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
// JITTER BUFFER FOR STATE INTERPOLATION
// ============================================================================

class JitterBuffer {
    constructor(config = {}) {
        this.minSize = config.minSize || 2;
        this.maxSize = config.maxSize || 8;
        this.maxDelay = config.maxDelay || 100;
        this.smoothing = config.smoothingFactor || 0.3;
        
        this.buffer = [];
        this.lastProcessedTime = 0;
        this.targetDelay = this.maxDelay / 2;
        this.currentDelay = this.targetDelay;
    }
    
    // Add incoming state to buffer with sequence number
    add(state, timestamp, sequence) {
        const entry = { state, timestamp, sequence, receivedAt: performance.now() };
        
        // Insert in order
        const insertIndex = this.buffer.findIndex(e => e.sequence > sequence);
        if (insertIndex === -1) {
            this.buffer.push(entry);
        } else {
            this.buffer.splice(insertIndex, 0, entry);
        }
        
        // Remove duplicates and limit size
        this.buffer = this.buffer.filter((e, i, arr) => 
            i === arr.findIndex(t => t.sequence === e.sequence)
        ).slice(-this.maxSize);
    }
    
    // Get next state to process, accounting for jitter
    get() {
        if (this.buffer.length < this.minSize) {
            return null; // Not enough buffered
        }
        
        const now = performance.now();
        this.currentDelay += (this.targetDelay - this.currentDelay) * this.smoothing;
        
        // Find oldest entry that satisfies our delay requirement
        const targetTime = now - this.currentDelay;
        const entry = this.buffer.find(e => e.receivedAt <= targetTime);
        
        if (entry) {
            this.buffer = this.buffer.filter(e => e !== entry);
            return entry.state;
        }
        
        return null;
    }
    
    // Get interpolated state between buffered states
    interpolate(alpha = 0.5) {
        if (this.buffer.length < 2) return null;
        
        const [older, newer] = this.buffer.slice(0, 2);
        return this._interpolateStates(older.state, newer.state, alpha);
    }
    
    _interpolateStates(a, b, t) {
        const result = { ...a };
        
        // Interpolate positions
        if (a.ball && b.ball) {
            result.ball = {
                x: a.ball.x + (b.ball.x - a.ball.x) * t,
                y: a.ball.y + (b.ball.y - a.ball.y) * t,
                vx: a.ball.vx + (b.ball.vx - a.ball.vx) * t,
                vy: a.ball.vy + (b.ball.vy - a.ball.vy) * t
            };
        }
        
        // Interpolate paddles
        if (a.paddles && b.paddles) {
            result.paddles = [
                { x: a.paddles[0].x + (b.paddles[0].x - a.paddles[0].x) * t },
                { x: a.paddles[1].x + (b.paddles[1].x - a.paddles[1].x) * t }
            ];
        }
        
        return result;
    }
    
    clear() {
        this.buffer = [];
    }
}

// ============================================================================
// INPUT PREDICTOR FOR GUEST
// ============================================================================

class InputPredictor {
    constructor() {
        this.history = []; // Last N inputs for prediction
        this.maxHistory = 5;
        this.predictedInput = { x: 0.5, fire: false };
        this.confidence = 0;
    }
    
    // Record actual input for learning
    record(input) {
        this.history.push({ ...input, timestamp: performance.now() });
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }
    
    // Predict next input based on velocity
    predict(dt) {
        if (this.history.length < 2) {
            return this.predictedInput;
        }
        
        const current = this.history[this.history.length - 1];
        const previous = this.history[this.history.length - 2];
        
        // Calculate velocity
        const dt_historical = current.timestamp - previous.timestamp;
        if (dt_historical <= 0) return current;
        
        const velocityX = (current.x - previous.x) / dt_historical;
        
        // Predict next position based on velocity
        const predictionTime = dt || 16; // Default to ~60fps
        let predictedX = current.x + velocityX * predictionTime;
        
        // Clamp to valid range
        predictedX = Math.max(0, Math.min(1, predictedX));
        
        // Calculate confidence based on velocity consistency
        if (this.history.length >= 3) {
            const v1 = (this.history[1].x - this.history[0].x) / 
                       (this.history[1].timestamp - this.history[0].timestamp);
            const v2 = velocityX;
            const velocityChange = Math.abs(v2 - v1);
            this.confidence = Math.max(0, 1 - velocityChange * 10);
        }
        
        this.predictedInput = {
            x: predictedX,
            fire: false // Don't predict fire action
        };
        
        return this.predictedInput;
    }
    
    // Reconcile prediction with actual server correction
    reconcile(predictedTimestamp, actualInput, serverTimestamp) {
        // Remove acknowledged inputs from history
        this.history = this.history.filter(h => h.timestamp > predictedTimestamp);
        
        // Calculate prediction error
        if (this.history.length > 0) {
            const error = Math.abs(this.predictedInput.x - actualInput.x);
            // High error reduces confidence
            this.confidence = Math.max(0, this.confidence - error * 2);
        }
    }
}

// ============================================================================
// LAG COMPENSATION MODULE
// ============================================================================

class LagCompensator {
    constructor() {
        this.stateHistory = []; // History of local states
        this.maxHistorySize = 60; // ~1 second at 60fps
        this.latency = 0;
    }
    
    recordLocalState(state, timestamp) {
        this.stateHistory.push({ state, timestamp });
        if (this.stateHistory.length > this.maxHistorySize) {
            this.stateHistory.shift();
        }
    }
    
    // Rewind to state at a specific time (for server reconciliation)
    getStateAtTime(targetTime) {
        // Find closest state
        const idx = this.stateHistory.findIndex(h => h.timestamp >= targetTime);
        if (idx === -1) return null;
        if (idx === 0) return this.stateHistory[0].state;
        
        // Interpolate between states
        const a = this.stateHistory[idx - 1];
        const b = this.stateHistory[idx];
        const t = (targetTime - a.timestamp) / (b.timestamp - a.timestamp);
        
        return this._interpolateStates(a.state, b.state, t);
    }
    
    // Apply correction from server and replay inputs
    reconcile(serverState, serverTimestamp, pendingInputs) {
        // Find state at server processing time
        const historicalState = this.getStateAtTime(serverTimestamp);
        if (!historicalState) return serverState;
        
        // Calculate error
        const error = this._calculateError(historicalState, serverState);
        
        // If error is small, just accept server state
        if (error < 0.01) {
            return this._applyPendingInputs(serverState, pendingInputs);
        }
        
        // For larger errors, snap to server state with smoothing
        const alpha = 0.3; // Smoothing factor
        const smoothedState = this._smoothStates(historicalState, serverState, alpha);
        
        // Replay pending inputs
        return this._applyPendingInputs(smoothedState, pendingInputs);
    }
    
    _calculateError(a, b) {
        let error = 0;
        if (a.ball && b.ball) {
            error += Math.abs(a.ball.x - b.ball.x);
            error += Math.abs(a.ball.y - b.ball.y);
        }
        return error;
    }
    
    _applyPendingInputs(state, inputs) {
        // Apply inputs in order
        for (const input of inputs) {
            // Apply input to state (simplified - actual game logic needed)
            if (input.input && state.paddles) {
                state.paddles[1] = { x: input.input.x };
            }
        }
        return state;
    }
    
    _smoothStates(a, b, alpha) {
        const result = { ...a };
        if (a.ball && b.ball) {
            result.ball = {
                x: a.ball.x * (1 - alpha) + b.ball.x * alpha,
                y: a.ball.y * (1 - alpha) + b.ball.y * alpha
            };
        }
        return result;
    }
    
    _interpolateStates(a, b, t) {
        const result = { ...a };
        if (a.ball && b.ball) {
            result.ball = {
                x: a.ball.x + (b.ball.x - a.ball.x) * t,
                y: a.ball.y + (b.ball.y - a.ball.y) * t
            };
        }
        return result;
    }
}

// ============================================================================
// DESYNC DETECTOR
// ============================================================================

class DesyncDetector {
    constructor(threshold = 0.05) {
        this.threshold = threshold; // Position difference threshold
        this.desyncCount = 0;
        this.lastDesyncTime = 0;
        this.desyncHistory = [];
    }
    
    checkForDesync(localState, remoteState, timestamp) {
        if (!localState || !remoteState) return false;
        
        let desyncDetected = false;
        let desyncMagnitude = 0;
        
        // Check ball position
        if (localState.ball && remoteState.ball) {
            const dx = localState.ball.x - remoteState.ball.x;
            const dy = localState.ball.y - remoteState.ball.y;
            const ballError = Math.sqrt(dx * dx + dy * dy);
            
            if (ballError > this.threshold) {
                desyncDetected = true;
                desyncMagnitude = ballError;
            }
        }
        
        // Check paddle positions
        if (localState.paddles && remoteState.paddles) {
            for (let i = 0; i < Math.min(localState.paddles.length, remoteState.paddles.length); i++) {
                const paddleError = Math.abs(localState.paddles[i].x - remoteState.paddles[i].x);
                if (paddleError > this.threshold) {
                    desyncDetected = true;
                    desyncMagnitude = Math.max(desyncMagnitude, paddleError);
                }
            }
        }
        
        if (desyncDetected) {
            const timeSinceLastDesync = timestamp - this.lastDesyncTime;
            this.lastDesyncTime = timestamp;
            this.desyncCount++;
            
            this.desyncHistory.push({
                timestamp,
                magnitude: desyncMagnitude,
                timeSinceLast: timeSinceLastDesync
            });
            
            // Keep only recent history
            const cutoff = timestamp - 10000; // 10 seconds
            this.desyncHistory = this.desyncHistory.filter(d => d.timestamp > cutoff);
            
            return {
                detected: true,
                magnitude: desyncMagnitude,
                frequency: this.desyncHistory.length / 10 // per second
            };
        }
        
        return { detected: false };
    }
    
    shouldForceResync() {
        // Force resync if desync frequency is too high
        return this.desyncHistory.length > 5; // More than 5 desyncs in 10 seconds
    }
}

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
        
        // ==================== SYNC ENHANCEMENTS ====================
        // Jitter buffer for smooth state interpolation (initialized after network setup)
        this.jitterBuffer = null; // Will be initialized in init()
        
        // Input prediction for guest
        this.inputPredictor = new InputPredictor();
        
        // Lag compensation
        this.lagCompensator = new LagCompensator();
        
        // Desync detection
        this.desyncDetector = new DesyncDetector(0.05);
        
        // State interpolation
        this.targetState = null;
        this.currentStateInterpolation = 0;
        this.stateInterpolationSpeed = 0.15; // Interpolation factor per frame
        
        // Delta compression
        this.lastInputSent = 0;
        this.inputSendInterval = 1000 / 30; // Send inputs at 30Hz minimum
        
        // Sequence numbers for reliability
        this.inputSequence = 0;
        this.lastAcknowledgedInput = 0;
        
        // Smooth display positions (reduce visual jitter)
        this.displayPaddlePosition = 0.5;
        this.displayBallPosition = { x: 0.5, y: 0.5 };
        
        // Game configuration
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas?.getContext('2d');
        
        // Cleanup tracking
        this.eventListeners = [];
        this.requestId = null;
        
        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
        this.handleResize = this.handleResize.bind(this);
        
        console.log('[Main] Arkanoid P2P initialized with enhanced sync');
    }
    
    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    
    async init() {
        console.log('[Main] Initializing...');
        
        try {
            // Check browser capabilities and show warnings
            checkBrowserCapabilities();
            
            // Setup error boundary
            this.setupErrorBoundary();
            
            // Setup offline detection
            this.setupOfflineDetection();
            
            // Setup keyboard accessibility
            this.setupAccessibility();
            
            // Initialize performance monitoring
            if (typeof PerformanceMonitor !== 'undefined') {
                this.perfMonitor = new PerformanceMonitor();
                this.mobileScaler = new MobilePerformanceScaler(this.perfMonitor.getDeviceTier());
                
                // Create debounced UI updater
                this.debouncedUIUpdate = new DebouncedUpdater((gameState) => {
                    this.ui?.updateGameUI(gameState);
                }, 32); // Update UI at most at 30fps
            }
            
            // Initialize progression system
            this.initProgression();
            
            // Initialize canvas
            this.setupCanvas();
            
            // Initialize modules
            this.network = new NetworkModule();
            this.levels = new LevelManager();
            this.game = new Game(this.canvas);
            this.ui = new UIController();
            
            // Initialize jitter buffer now that network is available
            this.jitterBuffer = new JitterBuffer({
                minSize: 2,
                maxSize: 6,
                maxDelay: 100 + (this.network.getLatency?.() || 100),
                smoothingFactor: 0.3
            });
            
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
            
            // Setup progression event handlers
            this.setupProgressionHandlers();
            
            // Setup input handlers
            this.setupInputHandlers();
            
            // Window resize handling
            window.addEventListener('resize', this.handleResize);
            
            // Mark initialization complete
            this.transitionTo(APP_STATES.MENU);
            
            // Start game loop
            this.requestId = requestAnimationFrame(this.gameLoop);
            
            // Show tutorial for first-time players
            this.showTutorialIfNeeded();
            
            // Apply saved settings
            this.applySettings();
            
            console.log('[Main] Initialization complete');
        } catch (error) {
            console.error('[Main] Initialization failed:', error);
            this.handleFatalError('Failed to initialize game', error);
        }
    }
    
    applySettings() {
        // Apply settings from SettingsManager
        if (typeof SettingsManager !== 'undefined') {
            const settings = SettingsManager.getAll();
            
            // Apply audio volume
            if (typeof audioSynth !== 'undefined' && audioSynth.setVolume) {
                audioSynth.setVolume(settings.audioVolume);
            }
            
            console.log('[Main] Settings applied:', settings);
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
            // Play block destroy sound (deterministic, both players hear it)
            if (typeof audioSynth !== 'undefined') {
                audioSynth.blockDestroy(data.block?.hp || 1);
            }
        });
        
        // Level complete
        this.game.on('level_complete', () => {
            this.onLevelComplete();
            // Play level complete fanfare
            if (typeof audioSynth !== 'undefined') {
                audioSynth.levelComplete();
            }
        });
        
        // Game over
        this.game.on('game_over', (data) => {
            this.onGameOver(data);
            // Play game over sound
            if (typeof audioSynth !== 'undefined') {
                audioSynth.gameOver();
            }
        });
        
        // Power-up collected (note: event name is 'powerup_collect' from game.js)
        this.game.on('powerup_collect', (data) => {
            this.onPowerUpCollected(data);
            // Play power-up pickup sound
            if (typeof audioSynth !== 'undefined') {
                audioSynth.powerUp();
            }
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
            
            // If guest, send input immediately to host (bypass throttling for fire)
            if (!this.isHost && this.network) {
                this.sendInput();
            }
            
            // Reset fire after one frame
            setTimeout(() => {
                this.localInput.fire = false;
            }, 50);
        }
    }
    
    setLocalInput(input) {
        const previousInput = { ...this.localInput };
        this.localInput = { ...this.localInput, ...input };
        
        // Record for prediction
        this.inputPredictor.record(this.localInput);
        
        // Send input to remote if guest
        if (!this.isHost && this.network && this.state === APP_STATES.PLAYING) {
            // Add to pending for reconciliation
            this.pendingInputs.push({
                input: { ...this.localInput },
                sequence: ++this.inputSequence,
                timestamp: Date.now()
            });
            
            // Throttle input sending
            const now = Date.now();
            if (now - this.lastInputSent >= this.inputSendInterval) {
                this.sendInput();
                this.lastInputSent = now;
            }
        }
        
        // Smooth display position update
        this.displayPaddlePosition += (this.localInput.x - this.displayPaddlePosition) * 0.5;
    }
    
    sendInput() {
        if (!this.network) return;
        
        // Use delta compression when possible
        const useDelta = typeof this.network.sendInputDelta === 'function';
        
        if (useDelta) {
            const sent = this.network.sendInputDelta({
                ...this.localInput,
                sequence: this.inputSequence
            });
            
            // Fall back to full input if delta wasn't sent (no change)
            if (!sent) {
                this.network.send({
                    type: MESSAGE_TYPES.INPUT,
                    input: this.localInput,
                    sequence: this.inputSequence,
                    timestamp: Date.now()
                });
            }
        } else {
            this.network.send({
                type: MESSAGE_TYPES.INPUT,
                input: this.localInput,
                sequence: this.inputSequence,
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
        
        // Start tracking game session for progression
        this.startGameSession();
        
        // Load first level (levels are 1-indexed)
        const levelData = this.levels.getLevel(1);
        this.game.loadLevel(levelData);
        
        // Start tracking first level for progression
        this.startLevel(1);
        
        // Reset input states
        this.localInput = { x: 0.5, fire: false };
        this.remoteInput = { x: 0.5, fire: false };
        this.displayPaddlePosition = 0.5;
        this.displayBallPosition = { x: 0.5, y: 0.5 };
        
        // Reset sync systems
        this.jitterBuffer?.clear();
        this.pendingInputs = [];
        this.inputSequence = 0;
        this.lastAcknowledgedInput = 0;
        this.inputPredictor = new InputPredictor();
        this.lagCompensator = new LagCompensator();
        this.desyncDetector = new DesyncDetector(0.05);
        
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
                    this.handleRemoteState(message);
                }
                break;
                
            case MESSAGE_TYPES.INPUT:
                // Guest input
                if (this.isHost) {
                    this.setRemoteInput(message.input);
                    // Send acknowledgment
                    this.network?.send({
                        type: MESSAGE_TYPES.STATE_ACK,
                        lastProcessedInput: message.sequence,
                        timestamp: Date.now()
                    });
                }
                break;
                
            case MESSAGE_TYPES.INPUT_DELTA:
                // Delta-compressed guest input
                if (this.isHost && message.delta) {
                    // Reconstruct full input from delta
                    const fullX = message.fullX || (this.remoteInput.x + message.delta.dx);
                    this.setRemoteInput({
                        x: fullX,
                        fire: message.delta.fire !== undefined ? message.delta.fire : this.remoteInput.fire,
                        sequence: message.delta.seq
                    });
                    // Send acknowledgment
                    this.network?.send({
                        type: MESSAGE_TYPES.STATE_ACK,
                        lastProcessedInput: message.delta.seq,
                        timestamp: Date.now()
                    });
                }
                break;
                
            case MESSAGE_TYPES.STATE_ACK:
                // Input acknowledgment from host
                if (!this.isHost && message.lastProcessedInput) {
                    this.lastAcknowledgedInput = message.lastProcessedInput;
                    // Remove acknowledged inputs
                    this.pendingInputs = this.pendingInputs.filter(
                        input => input.sequence > message.lastProcessedInput
                    );
                    // Update predictor
                    this.inputPredictor.reconcile(
                        message.timestamp,
                        this.localInput,
                        message.timestamp
                    );
                }
                break;
                
            case MESSAGE_TYPES.DESYNC_CHECK:
                // Desync detection check
                if (message.checksum) {
                    const localChecksum = this.calculateGameStateChecksum();
                    if (localChecksum !== message.checksum) {
                        console.warn('[Main] Desync detected! Requesting state sync...');
                        if (this.isHost) {
                            this.sendGameState();
                        }
                    }
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
        
        // Track block destruction for progression
        if (this.progression) {
            this.progression.onBlockDestroyed();
        }
        
        // Check for level complete
        if (this.game.allBlocksDestroyed()) {
            this.onLevelComplete();
        } else if (this.isHost) {
            // Sync state periodically after significant events
            this.sendGameState();
        }
    }
    
    onLevelComplete() {
        const completedLevelIndex = this.levels.currentLevel + 1;
        const totalScore = this.game?.getScore?.() || 0;
        
        // Track level completion for progression
        const progressionResult = this.completeLevel(true, totalScore);
        
        if (progressionResult.newAchievements?.length > 0) {
            // Achievements will be shown automatically via the achievement notification system
            console.log('[Main] New achievements:', progressionResult.newAchievements.map(a => a.name));
        }
        
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
            
            // Start tracking new level for progression
            this.startLevel(nextLevelIndex + 1);
            
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
        const totalScore = this.game?.getScore?.() || 0;
        
        // Track game over for progression
        this.completeLevel(false, totalScore);
        
        this.transitionTo(APP_STATES.GAME_OVER);
        this.network?.send({
            type: MESSAGE_TYPES.GAME_OVER,
            ...data
        });
    }
    
    onPowerUpCollected(data) {
        // Track for progression
        this.progression?.onPowerUpCollected();
        
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
    // STATE SYNCHRONIZATION WITH JITTER BUFFER & INTERPOLATION
    // ============================================================================
    
    sendGameState() {
        if (!this.isHost || !this.game) return;
        
        const state = this.game.getFullState();
        const timestamp = Date.now();
        
        this.network?.send({
            type: MESSAGE_TYPES.STATE,
            data: state,
            timestamp: timestamp,
            sequence: Math.floor(timestamp / 50) // ~20Hz sequence
        });
        
        this.lastStateUpdate = timestamp;
        
        // Send periodic desync check
        if (Math.random() < 0.1) { // 10% chance
            this.network?.send({
                type: MESSAGE_TYPES.DESYNC_CHECK,
                checksum: this.calculateGameStateChecksum(),
                timestamp: timestamp
            });
        }
    }
    
    calculateGameStateChecksum() {
        // Simple checksum for desync detection
        const state = this.game?.getFullState();
        if (!state) return 0;
        
        let checksum = 0;
        if (state.ball) {
            checksum += Math.floor(state.ball.x * 100) ^ Math.floor(state.ball.y * 100);
        }
        if (state.paddles) {
            checksum += Math.floor(state.paddles[0]?.x * 100 || 0);
            checksum += Math.floor(state.paddles[1]?.x * 100 || 0) << 8;
        }
        return checksum & 0xFFFF;
    }
    
    handleRemoteState(message) {
        if (this.isHost || !this.game) return;
        
        const { data: state, timestamp, sequence } = message;
        
        // Add to jitter buffer (skip if not initialized yet)
        if (this.jitterBuffer) {
            this.jitterBuffer.add(state, timestamp, sequence || 0);
        }
        
        // Cache for interpolation
        this.targetState = state;
    }
    
    applyRemoteState(state) {
        // Apply state reconciliation with lag compensation
        if (this.pendingInputs.length > 0 && this.lagCompensator) {
            const reconciled = this.lagCompensator.reconcile(
                state,
                Date.now() - this.network.getLatency(),
                this.pendingInputs
            );
            this.game.reconcileState(reconciled);
        } else {
            this.game.reconcileState(state);
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
                // Guest: Use predicted input locally
                const predictedInput = this.inputPredictor.predict(dt);
                this.game.setPaddlePosition(1, this.remoteInput.x);
                this.game.setPaddlePosition(2, predictedInput.x);
                this.game.setInput(2, this.localInput.fire);
            }
            
            // Get smoothed state from jitter buffer for guest
            if (!this.isHost && this.targetState && this.jitterBuffer) {
                const bufferedState = this.jitterBuffer.get();
                if (bufferedState) {
                    this.applyRemoteState(bufferedState);
                } else {
                    // Interpolate towards target state
                    this.currentStateInterpolation = Math.min(
                        1,
                        this.currentStateInterpolation + this.stateInterpolationSpeed
                    );
                    const interpolatedState = this.jitterBuffer.interpolate(
                        this.currentStateInterpolation
                    );
                    if (interpolatedState) {
                        this.applyRemoteState(interpolatedState);
                    }
                }
            }
            
            // Check for desyncs
            if (!this.isHost && this.targetState) {
                const currentGameState = this.game.getFullState();
                const desyncResult = this.desyncDetector.checkForDesync(
                    currentGameState,
                    this.targetState,
                    Date.now()
                );
                
                if (desyncResult.detected) {
                    console.warn(`[Main] Desync detected: magnitude=${desyncResult.magnitude.toFixed(3)}, frequency=${desyncResult.frequency.toFixed(2)}/s`);
                    
                    if (this.desyncDetector.shouldForceResync()) {
                        // Force immediate state application
                        this.applyRemoteState(this.targetState);
                    }
                }
            }
            
            // Update game
            this.game.update(dtSeconds);
            
            // Record state for lag compensation
            if (!this.isHost) {
                this.lagCompensator.recordLocalState(
                    this.game.getFullState(),
                    Date.now()
                );
            }
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
        
        // Guest sends inputs more frequently (throttled in setLocalInput)
        if (!this.isHost && this.pendingInputs.length > 0) {
            const now = Date.now();
            if (now - this.lastInputSent >= this.inputSendInterval) {
                this.sendInput();
                this.lastInputSent = now;
            }
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
        
        // Render network debug info if needed
        if (this.state === APP_STATES.PLAYING && this.network) {
            this.renderNetworkDebug();
        }
    }
    
    renderNetworkDebug() {
        const stats = this.network.getNetworkStats?.() || {};
        const latency = stats.latency || 0;
        const jitter = stats.jitter || 0;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(5, 5, 120, 50);
        this.ctx.fillStyle = '#0f0';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`Ping: ${latency}ms`, 10, 20);
        this.ctx.fillText(`Jitter: ${jitter.toFixed(1)}ms`, 10, 35);
        this.ctx.fillText(`Inputs: ${this.pendingInputs.length}`, 10, 50);
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
        this.jitterBuffer?.clear();
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
    
    // ============================================================================
    // PROGRESSION SYSTEM
    // ============================================================================
    
    initProgression() {
        // ProgressionManager is already initialized globally in progression.js
        // Store reference for easy access
        this.progression = window.progressionManager;
        
        if (!this.progression) {
            console.warn('[Main] Progression manager not available');
            return;
        }
        
        console.log('[Main] Progression system initialized');
        console.log('[Main] Unlocked levels:', this.progression.getHighestUnlockedLevel());
        console.log('[Main] Achievements unlocked:', this.progression.getUnlockedAchievements().length);
    }
    
    setupProgressionHandlers() {
        if (!this.progression) return;
        
        // Listen for achievement unlocks
        window.addEventListener('achievement-unlocked', (e) => {
            console.log('[Progression] Achievement unlocked:', e.detail.name);
        });
        
        // Listen for level unlocks
        window.addEventListener('level-unlocked', (e) => {
            console.log('[Progression] Level unlocked:', e.detail.level);
        });
    }
    
    showTutorialIfNeeded() {
        if (!this.progression) return;
        
        if (!this.progression.hasSeenTutorial()) {
            // Show tutorial after a short delay
            setTimeout(() => {
                const tutorial = new TutorialOverlay('game-container');
                tutorial.show(() => {
                    // Tutorial complete
                    console.log('[Progression] Tutorial completed');
                });
            }, 500);
        }
    }
    
    // Called when a new game session starts
    startGameSession() {
        if (this.progression) {
            // Determine if multiplayer
            const isMultiplayer = !!this.network?.isConnected?.();
            this.progression.startGameSession(isMultiplayer);
        }
    }
    
    // Called when a level starts
    startLevel(levelNumber) {
        if (this.progression) {
            const isMultiplayer = !!this.network?.isConnected?.();
            this.progression.startLevel(levelNumber, isMultiplayer);
        }
    }
    
    // Called when a level completes
    completeLevel(completed, finalScore) {
        if (!this.progression) return { completed };
        
        const result = this.progression.endLevel(completed, finalScore);
        
        // Update high score display if applicable
        if (result.highScoreRank) {
            console.log('[Progression] New high score! Rank:', result.highScoreRank);
        }
        
        return result;
    }
    
    // Called when a block is destroyed
    onBlockDestroyed(data) {
        if (this.progression) {
            this.progression.onBlockDestroyed();
        }
    }
    
    // Called when combo breaks
    onComboBreak() {
        if (this.progression) {
            this.progression.onComboBreak();
        }
    }
    
    // Called when power-up is collected
    onPowerUpCollected(data) {
        if (this.progression) {
            this.progression.onPowerUpCollected();
        }
        
        // existing code for UI update
        this.ui?.showPowerUpMessage(data.type);
        
        // Sync with remote
        if (this.isHost) {
            this.network?.send({
                type: MESSAGE_TYPES.BONUS,
                ...data
            });
        }
    }
    
    // Called when player dies/loses life
    onLifeLost() {
        if (this.progression) {
            this.progression.onDeath();
        }
    }
    
    // Check if a level is unlocked
    isLevelUnlocked(levelNumber) {
        if (!this.progression) return levelNumber === 1;
        return this.progression.isLevelUnlocked(levelNumber);
    }
    
    // Get progression stats
    getProgressionStats() {
        return this.progression?.getStats() || null;
    }
    
    // Export progress data
    exportProgress() {
        return this.progression?.exportProgress() || null;
    }
    
    // Import progress data
    importProgress(data) {
        return this.progression?.importProgress(data) || false;
    }
    
    // Reset all progression
    resetProgression() {
        this.progression?.resetAll();
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

// ============================================================================
// ACCESSIBILITY AND ERROR HANDLING HELPERS
// ============================================================================

/**
 * Check browser capabilities for P2P connection
 * Shows warnings if WebRTC or other required features are unavailable
 */
function checkBrowserCapabilities() {
    const warnings = [];
    
    // Check WebRTC support
    const hasWebRTC = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia || 
                         window.RTCPeerConnection || window.webkitRTCPeerConnection ||
                         window.mozRTCPeerConnection);
    
    if (!hasWebRTC) {
        warnings.push('Your browser does not support WebRTC P2P connections.');
        showWebRTCWarning();
    }
    
    // Check localStorage support
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
    } catch (e) {
        warnings.push('Local storage is unavailable - progress will not be saved.');
    }
    
    // Check canvas support
    const canvas = document.createElement('canvas');
    if (!canvas.getContext || !canvas.getContext('2d')) {
        warnings.push('Canvas is not supported - game cannot run.');
    }
    
    // Log all warnings
    if (warnings.length > 0) {
        console.warn('[Main] Browser capability warnings:', warnings);
    }
    
    return warnings.length === 0;
}

/**
 * Show WebRTC warning banner
 */
function showWebRTCWarning() {
    const warning = document.getElementById('webrtc-warning');
    if (warning) {
        warning.hidden = false;
        
        // Announce to screen readers
        announceToScreenReader('Warning: Your browser does not support P2P multiplayer connections. Multiplayer features will be unavailable.', true);
    }
}

/**
 * Set up offline/online detection
 */
ArkanoidP2P.prototype.setupOfflineDetection = function() {
    const offlineBanner = document.getElementById('offline-warning');
    
    const updateOnlineStatus = () => {
        const isOnline = navigator.onLine;
        
        if (offlineBanner) {
            offlineBanner.hidden = isOnline;
        }
        
        if (!isOnline) {
            console.warn('[Main] Connection lost - game will run in offline mode');
            announceToScreenReader('You are now offline. Some features may not work.', true);
        } else {
            console.log('[Main] Connection restored');
            announceToScreenReader('You are back online.', true);
        }
    };
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Check initial status
    updateOnlineStatus();
};

/**
 * Set up error boundary for catching unhandled errors
 */
ArkanoidP2P.prototype.setupErrorBoundary = function() {
    const errorBoundary = document.getElementById('error-boundary');
    const errorMessage = document.getElementById('error-message');
    const reloadBtn = document.getElementById('btn-reload');
    
    // Set up reload button
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }
    
    // Global error handler
    window.addEventListener('error', (e) => {
        console.error('[Main] Uncaught error:', e.error);
        this.handleFatalError('An unexpected error occurred', e.error);
    });
    
    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (e) => {
        console.error('[Main] Unhandled promise rejection:', e.reason);
        this.handleFatalError('A promise rejection occurred', e.reason);
    });
};

/**
 * Handle fatal errors - gracefully degrade if possible
 */
ArkanoidP2P.prototype.handleFatalError = function(message, error) {
    console.error('[Main] Fatal error:', message, error);
    
    const errorBoundary = document.getElementById('error-boundary');
    const errorMessage = document.getElementById('error-message');
    
    // Display error to user
    if (errorBoundary && errorMessage) {
        errorMessage.textContent = `${message}: ${error?.message || error || 'Unknown error'}`;
        errorBoundary.hidden = false;
    }
    
    // Stop game loop
    if (this.requestId) {
        cancelAnimationFrame(this.requestId);
        this.requestId = null;
    }
    
    // Announce error to screen readers
    announceToScreenReader(`Error: ${message}. Please reload the page to continue.`, true);
};

/**
 * Set up accessibility features
 */
ArkanoidP2P.prototype.setupAccessibility = function() {
    // Manage focus on screen transitions
    const originalShowScreen = this.ui?.showScreen;
    if (originalShowScreen) {
        this.ui.showScreen = (screenName, options) => {
            originalShowScreen.call(this.ui, screenName, options);
            
            // Focus first interactive element after transition
            setTimeout(() => {
                const screen = document.getElementById(this.getScreenId(screenName));
                if (screen) {
                    const focusable = screen.querySelector('button, [tabindex]:not([tabindex="-1"]), input');
                    if (focusable) {
                        focusable.focus();
                    }
                }
            }, 100);
        };
    }
    
    // Keyboard shortcut help
    document.addEventListener('keydown', (e) => {
        // ? key for help
        if (e.key === '?' && this.state !== APP_STATES.PLAYING) {
            e.preventDefault();
            this.showKeyboardShortcuts();
        }
    });
};

/**
 * Get screen ID from name
 */
ArkanoidP2P.prototype.getScreenId = function(screenName) {
    const screenMap = {
        'MENU': 'screen-menu',
        'ROOM': 'screen-room',
        'GAME': 'screen-game',
        'PAUSE': 'screen-pause',
        'LEVEL_COMPLETE': 'screen-level-complete',
        'GAME_OVER': 'screen-game-over',
        'LOADING': 'screen-loading',
        'HELP': 'screen-help'
    };
    return screenMap[screenName] || null;
};

/**
 * Show keyboard shortcuts
 */
ArkanoidP2P.prototype.showKeyboardShortcuts = function() {
    // Simple alert with shortcuts - could be a nice modal
    const shortcuts = [
        'Keyboard Shortcuts:',
        '',
        '← ↑ ↓ → or A/D: Move paddle',
        'Space: Launch ball / Resume',
        'Escape or P: Pause',
        'Tab: Navigate UI buttons',
        'Enter: Activate button',
        '?: Show this help'
    ];
    alert(shortcuts.join('\n'));
};

/**
 * Announce message to screen readers
 */
function announceToScreenReader(message, assertive = false) {
    const announcer = document.getElementById('sr-announcer');
    if (announcer) {
        announcer.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
        announcer.textContent = message;
        
        // Clear after announcement
        setTimeout(() => {
            announcer.textContent = '';
        }, 1000);
    }
}

// Export helper
window.announceToScreenReader = announceToScreenReader;

console.log('[Main] main.js loaded with enhanced P2P sync, accessibility, and error handling');
