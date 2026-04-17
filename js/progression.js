/**
 * Arkanoid P2P - Progression System
 * 
 * Features:
 * 1. Achievement system (first win, combo master, speed demon)
 * 2. LocalStorage high scores
 * 3. Player statistics tracking
 * 4. Tutorial overlay for first-time players
 * 5. Level unlock progression
 */

// ============================================================================
// ACHIEVEMENT SYSTEM
// ============================================================================

const ACHIEVEMENTS = {
    // First Win
    FIRST_VICTORY: {
        id: 'first_victory',
        name: 'First Victory',
        description: 'Complete your first level',
        icon: '🏆',
        condition: (stats) => stats.levelsCompleted >= 1,
        rarity: 'common'
    },
    
    // Combo Master
    COMBO_MASTER_5: {
        id: 'combo_master_5',
        name: 'Combo Starter',
        description: 'Achieve a 5x combo',
        icon: '⚡',
        condition: (stats) => stats.maxCombo >= 5,
        rarity: 'common'
    },
    COMBO_MASTER_10: {
        id: 'combo_master_10',
        name: 'Combo Master',
        description: 'Achieve a 10x combo',
        icon: '🔥',
        condition: (stats) => stats.maxCombo >= 10,
        rarity: 'rare'
    },
    COMBO_MASTER_20: {
        id: 'combo_master_20',
        name: 'Combo Legend',
        description: 'Achieve a 20x combo',
        icon: '🌟',
        condition: (stats) => stats.maxCombo >= 20,
        rarity: 'epic'
    },
    
    // Speed Demon
    SPEED_DEMON: {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Complete a level in under 60 seconds',
        icon: '⚡',
        condition: (stats) => stats.fastestLevelTime > 0 && stats.fastestLevelTime < 60,
        rarity: 'rare'
    },
    SPEED_FREAK: {
        id: 'speed_freak',
        name: 'Speed Freak',
        description: 'Complete a level in under 30 seconds',
        icon: '🚀',
        condition: (stats) => stats.fastestLevelTime > 0 && stats.fastestLevelTime < 30,
        rarity: 'epic'
    },
    
    // Block Destroyer
    BLOCK_DESTROYER_100: {
        id: 'block_destroyer_100',
        name: 'Block Buster',
        description: 'Destroy 100 blocks',
        icon: '🧱',
        condition: (stats) => stats.totalBlocksDestroyed >= 100,
        rarity: 'common'
    },
    BLOCK_DESTROYER_500: {
        id: 'block_destroyer_500',
        name: 'Block Demolisher',
        description: 'Destroy 500 blocks',
        icon: '💥',
        condition: (stats) => stats.totalBlocksDestroyed >= 500,
        rarity: 'rare'
    },
    BLOCK_DESTROYER_1000: {
        id: 'block_destroyer_1000',
        name: 'Block Annihilator',
        description: 'Destroy 1,000 blocks',
        icon: '☄️',
        condition: (stats) => stats.totalBlocksDestroyed >= 1000,
        rarity: 'epic'
    },
    
    // Survival
    SURVIVOR_3: {
        id: 'survivor_3',
        name: 'Survivor',
        description: 'Complete 3 levels without losing a life',
        streakKey: 'levelsWithoutLosingLife',
        icon: '🛡️',
        condition: (stats) => stats.bestStreak?.levelsWithoutLosingLife >= 3,
        rarity: 'rare'
    },
    SURVIVOR_5: {
        id: 'survivor_5',
        name: 'Iron Will',
        description: 'Complete 5 levels without losing a life',
        streakKey: 'levelsWithoutLosingLife',
        icon: '💎',
        condition: (stats) => stats.bestStreak?.levelsWithoutLosingLife >= 5,
        rarity: 'epic'
    },
    
    // Score Milestones
    SCORE_10K: {
        id: 'score_10k',
        name: 'Score Hunter',
        description: 'Reach 10,000 points in a single game',
        icon: '💰',
        condition: (stats) => stats.bestScore >= 10000,
        rarity: 'common'
    },
    SCORE_50K: {
        id: 'score_50k',
        name: 'Score Master',
        description: 'Reach 50,000 points in a single game',
        icon: '👑',
        condition: (stats) => stats.bestScore >= 50000,
        rarity: 'rare'
    },
    SCORE_100K: {
        id: 'score_100k',
        name: 'Score Legend',
        description: 'Reach 100,000 points in a single game',
        icon: '🏅',
        condition: (stats) => stats.bestScore >= 100000,
        rarity: 'epic'
    },
    
    // Level Progression
    LEVEL_5: {
        id: 'level_5',
        name: 'Halfway There',
        description: 'Reach level 5',
        icon: '🎯',
        condition: (stats) => stats.highestLevelReached >= 5,
        rarity: 'common'
    },
    LEVEL_10: {
        id: 'level_10',
        name: 'Decathlon',
        description: 'Reach level 10',
        icon: '🎪',
        condition: (stats) => stats.highestLevelReached >= 10,
        rarity: 'rare'
    },
    LEVEL_15: {
        id: 'level_15',
        name: 'True Gamer',
        description: 'Reach level 15',
        icon: '🎮',
        condition: (stats) => stats.highestLevelReached >= 15,
        rarity: 'epic'
    },
    LEVEL_20: {
        id: 'level_20',
        name: 'Arkanoid God',
        description: 'Complete all 20 levels',
        icon: '👑',
        condition: (stats) => stats.highestLevelReached >= 20,
        rarity: 'legendary'
    },
    
    // Power-ups
    POWERUP_COLLECTOR: {
        id: 'powerup_collector',
        name: 'Power-Up Junkie',
        description: 'Collect 20 power-ups',
        icon: '⚡',
        condition: (stats) => stats.totalPowerUpsCollected >= 20,
        rarity: 'common'
    },
    
    // Multiplayer
    MULTIPLAYER_MASTER: {
        id: 'multiplayer_master',
        name: 'Team Player',
        description: 'Complete 5 levels in multiplayer',
        icon: '🤝',
        condition: (stats) => stats.multiplayerLevelsCompleted >= 5,
        rarity: 'rare'
    },
    
    // Perfectionist
    PERFECT_GAME: {
        id: 'perfect_game',
        name: 'Untouchable',
        description: 'Complete a level without losing a life',
        icon: '✨',
        condition: (stats) => stats.perfectLevels >= 1,
        rarity: 'rare'
    },
    PERFECT_RUN: {
        id: 'perfect_run',
        name: 'Legendary Run',
        description: 'Complete 3 levels in a row without losing a life',
        icon: '🔱',
        condition: (stats) => stats.perfectLevels >= 3,
        rarity: 'epic'
    }
};

const RARITY_COLORS = {
    common: '#00FF88',
    rare: '#00FFFF',
    epic: '#FF00FF',
    legendary: '#FFD700'
};

// ============================================================================
// PROGRESSION MANAGER CLASS
// ============================================================================

class ProgressionManager {
    constructor() {
        this.storageKey = 'arkanoid_p2p_progression';
        this.highScoresKey = 'arkanoid_p2p_highscores';
        this.statsKey = 'arkanoid_p2p_stats';
        this.unlocksKey = 'arkanoid_p2p_unlocks';
        this.tutorialKey = 'arkanoid_p2p_tutorial_shown';
        
        this.achievements = { ...ACHIEVEMENTS };
        this.unlockedAchievements = new Set();
        this.currentStreak = {
            levelsWithoutLosingLife: 0,
            currentCombo: 0
        };
        this.sessionStats = this.createEmptySessionStats();
        
        this.loadData();
    }
    
    createEmptySessionStats() {
        return {
            blocksDestroyed: 0,
            powerUpsCollected: 0,
            levelStartTime: null,
            levelDeaths: 0,
            combo: 0,
            maxCombo: 0,
            perfectLevel: true
        };
    }
    
    // ============================================================================
    // LOCAL STORAGE MANAGEMENT
    // ============================================================================
    
    loadData() {
        try {
            // Load achievements
            const achievementsData = localStorage.getItem(this.storageKey);
            if (achievementsData) {
                const parsed = JSON.parse(achievementsData);
                this.unlockedAchievements = new Set(parsed.unlocked || []);
            }
            
            // Load stats (merge with defaults)
            const statsData = localStorage.getItem(this.statsKey);
            if (statsData) {
                this.stats = { ...this.getDefaultStats(), ...JSON.parse(statsData) };
            } else {
                this.stats = this.getDefaultStats();
            }
            
            // Load high scores
            const highScoresData = localStorage.getItem(this.highScoresKey);
            if (highScoresData) {
                this.highScores = JSON.parse(highScoresData);
            } else {
                this.highScores = this.getDefaultHighScores();
            }
            
            // Load level unlocks
            const unlocksData = localStorage.getItem(this.unlocksKey);
            if (unlocksData) {
                this.unlocks = { ...this.getDefaultUnlocks(), ...JSON.parse(unlocksData) };
            } else {
                this.unlocks = this.getDefaultUnlocks();
            }
        } catch (e) {
            console.warn('[Progression] Failed to load data:', e);
            this.stats = this.getDefaultStats();
            this.highScores = this.getDefaultHighScores();
            this.unlocks = this.getDefaultUnlocks();
        }
    }
    
    saveData() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify({
                unlocked: Array.from(this.unlockedAchievements),
                lastSaved: Date.now()
            }));
            
            localStorage.setItem(this.statsKey, JSON.stringify(this.stats));
            localStorage.setItem(this.highScoresKey, JSON.stringify(this.highScores));
            localStorage.setItem(this.unlocksKey, JSON.stringify(this.unlocks));
        } catch (e) {
            console.warn('[Progression] Failed to save data:', e);
        }
    }
    
    getDefaultStats() {
        return {
            gamesPlayed: 0,
            totalLevelsCompleted: 0,
            totalBlocksDestroyed: 0,
            totalPowerUpsCollected: 0,
            totalPlayTime: 0, // in seconds
            bestScore: 0,
            highestLevelReached: 1,
            maxCombo: 0,
            fastestLevelTime: 0,
            averageLevelTime: 0,
            perfectLevels: 0,
            multiplayerLevelsCompleted: 0,
            bestStreak: {
                levelsWithoutLosingLife: 0
            },
            firstPlayedDate: Date.now(),
            lastPlayedDate: Date.now()
        };
    }
    
    getDefaultHighScores() {
        return {
            easy: [],
            normal: [],
            hard: []
        };
    }
    
    getDefaultUnlocks() {
        return {
            highestUnlockedLevel: 1,
            totalLevels: 20, // Total levels available
            completedLevels: [] // Array of completed level numbers
        };
    }
    
    // ============================================================================
    // ACHIEVEMENT SYSTEM
    // ============================================================================
    
    checkAchievements() {
        const newlyUnlocked = [];
        
        for (const [key, achievement] of Object.entries(this.achievements)) {
            if (this.unlockedAchievements.has(achievement.id)) {
                continue; // Already unlocked
            }
            
            if (achievement.condition(this.stats)) {
                this.unlockAchievement(achievement);
                newlyUnlocked.push(achievement);
            }
        }
        
        if (newlyUnlocked.length > 0) {
            this.saveData();
        }
        
        return newlyUnlocked;
    }
    
    unlockAchievement(achievement) {
        this.unlockedAchievements.add(achievement.id);
        console.log(`[Progression] Achievement unlocked: ${achievement.name}`);
        
        // Dispatch event for UI notification
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('achievement-unlocked', {
                detail: achievement
            }));
        }
        
        return achievement;
    }
    
    isAchievementUnlocked(achievementId) {
        return this.unlockedAchievements.has(achievementId);
    }
    
    getAllAchievements() {
        return Object.values(this.achievements).map(ach => ({
            ...ach,
            unlocked: this.unlockedAchievements.has(ach.id),
            color: RARITY_COLORS[ach.rarity]
        }));
    }
    
    getUnlockedAchievements() {
        return Array.from(this.unlockedAchievements).map(id => {
            const ach = Object.values(this.achievements).find(a => a.id === id);
            return ach ? { ...ach, color: RARITY_COLORS[ach.rarity] } : null;
        }).filter(Boolean);
    }
    
    getAchievementProgress(achievementId) {
        const achievement = Object.values(this.achievements).find(a => a.id === achievementId);
        if (!achievement) return null;
        
        // Calculate progress based on achievement type
        let progress = 0;
        let target = 1;
        
        if (achievementId.includes('combo')) {
            const targetCombo = parseInt(achievementId.split('_')[2]) || 5;
            progress = Math.min(this.stats.maxCombo, this.sessionStats.maxCombo || 0);
            target = targetCombo;
        } else if (achievementId.includes('block_destroyer')) {
            const targetBlocks = parseInt(achievementId.split('_')[2]) || 100;
            progress = this.stats.totalBlocksDestroyed;
            target = targetBlocks;
        } else if (achievementId.includes('level_')) {
            const targetLevel = parseInt(achievementId.split('_')[1]) || 5;
            progress = this.stats.highestLevelReached;
            target = targetLevel;
        } else if (achievementId.includes('score_')) {
            const targetScore = parseInt(achievementId.split('_')[1]) || 10;
            progress = this.stats.bestScore;
            target = targetScore * 1000;
        }
        
        return {
            current: progress,
            target: target,
            percent: Math.min(100, Math.round((progress / target) * 100))
        };
    }
    
    // ============================================================================
    // HIGH SCORE SYSTEM
    // ============================================================================
    
    addHighScore(score, level, difficulty = 'normal', playerName = 'Player') {
        const entry = {
            score: score,
            level: level,
            playerName: playerName,
            date: Date.now(),
            difficulty: difficulty
        };
        
        this.highScores[difficulty].push(entry);
        
        // Sort by score (descending) and keep top 10
        this.highScores[difficulty].sort((a, b) => b.score - a.score);
        this.highScores[difficulty] = this.highScores[difficulty].slice(0, 10);
        
        // Update best score in stats
        if (score > this.stats.bestScore) {
            this.stats.bestScore = score;
        }
        
        this.saveData();
        return this.getHighScoreRank(entry, difficulty);
    }
    
    getHighScoreRank(entry, difficulty) {
        const index = this.highScores[difficulty].findIndex(e => 
            e.score === entry.score && e.date === entry.date
        );
        return index >= 0 ? index + 1 : null;
    }
    
    getHighScores(difficulty = 'normal', limit = 10) {
        return this.highScores[difficulty]?.slice(0, limit) || [];
    }
    
    isHighScore(score, difficulty = 'normal') {
        const scores = this.highScores[difficulty];
        if (scores.length < 10) return true;
        return score > scores[scores.length - 1].score;
    }
    
    // ============================================================================
    // STATISTICS TRACKING
    // ============================================================================
    
    startLevel(levelNumber, isMultiplayer = false) {
        this.sessionStats = this.createEmptySessionStats();
        this.sessionStats.levelStartTime = Date.now();
        this.sessionStats.isMultiplayer = isMultiplayer;
        this.sessionStats.levelNumber = levelNumber;
    }
    
    endLevel(completed, finalScore) {
        const levelTime = this.sessionStats.levelStartTime 
            ? Math.floor((Date.now() - this.sessionStats.levelStartTime) / 1000) 
            : 0;
        
        if (completed) {
            this.stats.totalLevelsCompleted++;
            this.stats.lastPlayedDate = Date.now();
            
            // Update level reach
            const levelNum = this.sessionStats.levelNumber || 1;
            if (levelNum > this.stats.highestLevelReached) {
                this.stats.highestLevelReached = levelNum;
            }
            
            // Unlock next level
            this.unlockLevel(levelNum + 1);
            
            // Update fastest time
            if (levelTime > 0) {
                if (this.stats.fastestLevelTime === 0 || levelTime < this.stats.fastestLevelTime) {
                    this.stats.fastestLevelTime = levelTime;
                }
                
                // Update average time
                const totalLevels = this.stats.totalLevelsCompleted;
                this.stats.averageLevelTime = 
                    ((this.stats.averageLevelTime * (totalLevels - 1)) + levelTime) / totalLevels;
            }
            
            // Update streaks
            if (this.sessionStats.levelDeaths === 0) {
                this.currentStreak.levelsWithoutLosingLife++;
                this.stats.perfectLevels++;
                this.sessionStats.perfectLevel = true;
            } else {
                // Reset streak
                if (this.currentStreak.levelsWithoutLosingLife > 
                    (this.stats.bestStreak?.levelsWithoutLosingLife || 0)) {
                    this.stats.bestStreak.levelsWithoutLosingLife = 
                        this.currentStreak.levelsWithoutLosingLife;
                }
                this.currentStreak.levelsWithoutLosingLife = 0;
            }
            
            // Update multiplayer stats
            if (this.sessionStats.isMultiplayer) {
                this.stats.multiplayerLevelsCompleted++;
            }
            
            // Check achievements after level complete
            const newAchievements = this.checkAchievements();
            
            // Save high score
            let rank = null;
            if (finalScore > 0) {
                rank = this.addHighScore(finalScore, levelNum, 'normal');
            }
            
            this.saveData();
            
            return {
                completed: true,
                levelTime,
                newAchievements,
                highScoreRank: rank,
                isPerfect: this.sessionStats.perfectLevel
            };
        } else {
            // Level failed
            this.currentStreak.levelsWithoutLosingLife = 0;
            return { completed: false };
        }
    }
    
    onBlockDestroyed() {
        this.sessionStats.blocksDestroyed++;
        this.stats.totalBlocksDestroyed++;
        
        // Update combo
        this.sessionStats.combo++;
        if (this.sessionStats.combo > this.sessionStats.maxCombo) {
            this.sessionStats.maxCombo = this.sessionStats.combo;
        }
        if (this.sessionStats.maxCombo > this.stats.maxCombo) {
            this.stats.maxCombo = this.sessionStats.maxCombo;
        }
    }
    
    onComboBreak() {
        this.sessionStats.combo = 0;
    }
    
    onPowerUpCollected() {
        this.sessionStats.powerUpsCollected++;
        this.stats.totalPowerUpsCollected++;
    }
    
    onDeath() {
        this.sessionStats.levelDeaths++;
        this.sessionStats.perfectLevel = false;
        this.onComboBreak();
    }
    
    startGameSession(isMultiplayer = false) {
        this.stats.gamesPlayed++;
        this.currentStreak.levelsWithoutLosingLife = 0;
        this.saveData();
    }
    
    updatePlayTime(seconds) {
        this.stats.totalPlayTime += seconds;
        this.saveData();
    }
    
    getStats() {
        return { ...this.stats };
    }
    
    getSessionStats() {
        return { ...this.sessionStats };
    }
    
    // ============================================================================
    // LEVEL UNLOCK PROGRESSION
    // ============================================================================
    
    unlockLevel(levelNumber) {
        if (levelNumber > this.unlocks.highestUnlockedLevel && 
            levelNumber <= this.unlocks.totalLevels) {
            this.unlocks.highestUnlockedLevel = levelNumber;
            
            // Dispatch event for UI
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('level-unlocked', {
                    detail: { level: levelNumber }
                }));
            }
            
            return true;
        }
        return false;
    }
    
    markLevelCompleted(levelNumber) {
        if (!this.unlocks.completedLevels.includes(levelNumber)) {
            this.unlocks.completedLevels.push(levelNumber);
            this.unlocks.completedLevels.sort((a, b) => a - b);
        }
        this.unlockLevel(levelNumber + 1);
        this.saveData();
    }
    
    isLevelUnlocked(levelNumber) {
        return levelNumber <= this.unlocks.highestUnlockedLevel;
    }
    
    isLevelCompleted(levelNumber) {
        return this.unlocks.completedLevels.includes(levelNumber);
    }
    
    getHighestUnlockedLevel() {
        return this.unlocks.highestUnlockedLevel;
    }
    
    getLockedLevelsCount() {
        return this.unlocks.totalLevels - this.unlocks.highestUnlockedLevel;
    }
    
    getProgressPercent() {
        return Math.round((this.unlocks.highestUnlockedLevel - 1) / this.unlocks.totalLevels * 100);
    }
    
    // ============================================================================
    // TUTORIAL SYSTEM
    // ============================================================================
    
    hasSeenTutorial() {
        try {
            return localStorage.getItem(this.tutorialKey) === 'true';
        } catch (e) {
            return false;
        }
    }
    
    markTutorialSeen() {
        try {
            localStorage.setItem(this.tutorialKey, 'true');
        } catch (e) {
            console.warn('[Progression] Failed to save tutorial state:', e);
        }
    }
    
    resetTutorial() {
        try {
            localStorage.removeItem(this.tutorialKey);
        } catch (e) {
            console.warn('[Progression] Failed to reset tutorial state:', e);
        }
    }
    
    // ============================================================================
    // EXPORT/IMPORT
    // ============================================================================
    
    exportProgress() {
        return {
            achievements: Array.from(this.unlockedAchievements),
            stats: this.stats,
            highScores: this.highScores,
            unlocks: this.unlocks,
            exportedAt: Date.now()
        };
    }
    
    importProgress(data) {
        try {
            if (data.achievements) {
                this.unlockedAchievements = new Set(data.achievements);
            }
            if (data.stats) {
                this.stats = { ...this.getDefaultStats(), ...data.stats };
            }
            if (data.highScores) {
                this.highScores = data.highScores;
            }
            if (data.unlocks) {
                this.unlocks = { ...this.getDefaultUnlocks(), ...data.unlocks };
            }
            this.saveData();
            return true;
        } catch (e) {
            console.error('[Progression] Failed to import progress:', e);
            return false;
        }
    }
    
    // ============================================================================
    // RESET
    // ============================================================================
    
    resetAll() {
        this.unlockedAchievements.clear();
        this.stats = this.getDefaultStats();
        this.highScores = this.getDefaultHighScores();
        this.unlocks = this.getDefaultUnlocks();
        this.resetTutorial();
        this.saveData();
    }
    
    resetHighScores() {
        this.highScores = this.getDefaultHighScores();
        this.saveData();
    }
}

// ============================================================================
// TUTORIAL OVERLAY COMPONENT
// ============================================================================

class TutorialOverlay {
    constructor(containerId = 'game-container') {
        this.container = document.getElementById(containerId);
        this.currentStep = 0;
        this.steps = [
            {
                title: 'Welcome to GOP-STOP ARKANOID!',
                content: 'Destroy all blocks to complete each level. Work together with your comrade!',
                highlight: null,
                position: 'center'
            },
            {
                title: 'Controls',
                content: 'Use ← → arrow keys or A/D to move your paddle. SPACE to launch the ball.',
                highlight: 'gameCanvas',
                position: 'bottom'
            },
            {
                title: 'Cooperative Play',
                content: 'Two paddles, one ball! Each player controls one paddle. Don\'t let the ball fall!',
                highlight: null,
                position: 'center'
            },
            {
                title: 'Power-Ups',
                content: 'Collect falling power-ups for special abilities: Expand, Multi-ball, Slow, and Sticky!',
                highlight: null,
                position: 'center'
            },
            {
                title: 'Lives & Score',
                content: 'You have 3 shared lives. Build combos by destroying blocks consecutively!',
                highlight: null,
                position: 'center'
            },
            {
                title: 'Ready to Play!',
                content: 'Complete levels to unlock achievements and climb the leaderboards!',
                highlight: null,
                position: 'center'
            }
        ];
        
        this.overlay = null;
        this.onComplete = null;
    }
    
    createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';
        overlay.innerHTML = `
            <div class="tutorial-backdrop"></div>
            <div class="tutorial-content">
                <div class="tutorial-card">
                    <h3 class="tutorial-title"></h3>
                    <p class="tutorial-text"></p>
                    <div class="tutorial-progress">
                        ${this.steps.map((_, i) => `<span class="tutorial-dot${i === 0 ? ' active' : ''}"></span>`).join('')}
                    </div>
                    <div class="tutorial-buttons">
                        <button class="btn btn--small tutorial-skip">Skip</button>
                        <button class="btn tutorial-next">Next →</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .tutorial-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .tutorial-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(4px);
            }
            .tutorial-content {
                position: relative;
                z-index: 1;
                max-width: 500px;
                padding: 20px;
            }
            .tutorial-card {
                background: var(--bg-secondary);
                border: 4px solid var(--neon-cyan);
                padding: 30px;
                text-align: center;
                box-shadow: 0 0 30px rgba(0, 255, 255, 0.3);
            }
            .tutorial-title {
                color: var(--neon-magenta);
                font-family: var(--font-display);
                font-size: 18px;
                margin-bottom: 15px;
                text-shadow: 0 0 10px var(--neon-magenta);
            }
            .tutorial-text {
                color: #fff;
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 25px;
            }
            .tutorial-progress {
                margin-bottom: 20px;
            }
            .tutorial-dot {
                display: inline-block;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #444;
                margin: 0 5px;
                transition: all 0.3s;
            }
            .tutorial-dot.active {
                background: var(--neon-cyan);
                box-shadow: 0 0 10px var(--neon-cyan);
            }
            .tutorial-buttons {
                display: flex;
                justify-content: space-between;
                gap: 15px;
            }
            .tutorial-highlight {
                position: absolute;
                border: 3px dashed var(--neon-yellow);
                box-shadow: 0 0 20px var(--neon-yellow), inset 0 0 20px rgba(255, 255, 0, 0.1);
                pointer-events: none;
                animation: pulse-border 1.5s infinite;
                z-index: 2;
            }
            @keyframes pulse-border {
                0%, 100% { opacity: 1; box-shadow: 0 0 20px var(--neon-yellow); }
                50% { opacity: 0.6; box-shadow: 0 0 10px var(--neon-yellow); }
            }
        `;
        document.head.appendChild(style);
        
        // Bind events
        overlay.querySelector('.tutorial-next').addEventListener('click', () => this.nextStep());
        overlay.querySelector('.tutorial-skip').addEventListener('click', () => this.skip());
        
        return overlay;
    }
    
    show(onComplete = null) {
        this.onComplete = onComplete;
        this.currentStep = 0;
        
        if (!this.overlay) {
            this.overlay = this.createOverlay();
        }
        
        document.body.appendChild(this.overlay);
        this.updateStep();
    }
    
    nextStep() {
        this.currentStep++;
        
        if (this.currentStep >= this.steps.length) {
            this.complete();
        } else {
            this.updateStep();
        }
    }
    
    skip() {
        this.complete();
    }
    
    updateStep() {
        const step = this.steps[this.currentStep];
        
        this.overlay.querySelector('.tutorial-title').textContent = step.title;
        this.overlay.querySelector('.tutorial-text').textContent = step.content;
        
        // Update dots
        const dots = this.overlay.querySelectorAll('.tutorial-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === this.currentStep);
        });
        
        // Update button text for last step
        const nextBtn = this.overlay.querySelector('.tutorial-next');
        nextBtn.textContent = this.currentStep === this.steps.length - 1 ? 'Let\'s Go!' : 'Next →';
        
        // Handle highlight
        const existingHighlight = this.overlay.querySelector('.tutorial-highlight');
        if (existingHighlight) {
            existingHighlight.remove();
        }
        
        if (step.highlight) {
            const element = document.getElementById(step.highlight);
            if (element) {
                const rect = element.getBoundingClientRect();
                const highlight = document.createElement('div');
                highlight.className = 'tutorial-highlight';
                highlight.style.left = `${rect.left - 10}px`;
                highlight.style.top = `${rect.top - 10}px`;
                highlight.style.width = `${rect.width + 20}px`;
                highlight.style.height = `${rect.height + 20}px`;
                this.overlay.appendChild(highlight);
            }
        }
    }
    
    complete() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        
        // Mark tutorial as seen
        if (window.progressionManager) {
            window.progressionManager.markTutorialSeen();
        }
        
        if (this.onComplete) {
            this.onComplete();
        }
    }
}

// ============================================================================
// ACHIEVEMENT NOTIFICATION COMPONENT
// ============================================================================

class AchievementNotification {
    constructor() {
        this.container = null;
        this.queue = [];
        this.isShowing = false;
        this.init();
    }
    
    init() {
        // Listen for achievement unlocks
        if (typeof window !== 'undefined') {
            window.addEventListener('achievement-unlocked', (e) => {
                this.show(e.detail);
            });
        }
        
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'achievement-notifications';
        this.container.innerHTML = `
            <style>
                .achievement-notifications {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .achievement-toast {
                    background: var(--bg-secondary);
                    border: 3px solid;
                    padding: 15px 20px;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    min-width: 300px;
                    transform: translateX(400px);
                    animation: slide-in 0.5s forwards, slide-out 0.5s 4.5s forwards;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                }
                .achievement-toast.rarity-common { border-color: #00FF88; }
                .achievement-toast.rarity-rare { border-color: #00FFFF; }
                .achievement-toast.rarity-epic { border-color: #FF00FF; }
                .achievement-toast.rarity-legendary { border-color: #FFD700; }
                
                .achievement-icon {
                    font-size: 32px;
                }
                .achievement-info h4 {
                    color: #fff;
                    font-family: var(--font-display);
                    font-size: 12px;
                    margin-bottom: 4px;
                }
                .achievement-info p {
                    color: #888;
                    font-size: 12px;
                }
                .achievement-rarity {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-top: 4px;
                }
                
                @keyframes slide-in {
                    to { transform: translateX(0); }
                }
                @keyframes slide-out {
                    to { transform: translateX(400px); opacity: 0; }
                }
            </style>
        `;
        document.body.appendChild(this.container);
    }
    
    show(achievement) {
        this.queue.push(achievement);
        if (!this.isShowing) {
            this.processQueue();
        }
    }
    
    processQueue() {
        if (this.queue.length === 0) {
            this.isShowing = false;
            return;
        }
        
        this.isShowing = true;
        const achievement = this.queue.shift();
        
        const toast = document.createElement('div');
        toast.className = `achievement-toast rarity-${achievement.rarity}`;
        toast.innerHTML = `
            <span class="achievement-icon">${achievement.icon}</span>
            <div class="achievement-info">
                <h4>Achievement Unlocked!</h4>
                <p style="color: ${RARITY_COLORS[achievement.rarity]}; font-weight: bold;">${achievement.name}</p>
                <p>${achievement.description}</p>
                <div class="achievement-rarity" style="color: ${RARITY_COLORS[achievement.rarity]}">${achievement.rarity}</div>
            </div>
        `;
        
        this.container.appendChild(toast);
        
        // Remove after animation
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            setTimeout(() => this.processQueue(), 100);
        }, 5000);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.ProgressionManager = ProgressionManager;
    window.TutorialOverlay = TutorialOverlay;
    window.AchievementNotification = AchievementNotification;
    window.ACHIEVEMENTS = ACHIEVEMENTS;
    window.RARITY_COLORS = RARITY_COLORS;
    
    // Initialize singleton
    window.progressionManager = new ProgressionManager();
    window.achievementNotification = new AchievementNotification();
}

export {
    ProgressionManager,
    TutorialOverlay,
    AchievementNotification,
    ACHIEVEMENTS,
    RARITY_COLORS
};

export default ProgressionManager;
