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
        HELP: 'screen-help',
        SETTINGS: 'screen-settings'
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
        mousePosition: { x: 0, y: 0 },
        hapticsDisabled: false
    };

    // ==================== MOBILE FEATURES ====================
    const MOBILE_FEATURES = {
        VIRTUAL_JOYSTICK: true,
        HAPTIC_FEEDBACK: true,
        ORIENTATION_HANDLING: true,
        FULLSCREEN: true
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
        onLaunchBall: null,
        onOrientationChange: null
    };

    // ==================== INITIALIZATION ====================

    /**
     * Initialize UI controller
     * @param {Object} options - Callback functions
     */
    function init(options = {}) {
        console.log('[UI] Initializing with accessibility...');

        // Store callbacks
        Object.assign(callbacks, options);

        // Cache DOM elements
        cacheElements();

        // Set up event listeners
        setupEventListeners();

        // Set up keyboard shortcuts with proper focus management
        setupKeyboardShortcuts();
        
        // Set up accessible focus traps for modals
        setupFocusTraps();

        // Set up touch controls
        setupTouchControls();

        // Set up mouse/pointer controls
        setupMouseControls();

        // Add button ripple effects with keyboard support
        addRippleEffects();

        // Initialize loading screen elements
        initLoadingScreen();
        
        // Initialize accessibility announcements
        initAccessibility();

        // Show initial screen and manage focus
        showScreen('MENU', { eager: true });
        setTimeout(() => focusFirstInteractive('screen-menu'), 100);

        // Set up network event listeners if network module exists
        setupNetworkIntegration();

        console.log('[UI] Initialized with keyboard navigation and ARIA support');
    }

    /**
     * Initialize accessibility features
     */
    function initAccessibility() {
        // Ensure all buttons have proper types for accessibility
        document.querySelectorAll('button:not([type])').forEach(btn => {
            btn.setAttribute('type', 'button');
        });
        
        // Add ARIA landmarks if missing
        const container = document.getElementById('game-container');
        if (container && !container.getAttribute('role')) {
            container.setAttribute('role', 'main');
        }
        
        // Initialize skip link behavior
        const skipLink = document.getElementById('skip-link');
        if (skipLink) {
            skipLink.addEventListener('click', (e) => {
                e.preventDefault();
                focusFirstInteractive(state.currentScreen ? `screen-${state.currentScreen.toLowerCase()}` : 'screen-menu');
            });
        }
    }

    /**
     * Focus first interactive element in a container
     */
    function focusFirstInteractive(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const focusable = container.querySelector(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusable) {
            focusable.focus();
        }
    }

    /**
     * Set up focus traps for modal screens
     */
    function setupFocusTraps() {
        const modalScreens = ['PAUSE', 'LEVEL_COMPLETE', 'GAME_OVER'];
        
        modalScreens.forEach(screenName => {
            const screen = document.getElementById(SCREENS[screenName]);
            if (!screen) return;
            
            screen.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                
                const focusableElements = screen.querySelectorAll(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                
                const firstFocusable = focusableElements[0];
                const lastFocusable = focusableElements[focusableElements.length - 1];
                
                if (e.shiftKey && document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable.focus();
                } else if (!e.shiftKey && document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            });
        });
    }

    /**
     * Announce to screen readers
     */
    function announce(message, assertive = false) {
        if (typeof window.announceToScreenReader === 'function') {
            window.announceToScreenReader(message, assertive);
        } else {
            // Fallback: create temporary announcer
            const announcer = document.getElementById('sr-announcer');
            if (announcer) {
                announcer.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
                announcer.textContent = message;
                setTimeout(() => announcer.textContent = '', 1000);
            }
        }
    }

    /**
     * Initialize loading screen structure if not present
     */
    function initLoadingScreen() {
        const loadingScreen = document.getElementById(SCREENS.LOADING);
        if (loadingScreen && !loadingScreen.querySelector('.loading-container')) {
            loadingScreen.innerHTML = `
                <div class="loading-container">
                    <div class="loading-logo">GOP-STOP</div>
                    <div class="loading-spinner"></div>
                    <div class="loading-progress">
                        <div class="loading-progress-bar indeterminate"></div>
                    </div>
                    <div class="loading-status" id="loading-text">LOADING...</div>
                </div>
            `;
        }
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

        // Settings screen
        elements.btnSettings = document.getElementById('btn-settings');
        elements.btnSettingsBack = document.getElementById('btn-settings-back');

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
     * Show specific screen with enhanced transitions and focus management
     * @param {string} screenName - Screen name (MENU, ROOM, GAME, etc.)
     * @param {Object} options - Transition options
     */
    function showScreen(screenName, options = {}) {
        const screenId = SCREENS[screenName];
        if (!screenId) {
            console.error(`[UI] Unknown screen: ${screenName}`);
            return;
        }

        const { 
            direction = 'up', 
            duration = 500,
            eager = false,
            announceTransition = true
        } = options;

        // Announce screen change to screen readers
        if (announceTransition) {
            const screenLabels = {
                'MENU': 'Main Menu',
                'ROOM': 'Room Management',
                'GAME': 'Game Screen',
                'PAUSE': 'Game Paused',
                'LEVEL_COMPLETE': 'Level Complete',
                'GAME_OVER': 'Game Over',
                'LOADING': 'Loading',
                'HELP': 'How to Play',
                'SETTINGS': 'Settings'
            };
            announce(`Now showing ${screenLabels[screenName] || screenName}`, false);
        }

        // Exit animation for current screen
        if (state.currentScreen) {
            const currentScreenId = SCREENS[state.currentScreen];
            const currentScreen = document.getElementById(currentScreenId);
            if (currentScreen) {
                currentScreen.classList.add('exiting');
                
                // Remove exiting class after animation
                setTimeout(() => {
                    currentScreen.classList.remove('exiting', 'active');
                }, duration * 0.6);
            }
        }

        // Show target screen with entrance animation
        setTimeout(() => {
            const targetScreen = document.getElementById(screenId);
            if (targetScreen) {
                // Add entrance animation class based on direction
                targetScreen.classList.remove('exiting');
                targetScreen.classList.add('active');
                
                // Apply staggered animation to children
                applyStaggeredAnimations(targetScreen);
                
                state.currentScreen = screenName;
                console.log(`[UI] Switched to screen: ${screenName}`);
                
                // Focus first interactive element after transition
                setTimeout(() => {
                    focusFirstInteractive(screenId);
                }, duration * 0.8);
                
                // Trigger haptic feedback on screen change (mobile)
                triggerHaptic('light');
            }
        }, eager ? 0 : state.currentScreen ? duration * 0.3 : 0);

        // Update game pause state
        if (screenName === 'PAUSE') {
            state.isPaused = true;
        } else if (screenName === 'GAME' && state.isPaused) {
            state.isPaused = false;
            if (callbacks.onGameResume) callbacks.onGameResume();
        }
    }

    /**
     * Apply staggered animations to screen children
     * @param {HTMLElement} screen - Screen element
     */
    function applyStaggeredAnimations(screen) {
        const animatableElements = screen.querySelectorAll('.btn, h1, h2, h3, .logo, .room-section, .stat-item');
        animatableElements.forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                el.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, 100 + (index * 50));
        });
    }

    /**
     * Show loading screen with progress
     * @param {string} message - Loading message
     * @param {number} progress - Progress percentage (0-100)
     */
    function showLoading(message = 'LOADING...', progress = null) {
        showScreen('LOADING');
        setLoadingText(message);
        
        if (progress !== null) {
            updateLoadingProgress(progress);
        } else {
            setIndeterminateProgress();
        }
    }

    /**
     * Update loading progress bar
     * @param {number} percent - Progress percentage (0-100)
     */
    function updateLoadingProgress(percent) {
        const progressBar = document.querySelector('.loading-progress-bar');
        if (progressBar) {
            progressBar.classList.remove('indeterminate');
            progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
    }

    /**
     * Set indeterminate loading progress
     */
    function setIndeterminateProgress() {
        const progressBar = document.querySelector('.loading-progress-bar');
        if (progressBar) {
            progressBar.style.width = '';
            progressBar.classList.add('indeterminate');
        }
    }

    /**
     * Enhanced show toast with animation options
     * @param {string} message - Toast message
     * @param {string} type - Toast type
     * @param {number} duration - Duration in ms
     * @param {Object} options - Additional options
     */
    function showToast(message, type = TOAST_TYPES.INFO, duration = 3000, options = {}) {
        const { position = 'top-right', animated = true } = options;
        
        const toast = document.createElement('div');
        
        // Colors based on type
        const colors = {
            [TOAST_TYPES.INFO]: { border: '#00ffff', bg: 'rgba(0, 255, 255, 0.1)', glow: '#00ffff' },
            [TOAST_TYPES.SUCCESS]: { border: '#00ff00', bg: 'rgba(0, 255, 0, 0.1)', glow: '#00ff00' },
            [TOAST_TYPES.WARNING]: { border: '#ffff00', bg: 'rgba(255, 255, 0, 0.1)', glow: '#ffff00' },
            [TOAST_TYPES.ERROR]: { border: '#ff0040', bg: 'rgba(255, 0, 64, 0.1)', glow: '#ff0040' }
        };
        
        const color = colors[type] || colors[TOAST_TYPES.INFO];

        // Build toast styles based on position
        const positionStyles = {
            'top-right': 'top: 20px; right: 20px;',
            'top-left': 'top: 20px; left: 20px;',
            'bottom-right': 'bottom: 20px; right: 20px;',
            'bottom-left': 'bottom: 20px; left: 20px;',
            'center': 'top: 50%; left: 50%; transform: translate(-50%, -50%);'
        };

        toast.style.cssText = `
            background: ${color.bg};
            border: 2px solid ${color.border};
            color: #fff;
            padding: 16px 24px;
            font-family: 'Press Start 2P', monospace;
            font-size: 12px;
            box-shadow: 
                0 0 15px ${color.glow}40,
                0 0 30px ${color.glow}20;
            clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
            pointer-events: auto;
            max-width: 350px;
            word-wrap: break-word;
            position: fixed;
            ${positionStyles[position] || positionStyles['top-right']}
            z-index: 10000;
            opacity: 0;
            transform: ${animated ? 'translateX(100px) scale(0.9)' : 'none'};
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        `;
        
        // Add icon based on type
        const icons = {
            [TOAST_TYPES.INFO]: 'ℹ',
            [TOAST_TYPES.SUCCESS]: '✓',
            [TOAST_TYPES.WARNING]: '⚠',
            [TOAST_TYPES.ERROR]: '✗'
        };
        
        toast.innerHTML = `
            <span style="color: ${color.glow}; margin-right: 8px;">${icons[type]}</span>
            ${message}
        `;

        document.body.appendChild(toast);
        
        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = position === 'center' ? 'translate(-50%, -50%) scale(1)' : 'translateX(0) scale(1)';
        });

        // Add click to dismiss
        toast.addEventListener('click', () => {
            dismissToast(toast);
        });

        // Auto dismiss
        setTimeout(() => {
            dismissToast(toast);
        }, duration);

        // Trigger haptic
        if (type === TOAST_TYPES.ERROR) {
            triggerHaptic('error');
        } else if (type === TOAST_TYPES.SUCCESS) {
            triggerHaptic('success');
        }

        console.log(`[UI] Toast: ${message} (${type})`);
    }

    /**
     * Dismiss toast with exit animation
     * @param {HTMLElement} toast - Toast element
     */
    function dismissToast(toast) {
        if (!toast || toast.dataset.dismissed) return;
        toast.dataset.dismissed = 'true';
        
        toast.style.opacity = '0';
        toast.style.transform = 'scale(0.9)';
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }

    /**
     * Create ripple effect on element click
     * @param {Event} e - Click event
     * @param {HTMLElement} element - Target element
     */
    function createRipple(e, element) {
        const ripple = document.createElement('span');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
        `;
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }

    /**
     * Add ripple effect to all buttons
     */
    function addRippleEffects() {
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', (e) => createRipple(e, btn));
        });
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

        // Help screen
        elements.btnHelpBack?.addEventListener('click', () => showScreen('MENU'));

        // Settings screen
        elements.btnSettings?.addEventListener('click', () => showScreen('SETTINGS'));
        elements.btnSettingsBack?.addEventListener('click', () => showScreen('MENU'));

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

        // BUG FIX #1: Enhanced touch move for paddle control
        // Added multi-touch support and better coordinate calculations
        elements.gameCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault(); // Prevent scrolling
            
            // Handle multiple touches - use first touch
            const touch = e.touches[0];
            if (!touch) return;
            
            const rect = elements.gameCanvas.getBoundingClientRect();
            
            // Calculate scale factors for responsive canvas
            const scaleX = elements.gameCanvas.width / rect.width;
            const scaleY = elements.gameCanvas.height / rect.height;
            
            // Calculate position relative to canvas
            const x = (touch.clientX - rect.left) * scaleX;
            const y = (touch.clientY - rect.top) * scaleY;
            
            state.mousePosition = { x, y };

            if (callbacks.onPaddleMove && state.currentScreen === 'GAME' && !state.isPaused) {
                callbacks.onPaddleMove(x, 'touch');
            }
        }, { passive: false });

        // BUG FIX #1: Better touch handling with proper event delegation
        elements.gameCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent default touch actions
            
            if (state.currentScreen === 'GAME' && !state.isPaused) {
                if (callbacks.onLaunchBall) callbacks.onLaunchBall();
            }
        }, { passive: false });
        
        // BUG FIX #1: Handle touch end to prevent stuck touches
        elements.gameCanvas.addEventListener('touchend', (e) => {
            e.preventDefault();
        }, { passive: false });

        // Touch buttons
        setupTouchButtons();
    }

    /**
     * Set up touch control buttons
     * BUG FIX #1: Improved touch button handling with continuous movement
     */
    function setupTouchButtons() {
        if (!elements.touchLeft || !elements.touchRight) return;

        let touchInterval = null;
        const TOUCH_REPEAT_DELAY = 50; // ms between repeated movements

        const startContinuousMove = (direction) => {
            // Initial move
            movePaddle(direction);
            
            // Set up continuous movement while button is held
            touchInterval = setInterval(() => {
                movePaddle(direction);
            }, TOUCH_REPEAT_DELAY);
        };

        const stopContinuousMove = () => {
            if (touchInterval) {
                clearInterval(touchInterval);
                touchInterval = null;
            }
        };

        const movePaddle = (direction) => {
            if (callbacks.onPaddleMove) {
                const canvasWidth = elements.gameCanvas?.width || 800;
                const currentX = elements.gameCanvas ? 
                    parseInt(elements.gameCanvas.dataset.paddleX || canvasWidth / 2) : 
                    canvasWidth / 2;
                const moveAmount = 30; // Smoother incremental movement
                const newX = direction === 'left' ? currentX - moveAmount : currentX + moveAmount;
                
                // Clamp to canvas bounds
                const clampedX = Math.max(0, Math.min(newX, canvasWidth));
                
                callbacks.onPaddleMove(clampedX, 'touch');
            }
        };

        const handleTouchStart = (direction) => (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.touchActive = true;
            
            // Add pressed class for visual feedback
            const btn = direction === 'left' ? elements.touchLeft : elements.touchRight;
            if (btn) btn.classList.add('pressed');
            
            startContinuousMove(direction);
        };

        const handleTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.touchActive = false;
            stopContinuousMove();
            
            // Remove pressed class from both buttons
            if (elements.touchLeft) elements.touchLeft.classList.remove('pressed');
            if (elements.touchRight) elements.touchRight.classList.remove('pressed');
        };

        // BUG FIX #1: Better touch event handling with multiple events
        // touchstart/touchend for immediate response
        elements.touchLeft.addEventListener('touchstart', handleTouchStart('left'), { passive: false });
        elements.touchLeft.addEventListener('touchend', handleTouchEnd, { passive: false });
        elements.touchLeft.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        
        elements.touchRight.addEventListener('touchstart', handleTouchStart('right'), { passive: false });
        elements.touchRight.addEventListener('touchend', handleTouchEnd, { passive: false });
        elements.touchRight.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        
        // Also support mouse events for testing on desktop
        elements.touchLeft.addEventListener('mousedown', handleTouchStart('left'));
        elements.touchLeft.addEventListener('mouseup', handleTouchEnd);
        elements.touchLeft.addEventListener('mouseleave', handleTouchEnd);
        
        elements.touchRight.addEventListener('mousedown', handleTouchStart('right'));
        elements.touchRight.addEventListener('mouseup', handleTouchEnd);
        elements.touchRight.addEventListener('mouseleave', handleTouchEnd);
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
        // Also disable virtual joystick
        disableVirtualJoystick();
    }

    // ==================== VIRTUAL JOYSTICK ====================

    /**
     * Virtual Joystick State
     */
    const joystickState = {
        active: false,
        touchId: null,
        centerX: 0,
        centerY: 0,
        currentX: 0,
        currentY: 0,
        maxRadius: 60,
        valueX: 0,
        valueY: 0,
        element: null,
        stickElement: null,
        animationFrame: null
    };

    /**
     * Initialize virtual joystick for mobile devices
     * Creates a circular touch area for analog-like paddle control
     */
    function initVirtualJoystick() {
        // Only initialize on touch devices
        if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
            return;
        }

        // Create joystick container if it doesn't exist
        let joystickContainer = document.getElementById('virtual-joystick');
        if (!joystickContainer) {
            joystickContainer = document.createElement('div');
            joystickContainer.id = 'virtual-joystick';
            joystickContainer.innerHTML = `
                <div class="joystick-base">
                    <div class="joystick-stick"></div>
                </div>
            `;
            document.body.appendChild(joystickContainer);

            // Add styles if not already present
            if (!document.getElementById('joystick-styles')) {
                const style = document.createElement('style');
                style.id = 'joystick-styles';
                style.textContent = `
                    #virtual-joystick {
                        position: fixed;
                        bottom: 20px;
                        left: 20px;
                        width: 140px;
                        height: 140px;
                        z-index: 999;
                        display: none;
                        touch-action: none;
                        -webkit-touch-callout: none;
                        -webkit-user-select: none;
                        user-select: none;
                    }
                    
                    #virtual-joystick.visible {
                        display: block;
                    }
                    
                    .joystick-base {
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 255, 255, 0.1);
                        border: 3px solid rgba(0, 255, 255, 0.3);
                        border-radius: 50%;
                        position: relative;
                        backdrop-filter: blur(4px);
                    }
                    
                    .joystick-stick {
                        width: 50px;
                        height: 50px;
                        background: linear-gradient(135deg, rgba(0, 255, 255, 0.6), rgba(255, 0, 255, 0.6));
                        border: 2px solid #00ffff;
                        border-radius: 50%;
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
                        transition: transform 0.05s ease-out;
                        pointer-events: none;
                    }
                    
                    .joystick-base:active .joystick-stick,
                    .joystick-base.active .joystick-stick {
                        background: linear-gradient(135deg, rgba(0, 255, 255, 0.9), rgba(255, 0, 255, 0.9));
                        box-shadow: 0 0 30px rgba(0, 255, 255, 0.8);
                    }
                    
                    /* Show joystick only in game screen on mobile */
                    @media (hover: none) and (pointer: coarse) {
                        #screen-game.active ~ #virtual-joystick,
                        #virtual-joystick.game-active {
                            display: block;
                        }
                    }
                    
                    /* Alternative positions for landscape */
                    @media (orientation: landscape) and (hover: none) and (pointer: coarse) {
                        #virtual-joystick {
                            bottom: 50%;
                            left: 20px;
                            transform: translateY(50%);
                        }
                    }
                    
                    /* Smaller on very small screens */
                    @media (max-width: 360px) {
                        #virtual-joystick {
                            width: 100px;
                            height: 100px;
                        }
                        .joystick-stick {
                            width: 40px;
                            height: 40px;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        joystickState.element = joystickContainer.querySelector('.joystick-base');
        joystickState.stickElement = joystickContainer.querySelector('.joystick-stick');

        // Set up touch events
        joystickContainer.addEventListener('touchstart', handleJoystickStart, { passive: false });
        joystickContainer.addEventListener('touchmove', handleJoystickMove, { passive: false });
        joystickContainer.addEventListener('touchend', handleJoystickEnd, { passive: false });
        joystickContainer.addEventListener('touchcancel', handleJoystickEnd, { passive: false });

        console.log('[UI] Virtual joystick initialized');
    }

    /**
     * Handle joystick touch start
     * @param {TouchEvent} e 
     */
    function handleJoystickStart(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect = joystickState.element.getBoundingClientRect();
        
        joystickState.active = true;
        joystickState.touchId = touch.identifier;
        joystickState.centerX = rect.left + rect.width / 2;
        joystickState.centerY = rect.top + rect.height / 2;
        joystickState.currentX = touch.clientX;
        joystickState.currentY = touch.clientY;
        
        joystickState.element.classList.add('active');
        
        // Haptic feedback on touch start
        triggerHaptic('light');
        
        updateJoystickPosition();
    }

    /**
     * Handle joystick touch move
     * @param {TouchEvent} e 
     */
    function handleJoystickMove(e) {
        if (!joystickState.active) return;
        e.preventDefault();
        
        const touch = Array.from(e.changedTouches).find(t => t.identifier === joystickState.touchId);
        if (!touch) return;
        
        joystickState.currentX = touch.clientX;
        joystickState.currentY = touch.clientY;
        
        updateJoystickPosition();
    }

    /**
     * Handle joystick touch end
     * @param {TouchEvent} e 
     */
    function handleJoystickEnd(e) {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === joystickState.touchId);
        if (!touch) return;
        
        joystickState.active = false;
        joystickState.touchId = null;
        joystickState.valueX = 0;
        joystickState.valueY = 0;
        
        joystickState.element.classList.remove('active');
        
        // Reset stick position
        if (joystickState.stickElement) {
            joystickState.stickElement.style.transform = 'translate(-50%, -50%)';
        }
        
        // Haptic feedback on release
        triggerHaptic('light');
    }

    /**
     * Update joystick visual position and calculate values
     */
    function updateJoystickPosition() {
        if (!joystickState.stickElement) return;
        
        const deltaX = joystickState.currentX - joystickState.centerX;
        const deltaY = joystickState.currentY - joystickState.centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = Math.atan2(deltaY, deltaX);
        
        // Clamp to max radius
        const clampedDistance = Math.min(distance, joystickState.maxRadius);
        
        // Calculate normalized values (-1 to 1)
        joystickState.valueX = (Math.cos(angle) * clampedDistance) / joystickState.maxRadius;
        joystickState.valueY = (Math.sin(angle) * clampedDistance) / joystickState.maxRadius;
        
        // Update stick position
        const stickX = Math.cos(angle) * clampedDistance;
        const stickY = Math.sin(angle) * clampedDistance;
        joystickState.stickElement.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
        
        // Call paddle move callback with joystick value
        if (callbacks.onPaddleMove && state.currentScreen === 'GAME' && !state.isPaused) {
            const canvasWidth = elements.gameCanvas?.width || 800;
            const paddleX = (canvasWidth / 2) + (joystickState.valueX * canvasWidth * 0.4);
            callbacks.onPaddleMove(Math.max(0, Math.min(canvasWidth, paddleX)), 'joystick');
        }
    }

    /**
     * Enable virtual joystick
     */
    function enableVirtualJoystick() {
        const joystick = document.getElementById('virtual-joystick');
        if (joystick) {
            joystick.classList.add('visible');
            joystick.classList.add('game-active');
        }
    }

    /**
     * Disable virtual joystick
     */
    function disableVirtualJoystick() {
        const joystick = document.getElementById('virtual-joystick');
        if (joystick) {
            joystick.classList.remove('visible');
            joystick.classList.remove('game-active');
        }
        joystickState.active = false;
    }

    /**
     * Check if joystick is active
     * @returns {boolean}
     */
    function isJoystickActive() {
        return joystickState.active;
    }

    /**
     * Get joystick values
     * @returns {Object} { x, y } values between -1 and 1
     */
    function getJoystickValues() {
        return {
            x: joystickState.valueX,
            y: joystickState.valueY,
            active: joystickState.active
        };
    }

    // ==================== HAPTIC FEEDBACK ====================

    /**
     * Haptic feedback patterns
     */
    const HAPTIC_PATTERNS = {
        light: 10,       // 10ms light tap
        medium: 20,      // 20ms medium feedback
        heavy: 30,       // 30ms strong feedback
        success: [50, 30, 50],  // Success pattern
        error: [100, 50, 100, 50, 200],  // Error pattern
        gameOver: [200, 100, 200],
        levelUp: [30, 20, 30, 20, 30, 50, 100]
    };

    /**
     * Trigger haptic feedback if available
     * @param {string|number|Array} pattern - Haptic pattern name, duration in ms, or custom array
     */
    function triggerHaptic(pattern = 'light') {
        // Check if vibration API is available and user hasn't disabled it
        if (!navigator.vibrate || state.hapticsDisabled) {
            return false;
        }

        try {
            let vibratePattern;
            
            if (typeof pattern === 'string' && HAPTIC_PATTERNS[pattern]) {
                vibratePattern = HAPTIC_PATTERNS[pattern];
            } else if (typeof pattern === 'number') {
                vibratePattern = pattern;
            } else if (Array.isArray(pattern)) {
                vibratePattern = pattern;
            } else {
                vibratePattern = HAPTIC_PATTERNS.light;
            }

            return navigator.vibrate(vibratePattern);
        } catch (err) {
            console.warn('[UI] Haptic feedback failed:', err);
            return false;
        }
    }

    /**
     * Check if haptic feedback is available
     * @returns {boolean}
     */
    function isHapticAvailable() {
        return !!(navigator.vibrate && !state.hapticsDisabled);
    }

    /**
     * Enable/disable haptic feedback
     * @param {boolean} enabled 
     */
    function setHapticsEnabled(enabled) {
        state.hapticsDisabled = !enabled;
        // Save preference
        try {
            localStorage.setItem('arkanoid_haptics', enabled ? '1' : '0');
        } catch (e) {
            // Ignore storage errors
        }
    }

    /**
     * Load haptic preference
     */
    function loadHapticPreference() {
        try {
            const saved = localStorage.getItem('arkanoid_haptics');
            state.hapticsDisabled = saved === '0';
        } catch (e) {
            state.hapticsDisabled = false;
        }
    }

    // ==================== ORIENTATION HANDLING ====================

    /**
     * Orientation state
     */
    const orientationState = {
        current: screen.orientation?.type || 'unknown',
        angle: screen.orientation?.angle || 0,
        isLandscape: false,
        isPortrait: true
    };

    /**
     * Initialize orientation change handling
     */
    function initOrientationHandling() {
        // Update initial state
        updateOrientationState();

        // Listen for orientation changes
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handleOrientationChange);
        } else {
            // Fallback for older browsers
            window.addEventListener('orientationchange', handleOrientationChange);
        }

        // Also listen to resize for responsive adjustments
        window.addEventListener('resize', debounce(() => {
            updateOrientationState();
            adjustLayoutForOrientation();
        }, 250));

        console.log('[UI] Orientation handling initialized');
    }

    /**
     * Handle orientation change event
     */
    function handleOrientationChange() {
        updateOrientationState();
        
        const orientationType = orientationState.isLandscape ? 'landscape' : 'portrait';
        console.log(`[UI] Orientation changed to: ${orientationType} (${orientationState.angle}°)`);

        // Haptic feedback on orientation change
        triggerHaptic('light');

        // Adjust layout
        adjustLayoutForOrientation();

        // Show toast notification
        if (state.currentScreen === 'GAME') {
            const message = orientationState.isLandscape 
                ? 'Landscape mode - Full experience!' 
                : 'Portrait mode - Rotate for best experience';
            showToast(message, TOAST_TYPES.INFO, 2000);
        }

        // Notify game if needed
        if (callbacks.onOrientationChange) {
            callbacks.onOrientationChange(orientationState);
        }
    }

    /**
     * Update orientation state
     */
    function updateOrientationState() {
        if (screen.orientation) {
            orientationState.current = screen.orientation.type;
            orientationState.angle = screen.orientation.angle;
        } else if (window.orientation !== undefined) {
            orientationState.angle = window.orientation;
        }
        
        orientationState.isLandscape = 
            Math.abs(orientationState.angle) === 90 || 
            orientationState.current?.includes('landscape');
        orientationState.isPortrait = !orientationState.isLandscape;
    }

    /**
     * Adjust layout based on current orientation
     */
    function adjustLayoutForOrientation() {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        if (orientationState.isLandscape) {
            gameContainer.classList.add('landscape');
            gameContainer.classList.remove('portrait');
            
            // Adjust canvas for landscape
            if (elements.gameCanvas) {
                elements.gameCanvas.style.maxHeight = '70vh';
            }
        } else {
            gameContainer.classList.add('portrait');
            gameContainer.classList.remove('landscape');
            
            // Adjust canvas for portrait
            if (elements.gameCanvas) {
                elements.gameCanvas.style.maxHeight = '50vh';
            }
        }

        // Resize canvas after orientation change
        setTimeout(() => {
            if (window.dispatchEvent) {
                window.dispatchEvent(new Event('resize'));
            }
        }, 300);
    }

    /**
     * Get current orientation state
     * @returns {Object}
     */
    function getOrientationState() {
        return { ...orientationState };
    }

    /**
     * Request specific orientation (if supported)
     * @param {string} orientation - 'landscape' or 'portrait'
     */
    function lockOrientation(orientation) {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock(orientation).catch(err => {
                console.warn('[UI] Could not lock orientation:', err);
            });
        }
    }

    /**
     * Unlock orientation
     */
    function unlockOrientation() {
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }

    // ==================== FULLSCREEN ====================

    /**
     * Fullscreen state
     */
    const fullscreenState = {
        element: null,
        isActive: false
    };

    /**
     * Initialize fullscreen handling
     */
    function initFullscreen() {
        // Add fullscreen button if on mobile
        if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
            addFullscreenButton();
        }

        // Listen for fullscreen changes
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    }

    /**
     * Add fullscreen toggle button
     */
    function addFullscreenButton() {
        let fsButton = document.getElementById('fullscreen-btn');
        if (fsButton) return;

        fsButton = document.createElement('button');
        fsButton.id = 'fullscreen-btn';
        fsButton.innerHTML = '⛶';
        fsButton.setAttribute('aria-label', 'Toggle Fullscreen');
        fsButton.style.cssText = `
            position: fixed;
            top: var(--space-md);
            right: var(--space-md);
            width: 44px;
            height: 44px;
            background: rgba(0, 0, 0, 0.7);
            border: 2px solid var(--neon-cyan);
            color: var(--neon-cyan);
            font-size: 20px;
            border-radius: 8px;
            cursor: pointer;
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            transition: all 0.2s ease;
        `;

        // Show only in game screen
        const style = document.createElement('style');
        style.textContent = `
            #fullscreen-btn {
                display: none;
            }
            #screen-game.active ~ #fullscreen-btn,
            #fullscreen-btn.visible {
                display: flex;
            }
            #fullscreen-btn:active {
                background: var(--neon-cyan);
                color: var(--bg-primary);
                transform: scale(0.95);
            }
        `;
        document.head.appendChild(style);

        fsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFullscreen();
        });

        // Touch events
        fsButton.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            fsButton.style.background = 'var(--neon-cyan)';
            fsButton.style.color = 'var(--bg-primary)';
        }, { passive: true });
        
        fsButton.addEventListener('touchend', (e) => {
            e.stopPropagation();
            toggleFullscreen();
            setTimeout(() => {
                fsButton.style.background = 'rgba(0, 0, 0, 0.7)';
                fsButton.style.color = 'var(--neon-cyan)';
            }, 100);
        });

        document.body.appendChild(fsButton);
        fullscreenState.element = fsButton;
    }

    /**
     * Toggle fullscreen mode
     */
    function toggleFullscreen() {
        const doc = document;
        const docEl = document.documentElement;

        if (!isFullscreen()) {
            // Enter fullscreen
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().then(() => {
                    triggerHaptic('medium');
                    showToast('Fullscreen enabled', TOAST_TYPES.SUCCESS, 1500);
                }).catch(err => {
                    console.warn('[UI] Fullscreen request failed:', err);
                    showToast('Fullscreen not available', TOAST_TYPES.WARNING);
                });
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
                triggerHaptic('medium');
            } else if (docEl.mozRequestFullScreen) {
                docEl.mozRequestFullScreen();
                triggerHaptic('medium');
            } else if (docEl.msRequestFullscreen) {
                docEl.msRequestFullscreen();
                triggerHaptic('medium');
            }
        } else {
            // Exit fullscreen
            if (doc.exitFullscreen) {
                doc.exitFullscreen().then(() => {
                    triggerHaptic('light');
                }).catch(err => {
                    console.warn('[UI] Exit fullscreen failed:', err);
                });
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
            } else if (doc.mozCancelFullScreen) {
                doc.mozCancelFullScreen();
            } else if (doc.msExitFullscreen) {
                doc.msExitFullscreen();
            }
        }
    }

    /**
     * Check if fullscreen is active
     * @returns {boolean}
     */
    function isFullscreen() {
        return !!(document.fullscreenElement || 
                  document.webkitFullscreenElement || 
                  document.mozFullScreenElement || 
                  document.msFullscreenElement);
    }

    /**
     * Handle fullscreen change event
     */
    function handleFullscreenChange() {
        fullscreenState.isActive = isFullscreen();
        
        // Update button visual state
        const fsButton = document.getElementById('fullscreen-btn');
        if (fsButton) {
            fsButton.innerHTML = fullscreenState.isActive ? '⛶' : '⛶';
            fsButton.style.borderColor = fullscreenState.isActive 
                ? 'var(--neon-green)' 
                : 'var(--neon-cyan)';
        }

        console.log(`[UI] Fullscreen ${fullscreenState.isActive ? 'enabled' : 'disabled'}`);

        // Trigger haptic
        if (fullscreenState.isActive) {
            triggerHaptic('success');
        }
    }

    /**
     * Enter fullscreen (helper function)
     */
    function enterFullscreen() {
        if (!isFullscreen()) {
            toggleFullscreen();
        }
    }

    /**
     * Exit fullscreen (helper function)
     */
    function exitFullscreen() {
        if (isFullscreen()) {
            toggleFullscreen();
        }
    }

    // ==================== APP-LIKE EXPERIENCE ====================

    /**
     * Check if running as installed PWA
     * @returns {boolean}
     */
    function isStandalone() {
        return !!(window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone || // iOS
                  document.referrer.includes('android-app://'));
    }

    /**
     * Initialize app-like features
     */
    function initAppMode() {
        // Prevent default touch behaviors that feel like browser
        document.addEventListener('touchmove', (e) => {
            // Prevent pull-to-refresh in standalone mode
            if (isStandalone() && e.touches[0].clientY < 100) {
                e.preventDefault();
            }
        }, { passive: false });

        // Prevent double-tap zoom
        let lastTouchTime = 0;
        document.addEventListener('touchend', (e) => {
            const touchTime = Date.now();
            if (touchTime - lastTouchTime < 300) {
                e.preventDefault();
            }
            lastTouchTime = touchTime;
        }, { passive: false });

        // Hide address bar on scroll (mobile browsers)
        window.addEventListener('load', () => {
            setTimeout(() => {
                window.scrollTo(0, 1);
            }, 0);
        });

        // Show install prompt info if not standalone
        if (!isStandalone() && window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
            setTimeout(() => {
                showToast('Tip: Install as app for fullscreen!', TOAST_TYPES.INFO, 5000);
            }, 3000);
        }

        console.log('[UI] App mode features initialized. Standalone:', isStandalone());
    }

    /**
     * Debounce helper function
     * @param {Function} func 
     * @param {number} wait 
     * @returns {Function}
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
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
     * BUG FIX #4: Room code copy not working on some browsers - added fallback
     * Uses modern Clipboard API when available, falls back to execCommand for older browsers
     */
    async function handleCopyCode() {
        const code = elements.generatedCode?.textContent;
        if (!code || code === '--------') {
            showToast('No code to copy', TOAST_TYPES.WARNING);
            return;
        }

        let copied = false;

        // Try modern Clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(code);
                copied = true;
            } catch (err) {
                console.warn('[UI] Clipboard API failed:', err);
            }
        }

        // Fallback: use execCommand for older browsers or non-secure contexts
        if (!copied) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = code;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '0';
                textarea.setAttribute('readonly', '');
                document.body.appendChild(textarea);
                
                textarea.select();
                textarea.setSelectionRange(0, 99999); // For mobile devices
                
                copied = document.execCommand('copy');
                document.body.removeChild(textarea);
            } catch (err) {
                console.error('[UI] execCommand fallback failed:', err);
            }
        }

        // Provide user feedback
        const btn = elements.btnCopyCode;
        const originalText = btn.textContent;
        
        if (copied) {
            btn.textContent = 'COPIED!';
            showToast('Code copied to clipboard!', TOAST_TYPES.SUCCESS);
        } else {
            // Last resort: select text for manual copy
            const codeElement = elements.generatedCode;
            if (codeElement) {
                const range = document.createRange();
                range.selectNode(codeElement);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }
            btn.textContent = 'SELECTED - COPY MANUALLY';
            showToast('Please copy the code manually', TOAST_TYPES.WARNING);
        }
        
        // Reset button text after 2 seconds
        setTimeout(() => btn.textContent = originalText, 2000);
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

        // Store previous values for change detection
        const prevScore = elements.scoreDisplay?.textContent;
        const prevLevel = elements.levelDisplay?.textContent;
        const prevLives = elements.livesDisplay?.textContent;

        // Update score
        if (gameState.score !== undefined && elements.scoreDisplay) {
            const newScore = gameState.score.toString().padStart(6, '0');
            elements.scoreDisplay.textContent = newScore;
            // Announce score changes for accessibility
            if (prevScore && newScore !== prevScore && gameState.score > 0) {
                const scoreDiff = gameState.score - parseInt(prevScore);
                if (scoreDiff >= 100) {
                    announce(`Score increased by ${scoreDiff} points`, false);
                }
            }
        }

        // Update level
        if (gameState.level !== undefined && elements.levelDisplay) {
            elements.levelDisplay.textContent = gameState.level.toString().padStart(2, '0');
        }

        // Update lives
        if (gameState.lives !== undefined && elements.livesDisplay) {
            const lives = '♥'.repeat(Math.max(0, gameState.lives));
            elements.livesDisplay.textContent = lives;
            // Announce lives changes
            if (prevLives && lives.length < prevLives.length) {
                announce(`Life lost. ${gameState.lives} lives remaining`, true);
            }
        }
        
        // Update game state description for screen readers
        updateGameStateDescription(gameState);
    }

    /**
     * Update screen reader description of game state
     */
    function updateGameStateDescription(gameState) {
        const descriptionEl = document.getElementById('game-state-description');
        if (!descriptionEl || !gameState) return;
        
        const descriptions = [];
        if (gameState.score !== undefined) {
            descriptions.push(`Score: ${gameState.score}`);
        }
        if (gameState.lives !== undefined) {
            descriptions.push(`Lives: ${gameState.lives}`);
        }
        if (gameState.level !== undefined) {
            descriptions.push(`Level: ${gameState.level}`);
        }
        
        descriptionEl.textContent = descriptions.join('. ');
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
        const loadingText = document.getElementById('loading-text') || elements.loadingText;
        if (loadingText) {
            loadingText.textContent = text?.toUpperCase() || 'LOADING...';
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
        dismissToast,
        TOAST_TYPES,
        
        // Visual polish functions
        addRippleEffects,
        createRipple,
        applyStaggeredAnimations,
        
        // Loading
        showLoading,
        setLoadingText,
        updateLoadingProgress,
        setIndeterminateProgress,
        
        // Game state
        getState,
        isGamePaused,
        isGameActive,
        setGameActive,
        
        // Accessibility
        announce,
        focusFirstInteractive,
        updateGameStateDescription,
        
        // Focus traps
        setupFocusTraps,

        // Settings
        loadSettingsToUI: () => {
            if (typeof loadSettingsToUI === 'function') {
                loadSettingsToUI();
            }
        },

        // Network
        getNetwork,

        // Constants
        SCREENS
    };

})();

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UIController.init());
} else {
    // Defer to ensure all scripts loaded
    setTimeout(() => UIController.init(), 0);
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
