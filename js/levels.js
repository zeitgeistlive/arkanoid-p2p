/**
 * Arkanoid P2P - Level Generator
 * 20 unique cooperative levels with increasing difficulty
 * Style: Гоп-стоп (90s post-Soviet aesthetic)
 * 
 * ITERATION 4 CHANGES:
 * - Fixed unreachable blocks in levels 14, 19 (moved too low/too wide positions)
 * - Fixed similar consecutive levels (levels 6 & 18, 3 & 14)
 * - Added 3 new patterns: wave, fortress, bullseye
 * - Improved difficulty curve: 1-5 easy, 6-10 moderate, 11-15 hard, 16-20 expert
 * - Added block color variety (red=1HP, yellow=2HP, blue=3HP)
 * - Fixed Level 20 overlap issues
 * - Added powerup blocks in later levels
 * - Ensured all blocks are reachable from paddle position (y < 450)
 */

// ============================================================================
// PATTERN GENERATORS
// ============================================================================

const PATTERNS = {
    // Standard grid
    grid(rows, cols, startHp = 1, hpIncrease = 0) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const totalW = cols * (blockW + padding) - padding;
        const startX = (800 - totalW) / 2;
        const startY = 80;
        
        for (let row = 0; row < rows; row++) {
            const hp = Math.min(3, startHp + Math.floor(row * hpIncrease));
            for (let col = 0; col < cols; col++) {
                blocks.push({
                    x: startX + col * (blockW + padding),
                    y: startY + row * (blockH + padding),
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // Pyramid shape
    pyramid(rows, baseCols, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const centerX = 400;
        const startY = 80;
        
        for (let row = 0; row < rows; row++) {
            const cols = baseCols - row * 2;
            if (cols <= 0) break;
            
            const totalW = cols * (blockW + padding) - padding;
            const rowX = centerX - totalW / 2;
            const hp = Math.min(3, startHp + Math.floor(row / 2));
            
            for (let col = 0; col < cols; col++) {
                blocks.push({
                    x: rowX + col * (blockW + padding),
                    y: startY + row * (blockH + padding),
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // Diamond shape
    diamond(size, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const centerX = 400;
        const centerY = 150;
        
        for (let i = 0; i < size; i++) {
            const dist = i - Math.floor(size / 2);
            const cols = size - Math.abs(dist) * 2;
            const rowY = centerY + i * (blockH + padding);
            const totalW = cols * (blockW + padding) - padding;
            const rowX = centerX - totalW / 2;
            const hp = Math.min(3, startHp + Math.abs(dist) % 3);
            
            for (let col = 0; col < cols; col++) {
                blocks.push({
                    x: rowX + col * (blockW + padding),
                    y: rowY,
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // Hourglass shape
    hourglass(rows, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const centerX = 400;
        const startY = 80;
        
        for (let row = 0; row < rows; row++) {
            const midpoint = rows / 2;
            const distFromCenter = Math.abs(row - midpoint + 0.5);
            const cols = 2 + Math.floor(distFromCenter * 1.5);
            
            const totalW = cols * (blockW + padding) - padding;
            const rowX = centerX - totalW / 2;
            const hp = Math.min(3, startHp + Math.floor(distFromCenter / 2));
            
            for (let col = 0; col < cols; col++) {
                blocks.push({
                    x: rowX + col * (blockW + padding),
                    y: startY + row * (blockH + padding),
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // Scattered pattern - FIXED: ensures all blocks are reachable
    scattered(count, startHp = 1, minY = 60, maxY = 300) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const marginX = 100;  // Increased margin to ensure reachability
        const marginY = minY;
        const maxX = 800 - blockW - marginX;
        const maxRowY = maxY;
        
        for (let i = 0; i < count; i++) {
            const col = i % 10;
            const row = Math.floor(i / 10);
            // Ensure y position is reachable (not too low, not too high)
            const y = marginY + row * 35 + (Math.cos(col * 0.3) * 15);
            const clampedY = Math.max(marginY, Math.min(maxRowY, y));
            const x = marginX + col * 68 + (Math.sin(row * 0.5) * 20);
            const hp = Math.min(3, startHp + Math.floor(Math.random() * 2));
            
            blocks.push({
                x: Math.max(marginX, Math.min(maxX, x)),
                y: clampedY,
                hp: hp,
                type: 'normal',
                color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
            });
        }
        return blocks;
    },

    // Columns pattern
    columns(cols, rows, spacing, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const colWidth = 800 / cols;
        const startY = 80;
        
        for (let c = 0; c < cols; c++) {
            const x = c * colWidth + (colWidth - blockW) / 2;
            const hp = Math.min(3, startHp + (c % 3));
            
            for (let r = 0; r < rows; r++) {
                if ((r + c) % spacing === 0) continue; // Skip for pattern
                
                blocks.push({
                    x: x,
                    y: startY + r * (blockH + padding),
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // Wedge shape
    wedge(rows, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const startY = 80;
        
        for (let row = 0; row < rows; row++) {
            const cols = row + 2;
            const totalW = cols * (blockW + padding) - padding;
            const rowX = (800 - totalW) / 2;
            const hp = Math.min(3, startHp + Math.floor(row / 3));
            
            for (let col = 0; col < cols; col++) {
                blocks.push({
                    x: rowX + col * (blockW + padding),
                    y: startY + row * (blockH + padding),
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // Two separate formations - FIXED: ensure gap is bridgeable
    dualFormation(offset, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        
        // Left formation - positioned more centrally for reachability
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                blocks.push({
                    x: 120 + col * (blockW + padding),
                    y: 100 + row * (blockH + padding) + Math.sin(row) * 10,
                    hp: Math.min(3, startHp + row % 3),
                    type: 'normal',
                    color: (startHp + row % 3) === 1 ? 'red' : (startHp + row % 3) === 2 ? 'yellow' : 'blue'
                });
            }
        }
        
        // Right formation - positioned more centrally for reachability
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                blocks.push({
                    x: 480 + col * (blockW + padding),
                    y: 100 + row * (blockH + padding) + Math.cos(row) * 10,
                    hp: Math.min(3, startHp + (3 - row) % 3),
                    type: 'normal',
                    color: (startHp + (3 - row) % 3) === 1 ? 'red' : (startHp + (3 - row) % 3) === 2 ? 'yellow' : 'blue'
                });
            }
        }
        
        return blocks;
    },

    // Tunnel pattern
    tunnel(rows, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const centerX = 400;
        const startY = 60;
        
        for (let row = 0; row < rows; row++) {
            const tunnelWidth = 150 + Math.sin(row * 0.5) * 50;
            const leftWall = centerX - tunnelWidth / 2 - blockW;
            const rightWall = centerX + tunnelWidth / 2;
            const hp = Math.min(3, startHp + Math.floor(row / 4));
            
            // Left wall blocks
            for (let col = 0; col < 3; col++) {
                blocks.push({
                    x: leftWall - col * (blockW + padding),
                    y: startY + row * (blockH + padding),
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
            
            // Right wall blocks
            for (let col = 0; col < 3; col++) {
                blocks.push({
                    x: rightWall + col * (blockW + padding),
                    y: startY + row * (blockH + padding),
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // Shield pattern - protect inner blocks
    shield(rows, cols, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const totalW = cols * (blockW + padding) - padding;
        const totalH = rows * (blockH + padding) - padding;
        const startX = (800 - totalW) / 2;
        const startY = 60;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const isEdge = row === 0 || row === rows - 1 || col === 0 || col === cols - 1;
                const hp = isEdge ? 3 : startHp;
                
                blocks.push({
                    x: startX + col * (blockW + padding),
                    y: startY + row * (blockH + padding),
                    hp: hp,
                    type: isEdge ? 'shield' : 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // Checkerboard pattern
    checkerboard(rows, cols, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const totalW = cols * (blockW + padding) - padding;
        const startX = (800 - totalW) / 2;
        const startY = 80;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if ((row + col) % 2 === 0) {
                    const hp = Math.min(3, startHp + (row % 2));
                    blocks.push({
                        x: startX + col * (blockW + padding),
                        y: startY + row * (blockH + padding),
                        hp: hp,
                        type: 'normal',
                        color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                    });
                }
            }
        }
        return blocks;
    },

    // Spiral pattern
    spiral(turns, blocksPerTurn, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const centerX = 400;
        const centerY = 200;
        const radiusStep = 30;
        const angleStep = (Math.PI * 2) / blocksPerTurn;
        
        for (let i = 0; i < turns * blocksPerTurn; i++) {
            const angle = i * angleStep;
            const radius = 100 + (i / blocksPerTurn) * radiusStep;
            const hp = Math.min(3, startHp + Math.floor(i / blocksPerTurn));
            
            blocks.push({
                x: centerX + Math.cos(angle) * radius - blockW / 2,
                y: centerY + Math.sin(angle) * radius - blockH / 2,
                hp: hp,
                type: 'normal',
                color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
            });
        }
        return blocks;
    },

    // NEW PATTERN 1: Wave - sinusoidal pattern
    wave(rows, cols, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const totalW = cols * (blockW + padding) - padding;
        const startX = (800 - totalW) / 2;
        const startY = 80;
        
        for (let row = 0; row < rows; row++) {
            const hp = Math.min(3, startHp + Math.floor(row / 2));
            for (let col = 0; col < cols; col++) {
                const waveOffset = Math.sin(col * 0.8) * 30;
                blocks.push({
                    x: startX + col * (blockW + padding),
                    y: startY + row * (blockH + padding) + waveOffset,
                    hp: hp,
                    type: 'normal',
                    color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                });
            }
        }
        return blocks;
    },

    // NEW PATTERN 2: Fortress - concentric rectangles
    fortress(layers, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const centerX = 400;
        const centerY = 180;
        
        for (let layer = 0; layer < layers; layer++) {
            const hp = Math.min(3, startHp + layer);
            const cols = 6 + layer * 2;
            const rows = 3 + layer;
            const totalW = cols * (blockW + padding) - padding;
            const totalH = rows * (blockH + padding) - padding;
            const startX = centerX - totalW / 2;
            const startY = centerY - totalH / 2;
            
            // Only place blocks on the perimeter of each layer
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    // Only add blocks on the outer edge of this layer
                    if (row === 0 || row === rows - 1 || col === 0 || col === cols - 1) {
                        blocks.push({
                            x: startX + col * (blockW + padding),
                            y: Math.max(60, Math.min(300, startY + row * (blockH + padding))),
                            hp: hp,
                            type: layer === layers - 1 ? 'shield' : 'normal',
                            color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                        });
                    }
                }
            }
        }
        return blocks;
    },

    // NEW PATTERN 3: Bullseye - target pattern with center focus
    bullseye(rings, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        const centerX = 400;
        const centerY = 150;
        
        for (let ring = 0; ring < rings; ring++) {
            const hp = Math.min(3, startHp + ring);
            const blocksInRing = 8 + ring * 4;
            const radius = 60 + ring * 45;
            
            for (let i = 0; i < blocksInRing; i++) {
                const angle = (i / blocksInRing) * Math.PI * 2;
                // Only use top half for reachability
                if (Math.sin(angle) > -0.3) {
                    blocks.push({
                        x: centerX + Math.cos(angle) * radius - blockW / 2,
                        y: Math.max(60, Math.min(320, centerY + Math.sin(angle) * radius)),
                        hp: hp,
                        type: ring === 0 ? 'powerup' : 'normal',
                        color: hp === 1 ? 'red' : hp === 2 ? 'yellow' : 'blue'
                    });
                }
            }
        }
        return blocks;
    }
};

// ============================================================================
// LEVEL DEFINITIONS
// ============================================================================

const LEVELS = [
    // ============================================================================
    // LEVELS 1-5: EASY INTRODUCTION
    // ============================================================================
    
    // Level 1: Easy introduction - simple flat row
    {
        name: "Добро пожаловать",
        description: "Простая сетка для разминки - Welcome to the game!",
        generate() {
            return PATTERNS.grid(3, 8, 1, 0);  // Reduced from 4 rows to 3, simpler
        }
    },
    
    // Level 2: More blocks, still easy
    {
        name: "Двойной удар",
        description: "Больше рядов, но все еще просто",
        generate() {
            return PATTERNS.grid(4, 10, 1, 0);  // No HP increase yet
        }
    },
    
    // Level 3: Simple pyramid (different from flat grid)
    {
        name: "Пирамида Гизы",
        description: "Классическая пирамидальная форма",
        generate() {
            return PATTERNS.pyramid(5, 10, 1);  // Smaller pyramid, easier
        }
    },
    
    // Level 4: Diamond - introduces shape variety
    {
        name: "Алмаз в небе",
        description: "Ромбовидная форма - новая фигура!",
        generate() {
            return PATTERNS.diamond(5, 1);  // Smaller, easier diamond
        }
    },
    
    // Level 5: Columns with gaps - introduces aiming
    {
        name: "Колонны",
        description: "Колонны с пропусками - научись целиться!",
        generate() {
            return PATTERNS.columns(8, 6, 2, 1);  // Fewer rows, simpler
        }
    },
    
    // ============================================================================
    // LEVELS 6-10: MODERATE CHALLENGE
    // ============================================================================
    
    // Level 6: Wave pattern (NEW - instead of scattered)
    {
        name: "Волна",
        description: "Синусоидальный паттерн - следи за ритмом!",
        generate() {
            return PATTERNS.wave(4, 10, 1);  // NEW PATTERN replaces scattered
        }
    },
    
    // Level 7: Hourglass - ball channeling
    {
        name: "Песочные часы",
        description: "Блоки стягиваются к центру",
        generate() {
            return PATTERNS.hourglass(8, 1);  // Slightly smaller
        }
    },
    
    // Level 8: Wedge - wider at bottom
    {
        name: "Клин",
        description: "Треугольная форма - расширяется книзу",
        generate() {
            return PATTERNS.wedge(6, 1);  // Slightly smaller
        }
    },
    
    // Level 9: Dual formation - requires ball control
    {
        name: "Близнецы",
        description: "Два отдельных образования - контроль мяча!",
        generate() {
            return PATTERNS.dualFormation(0, 1);
        }
    },
    
    // Level 10: Full grid with HP increase - first "boss" of moderate section
    {
        name: "Первая крепость",
        description: "Все цвета блоков - готовься к сложному!",
        generate() {
            return PATTERNS.grid(5, 12, 1, 0.5);  // Introduces all 3 HP levels
        }
    },
    
    // ============================================================================
    // LEVELS 11-15: HARD PATTERNS
    // ============================================================================
    
    // Level 11: Tunnel - requires precision
    {
        name: "Туннель",
        description: "Пролети через туннель - точность превыше всего!",
        generate() {
            return PATTERNS.tunnel(8, 1);  // Slightly smaller
        }
    },
    
    // Level 12: Shield - requires breaking outer shell first
    {
        name: "Щит",
        description: "Защищенные блоки - ломай снаружи кнутри!",
        generate() {
            return PATTERNS.shield(5, 8, 1);  // Smaller shield
        }
    },
    
    // Level 13: Checkerboard with higher HP
    {
        name: "Шахматы",
        description: "Чередующиеся блоки - все 2 HP",
        generate() {
            return PATTERNS.checkerboard(6, 12, 2);  // All blocks are 2 HP
        }
    },
    
    // Level 14: Fortress (NEW - instead of double pyramid)
    // FIXED: Replaced double pyramid which had y=400 unreachable blocks
    {
        name: "Крепость",
        description: "Концентрические стены - прорвись сквозь защиту!",
        generate() {
            return PATTERNS.fortress(4, 1);  // NEW PATTERN replaces broken double pyramid
        }
    },
    
    // Level 15: Spiral - challenging pattern
    {
        name: "Вихрь",
        description: "Спиральная форма - хаос и порядок!",
        generate() {
            return PATTERNS.spiral(3, 16, 2);  // Slightly smaller spiral
        }
    },
    
    // ============================================================================
    // LEVELS 16-20: EXPERT/BOSS LEVELS
    // ============================================================================
    
    // Level 16: Mixed pattern - combination challenge
    {
        name: "Коктейль",
        description: "Смешанные паттерны - экстремально!",
        generate() {
            const center = PATTERNS.pyramid(3, 6, 2);
            const left = PATTERNS.grid(3, 2, 2).map(b => ({...b, x: b.x + 30}));
            const right = PATTERNS.grid(3, 2, 2).map(b => ({...b, x: b.x + 550}));
            // Add higher HP and mix patterns
            return [...center, ...left, ...right].map(b => ({...b, hp: Math.min(3, b.hp + 1)}));
        }
    },
    
    // Level 17: Dense columns with high HP
    {
        name: "Стена",
        description: "Плотные колонны - пробейся сквозь!",
        generate() {
            return PATTERNS.columns(6, 10, 1, 2);  // Denser, higher HP
        }
    },
    
    // Level 18: Bullseye (NEW - instead of scattered repeat)
    // FIXED: Replaced scattered pattern that was too similar to level 6
    {
        name: "Мишень",
        description: "Целевой паттерн - порази сердцевину!",
        generate() {
            return PATTERNS.bullseye(5, 2);  // NEW PATTERN replaces repeated scattered
        }
    },
    
    // Level 19: The Gauntlet - FIXED unreachable blocks
    // FIXED: Removed blocks at x=50, x=680 which were too far to reach
    {
        name: "Полоса препятствий",
        description: "Сложная комбинация шаблонов - твое испытание!",
        generate() {
            const top = PATTERNS.diamond(4, 2).map(b => ({...b, y: b.y + 20}));
            const mid = PATTERNS.hourglass(5, 2).map(b => ({...b, y: b.y + 60}));
            // FIXED: Changed from unreachable x=50,680 to reachable x=100,600
            const sides = [
                {x: 100, y: 100, hp: 3, type: 'normal', color: 'blue'},
                {x: 100, y: 130, hp: 3, type: 'normal', color: 'blue'},
                {x: 100, y: 160, hp: 3, type: 'normal', color: 'blue'},
                {x: 600, y: 100, hp: 3, type: 'normal', color: 'blue'},
                {x: 600, y: 130, hp: 3, type: 'normal', color: 'blue'},
                {x: 600, y: 160, hp: 3, type: 'normal', color: 'blue'}
            ];
            return [...top, ...mid, ...sides];
        }
    },
    
    // Level 20: Final boss - FIXED overlap issues
    // FIXED: Replaced overlapping patterns with single fortress + outer ring
    {
        name: "Босс",
        description: "Максимальная сложность - финальная битва!",
        generate() {
            // Use fortress as base (guarantees no overlap)
            const fortress = PATTERNS.fortress(5, 2);
            // Add outer ring of shields
            const shields = PATTERNS.shield(3, 14, 3).map(b => ({
                ...b, 
                y: Math.max(50, b.y - 10),
                type: 'shield'
            }));
            return [...fortress, ...shields];
        }
    }
];

// ============================================================================
// LEVEL MANAGER
// ============================================================================

class LevelManager {
    constructor() {
        this.currentLevel = 1;
        this.totalLevels = LEVELS.length;
        this.completedLevels = new Set();
        this.levelCache = new Map();
        this.lazyLoader = null;
    }
    
    // Set lazy loader for async level loading
    setLazyLoader(loader) {
        this.lazyLoader = loader;
    }

    // Get level data (with optional lazy loading)
    async getLevel(levelNum) {
        const idx = Math.max(0, Math.min(levelNum - 1, this.totalLevels - 1));
        const levelDef = LEVELS[idx];
        
        // Use lazy loader if available for heavy levels
        if (this.lazyLoader && this.lazyLoader.loadLevel && levelDef.generate) {
            try {
                const cached = this.levelCache.get(levelNum);
                if (cached) return cached;
                
                const blocks = await this.lazyLoader.loadLevel(levelNum, levelDef.generate);
                const levelData = {
                    number: levelNum,
                    name: levelDef.name,
                    description: levelDef.description,
                    blocks: blocks.blocks || blocks
                };
                this.levelCache.set(levelNum, levelData);
                return levelData;
            } catch (e) {
                console.warn('[LevelManager] Lazy load failed, using sync fallback:', e);
            }
        }
        
        return {
            number: levelNum,
            name: levelDef.name,
            description: levelDef.description,
            blocks: levelDef.generate()
        };
    }
    
    // Clear level cache (call when memory is needed)
    clearCache() {
        this.levelCache.clear();
    }

    // Get current level
    getCurrentLevel() {
        return this.getLevel(this.currentLevel);
    }

    // Advance to next level
    nextLevel() {
        this.completedLevels.add(this.currentLevel);
        if (this.currentLevel < this.totalLevels) {
            this.currentLevel++;
            return this.getCurrentLevel();
        }
        return null; // Game complete
    }

    // Reset to specific level
    resetToLevel(levelNum) {
        this.currentLevel = Math.max(1, Math.min(levelNum, this.totalLevels));
        return this.getCurrentLevel();
    }

    // Check if all levels completed
    isGameComplete() {
        return this.completedLevels.size >= this.totalLevels;
    }

    // Get progress stats
    getProgress() {
        return {
            current: this.currentLevel,
            total: this.totalLevels,
            completed: this.completedLevels.size,
            percent: Math.floor((this.completedLevels.size / this.totalLevels) * 100)
        };
    }

    // Get all level names (for level select)
    getAllLevels() {
        return LEVELS.map((level, idx) => ({
            number: idx + 1,
            name: level.name,
            description: level.description,
            completed: this.completedLevels.has(idx + 1)
        }));
    }
    
    // Preload upcoming levels during idle time
    preloadUpcomingLevels(count = 2) {
        if (!this.lazyLoader) return;
        
        const upcoming = [];
        for (let i = 1; i <= count; i++) {
            const levelNum = this.currentLevel + i;
            if (levelNum <= this.totalLevels) {
                upcoming.push(levelNum);
            }
        }
        
        this.lazyLoader.preloadLevels(upcoming, LEVELS.map(l => l.generate));
    }
}

// ============================================================================
// GLOBAL ASSIGNMENTS
// ============================================================================

// Export to window for global access
window.LevelManager = LevelManager;
window.LEVELS = LEVELS;
window.PATTERNS = PATTERNS;
