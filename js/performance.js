/**
 * Arkanoid P2P - Performance Optimizer Module
 * Provides performance monitoring, object pooling, and optimization utilities
 */

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

class PerformanceMonitor {
    constructor() {
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.frameTime = 0;
        this.frameTimeHistory = [];
        this.maxHistoryLength = 60;
        
        // Network stats
        this.networkStats = {
            bytesSent: 0,
            bytesReceived: 0,
            messagesSent: 0,
            messagesReceived: 0,
            latency: 0
        };
        
        // Memory stats (where available)
        this.memoryStats = {
            used: 0,
            total: 0,
            limit: 0
        };
        
        // DOM element for FPS display
        this.fpsElement = null;
        this.statsElement = null;
        
        // Device capability detection
        this.deviceTier = this.detectDeviceTier();
        
        this.createStatsDisplay();
    }
    
    detectDeviceTier() {
        // Detect device capability for performance scaling
        const memory = navigator.deviceMemory || 4;
        const cores = navigator.hardwareConcurrency || 4;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile && (memory < 4 || cores < 4)) {
            return 'low';
        } else if (isMobile || memory < 8) {
            return 'medium';
        }
        return 'high';
    }
    
    createStatsDisplay() {
        // Create hidden stats container
        const container = document.createElement('div');
        container.id = 'perf-stats';
        container.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #00ff00;
            color: #00ff00;
            font-family: monospace;
            font-size: 12px;
            padding: 8px;
            z-index: 9999;
            pointer-events: none;
            display: none;
            min-width: 150px;
        `;
        
        this.fpsElement = document.createElement('div');
        this.networkElement = document.createElement('div');
        this.memoryElement = document.createElement('div');
        this.deviceElement = document.createElement('div');
        
        container.appendChild(this.fpsElement);
        container.appendChild(this.networkElement);
        container.appendChild(this.memoryElement);
        container.appendChild(this.deviceElement);
        
        document.body.appendChild(container);
        this.statsElement = container;
        
        // Show with Ctrl+Shift+P
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                this.toggleDisplay();
            }
        });
    }
    
    toggleDisplay() {
        if (this.statsElement) {
            const isVisible = this.statsElement.style.display !== 'none';
            this.statsElement.style.display = isVisible ? 'none' : 'block';
        }
    }
    
    update(deltaTime) {
        // Update frame count and FPS
        this.frameCount++;
        const now = performance.now();
        
        // Track frame time history
        this.frameTimeHistory.push(deltaTime);
        if (this.frameTimeHistory.length > this.maxHistoryLength) {
            this.frameTimeHistory.shift();
        }
        
        // Calculate average frame time
        const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
        this.frameTime = avgFrameTime;
        
        // Update FPS every second
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
            this.updateDisplay();
        }
        
        // Update memory stats if available
        if (performance.memory) {
            this.memoryStats.used = Math.round(performance.memory.usedJSHeapSize / 1048576);
            this.memoryStats.total = Math.round(performance.memory.totalJSHeapSize / 1048576);
            this.memoryStats.limit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
        }
    }
    
    updateDisplay() {
        if (!this.statsElement || this.statsElement.style.display === 'none') return;
        
        // Color code FPS
        let fpsColor = '#00ff00';
        if (this.fps < 30) fpsColor = '#ff0000';
        else if (this.fps < 55) fpsColor = '#ffff00';
        
        this.fpsElement.innerHTML = `FPS: <span style="color:${fpsColor}">${this.fps}</span> | Frame: ${this.frameTime.toFixed(1)}ms`;
        
        const kbSent = (this.networkStats.bytesSent / 1024).toFixed(1);
        const kbRecv = (this.networkStats.bytesReceived / 1024).toFixed(1);
        this.networkElement.textContent = `Net: ${kbSent}KB↑ ${kbRecv}KB↓ | Ping: ${this.networkStats.latency}ms`;
        
        if (this.memoryStats.total > 0) {
            this.memoryElement.textContent = `Mem: ${this.memoryStats.used}/${this.memoryStats.total}MB`;
        }
        
        this.deviceElement.textContent = `Device: ${this.deviceTier.toUpperCase()}`;
    }
    
    recordNetworkSent(bytes) {
        this.networkStats.bytesSent += bytes;
        this.networkStats.messagesSent++;
    }
    
    recordNetworkReceived(bytes) {
        this.networkStats.bytesReceived += bytes;
        this.networkStats.messagesReceived++;
    }
    
    setLatency(latency) {
        this.networkStats.latency = latency;
    }
    
    getDeviceTier() {
        return this.deviceTier;
    }
}

// ============================================================================
// OBJECT POOLING
// ============================================================================

class ObjectPool {
    constructor(factory, reset, initialSize = 10) {
        this.factory = factory;
        this.reset = reset;
        this.pool = [];
        this.active = new Set();
        this.maxSize = 100;
        
        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.factory());
        }
    }
    
    acquire() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.factory();
        }
        this.active.add(obj);
        return obj;
    }
    
    release(obj) {
        if (this.active.has(obj)) {
            this.active.delete(obj);
            if (this.pool.length < this.maxSize) {
                this.reset(obj);
                this.pool.push(obj);
            }
        }
    }
    
    releaseAll() {
        this.active.forEach(obj => {
            if (this.pool.length < this.maxSize) {
                this.reset(obj);
                this.pool.push(obj);
            }
        });
        this.active.clear();
    }
    
    getActiveCount() {
        return this.active.size;
    }
    
    getPoolSize() {
        return this.pool.length;
    }
}

// ============================================================================
// THROTTLED STATE SYNC
// ============================================================================

class ThrottledStateSync {
    constructor(network, options = {}) {
        this.network = network;
        this.interval = options.interval || 50; // 20Hz default
        this.lastSent = 0;
        this.pendingState = null;
        this.lastSentState = null;
        this.compressionEnabled = options.compression !== false;
        
        // Delta compression state
        this.lastFullState = null;
        this.deltaThreshold = options.deltaThreshold || 0.5; // Min change to include
    }
    
    send(state) {
        const now = performance.now();
        
        // Apply delta compression
        let stateToSend = state;
        if (this.compressionEnabled && this.lastSentState) {
            stateToSend = this.compressDelta(state, this.lastSentState);
            // If compressed state is too small (no significant changes), skip
            if (Object.keys(stateToSend).length <= 2) { // Only timestamp and minimal data
                return false;
            }
        }
        
        // Throttle sends
        if (now - this.lastSent >= this.interval) {
            if (this.network && this.network.send) {
                const message = JSON.stringify({
                    type: 'STATE',
                    data: stateToSend,
                    timestamp: now
                });
                this.network.send({
                    type: 'STATE',
                    data: stateToSend,
                    timestamp: now
                });
                
                this.lastSent = now;
                this.lastSentState = JSON.parse(JSON.stringify(state)); // Deep copy
                return true;
            }
        } else {
            // Store for next send
            this.pendingState = state;
        }
        
        return false;
    }
    
    compressDelta(newState, oldState) {
        const delta = { timestamp: newState.timestamp };
        
        // Only include changed properties
        for (const key in newState) {
            if (key === 'timestamp') continue;
            
            const newVal = newState[key];
            const oldVal = oldState[key];
            
            if (typeof newVal === 'number' && typeof oldVal === 'number') {
                // For numbers, only send if changed significantly
                if (Math.abs(newVal - oldVal) > this.deltaThreshold) {
                    delta[key] = newVal;
                }
            } else if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
                delta[key] = newVal;
            }
        }
        
        return delta;
    }
    
    flush() {
        if (this.pendingState) {
            this.send(this.pendingState);
            this.pendingState = null;
        }
    }
}

// ============================================================================
// DIRTY RECT TRACKING
// ============================================================================

class DirtyRectManager {
    constructor(canvasWidth, canvasHeight) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.dirtyRects = [];
        this.maxRects = 10;
        this.enabled = true;
    }
    
    addRect(x, y, width, height, padding = 5) {
        if (!this.enabled) return;
        
        // Clamp to canvas bounds
        const rect = {
            x: Math.max(0, x - padding),
            y: Math.max(0, y - padding),
            width: Math.min(this.width, width + padding * 2),
            height: Math.min(this.height, height + padding * 2)
        };
        
        // Merge with existing rects if overlapping
        let merged = false;
        for (const dirty of this.dirtyRects) {
            if (this.rectsIntersect(rect, dirty)) {
                // Merge rectangles
                const minX = Math.min(rect.x, dirty.x);
                const minY = Math.min(rect.y, dirty.y);
                const maxX = Math.max(rect.x + rect.width, dirty.x + dirty.width);
                const maxY = Math.max(rect.y + rect.height, dirty.y + dirty.height);
                
                dirty.x = minX;
                dirty.y = minY;
                dirty.width = maxX - minX;
                dirty.height = maxY - minY;
                merged = true;
                break;
            }
        }
        
        if (!merged) {
            this.dirtyRects.push(rect);
        }
        
        // Limit number of dirty rects
        if (this.dirtyRects.length > this.maxRects) {
            // Merge all into one big rect
            this.mergeAll();
        }
    }
    
    rectsIntersect(a, b) {
        return !(a.x + a.width < b.x || 
                 b.x + b.width < a.x || 
                 a.y + a.height < b.y || 
                 b.y + b.height < a.y);
    }
    
    mergeAll() {
        if (this.dirtyRects.length === 0) return;
        
        let minX = Infinity, minY = Infinity;
        let maxX = 0, maxY = 0;
        
        for (const rect of this.dirtyRects) {
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.width);
            maxY = Math.max(maxY, rect.y + rect.height);
        }
        
        this.dirtyRects = [{
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        }];
    }
    
    clear() {
        this.dirtyRects = [];
    }
    
    getDirtyRects() {
        return this.dirtyRects;
    }
    
    hasDirtyRects() {
        return this.dirtyRects.length > 0;
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.clear();
        }
    }
}

// ============================================================================
// DEBOUNSED DOM UPDATES
// ============================================================================

class DebouncedUpdater {
    constructor(updateFn, delay = 16) {
        this.updateFn = updateFn;
        this.delay = delay;
        this.timeout = null;
        this.lastUpdate = 0;
        this.pendingData = null;
    }
    
    update(data) {
        this.pendingData = data;
        
        const now = performance.now();
        const timeSinceLast = now - this.lastUpdate;
        
        // If enough time has passed, update immediately
        if (timeSinceLast >= this.delay) {
            this.flush();
        } else if (!this.timeout) {
            // Schedule update
            this.timeout = setTimeout(() => this.flush(), this.delay - timeSinceLast);
        }
    }
    
    flush() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        
        if (this.pendingData !== null) {
            this.updateFn(this.pendingData);
            this.lastUpdate = performance.now();
            this.pendingData = null;
        }
    }
}

// ============================================================================
// MOBILE PERFORMANCE SCALER
// ============================================================================

class MobilePerformanceScaler {
    constructor(deviceTier) {
        this.deviceTier = deviceTier;
        this.scalingFactor = this.calculateScalingFactor();
        
        // Listen for thermal/performance changes (where supported)
        if ('performance' in navigator && navigator.performance) {
            // Monitor frame rate and adjust if needed
            this.frameTimeThreshold = 33; // ~30fps
            this.consecutiveSlowFrames = 0;
            this.autoScaleEnabled = true;
        }
    }
    
    calculateScalingFactor() {
        switch (this.deviceTier) {
            case 'low':
                return 0.5;
            case 'medium':
                return 0.75;
            case 'high':
            default:
                return 1.0;
        }
    }
    
    getParticleCount(baseCount) {
        return Math.floor(baseCount * this.scalingFactor);
    }
    
    getUpdateRate(baseRate) {
        // Reduce update rate for physics on low-end devices
        if (this.deviceTier === 'low') {
            return Math.min(baseRate, 30);
        }
        return baseRate;
    }
    
    shouldRenderEffects() {
        return this.deviceTier !== 'low';
    }
    
    shouldUseDirtyRects() {
        // Dirty rects help most on high-end devices
        return this.deviceTier !== 'low';
    }
    
    monitorPerformance(frameTime) {
        if (!this.autoScaleEnabled) return;
        
        if (frameTime > this.frameTimeThreshold) {
            this.consecutiveSlowFrames++;
            if (this.consecutiveSlowFrames > 30) {
                // Automatically reduce quality
                this.reduceQuality();
                this.consecutiveSlowFrames = 0;
            }
        } else {
            this.consecutiveSlowFrames = Math.max(0, this.consecutiveSlowFrames - 1);
        }
    }
    
    reduceQuality() {
        if (this.scalingFactor > 0.25) {
            this.scalingFactor *= 0.8;
            console.log(`[Performance] Auto-reduced scaling factor to ${this.scalingFactor.toFixed(2)}`);
        }
    }
}

// ============================================================================
// LAZY LEVEL LOADER
// ============================================================================

class LazyLevelLoader {
    constructor() {
        this.levelCache = new Map();
        this.loadingPromises = new Map();
        this.compressionEnabled = true;
    }
    
    async loadLevel(levelNumber, levelGenerator) {
        // Check cache
        if (this.levelCache.has(levelNumber)) {
            return this.levelCache.get(levelNumber);
        }
        
        // Check if already loading
        if (this.loadingPromises.has(levelNumber)) {
            return this.loadingPromises.get(levelNumber);
        }
        
        // Start loading
        const loadPromise = this._loadLevelData(levelNumber, levelGenerator);
        this.loadingPromises.set(levelNumber, loadPromise);
        
        try {
            const levelData = await loadPromise;
            this.levelCache.set(levelNumber, levelData);
            this.loadingPromises.delete(levelNumber);
            return levelData;
        } catch (error) {
            this.loadingPromises.delete(levelNumber);
            throw error;
        }
    }
    
    async _loadLevelData(levelNumber, levelGenerator) {
        // Use requestIdleCallback if available for non-critical loading
        if (typeof requestIdleCallback !== 'undefined') {
            await new Promise(resolve => requestIdleCallback(resolve, { timeout: 100 }));
        } else {
            // Fallback: use setTimeout to yield to main thread
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        // Generate level data
        const blocks = levelGenerator();
        
        // Compress if enabled and level is large
        if (this.compressionEnabled && blocks.length > 50) {
            return this.compressLevelData(blocks);
        }
        
        return { blocks };
    }
    
    compressLevelData(blocks) {
        // Simple RLE compression for block data
        const compressed = {
            blocks: [],
            compressed: true,
            originalCount: blocks.length
        };
        
        let currentRun = null;
        let runCount = 0;
        
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            
            if (!currentRun || 
                block.hp !== currentRun.hp || 
                block.type !== currentRun.type ||
                Math.abs(block.x - (currentRun.startX + runCount * 64)) > 4) {
                // Start new run
                if (currentRun) {
                    compressed.blocks.push({
                        ...currentRun,
                        count: runCount
                    });
                }
                currentRun = {
                    x: block.x,
                    y: block.y,
                    hp: block.hp,
                    type: block.type,
                    startX: block.x
                };
                runCount = 1;
            } else {
                runCount++;
            }
        }
        
        // Add final run
        if (currentRun) {
            compressed.blocks.push({
                ...currentRun,
                count: runCount
            });
        }
        
        return compressed;
    }
    
    decompressLevelData(compressed) {
        if (!compressed.compressed) {
            return compressed;
        }
        
        const blocks = [];
        for (const run of compressed.blocks) {
            for (let i = 0; i < run.count; i++) {
                blocks.push({
                    x: run.startX + i * 64, // Approximate spacing
                    y: run.y,
                    hp: run.hp,
                    type: run.type
                });
            }
        }
        
        return { blocks };
    }
    
    preloadLevels(levelNumbers, levelGenerators) {
        // Preload levels during idle time
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
                for (const levelNum of levelNumbers) {
                    if (!this.levelCache.has(levelNum) && levelGenerators[levelNum]) {
                        this.loadLevel(levelNum, levelGenerators[levelNum]);
                    }
                }
            }, { timeout: 2000 });
        }
    }
    
    clearCache() {
        this.levelCache.clear();
        this.loadingPromises.clear();
    }
}

// ============================================================================
// EXPORT
// ============================================================================

const performanceMonitor = new PerformanceMonitor();

// Make classes available globally for non-module usage
if (typeof window !== 'undefined') {
    window.PerformanceMonitor = PerformanceMonitor;
    window.ObjectPool = ObjectPool;
    window.ThrottledStateSync = ThrottledStateSync;
    window.DirtyRectManager = DirtyRectManager;
    window.DebouncedUpdater = DebouncedUpdater;
    window.MobilePerformanceScaler = MobilePerformanceScaler;
    window.LazyLevelLoader = LazyLevelLoader;
    window.performanceMonitor = performanceMonitor;
}

export {
    PerformanceMonitor,
    ObjectPool,
    ThrottledStateSync,
    DirtyRectManager,
    DebouncedUpdater,
    MobilePerformanceScaler,
    LazyLevelLoader,
    performanceMonitor
};

export default performanceMonitor;
