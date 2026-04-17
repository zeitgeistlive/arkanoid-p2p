/**
 * Arkanoid P2P - Level Generator
 * 20 unique cooperative levels with increasing difficulty
 * Style: Гоп-стоп (90s post-Soviet aesthetic)
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
                    type: 'normal'
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
                    type: 'normal'
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
                    type: 'normal'
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
                    type: 'normal'
                });
            }
        }
        return blocks;
    },

    // Scattered pattern
    scattered(count, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const marginX = 80;
        const marginY = 60;
        const maxX = 800 - blockW - marginX;
        const maxY = 350;
        
        for (let i = 0; i < count; i++) {
            const col = i % 10;
            const row = Math.floor(i / 10);
            const x = marginX + col * 68 + (Math.sin(row * 0.5) * 20);
            const y = marginY + row * 30 + (Math.cos(col * 0.3) * 15);
            
            blocks.push({
                x: Math.max(marginX, Math.min(maxX, x)),
                y: Math.max(marginY, Math.min(maxY, y)),
                hp: Math.min(3, startHp + Math.floor(Math.random() * 2)),
                type: 'normal'
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
                    type: 'normal'
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
                    type: 'normal'
                });
            }
        }
        return blocks;
    },

    // Two separate formations
    dualFormation(offset, startHp = 1) {
        const blocks = [];
        const blockW = 60;
        const blockH = 24;
        const padding = 4;
        
        // Left formation
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                blocks.push({
                    x: 100 + col * (blockW + padding),
                    y: 100 + row * (blockH + padding) + Math.sin(row) * 10,
                    hp: Math.min(3, startHp + row % 3),
                    type: 'normal'
                });
            }
        }
        
        // Right formation
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                blocks.push({
                    x: 500 + col * (blockW + padding),
                    y: 100 + row * (blockH + padding) + Math.cos(row) * 10,
                    hp: Math.min(3, startHp + (3 - row) % 3),
                    type: 'normal'
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
                    type: 'normal'
                });
            }
            
            // Right wall blocks
            for (let col = 0; col < 3; col++) {
                blocks.push({
                    x: rightWall + col * (blockW + padding),
                    y: startY + row * (blockH + padding),
                    hp: hp,
                    type: 'normal'
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
                    type: isEdge ? 'shield' : 'normal'
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
                    blocks.push({
                        x: startX + col * (blockW + padding),
                        y: startY + row * (blockH + padding),
                        hp: Math.min(3, startHp + (row % 2)),
                        type: 'normal'
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
            
            blocks.push({
                x: centerX + Math.cos(angle) * radius - blockW / 2,
                y: centerY + Math.sin(angle) * radius - blockH / 2,
                hp: Math.min(3, startHp + Math.floor(i / blocksPerTurn)),
                type: 'normal'
            });
        }
        return blocks;
    }
};

// ============================================================================
// LEVEL DEFINITIONS
// ============================================================================

const LEVELS = [
    // Level 1: Easy introduction
    {
        name: "Добро пожаловать",
        description: "Простая сетка для разминки",
        generate() {
            return PATTERNS.grid(4, 10, 1, 0);
        }
    },
    
    // Level 2: Slightly more blocks
    {
        name: "Двойной удар",
        description: "Больше блоков на поле",
        generate() {
            return PATTERNS.grid(5, 10, 1, 0.3);
        }
    },
    
    // Level 3: Pyramid
    {
        name: "Пирамида Гизы",
        description: "Классическая пирамидальная форма",
        generate() {
            return PATTERNS.pyramid(6, 12, 1);
        }
    },
    
    // Level 4: Diamond
    {
        name: "Алмаз в небе",
        description: "Ромбовидная форма с усиленными блоками",
        generate() {
            return PATTERNS.diamond(7, 1);
        }
    },
    
    // Level 5: Columns with gaps
    {
        name: "Колонны",
        description: "Колонны с пропусками",
        generate() {
            return PATTERNS.columns(10, 8, 2, 1);
        }
    },
    
    // Level 6: Scattered
    {
        name: "Хаос",
        description: "Разбросанные блоки",
        generate() {
            return PATTERNS.scattered(40, 1);
        }
    },
    
    // Level 7: Hourglass
    {
        name: "Песочные часы",
        description: "Блоки стягиваются к центру",
        generate() {
            return PATTERNS.hourglass(10, 1);
        }
    },
    
    // Level 8: Wedge
    {
        name: "Клин",
        description: "Треугольная форма",
        generate() {
            return PATTERNS.wedge(7, 1);
        }
    },
    
    // Level 9: Dual formation
    {
        name: "Близнецы",
        description: "Два отдельных образования",
        generate() {
            return PATTERNS.dualFormation(0, 1);
        }
    },
    
    // Level 10: Full grid with HP increase
    {
        name: "Крепость",
        description: "Все 3 уровня HP представлены",
        generate() {
            return PATTERNS.grid(6, 12, 1, 0.5);
        }
    },
    
    // Level 11: Tunnel
    {
        name: "Туннель",
        description: "Пролетите через туннель",
        generate() {
            return PATTERNS.tunnel(10, 1);
        }
    },
    
    // Level 12: Shield
    {
        name: "Щит",
        description: "Защитите внутренние блоки",
        generate() {
            return PATTERNS.shield(6, 10, 1);
        }
    },
    
    // Level 13: Checkerboard
    {
        name: "Шахматы",
        description: "Чередующиеся блоки",
        generate() {
            return PATTERNS.checkerboard(7, 12, 2);
        }
    },
    
    // Level 14: Double pyramid
    {
        name: "Две пирамиды",
        description: "Пирамида сверху и снизу",
        generate() {
            const top = PATTERNS.pyramid(4, 10, 1).map(b => ({...b, y: b.y}));
            const bottom = PATTERNS.pyramid(4, 10, 1).map(b => ({...b, y: 400 - (b.y - 80)}));
            return [...top, ...bottom];
        }
    },
    
    // Level 15: Spiral
    {
        name: "Вихрь",
        description: "Спиральная форма",
        generate() {
            return PATTERNS.spiral(4, 16, 2);
        }
    },
    
    // Level 16: Mixed pattern
    {
        name: "Коктейль",
        description: "Смешанные паттерны",
        generate() {
            const center = PATTERNS.pyramid(4, 8, 2);
            const left = PATTERNS.grid(4, 3, 1).map(b => ({...b, x: b.x + 20}));
            const right = PATTERNS.grid(4, 3, 1).map(b => ({...b, x: b.x + 540}));
            return [...center, ...left, ...right];
        }
    },
    
    // Level 17: Dense columns
    {
        name: "Стена",
        description: "Плотные колонны",
        generate() {
            return PATTERNS.columns(8, 10, 1, 2);
        }
    },
    
    // Level 18: Scattered with high HP
    {
        name: "Крепкий орешек",
        description: "Мало блоков, но крепкие",
        generate() {
            return PATTERNS.scattered(30, 2);
        }
    },
    
    // Level 19: The Gauntlet
    {
        name: "Полоса препятствий",
        description: "Сложная комбинация шаблонов",
        generate() {
            const top = PATTERNS.diamond(5, 3);
            const mid = PATTERNS.hourglass(6, 2);
            const sides = [
                {x: 50, y: 100, hp: 3}, {x: 50, y: 130, hp: 3},
                {x: 50, y: 160, hp: 3}, {x: 680, y: 100, hp: 3},
                {x: 680, y: 130, hp: 3}, {x: 680, y: 160, hp: 3}
            ];
            return [...top, ...mid, ...sides];
        }
    },
    
    // Level 20: Final boss
    {
        name: "Босс",
        description: "Максимальная сложность",
        generate() {
            const grid = PATTERNS.grid(5, 12, 2, 0.5);
            const diamond = PATTERNS.diamond(5, 3).map(b => ({...b, y: b.y + 50}));
            const outer = PATTERNS.shield(7, 12, 2);
            return [...outer, ...grid, ...diamond];
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
    }

    // Get level data
    getLevel(levelNum) {
        const idx = Math.max(0, Math.min(levelNum - 1, this.totalLevels - 1));
        const levelDef = LEVELS[idx];
        
        return {
            number: levelNum,
            name: levelDef.name,
            description: levelDef.description,
            blocks: levelDef.generate()
        };
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
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    LevelManager,
    LEVELS,
    PATTERNS
};

export default LevelManager;
