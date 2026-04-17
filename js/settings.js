/*** Settings Module for Arkanoid P2P
 * Handles game settings including:
 * - Audio volume
 * - Particle density
 * - Difficulty (Easy/Normal/Hard)
 * - Colorblind mode
 * - Save/Export/Import/Reset
 */

const SettingsManager = (function() {
    'use strict';

    // Default settings
    const DEFAULTS = {
        audioVolume: 0.7,
        particleDensity: 'medium', // low, medium, high
        difficulty: 'normal', // easy, normal, hard
        colorblindMode: 'off', // off, deuteranopia, protanopia, tritanopia, monochrome
        hapticsEnabled: true,
        screenShake: true
    };

    // Settings state
    let settings = { ...DEFAULTS };
    let settingsKey = 'arkanoid_settings';
    let callbacks = {};

    /**
     * Initialize settings manager
     */
    function init() {
        loadSettings();
        console.log('[Settings] Initialized with', settings);
    }

    /**
     * Load settings from localStorage
     */
    function loadSettings() {
        try {
            const saved = localStorage.getItem(settingsKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                settings = { ...DEFAULTS, ...parsed };
            }
        } catch (e) {
            console.warn('[Settings] Failed to load settings:', e);
            settings = { ...DEFAULTS };
        }
    }

    /**
     * Save settings to localStorage
     */
    function saveSettings() {
        try {
            localStorage.setItem(settingsKey, JSON.stringify(settings));
            if (callbacks.onSettingsSaved) {
                callbacks.onSettingsSaved(settings);
            }
            return true;
        } catch (e) {
            console.error('[Settings] Failed to save settings:', e);
            return false;
        }
    }

    /**
     * Get a setting value
     */
    function get(key) {
        return settings[key];
    }

    /**
     * Get all settings
     */
    function getAll() {
        return { ...settings };
    }

    /**
     * Set a setting value
     */
    function set(key, value) {
        const oldValue = settings[key];
        settings[key] = value;
        
        // Trigger callback if value changed
        if (oldValue !== value && callbacks.onSettingChanged) {
            callbacks.onSettingChanged(key, value, oldValue);
        }
        
        // Auto-save
        saveSettings();
    }

    /**
     * Reset all settings to defaults
     */
    function resetToDefaults() {
        settings = { ...DEFAULTS };
        saveSettings();
        if (callbacks.onSettingsReset) {
            callbacks.onSettingsReset(settings);
        }
        return settings;
    }

    /**
     * Export settings as JSON string
     */
    function exportSettings() {
        try {
            return JSON.stringify(settings, null, 2);
        } catch (e) {
            console.error('[Settings] Failed to export settings:', e);
            return null;
        }
    }

    /**
     * Import settings from JSON string
     */
    function importSettings(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            // Validate required fields
            const validKeys = Object.keys(DEFAULTS);
            const filtered = {};
            for (const key of validKeys) {
                if (imported[key] !== undefined) {
                    filtered[key] = imported[key];
                }
            }
            settings = { ...DEFAULTS, ...filtered };
            saveSettings();
            if (callbacks.onSettingsImported) {
                callbacks.onSettingsImported(settings);
            }
            return { success: true, settings };
        } catch (e) {
            console.error('[Settings] Failed to import settings:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get difficulty modifiers for game logic
     */
    function getDifficultyModifiers() {
        switch (settings.difficulty) {
            case 'easy':
                return {
                    ballSpeedMultiplier: 0.8,
                    blockHpMultiplier: 0.7,
                    powerUpChance: 0.35,
                    livesBonus: 2
                };
            case 'hard':
                return {
                    ballSpeedMultiplier: 1.3,
                    blockHpMultiplier: 1.5,
                    powerUpChance: 0.15,
                    livesBonus: -1
                };
            case 'normal':
            default:
                return {
                    ballSpeedMultiplier: 1.0,
                    blockHpMultiplier: 1.0,
                    powerUpChance: 0.25,
                    livesBonus: 0
                };
        }
    }

    /**
     * Get particle multiplier based on density setting
     */
    function getParticleMultiplier() {
        switch (settings.particleDensity) {
            case 'low': return 0.5;
            case 'high': return 2.0;
            case 'medium':
            default: return 1.0;
        }
    }

    /**
     * Get colorblind color adjustments
     */
    function getColorblindColors() {
        const colorMap = {
            off: {
                paddle1: '#00FF88',
                paddle2: '#0088FF',
                ball: '#FF0055',
                block1: '#FFAA00',
                block2: '#FF5500',
                block3: '#FF0055'
            },
            deuteranopia: {
                // Red-green colorblind (more yellow/blue)
                paddle1: '#FFFF00',
                paddle2: '#0099FF',
                ball: '#9999FF',
                block1: '#FFFF00',
                block2: '#FF8800',
                block3: '#9999FF'
            },
            protanopia: {
                // Red-blind (more green/yellow)
                paddle1: '#CCFF00',
                paddle2: '#00CCFF',
                ball: '#FFD580',
                block1: '#CCFF00',
                block2: '#FFCC00',
                block3: '#FFD580'
            },
            tritanopia: {
                // Blue-blind (more red/green)
                paddle1: '#00FF88',
                paddle2: '#FF0088',
                ball: '#FF4400',
                block1: '#FFCC00',
                block2: '#FF8800',
                block3: '#FF4400'
            },
            monochrome: {
                // Grayscale
                paddle1: '#CCCCCC',
                paddle2: '#888888',
                ball: '#FFFFFF',
                block1: '#DDDDDD',
                block2: '#AAAAAA',
                block3: '#777777'
            }
        };
        return colorMap[settings.colorblindMode] || colorMap.off;
    }

    /**
     * Register callback
     */
    function on(event, callback) {
        callbacks[event] = callback;
    }

    /**
     * Apply settings to AudioSynth
     */
    function applyAudioSettings(audioSynth) {
        if (audioSynth && typeof audioSynth.setVolume === 'function') {
            audioSynth.setVolume(settings.audioVolume);
        }
    }

    /**
     * Apply settings to ParticleSystem
     */
    function applyParticleSettings(particleSystem) {
        // Particle multiplier is accessed via getParticleMultiplier()
        // This is handled in the game engine
    }

    /**
     * Apply settings to Game (difficulty)
     */
    function applyGameSettings(game) {
        if (!game) return;
        
        const modifiers = getDifficultyModifiers();
        
        // Store modifiers on game for use during updates
        game.difficultyModifiers = modifiers;
        
        // Apply colorblind colors if needed
        if (settings.colorblindMode !== 'off') {
            const colors = getColorblindColors();
            game.colorAdjustments = colors;
            
            // Update GAME_CONFIG colors temporarily
            if (typeof GAME_CONFIG !== 'undefined') {
                GAME_CONFIG.colors.paddle1 = colors.paddle1;
                GAME_CONFIG.colors.paddle2 = colors.paddle2;
                GAME_CONFIG.colors.ball = colors.ball;
                GAME_CONFIG.colors.blocks[1] = colors.block1;
                GAME_CONFIG.colors.blocks[2] = colors.block2;
                GAME_CONFIG.colors.blocks[3] = colors.block3;
            }
        } else {
            game.colorAdjustments = null;
        }
        
        console.log('[Settings] Applied to game:', modifiers);
    }

    // Initialize immediately
    init();

    // Public API
    return {
        init,
        get,
        getAll,
        set,
        saveSettings,
        loadSettings,
        resetToDefaults,
        exportSettings,
        importSettings,
        getDifficultyModifiers,
        getParticleMultiplier,
        getColorblindColors,
        on,
        applyAudioSettings,
        applyParticleSettings,
        applyGameSettings,
        DEFAULTS
    };
})();

// Make available globally
window.SettingsManager = SettingsManager;
