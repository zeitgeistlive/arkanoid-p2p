/**
 * Arkanoid P2P - Web Audio API Sound System
 * Synthesized sounds - no external audio files required
 * Style: Гоп-стоп (90s post-Soviet aesthetic)
 */

// ============================================================================
// AUDIO SYSTEM - Web Audio API Synthesizer
// ============================================================================

class AudioSynth {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.ambientGain = null;
        this.sfxGain = null;
        this.ambientOscillators = [];
        this.isMuted = false;
        this.volume = 0.7;
        this.isInitialized = false;
        this.hasAudioContext = false;

        // Sound presets
        this.presets = {
            paddleHit: { frequency: 220, type: 'sine', duration: 0.1, attack: 0.005, decay: 0.08 },
            blockDestroy: { frequency: 440, type: 'square', duration: 0.15, attack: 0.01, decay: 0.12 },
            powerUp: { frequency: 880, type: 'sawtooth', duration: 0.3, attack: 0.02, decay: 0.25 },
            levelComplete: { frequency: 660, type: 'triangle', duration: 0.8, attack: 0.05, decay: 0.7 },
            gameOver: { frequency: 110, type: 'sawtooth', duration: 1.2, attack: 0.1, decay: 1.0 }
        };

        // Check for Web Audio API support
        this._checkSupport();
    }

    /**
     * Check if Web Audio API is supported
     */
    _checkSupport() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.hasAudioContext = true;
            } else {
                console.warn('[Audio] Web Audio API not supported - audio disabled');
                this.hasAudioContext = false;
            }
        } catch (e) {
            console.warn('[Audio] Error checking AudioContext support:', e);
            this.hasAudioContext = false;
        }
    }

    /**
     * Initialize audio context (must be called after user interaction)
     */
    init() {
        if (this.isInitialized || !this.hasAudioContext) return false;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            // Create master gain (volume control)
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.ctx.destination);

            // Create submix gains
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 1.0;
            this.sfxGain.connect(this.masterGain);

            this.ambientGain = this.ctx.createGain();
            this.ambientGain.gain.value = 0.3; // Ambient is quieter
            this.ambientGain.connect(this.masterGain);

            this.isInitialized = true;
            console.log('[Audio] Audio system initialized');

            // Start ambient drone
            this.startAmbient();

            return true;
        } catch (e) {
            console.error('[Audio] Failed to initialize audio:', e);
            this.hasAudioContext = false;
            return false;
        }
    }

    /**
     * Ensure audio context is running (resume if suspended)
     */
    async ensureRunning() {
        if (!this.isInitialized || !this.ctx) {
            return this.init();
        }

        if (this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
                console.log('[Audio] AudioContext resumed');
            } catch (e) {
                console.warn('[Audio] Failed to resume AudioContext:', e);
            }
        }

        return true;
    }

    /**
     * Create a simple synthesized sound
     */
    _playTone(config, pitchMod = 0) {
        if (!this.isInitialized || this.isMuted || !this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Configure oscillator
        osc.type = config.type;
        osc.frequency.setValueAtTime(config.frequency + pitchMod, now);

        // Configure envelope
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + config.attack);
        gain.gain.exponentialRampToValueAtTime(0.001, now + config.attack + config.decay);

        // Connect and start
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + config.duration + 0.1);

        // Cleanup
        setTimeout(() => {
            osc.disconnect();
            gain.disconnect();
        }, (config.duration + 0.2) * 1000);
    }

    /**
     * Play paddle hit sound
     */
    paddleHit() {
        if (!this.isInitialized || !this.ctx) {
            this.init();
            return;
        }

        this.ensureRunning();

        // Pitch varies slightly based on ball speed for variety
        const pitchMod = Math.random() * 60 - 30;
        this._playTone(this.presets.paddleHit, pitchMod);

        // Add a subtle secondary tone for punchiness
        setTimeout(() => {
            if (!this.isMuted && this.ctx) {
                this._playTone({
                    frequency: 110,
                    type: 'triangle',
                    duration: 0.05,
                    attack: 0.002,
                    decay: 0.04
                }, 0);
            }
        }, 10);
    }

    /**
     * Play block destroy sound
     */
    blockDestroy(blockHP = 1) {
        if (!this.isInitialized || !this.ctx) {
            this.init();
            return;
        }

        this.ensureRunning();

        // Higher pitch for higher HP blocks
        const pitchMod = (4 - blockHP) * 100;
        this._playTone(this.presets.blockDestroy, pitchMod);

        // Add sparkle effect for higher HP blocks
        if (blockHP >= 2) {
            setTimeout(() => {
                this._playTone({
                    frequency: 880 + pitchMod,
                    type: 'sine',
                    duration: 0.1,
                    attack: 0.01,
                    decay: 0.08
                }, 0);
            }, 30);
        }
    }

    /**
     * Play power-up pickup sound
     */
    powerUp() {
        if (!this.isInitialized || !this.ctx) {
            this.init();
            return;
        }

        this.ensureRunning();

        // Rising pitch arpeggio
        const baseFreq = this.presets.powerUp.frequency;
        const notes = [0, 4, 7, 12]; // Major arpeggio intervals

        notes.forEach((interval, i) => {
            setTimeout(() => {
                if (!this.isMuted && this.ctx) {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(baseFreq * Math.pow(2, interval / 12), this.ctx.currentTime);

                    gain.gain.setValueAtTime(0, this.ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

                    osc.connect(gain);
                    gain.connect(this.sfxGain);

                    osc.start(this.ctx.currentTime);
                    osc.stop(this.ctx.currentTime + 0.18);

                    setTimeout(() => {
                        osc.disconnect();
                        gain.disconnect();
                    }, 200);
                }
            }, i * 80);
        });
    }

    /**
     * Play level complete fanfare
     */
    levelComplete() {
        if (!this.isInitialized || !this.ctx) {
            this.init();
            return;
        }

        this.ensureRunning();

        const now = this.ctx.currentTime;
        const baseFreq = this.presets.levelComplete.frequency;
        const chords = [
            [0, 4, 7],     // Major
            [5, 9, 12],    // Fourth
            [7, 11, 14],   // Fifth
            [0, 4, 7, 12]  // Octave
        ];

        // Play chord progression
        chords.forEach((chord, chordIndex) => {
            setTimeout(() => {
                if (!this.isMuted && this.ctx) {
                    chord.forEach((interval, noteIndex) => {
                        setTimeout(() => {
                            if (!this.isMuted && this.ctx) {
                                const osc = this.ctx.createOscillator();
                                const gain = this.ctx.createGain();

                                osc.type = 'triangle';
                                const freq = baseFreq * Math.pow(2, interval / 12);
                                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

                                gain.gain.setValueAtTime(0, this.ctx.currentTime);
                                gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.1);
                                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

                                osc.connect(gain);
                                gain.connect(this.sfxGain);

                                osc.start(this.ctx.currentTime);
                                osc.stop(this.ctx.currentTime + 0.7);

                                setTimeout(() => {
                                    osc.disconnect();
                                    gain.disconnect();
                                }, 800);
                            }
                        }, noteIndex * 50);
                    });
                }
            }, chordIndex * 200);
        });
    }

    /**
     * Play game over sound
     */
    gameOver() {
        if (!this.isInitialized || !this.ctx) {
            this.init();
            return;
        }

        this.ensureRunning();

        const now = this.ctx.currentTime;
        const baseFreq = this.presets.gameOver.frequency;

        // Descending glissando
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq / 4, now + 1.5);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        // Add filter sweep for "vintage" effect
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 1.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 1.6);

        setTimeout(() => {
            osc.disconnect();
            filter.disconnect();
            gain.disconnect();
        }, 1700);

        // Deep drone underneath
        setTimeout(() => {
            if (!this.isMuted && this.ctx) {
                const droneOsc = this.ctx.createOscillator();
                const droneGain = this.ctx.createGain();

                droneOsc.type = 'sine';
                droneOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

                droneGain.gain.setValueAtTime(0, this.ctx.currentTime);
                droneGain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.3);
                droneGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.0);

                droneOsc.connect(droneGain);
                droneGain.connect(this.sfxGain);

                droneOsc.start(this.ctx.currentTime);
                droneOsc.stop(this.ctx.currentTime + 2.1);

                setTimeout(() => {
                    droneOsc.disconnect();
                    droneGain.disconnect();
                }, 2200);
            }
        }, 100);
    }

    /**
     * Start ambient background drone
     */
    startAmbient() {
        if (!this.isInitialized || !this.ctx || this.ambientOscillators.length > 0) return;

        const now = this.ctx.currentTime;

        // Create multiple oscillators for a rich drone
        const droneConfig = [
            { freq: 55, type: 'sine', gain: 0.15 },      // A1
            { freq: 82.5, type: 'sine', gain: 0.08 },    // E2 (perfect fifth)
            { freq: 110, type: 'triangle', gain: 0.05 }, // A2
            { freq: 165, type: 'sine', gain: 0.04 }      // E3
        ];

        droneConfig.forEach(config => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = config.type;
            osc.frequency.setValueAtTime(config.freq, now);

            // Slight detuning for "beating" effect
            osc.detune.value = (Math.random() - 0.5) * 10;

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(config.gain, now + 2);

            osc.connect(gain);
            gain.connect(this.ambientGain);

            osc.start(now);

            this.ambientOscillators.push({ osc, gain });
        });

        // Add subtle modulation
        this._modulateAmbient();
    }

    /**
     * Modulate ambient sound for variation
     */
    _modulateAmbient() {
        if (!this.isInitialized || this.ambientOscillators.length === 0 || !this.ctx) return;

        const modulate = () => {
            if (!this.isInitialized || !this.ctx) return;

            const now = this.ctx.currentTime;

            this.ambientOscillators.forEach((obj, i) => {
                // Slowly vary the detune
                const newDetune = (Math.random() - 0.5) * 15;
                obj.osc.detune.setTargetAtTime(newDetune, now, 3);

                // Subtle volume variation
                const baseGain = [0.15, 0.08, 0.05, 0.04][i];
                const variation = baseGain * 0.3;
                const newGain = baseGain + (Math.random() - 0.5) * variation;
                obj.gain.gain.setTargetAtTime(Math.max(0.01, newGain), now, 4);
            });

            // Schedule next modulation
            if (this.isInitialized) {
                setTimeout(() => modulate(), 4000 + Math.random() * 2000);
            }
        };

        modulate();
    }

    /**
     * Stop ambient drone
     */
    stopAmbient() {
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        this.ambientOscillators.forEach(obj => {
            obj.gain.gain.setTargetAtTime(0, now, 0.5);
            obj.osc.stop(now + 1);
        });

        this.ambientOscillators = [];
    }

    // ============================================================================
    // VOLUME CONTROLS
    // ============================================================================

    /**
     * Set master volume (0.0 to 1.0)
     */
    setVolume(value) {
        this.volume = clamp(value, 0, 1);

        if (this.masterGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.setTargetAtTime(this.volume, now, 0.1);
        }

        console.log(`[Audio] Volume set to ${Math.round(this.volume * 100)}%`);
    }

    /**
     * Get current volume
     */
    getVolume() {
        return this.volume;
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        this.isMuted = !this.isMuted;

        if (this.masterGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, now, 0.1);
        }

        console.log(`[Audio] Muted: ${this.isMuted}`);
        return this.isMuted;
    }

    /**
     * Set mute state
     */
    setMute(muted) {
        this.isMuted = muted;

        if (this.masterGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, now, 0.1);
        }
    }

    /**
     * Check if audio is muted
     */
    isAudioMuted() {
        return this.isMuted;
    }

    // ============================================================================
    // STATUS & INFO
    // ============================================================================

    /**
     * Check if audio is available and supported
     */
    isAvailable() {
        return this.hasAudioContext;
    }

    /**
     * Check if audio is initialized and running
     */
    isActive() {
        return this.isInitialized && this.ctx && this.ctx.state === 'running';
    }

    /**
     * Get audio context state
     */
    getState() {
        if (!this.hasAudioContext) return 'unsupported';
        if (!this.ctx) return 'uninitialized';
        return this.ctx.state;
    }

    /**
     * Destroy and cleanup audio context
     */
    destroy() {
        this.stopAmbient();

        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }

        this.masterGain = null;
        this.sfxGain = null;
        this.ambientGain = null;
        this.ambientOscillators = [];
        this.isInitialized = false;

        console.log('[Audio] Audio system destroyed');
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// ============================================================================
// GLOBAL AUDIO INSTANCE
// ============================================================================

// Create global audio instance
const audioSynth = new AudioSynth();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioSynth, audioSynth };
}

// Also expose to window for browser usage
if (typeof window !== 'undefined') {
    window.AudioSynth = AudioSynth;
    window.audioSynth = audioSynth;

    // Convenience functions for game events
    window.playPaddleHit = () => audioSynth.paddleHit();
    window.playBlockDestroy = (hp) => audioSynth.blockDestroy(hp);
    window.playPowerUp = () => audioSynth.powerUp();
    window.playLevelComplete = () => audioSynth.levelComplete();
    window.playGameOver = () => audioSynth.gameOver();

    // Volume controls
    window.setGameVolume = (v) => audioSynth.setVolume(v);
    window.toggleGameMute = () => audioSynth.toggleMute();
    window.isGameMuted = () => audioSynth.isAudioMuted();
}

// ============================================================================
// AUTO-INITIALIZATION ON FIRST INTERACTION
// ============================================================================

// Initialize audio on first user interaction (required by browsers)
function initAudioOnInteraction() {
    if (!audioSynth.isInitialized && audioSynth.isAvailable()) {
        audioSynth.init();
    }
}

// Add listeners for first interaction
if (typeof document !== 'undefined') {
    const events = ['click', 'touchstart', 'keydown'];

    events.forEach(event => {
        document.addEventListener(event, initAudioOnInteraction, { once: true });
    });
}

console.log('[Audio] Audio module loaded. Click/tap/press any key to initialize.');