/**
 * Arkanoid P2P - UI Controller Module
 * Manages all screen transitions, user interactions, HUD updates
 * Integrates with game.js and network.js
 * Style: Гоп-стоп (90s post-Soviet neon aesthetic)
 * @module ui.js
 */

// ==================== UI CONTROLLER ====================

const UIController = (function() {
    'use strict';

    // ==================== CONSTANTS ====================
    const SCREENS = {
        MENU: 'screen-menu',
        ROOM: 'screen-room',
        GAME: 'screen-game',
        PAUSE: 'screen-pause',
        LEVEL_COMPLETE: 'screen-level-complete',
        GAME_OVER: 'screen-game-over',
        LOADING: 'screen-loading',
        HELP: 'screen-help'
    };

    const CONNECTION_STATUS = {
        DISCONNECTED: 'disconnected',
        WAITING: 'waiting',
        CONNECTED: 'connected',
        ERROR: 'error'
    };

    const TOAST_TYPES = {
        INFO: 'info',
        SUCCESS: 'success',
        WARNING: 'warning',
        ERROR: 'error'
    };

    // ==================== STATE ====================
    let state = {
        currentScreen: null,
        isHost: false,
        roomCode: null,
        connectionStatus: CONNECTION_STATUS.DISCONNECTED,
        gameActive: false,
        isPaused: false,
        touchActive: false,
        keyState: {},
        mousePosition: { x: 0, y: 0 }
    };

    // ==================== DOM ELEMENTS CACHE ====================
    let elements = {};

    // ==================== CALLBACKS ====================
    let callbacks = {
        onRoomCreate: null,
        onRoomJoin: null,
        onGameStart: null,
        onGamePause: null,
        onGameResume: null,
        onGameRestart: null,
        onGameQuit: null,
        onNextLevel: null,
        onPaddleMove: null,
        onLaunchBall: null
    };

    // ==================== INITIALIZATION ====================

    /**
     * Initialize UI controller
     * @param {Object} options - Callback functions
     */
    function init(options = {}) {
        console.log('[UI] Initializing...');

        // Store callbacks
        Object.assign(callbacks, options);

        // Cache DOM elements
        cacheElements();

        // Set up event listeners
        setupEventListeners();

        // Set up keyboard shortcuts
        setupKeyboardShortcuts();

        // Set up touch controls
        setupTouchControls();

        // Set up mouse/pointer controls
        setupMouseControls();

        // Show initial screen
        showScreen('MENU');

        // Set up network event listeners if network module exists
        setupNetworkIntegration();

        console.log('[UI] Initialized');
    }

    /**
     * Cache DOM elements for faster access
     */
    function cacheElements() {
        // Screens
        Object.keys(SCREENS).forEach(key => {
            elements[key.toLowerCase()] = document.getElementById(SCREENS[key]);
        });

        // Menu buttons
        elements.btnCreateRoom = document.getElementById('btn-create-room');
        elements.btnJoinRoom = document.getElementById('btn-join-room');
        elements.btnHelp = document.getElementById('btn-help');

        // Room screen elements
        elements.createSection = document.getElementById('create-section');
        elements.joinSection = document.getElementById('join-section');
        elements.codeDisplay = document.getElementById('code-display');
        elements.generatedCode = document.getElementById('generated-code');
        elements.roomCodeInput = document.getElementById('room-code-input');
        elements.btnGenerateCode = document.getElementById('btn-generate-code');
        elements.btnCopyCode = document.getElementById('btn-copy-code');
        elements.btnConnect = document.getElementById('btn-connect');
        elements.btnBackToMenu = document.getElementById('btn-back-to-menu');

        // Connection status
        elements.connectionDot = document.getElementById('connection-dot');
        elements.connectionText = document.getElementById('connection-text');

        // Game HUD elements
        elements.scoreDisplay = document.getElementById('score-display');
        elements.levelDisplay = document.getElementById('level-display');
        elements.livesDisplay = document.getElementById('lives-display');
        elements.player1Indicator = document.getElementById('player-1-indicator');
        elements.player2Indicator = document.getElementById('player-2-indicator');
        elements.btnPause = document.getElementById('btn-pause');
        elements.gameCanvas = document.getElementById('gameCanvas');

        // Touch controls
        elements.touchLeft = document.getElementById('touch-left');
        elements.touchRight = document.getElementById('touch-right');

        // Game over screen
        elements.finalScore = document.getElementById('final-score');
        elements.finalLevel = document.getElementById('final-level');
        elements.highScore = document.getElementById('high-score');
        elements.btnRetry = document.getElementById('btn-retry');
        elements.btnMainMenu = document.getElementById('btn-main-menu');

        // Level complete screen
        elements.levelScore = document.getElementById('level-score');
        elements.levelBlocks = document.getElementById('level-blocks');
        elements.levelTime = document.getElementById('level-time');
        elements.btnNextLevel = document.getElementById('btn-next-level');

        // Pause screen
        elements.btnResume = document.getElementById('btn-resume');
        elements.btnQuitGame = document.getElementById('btn-quit-game');

        // Help screen
        elements.btnHelpBack = document.getElementById('btn-help-back');

        // Loading screen
        elements.loadingText = document.getElementById('loading-text');

        // Toast container (create if doesn't exist)
        createToastContainer();
    }

    /**
     * Create toast notification container
     */
    function createToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }
        elements.toastContainer = container;
    }

    // ==================== SCREEN MANAGEMENT ====================

    /**
     * Show specific screen
     * @param {string} screenName - Screen name (MENU, ROOM, GAME, etc.)
     */
    function showScreen(screenName) {
        const screenId = SCREENS[screenName];
        if (!screenId) {
            console.error(`[UI] Unknown screen: ${screenName}`);
            return;
        }

        // Hide all screens
        Object.values(SCREENS).forEach(id => {
            const screen = document.getElementById(id);
            if (screen) {
                screen.classList.remove('active');
            }
        });

        // Show target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            state.currentScreen = screenName;
            console.log(`[UI] Switched to screen: ${screenName}`);
        }

        // Update game pause state
        if (screenName === 'PAUSE') {
            state.isPaused = true;
        } else if (screenName === 'GAME' && state.isPaused) {
            state.isPaused = false;
            if (callbacks.onGameResume) callbacks.onGameResume();
        }
    }

    // ==================== EVENT LISTENERS ====================

    function setupEventListeners() {
        // Menu screen
        elements.btnCreateRoom?.addEventListener('click', handleCreateRoomClick);
        elements.btnJoinRoom?.addEventListener('click', handleJoinRoomClick);
        elements.btnHelp?.addEventListener('click', () => showScreen('HELP'));

        // Room screen
        elements.btnGenerateCode?.addEventListener('click', handleGenerateCode);
        elements.btnCopyCode?.addEventListener('click', handleCopyCode);
        elements.btnConnect?.addEventListener('click', handleConnect);
        elements.btnBackToMenu?.addEventListener('click', () => showScreen('MENU'));

        // Help screen
        elements.btnHelpBack?.addEventListener('click', () => showScreen('MENU'));

        // Game screen
        elements.btnPause?.addEventListener('click', () => {
            showScreen('PAUSE');
            if (callbacks.onGamePause) callbacks.onGamePause();
        });

        // Pause screen
        elements.btnResume?.addEventListener('click', () => showScreen('GAME'));
        elements.btnQuitGame?.addEventListener('click', handleQuitGame);

        // Game over screen
        elements.btnRetry?.addEventListener('click', handleRetry);
        elements.btnMainMenu?.addEventListener('click', handleReturnToMenu);

        // Level complete screen
        elements.btnNextLevel?.addEventListener('click', handleNextLevel);

        // Room code input (Enter key)
        elements.roomCodeInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleConnect();
        });
    }

    // ==================== KEYBOARD SHORTCUTS ====================

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            state.keyState[e.key] = true;

            // Global shortcuts
            switch (e.key) {
                case 'Escape':
                    if (state.currentScreen === 'GAME') {
                        showScreen('PAUSE');
                        if (callbacks.onGamePause) callbacks.onGamePause();
                    } else if (state.currentScreen === 'PAUSE') {
                        showScreen('GAME');
                    }
                    break;
                case ' ':
                case 'Spacebar':
                    if (state.currentScreen === 'GAME' && !state.isPaused) {
                        e.preventDefault();
                        if (callbacks.onLaunchBall) callbacks.onLaunchBall();
                    }
                    break;
                case 'p':
                case 'P':
                    if (state.currentScreen === 'GAME') {
                        showScreen('PAUSE');
                        if (callbacks.onGamePause) callbacks.onGamePause();
                    } else if (state.currentScreen === 'PAUSE') {
                        showScreen('GAME');
                    }
                    break;
                case 'r':
                case 'R':
                    if (state.currentScreen === 'GAME_OVER') {
                        handleRetry();
                    }
                    break;
                case 'm':
                case 'M':
                    if (state.currentScreen === 'GAME_OVER' || state.currentScreen === 'PAUSE') {
                        handleReturnToMenu();
                    }
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            state.keyState[e.key] = false;
        });
    }

    /**
     * Check if a key is currently pressed
     * @param {string} key - Key to check
     * @returns {boolean}
     */
    function isKeyPressed(key) {
        return !!state.keyState[key];
    }

    /**
     * Get current key state
     * @returns {Object}
     */
    function getKeyState() {
        return { ...state.keyState };
    }

    // ==================== MOUSE/TOUCH CONTROLS ====================

    function setupMouseControls() {
        if (!elements.gameCanvas) return;

        // Mouse move for paddle control
        elements.gameCanvas.addEventListener('mousemove', (e) => {
            const rect = elements.gameCanvas.getBoundingClientRect();
            state.mousePosition = {
                x: (e.clientX - rect.left) * (elements.gameCanvas.width / rect.width),
                y: (e.clientY - rect.top) * (elements.gameCanvas.height / rect.height)
            };

            if (callbacks.onPaddleMove && state.currentScreen === 'GAME' && !state.isPaused) {
                callbacks.onPaddleMove(state.mousePosition.x, 'mouse');
            }
        });

        // Click to launch ball
        elements.gameCanvas.addEventListener('click', () => {
            if (state.currentScreen === 'GAME' && !state.isPaused) {
                if (callbacks.onLaunchBall) callbacks.onLaunchBall();
            }
        });

        // Prevent context menu on canvas
        elements.gameCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    function setupTouchControls() {
        if (!elements.gameCanvas) return;

        // Touch move for paddle control
        elements.gameCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = elements.gameCanvas.getBoundingClientRect();
            const x = (touch.clientX - rect.left) * (elements.gameCanvas.width / rect.width);

            if (callbacks.onPaddleMove && state.currentScreen === 'GAME' && !state.isPaused) {
                callbacks.onPaddleMove(x, 'touch');
            }
        }, { passive: false });

        // Touch to launch
        elements.gameCanvas.addEventListener('touchstart', (e) => {
            if (state.currentScreen === 'GAME' && !state.isPaused) {
                if (callbacks.onLaunchBall) callbacks.onLaunchBall();
            }
        });

        // Touch buttons
        setupTouchButtons();
    }

    /**
     * Set up touch control buttons
     */
    function setupTouchButtons() {
        if (!elements.touchLeft || !elements.touchRight) return;

        const handleTouchStart = (direction) => (e) => {
            e.preventDefault();
            state.touchActive = true;
            if (callbacks.onPaddleMove) {
                const canvasWidth = elements.gameCanvas?.width || 800;
                const currentX = elements.gameCanvas ? 
                    parseInt(elements.gameCanvas.dataset.paddleX || canvasWidth / 2) : 
                    canvasWidth / 2;
                const newX = direction === 'left' ? currentX - 50 : currentX + 50;
                callbacks.onPaddleMove(newX, 'touch');
            }
        };

        const handleTouchEnd = (e) => {
            e.preventDefault();
            state.touchActive = false;
        };

        elements.touchLeft.addEventListener('touchstart', handleTouchStart('left'));
        elements.touchLeft.addEventListener('touchend', handleTouchEnd);
        elements.touchRight.addEventListener('touchstart', handleTouchStart('right'));
        elements.touchRight.addEventListener('touchend', handleTouchEnd);
    }

    /**
     * Enable touch controls for specific player
     * @param {number} player - Player number (1 or 2)
     */
    function enableTouchControls(player) {
        if (elements.touchLeft && elements.touchRight) {
            elements.touchLeft.style.display = 'flex';
            elements.touchRight.style.display = 'flex';
        }
        console.log(`[UI] Touch controls enabled for player ${player}`);
    }

    /**
     * Disable touch controls
     */
    function disableTouchControls() {
        if (elements.touchLeft && elements.touchRight) {
            elements.touchLeft.style.display = 'none';
            elements.touchRight.style.display = 'none';
        }
    }

    // ==================== ROOM MANAGEMENT ====================

    function handleCreateRoomClick() {
        if (elements.createSection) elements.createSection.classList.remove('hidden');
        if (elements.joinSection) elements.joinSection.classList.add('hidden');
        if (elements.codeDisplay) elements.codeDisplay.classList.add('hidden');
        
        state.isHost = true;
        showScreen('ROOM');
    }

    function handleJoinRoomClick() {
        if (elements.createSection) elements.createSection.classList.add('hidden');
        if (elements.joinSection) elements.joinSection.classList.remove('hidden');
        if (elements.codeDisplay) elements.codeDisplay.classList.add('hidden');
        
        state.isHost = false;
        showScreen('ROOM');
        
        // Focus input
        setTimeout(() => elements.roomCodeInput?.focus(), 100);
    }

    function handleGenerateCode() {
        if (callbacks.onRoomCreate) {
            callbacks.onRoomCreate();
        }
    }

    function handleConnect() {
        const code = elements.roomCodeInput?.value?.trim().toUpperCase();
        if (!code) {
            showToast('Please enter a room code', TOAST_TYPES.ERROR);
            return;
        }
        
        if (code.length < 4) {
            showToast('Invalid room code', TOAST_TYPES.ERROR);
            return;
        }

        showScreen('LOADING');
        if (elements.loadingText) elements.loadingText.textContent = 'CONNECTING...';

        if (callbacks.onRoomJoin) {
            callbacks.onRoomJoin(code);
        }
    }

    /**
     * Set room code display
     * @param {string} code - Room code
     */
    function setRoomCode(code) {
        state.roomCode = code;
        if (elements.generatedCode) {
            elements.generatedCode.textContent = code;
        }
        if (elements.codeDisplay) {
            elements.codeDisplay.classList.remove('hidden');
        }
        showToast('Room code generated! Share it with your comrade.', TOAST_TYPES.SUCCESS);
    }

    /**
     * Copy room code to clipboard
     */
    async function handleCopyCode() {
        const code = elements.generatedCode?.textContent;
        if (!code || code === '--------') {
            showToast('No code to copy', TOAST_TYPES.WARNING);
            return;
        }

        try {
            await navigator.clipboard.writeText(code);
            const btn = elements.btnCopyCode;
            const originalText = btn.textContent;
            btn.textContent = 'COPIED!';
            showToast('Code copied to clipboard!', TOAST_TYPES.SUCCESS);
            setTimeout(() => btn.textContent = originalText, 2000);
        } catch (err) {
            console.error('[UI] Failed to copy:', err);
            showToast('Failed to copy code', TOAST_TYPES.ERROR);
        }
    }

    // ==================== CONNECTION STATUS ====================

    /**
     * Update connection status indicator
     * @param {string} status - Status type
     * @param {number} player - Player number (1 or 2)
     */
    function setConnectionStatus(status, player = null) {
        state.connectionStatus = status;

        // Update status dot
        if (elements.connectionDot) {
            elements.connectionDot.className = 'status-dot';
            
            switch (status) {
                case CONNECTION_STATUS.CONNECTED:
                    elements.connectionDot.classList.add('status-dot--connected');
                    break;
                case CONNECTION_STATUS.WAITING:
                    elements.connectionDot.classList.add('status-dot--waiting');
                    break;
                case CONNECTION_STATUS.ERROR:
                    elements.connectionDot.classList.add('status-dot--error');
                    break;
            }
        }

        // Update status text
        if (elements.connectionText) {
            const messages = {
                [CONNECTION_STATUS.DISCONNECTED]: 'DISCONNECTED',
                [CONNECTION_STATUS.WAITING]: 'WAITING FOR PLAYER...',
                [CONNECTION_STATUS.CONNECTED]: 'CONNECTED',
                [CONNECTION_STATUS.ERROR]: 'CONNECTION ERROR'
            };
            elements.connectionText.textContent = messages[status] || 'UNKNOWN';
        }

        // Update player indicator
        if (player) {
            const indicator = player === 1 ? elements.player1Indicator : elements.player2Indicator;
            if (indicator) {
                if (status === CONNECTION_STATUS.CONNECTED) {
                    indicator.classList.add('player-indicator--active');
                } else {
                    indicator.classList.remove('player-indicator--active');
                }
            }
        }

        console.log(`[UI] Connection status: ${status}${player ? ` (Player ${player})` : ''}`);
    }

    // ==================== GAME UI UPDATES ====================

    /**
     * Update game HUD with current state
     * @param {Object} gameState - Game state object
     */
    function updateGameUI(gameState) {
        if (!gameState) return;

        // Update score
        if (gameState.score !== undefined && elements.scoreDisplay) {
            elements.scoreDisplay.textContent = gameState.score.toString().padStart(6, '0');
        }

        // Update level
        if (gameState.level !== undefined && elements.levelDisplay) {
            elements.levelDisplay.textContent = gameState.level.toString().padStart(2, '0');
        }

        // Update lives
        if (gameState.lives !== undefined && elements.livesDisplay) {
            const lives = '♥'.repeat(Math.max(0, gameState.lives));
            elements.livesDisplay.textContent = lives;
        }
    }

    /**
     * Update player indicator status
     * @param {number} player - Player number
     * @param {boolean} isActive - Whether player is active
     * @param {string} name - Optional player name
     */
    function updatePlayerIndicator(player, isActive, name = null) {
        const indicator = player === 1 ? elements.player1Indicator : elements.player2Indicator;
        if (!indicator) return;

        if (isActive) {
            indicator.classList.add('player-indicator--active');
        } else {
            indicator.classList.remove('player-indicator--active');
        }

        if (name) {
            const nameEl = indicator.querySelector('.player-indicator__name');
            if (nameEl) nameEl.textContent = name;
        }
    }

    /**
     * Show level complete screen with stats
     * @param {Object} stats - Level statistics
     */
    function showLevelComplete(stats) {
        if (elements.levelScore) {
            elements.levelScore.textContent = stats.score || 0;
        }
        if (elements.levelBlocks) {
            elements.levelBlocks.textContent = stats.blocksDestroyed || 0;
        }
        if (elements.levelTime) {
            const minutes = Math.floor((stats.time || 0) / 60);
            const seconds = Math.floor((stats.time || 0) % 60);
            elements.levelTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        showScreen('LEVEL_COMPLETE');
    }

    /**
     * Show game over screen with stats
     * @param {Object} stats - Final game statistics
     */
    function showGameOver(stats) {
        if (elements.finalScore) {
            elements.finalScore.textContent = stats.score || 0;
        }
        if (elements.finalLevel) {
            elements.finalLevel.textContent = stats.level || 1;
        }
        if (elements.highScore) {
            elements.highScore.textContent = stats.highScore || stats.score || 0;
        }
        showScreen('GAME_OVER');
    }

    // ==================== GAME CONTROL HANDLERS ====================

    function handleQuitGame() {
        if (confirm('Are you sure you want to quit? Progress will be lost.')) {
            state.gameActive = false;
            state.isPaused = false;
            if (callbacks.onGameQuit) callbacks.onGameQuit();
            showScreen('MENU');
        }
    }

    function handleRetry() {
        showScreen('LOADING');
        if (elements.loadingText) elements.loadingText.textContent = 'RESTARTING...';
        
        setTimeout(() => {
            if (callbacks.onGameRestart) callbacks.onGameRestart();
            showScreen('GAME');
        }, 500);
    }

    function handleReturnToMenu() {
        state.gameActive = false;
        state.isPaused = false;
        if (callbacks.onGameQuit) callbacks.onGameQuit();
        showScreen('MENU');
    }

    function handleNextLevel() {
        showScreen('LOADING');
        if (elements.loadingText) elements.loadingText.textContent = 'LOADING NEXT LEVEL...';
        
        setTimeout(() => {
            if (callbacks.onNextLevel) callbacks.onNextLevel();
            showScreen('GAME');
        }, 500);
    }

    // ==================== TOAST NOTIFICATIONS ====================

    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type (info, success, warning, error)
     * @param {number} duration - Duration in milliseconds
     */
    function showToast(message, type = TOAST_TYPES.INFO, duration = 3000) {
        const toast = document.createElement('div');
        
        // Colors based on type
        const colors = {
            [TOAST_TYPES.INFO]: { border: '#00ffff', bg: 'rgba(0, 255, 255, 0.1)' },
            [TOAST_TYPES.SUCCESS]: { border: '#00ff00', bg: 'rgba(0, 255, 0, 0.1)' },
            [TOAST_TYPES.WARNING]: { border: '#ffff00', bg: 'rgba(255, 255, 0, 0.1)' },
            [TOAST_TYPES.ERROR]: { border: '#ff0040', bg: 'rgba(255, 0, 64, 0.1)' }
        };
        
        const color = colors[type] || colors[TOAST_TYPES.INFO];

        toast.style.cssText = `
            background: ${color.bg};
            border: 2px solid ${color.border};
            color: #fff;
            padding: 12px 24px;
            font-family: 'Press Start 2P', monospace;
            font-size: 12px;
            box-shadow: 0 0 15px ${color.border}40;
            clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
            animation: slideIn 0.3s ease, fadeOut 0.3s ease ${duration - 300}ms forwards;
            pointer-events: auto;
            max-width: 300px;
            word-wrap: break-word;
        `;
        toast.textContent = message;

        // Add animations if not already in document
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        elements.toastContainer.appendChild(toast);

        // Remove after duration
        setTimeout(() => {
            toast.remove();
        }, duration);

        console.log(`[UI] Toast: ${message} (${type})`);
    }

    // ==================== NETWORK INTEGRATION ====================

    function setupNetworkIntegration() {
        // Check if network module exists
        if (typeof NetworkModule !== 'undefined') {
            const network = new NetworkModule();

            // Listen for connection events
            network.on('connect', (data) => {
                setConnectionStatus(CONNECTION_STATUS.CONNECTED, data.isHost ? 1 : 2);
                showToast('Player connected! Starting game...', TOAST_TYPES.SUCCESS);
                
                setTimeout(() => {
                    if (callbacks.onGameStart) callbacks.onGameStart(data);
                    showScreen('GAME');
                }, 1000);
            });

            network.on('disconnect', (data) => {
                setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
                showToast('Player disconnected', TOAST_TYPES.WARNING);
            });

            network.on('error', (error) => {
                setConnectionStatus(CONNECTION_STATUS.ERROR);
                showToast('Connection error: ' + error.message, TOAST_TYPES.ERROR);
                showScreen('ROOM');
            });

            // Store network reference
            state.network = network;
        }
    }

    /**
     * Get network module reference
     * @returns {NetworkModule|null}
     */
    function getNetwork() {
        return state.network || null;
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get current UI state
     * @returns {Object}
     */
    function getState() {
        return { ...state };
    }

    /**
     * Set loading text
     * @param {string} text - Loading message
     */
    function setLoadingText(text) {
        if (elements.loadingText) {
            elements.loadingText.textContent = text;
        }
    }

    /**
     * Check if game is currently paused
     * @returns {boolean}
     */
    function isGamePaused() {
        return state.isPaused;
    }

    /**
     * Check if game is active
     * @returns {boolean}
     */
    function isGameActive() {
        return state.gameActive;
    }

    /**
     * Set game active state
     * @param {boolean} active
     */
    function setGameActive(active) {
        state.gameActive = active;
    }

    /**
     * Update room code input value
     * @param {string} code
     */
    function setRoomCodeInput(code) {
        if (elements.roomCodeInput) {
            elements.roomCodeInput.value = code;
        }
    }

    // ==================== PUBLIC API ====================

    return {
        // Core methods
        init,
        showScreen,
        
        // Room management
        setRoomCode,
        setRoomCodeInput,
        
        // Connection status
        setConnectionStatus,
        CONNECTION_STATUS,
        
        // Game UI updates
        updateGameUI,
        updatePlayerIndicator,
        showLevelComplete,
        showGameOver,
        
        // Touch controls
        enableTouchControls,
        disableTouchControls,
        
        // Input handling
        isKeyPressed,
        getKeyState,
        getMousePosition: () => ({ ...state.mousePosition }),
        
        // Notifications
        showToast,
        TOAST_TYPES,
        
        // Game state
        getState,
        isGamePaused,
        isGameActive,
        setGameActive,
        
        // Network
        getNetwork,
        
        // Loading
        setLoadingText,
        
        // Constants
        SCREENS
    };

})();

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UIController.init());
} else {
    UIController.init();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
