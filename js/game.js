/**
 * Arkanoid P2P - Game Engine
 * Cooperative multiplayer Arkanoid with WebRTC synchronization
 * Style: Гоп-стоп (90s post-Soviet aesthetic)
 */

// ============================================================================
// CONSTANTS & CONFIG
// ============================================================================

const GAME_CONFIG = {
    canvas: {
        width: 800,
        height: 600
    },
    ball: {
        radius: 8,
        baseSpeed: 300,        // pixels per second
        maxSpeed: 600,
        speedIncrement: 15     // speed increase per paddle hit
    },
    paddle: {
        width: 120,
        height: 16,
        yOffset: 40            // distance from edge
    },
    block: {
        width: 60,
        height: 24,
        padding: 4,
        rows: 8,
        cols: 12
    },
    colors: {
        ball: '#FF0055',
        paddle1: '#00FF88',    // bottom player (host)
        paddle2: '#0088FF',    // top player (guest)
        blocks: {
            1: '#FFAA00',      // 1 HP - yellow
            2: '#FF5500',      // 2 HP - orange
            3: '#FF0055'       // 3 HP - red/pink
        },
        particles: ['#FF0055', '#FFAA00', '#00FF88', '#0088FF', '#AA00FF']
    },
    powerUps: {
        chance: 0.25,          // 25% chance on block destroy
        types: ['expand', 'multiball', 'slow', 'sticky', 'laser', 'magnet', 'shield'],
        fallSpeed: 150
    },
    laser: {
        width: 4,
        height: 16,
        speed: 600,
        color: '#FF0000',
        maxShots: 5
    }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function lerp(start, end, t) {
    return start + (end - start) * t;
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

// ============================================================================
// VECTOR MATH
// ============================================================================

class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vec2(this.x * s, this.y * s); }
    div(s) { return new Vec2(this.x / s, this.y / s); }
    
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    lengthSq() { return this.x * this.x + this.y * this.y; }
    
    normalize() {
        const len = this.length();
        if (len === 0) return new Vec2(0, 0);
        return this.div(len);
    }
    
    dot(v) { return this.x * v.x + this.y * v.y; }
    
    copy() { return new Vec2(this.x, this.y); }
    
    toJSON() { return { x: this.x, y: this.y }; }
    static fromJSON(obj) { return new Vec2(obj.x, obj.y); }
}

// ============================================================================
// PARTICLE SYSTEM WITH OBJECT POOLING
// ============================================================================

// Initialize performance monitoring
let performanceMonitor = null;
let mobileScaler = null;

// Set performance monitors from external module
function setPerformanceMonitors(monitor, scaler) {
    performanceMonitor = monitor;
    mobileScaler = scaler;
}

class Particle {
    constructor() {
        this.pos = new Vec2(0, 0);
        this.vel = new Vec2(0, 0);
        this.color = '#FFFFFF';
        this.life = 0;
        this.maxLife = 0;
        this.size = 0;
        this.alpha = 1;
        this.active = false;
    }

    init(x, y, vx, vy, color, life, size) {
        this.pos.x = x;
        this.pos.y = y;
        this.vel.x = vx;
        this.vel.y = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.alpha = 1;
        this.active = true;
    }

    reset() {
        this.active = false;
        this.life = 0;
        this.alpha = 1;
    }

    update(dt) {
        if (!this.active) return;
        
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.life -= dt;
        this.alpha = Math.max(0, this.life / this.maxLife);
        this.vel.x *= 0.98;
        this.vel.y *= 0.98;
        
        if (this.life <= 0) {
            this.active = false;
        }
    }

    render(ctx) {
        if (!this.active) return;
        
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }

    isDead() {
        return !this.active || this.life <= 0;
    }
}

class ParticleSystem {
    constructor(maxParticles = 200) {
        this.particles = [];
        this.maxParticles = maxParticles;
        this.poolIndex = 0;
        
        // Pre-allocate particles
        for (let i = 0; i < maxParticles; i++) {
            this.particles.push(new Particle());
        }
    }

    update(dt) {
        let activeCount = 0;
        for (const p of this.particles) {
            if (p.active) {
                p.update(dt);
                if (p.active) activeCount++;
            }
        }
    }

    render(ctx) {
        // Batch render for better performance
        ctx.save();
        
        // Skip glow effects on low-end devices
        const useGlow = !mobileScaler || mobileScaler.shouldRenderEffects();
        
        for (const p of this.particles) {
            if (p.active) {
                if (useGlow) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = p.color;
                }
                p.render(ctx);
            }
        }
        
        ctx.restore();
    }

    // Find an inactive particle or reuse oldest
    getParticle() {
        // Look for inactive particle
        for (const p of this.particles) {
            if (!p.active) {
                return p;
            }
        }
        
        // All active - reuse the oldest (lowest life)
        let oldest = this.particles[0];
        for (const p of this.particles) {
            if (p.life < oldest.life) {
                oldest = p;
            }
        }
        return oldest;
    }

    // Create explosion effect at position - deterministic for P2P sync
    explode(x, y, color, count = 12, seedOffset = 0) {
        // Scale particle count based on device tier
        if (mobileScaler) {
            count = mobileScaler.getParticleCount(count);
        }
        
        const colors = GAME_CONFIG.colors.particles;
        for (let i = 0; i < count; i++) {
            // Deterministic angle distribution for P2P synchronization
            const angle = (Math.PI * 2 * i) / count + (Math.sin(i * 17 + seedOffset) * 0.25);
            // Deterministic speed using seeded pattern
            const speed = 50 + ((i * 43 + seedOffset * 13) % 150);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const particleColor = color || colors[i % colors.length];
            const life = 0.3 + ((i * 7) % 50) / 100;
            const size = 2 + ((i * 11) % 40) / 10;
            
            const p = this.getParticle();
            p.init(x, y, vx, vy, particleColor, life, size);
        }
    }

    // Spark effect for paddle hits - deterministic for P2P sync
    spark(x, y, normalX, normalY, color) {
        const baseCount = 8;
        const count = mobileScaler ? mobileScaler.getParticleCount(baseCount) : baseCount;
        
        for (let i = 0; i < count; i++) {
            // Deterministic angle spread around normal
            const baseAngle = Math.atan2(normalY, normalX);
            const angle = baseAngle + (i - count/2 + 0.5) * 0.15;
            // Deterministic speed
            const speed = 30 + ((i * 23) % 80);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const life = 0.2 + ((i * 13) % 30) / 100;
            const size = 2 + ((i * 7) % 30) / 10;
            
            const p = this.getParticle();
            p.init(x, y, vx, vy, color, life, size);
        }
    }

    clear() {
        for (const p of this.particles) {
            p.reset();
        }
    }

    getCount() {
        return this.particles.filter(p => p.active).length;
    }
}

// ============================================================================
// POWER-UP SYSTEM
// ============================================================================

class PowerUp {
    constructor(x, y, type) {
        this.pos = new Vec2(x, y);
        this.type = type;
        this.radius = 12;
        this.vel = new Vec2(0, GAME_CONFIG.powerUps.fallSpeed);
        this.collected = false;
        
        // Power-up properties with enhanced visuals and labels
        this.types = {
            expand: { 
                color: '#00FF88', 
                symbol: '↔', 
                duration: 10,
                label: 'EXPAND',
                glowColor: '#00FF88',
                glowSize: 20
            },
            multiball: { 
                color: '#FFAA00', 
                symbol: '●', 
                duration: 0,
                label: 'MULTIBALL',
                glowColor: '#FFAA00',
                glowSize: 20
            },
            slow: { 
                color: '#0088FF', 
                symbol: '⏱', 
                duration: 8,
                label: 'SLOW',
                glowColor: '#0088FF',
                glowSize: 20
            },
            sticky: { 
                color: '#AA00FF', 
                symbol: '§', 
                duration: 10,
                label: 'STICKY',
                glowColor: '#AA00FF',
                glowSize: 20
            },
            laser: { 
                color: '#FF0000', 
                symbol: '⌄', 
                duration: 15,
                label: 'LASER',
                glowColor: '#FF0000',
                glowSize: 25
            },
            magnet: { 
                color: '#FF00AA', 
                symbol: '⧖', 
                duration: 12,
                label: 'MAGNET',
                glowColor: '#FF00AA',
                glowSize: 25
            },
            shield: { 
                color: '#00FFFF', 
                symbol: '◊', 
                duration: 0,
                label: 'SHIELD',
                glowColor: '#00FFFF',
                glowSize: 25
            }
        };
        
        // Animation properties
        this.animTime = 0;
        this.pulse = 0;
    }

    update(dt) {
        this.pos = this.pos.add(this.vel.mul(dt));
        this.animTime += dt;
        this.pulse = 0.7 + Math.sin(this.animTime * 5) * 0.3; // Pulsing effect
    }

    render(ctx) {
        const props = this.types[this.type] || this.types.expand;
        
        ctx.save();
        
        // Outer glow pulse
        const glowSize = props.glowSize * this.pulse;
        ctx.shadowBlur = glowSize;
        ctx.shadowColor = props.glowColor;
        
        // Outer glow ring
        ctx.fillStyle = props.color;
        ctx.globalAlpha = 0.3 * this.pulse;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius + 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Main circle
        ctx.globalAlpha = 1;
        ctx.fillStyle = props.color;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner highlight
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(this.pos.x - 3, this.pos.y - 3, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        // Border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Symbol
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 10;
        ctx.shadowColor = props.color;
        ctx.fillText(props.symbol, this.pos.x, this.pos.y);
        
        // Floating label above power-up
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = props.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = props.color;
        
        // Label background for readability
        const labelText = props.label;
        const textWidth = ctx.measureText(labelText).width;
        const labelY = this.pos.y - this.radius - 12;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.roundRect(this.pos.x - textWidth/2 - 4, labelY - 8, textWidth + 8, 14, 3);
        ctx.fill();
        
        // Label text
        ctx.fillStyle = props.color;
        ctx.fillText(labelText, this.pos.x, labelY);
        
        ctx.restore();
    }

    getBounds() {
        return {
            x: this.pos.x - this.radius,
            y: this.pos.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }

    toJSON() {
        return {
            x: this.pos.x,
            y: this.pos.y,
            type: this.type
        };
    }

    static fromJSON(data) {
        return new PowerUp(data.x, data.y, data.type);
    }

    static randomType(seed = 0) {
        const types = GAME_CONFIG.powerUps.types;
        // Deterministic selection based on seed for P2P sync
        const index = seed % types.length;
        return types[index];
    }
    
    // Get serialization char for network
    getTypeChar() {
        const charMap = {
            'expand': 'e',
            'multiball': 'm',
            'slow': 's',
            'sticky': 't',
            'laser': 'l',
            'magnet': 'n',
            'shield': 'h'
        };
        return charMap[this.type] || 'e';
    }
}

// ============================================================================
// LASER PROJECTILE
// ============================================================================

class Laser {
    constructor(x, y, direction = 1) {
        this.pos = new Vec2(x, y);
        this.vel = new Vec2(0, GAME_CONFIG.laser.speed * direction);
        this.width = GAME_CONFIG.laser.width;
        this.height = GAME_CONFIG.laser.height;
        this.active = true;
        this.color = GAME_CONFIG.laser.color;
        this.fromPlayer = direction === -1 ? 1 : 2; // Bottom player shoots up (direction -1), top shoots down
    }

    update(dt) {
        this.pos = this.pos.add(this.vel.mul(dt));
        
        // Deactivate if off screen
        if (this.pos.y < -50 || this.pos.y > GAME_CONFIG.canvas.height + 50) {
            this.active = false;
        }
    }

    render(ctx) {
        ctx.save();
        
        // Glow effect
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        
        // Main laser beam
        ctx.fillStyle = this.color;
        ctx.fillRect(this.pos.x - this.width/2, this.pos.y - this.height/2, this.width, this.height);
        
        // Inner bright core
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(this.pos.x - this.width/4, this.pos.y - this.height/2, this.width/2, this.height);
        
        ctx.restore();
    }

    getBounds() {
        return {
            x: this.pos.x - this.width/2,
            y: this.pos.y - this.height/2,
            width: this.width,
            height: this.height
        };
    }
}

// ============================================================================
// FLOATING TEXT LABEL
// ============================================================================

class FloatingText {
    constructor(x, y, text, color, duration = 1.5) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.duration = duration;
        this.life = duration;
        this.active = true;
        this.vy = -30; // Float upward
        this.scale = 1;
    }

    update(dt) {
        this.life -= dt;
        this.y += this.vy * dt;
        
        // Scale up then down
        const progress = 1 - (this.life / this.duration);
        if (progress < 0.2) {
            this.scale = 1 + progress * 2; // Scale up to 1.4
        } else {
            this.scale = 1.4 - (progress - 0.2) * 0.5; // Scale down slightly
        }
        
        if (this.life <= 0) {
            this.active = false;
        }
    }

    render(ctx) {
        if (!this.active) return;
        
        ctx.save();
        
        const alpha = Math.min(1, this.life / 0.5);
        ctx.globalAlpha = alpha;
        
        // Shadow/glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        // Draw text
        ctx.fillStyle = this.color;
        ctx.font = `bold ${Math.floor(16 * this.scale)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, this.x, this.y);
        
        ctx.restore();
    }
}

// ============================================================================
// BALL CLASS
// ============================================================================

class Ball {
    constructor(x, y) {
        this.pos = new Vec2(x, y);
        this.vel = new Vec2(0, 0);
        this.radius = GAME_CONFIG.ball.radius;
        this.baseSpeed = GAME_CONFIG.ball.baseSpeed;
        this.speed = this.baseSpeed;
        this.active = false;     // waiting on paddle
        this.stuck = false;      // stuck to paddle (sticky power-up)
        this.stuckTo = null;     // which paddle it's stuck to
        this.stuckOffset = 0;    // offset from paddle center
        this.trail = [];         // position trail for effects
        this.maxTrail = 8;
    }

    launch(angle) {
        this.vel = new Vec2(
            Math.cos(angle) * this.speed,
            Math.sin(angle) * this.speed
        );
        this.active = true;
        this.stuck = false;
        this.stuckTo = null;
    }

    update(dt) {
        if (!this.active) {
            // Update trail even when inactive
            this.updateTrail();
            return;
        }

        if (this.stuck && this.stuckTo) {
            // Follow paddle when stuck
            this.pos.x = this.stuckTo.x + this.stuckOffset;
            this.pos.y = this.stuckTo.y + (this.stuckTo.isTop ? this.radius + 2 : -this.radius - 2);
            this.updateTrail();
            return;
        }

        // Move ball
        this.pos = this.pos.add(this.vel.mul(dt));
        
        // Update speed based on velocity magnitude
        this.speed = this.vel.length();
        
        this.updateTrail();
    }

    updateTrail() {
        this.trail.unshift({ x: this.pos.x, y: this.pos.y });
        if (this.trail.length > this.maxTrail) {
            this.trail.pop();
        }
    }

    // Check and resolve wall collisions
    checkWalls(width, height) {
        let hit = false;
        const MIN_VELOCITY = 10; // Minimum velocity nudge to prevent sticking

        // Left/Right walls
        if (this.pos.x - this.radius < 0) {
            this.pos.x = this.radius;
            this.vel.x = Math.abs(this.vel.x);
            // Add velocity nudge if too slow or stuck
            if (Math.abs(this.vel.x) < MIN_VELOCITY) {
                this.vel.x = MIN_VELOCITY;
            }
            // Prevent perfectly vertical bounce that could cause sticking
            if (Math.abs(this.vel.y) < MIN_VELOCITY) {
                // Deterministic direction based on position
                this.vel.y = ((this.pos.y * 7) % 2 > 1 ? 1 : -1) * MIN_VELOCITY;
            }
            hit = true;
        } else if (this.pos.x + this.radius > width) {
            this.pos.x = width - this.radius;
            this.vel.x = -Math.abs(this.vel.x);
            // Add velocity nudge if too slow or stuck
            if (Math.abs(this.vel.x) < MIN_VELOCITY) {
                this.vel.x = -MIN_VELOCITY;
            }
            // Prevent perfectly vertical bounce
            if (Math.abs(this.vel.y) < MIN_VELOCITY) {
                // Deterministic direction based on position
                this.vel.y = ((this.pos.y * 11) % 2 > 1 ? 1 : -1) * MIN_VELOCITY;
            }
            hit = true;
        }

        // Top/Bottom walls (blocks top area, prevents escaping through edges)
        if (this.pos.y - this.radius < 0) {
            this.pos.y = this.radius;
            this.vel.y = Math.abs(this.vel.y);
            hit = true;
        } else if (this.pos.y + this.radius > height) {
            this.pos.y = height - this.radius;
            this.vel.y = -Math.abs(this.vel.y);
            hit = true;
        }

        return hit;
    }

    // Check if ball is out of bounds (missed)
    checkMiss(height) {
        if (this.pos.y - this.radius > height) {
            return 'bottom';  // Missed by bottom player
        }
        if (this.pos.y + this.radius < 0) {
            return 'top';     // Missed by top player  
        }
        return null;
    }

    // Reflect velocity based on normal
    reflect(normal) {
        const n = normal.normalize();
        const dot = this.vel.dot(n);
        this.vel = this.vel.sub(n.mul(2 * dot));
    }

    // Increase speed after paddle hit
    increaseSpeed() {
        const newSpeed = Math.min(
            this.speed + GAME_CONFIG.ball.speedIncrement,
            GAME_CONFIG.ball.maxSpeed
        );
        this.vel = this.vel.normalize().mul(newSpeed);
        this.speed = newSpeed;
    }

    render(ctx) {
        // Draw trail
        for (let i = this.trail.length - 1; i >= 0; i--) {
            const pos = this.trail[i];
            const alpha = (1 - i / this.trail.length) * 0.5;
            const size = this.radius * (1 - i * 0.1);
            
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = GAME_CONFIG.colors.ball;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Draw ball
        ctx.save();
        ctx.fillStyle = GAME_CONFIG.colors.ball;
        ctx.shadowBlur = 15;
        ctx.shadowColor = GAME_CONFIG.colors.ball;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner highlight
        ctx.fillStyle = '#FF88AA';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(this.pos.x - 2, this.pos.y - 2, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    getBounds() {
        return {
            x: this.pos.x - this.radius,
            y: this.pos.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }

    toJSON() {
        return {
            x: this.pos.x,
            y: this.pos.y,
            vx: this.vel.x,
            vy: this.vel.y,
            active: this.active,
            speed: this.speed
        };
    }

    static fromJSON(data) {
        const ball = new Ball(data.x, data.y);
        ball.vel = new Vec2(data.vx, data.vy);
        ball.active = data.active;
        ball.speed = data.speed;
        return ball;
    }
}

// ============================================================================
// PADDLE CLASS
// ============================================================================

class Paddle {
    constructor(x, y, isTop, playerNum) {
        this.x = x;
        this.y = y;
        this.width = GAME_CONFIG.paddle.width;
        this.height = GAME_CONFIG.paddle.height;
        this.isTop = isTop;
        this.playerNum = playerNum;  // 1 or 2
        this.color = isTop ? GAME_CONFIG.colors.paddle2 : GAME_CONFIG.colors.paddle1;
        
        // Power-up effects
        this.expanded = false;
        this.originalWidth = this.width;
        this.expandTimer = 0;
        this.sticky = false;
        this.stickyTimer = 0;
        
        // New power-up effects
        this.laser = false;
        this.laserTimer = 0;
        this.laserShots = 0;
        this.laserCooldown = 0;
        this.magnet = false;
        this.magnetTimer = 0;
        this.magnetRange = 150; // Pull range in pixels
        this.magnetStrength = 200; // Pull strength
        this.shield = false;
        
        // Visual
        this.glowIntensity = 0;
        this.laserFlash = 0;
    }

    update(dt) {
        // Handle power-up timers
        if (this.expandTimer > 0) {
            this.expandTimer -= dt;
            if (this.expandTimer <= 0) {
                this.expanded = false;
                this.width = this.originalWidth;
            }
        }
        
        if (this.stickyTimer > 0) {
            this.stickyTimer -= dt;
            if (this.stickyTimer <= 0) {
                this.sticky = false;
            }
        }
        
        if (this.laserTimer > 0) {
            this.laserTimer -= dt;
            if (this.laserTimer <= 0) {
                this.laser = false;
                this.laserShots = 0;
            }
        }
        
        if (this.laserCooldown > 0) {
            this.laserCooldown -= dt;
        }
        
        if (this.magnetTimer > 0) {
            this.magnetTimer -= dt;
            if (this.magnetTimer <= 0) {
                this.magnet = false;
            }
        }

        // Update glow
        this.glowIntensity = 0.5 + Math.sin(Date.now() / 200) * 0.3;
        
        // Update laser flash
        if (this.laserFlash > 0) {
            this.laserFlash -= dt;
        }
    }

    setPosition(x, canvasWidth) {
        // Clamp to canvas bounds
        const halfWidth = this.width / 2;
        this.x = clamp(x, halfWidth, canvasWidth - halfWidth);
    }

    expand(duration) {
        this.expanded = true;
        this.width = this.originalWidth * 1.5;
        this.expandTimer = duration;
    }

    enableSticky(duration) {
        this.sticky = true;
        this.stickyTimer = duration;
    }
    
    enableLaser(duration) {
        this.laser = true;
        this.laserTimer = duration;
        this.laserShots = GAME_CONFIG.laser.maxShots;
    }
    
    enableMagnet(duration) {
        this.magnet = true;
        this.magnetTimer = duration;
    }
    
    enableShield() {
        this.shield = true;
    }
    
    useShield() {
        if (this.shield) {
            this.shield = false;
            return true;
        }
        return false;
    }
    
    shoot() {
        if (!this.laser || this.laserShots <= 0 || this.laserCooldown > 0) {
            return null;
        }
        
        this.laserShots--;
        this.laserCooldown = 0.3; // 300ms cooldown between shots
        this.laserFlash = 0.1;
        
        const direction = this.isTop ? 1 : -1; // Top shoots down, bottom shoots up
        const laserY = this.isTop ? this.y + this.height/2 : this.y - this.height/2;
        
        return new Laser(this.x, laserY, direction);
    }
    
    getMagnetForce(ballX, ballY) {
        if (!this.magnet) return null;
        
        const dy = this.y - ballY;
        const dx = this.x - ballX;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > this.magnetRange) return null;
        
        // Calculate pull force
        const force = this.magnetStrength * (1 - dist / this.magnetRange);
        return {
            fx: (dx / dist) * force,
            fy: (dy / dist) * force,
            strength: force
        };
    }

    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }

    // Get hit position normalized to [-1, 1] from center
    getHitPosition(ballX) {
        const relativeX = (ballX - this.x) / (this.width / 2);
        return clamp(relativeX, -1, 1);
    }

    render(ctx) {
        const bounds = this.getBounds();
        
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15 * this.glowIntensity;
        ctx.shadowColor = this.color;
        
        // Laser flash effect
        if (this.laserFlash > 0) {
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#FF0000';
            ctx.fillStyle = '#FF4444';
        }
        
        // Rounded rectangle
        const radius = 4;
        ctx.beginPath();
        ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
        ctx.fill();
        
        // Inner glow line
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        
        // Center marker
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.3;
        ctx.fillRect(this.x - 2, bounds.y, 4, bounds.height);
        
        // Power-up indicators
        const time = Date.now() / 200;
        
        // Sticky indicator
        if (this.sticky) {
            ctx.strokeStyle = '#AA00FF';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.8 + Math.sin(time) * 0.2;
            ctx.beginPath();
            ctx.roundRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4, radius + 2);
            ctx.stroke();
        }
        
        // Laser indicator
        if (this.laser) {
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.8 + Math.sin(time * 2) * 0.2;
            ctx.beginPath();
            ctx.roundRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6, radius + 3);
            ctx.stroke();
            
            // Laser shots counter
            ctx.fillStyle = '#FF0000';
            ctx.globalAlpha = 1;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`⚡${this.laserShots}`, this.x, bounds.y - 8);
        }
        
        // Magnet indicator
        if (this.magnet) {
            ctx.strokeStyle = '#FF00AA';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6 + Math.sin(time * 1.5) * 0.3;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.roundRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8, radius + 4);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Magnet range visualization (subtle)
            ctx.strokeStyle = '#FF00AA';
            ctx.globalAlpha = 0.1;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.magnetRange, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Shield indicator
        if (this.shield) {
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.8 + Math.sin(time * 3) * 0.2;
            ctx.beginPath();
            ctx.roundRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10, radius + 5);
            ctx.stroke();
            
            // Shield icon
            ctx.fillStyle = '#00FFFF';
            ctx.globalAlpha = 1;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('◊', this.x, bounds.y - 10);
        }
        
        ctx.restore();
    }

    toJSON() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            expanded: this.expanded,
            sticky: this.sticky,
            laser: this.laser,
            magnet: this.magnet,
            shield: this.shield,
            laserShots: this.laserShots
        };
    }

    static fromJSON(data) {
        const paddle = new Paddle(data.x, data.y, data.y < 300, data.y < 300 ? 2 : 1);
        paddle.width = data.width;
        paddle.expanded = data.expanded;
        paddle.sticky = data.sticky;
        paddle.laser = data.laser || false;
        paddle.magnet = data.magnet || false;
        paddle.shield = data.shield || false;
        paddle.laserShots = data.laserShots || 0;
        return paddle;
    }
}

// ============================================================================
// BLOCK CLASS
// ============================================================================

class Block {
    constructor(x, y, hp, type = 'normal') {
        this.x = x;
        this.y = y;
        this.width = GAME_CONFIG.block.width;
        this.height = GAME_CONFIG.block.height;
        this.hp = hp;
        this.maxHp = hp;
        this.type = type;
        this.destroyed = false;
        
        // Visual
        this.flash = 0;  // hit flash timer
    }

    hit(damage = 1) {
        this.hp -= damage;
        this.flash = 0.1;  // 100ms flash
        
        if (this.hp <= 0) {
            this.destroyed = true;
            return true;  // destroyed
        }
        return false;  // still alive
    }

    update(dt) {
        if (this.flash > 0) {
            this.flash -= dt;
        }
    }

    getColor() {
        const baseColor = GAME_CONFIG.colors.blocks[this.hp] || GAME_CONFIG.colors.blocks[1];
        
        if (this.flash > 0) {
            // White flash on hit
            return '#FFFFFF';
        }
        
        return baseColor;
    }

    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }

    render(ctx) {
        if (this.destroyed) return;
        
        const color = this.getColor();
        
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        
        // Main block
        ctx.beginPath();
        ctx.roundRect(this.x + 2, this.y + 2, this.width - 4, this.height - 4, 3);
        ctx.fill();
        
        // HP indicator (dots)
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < this.hp; i++) {
            const dotX = this.x + 8 + i * 10;
            const dotY = this.y + this.height - 6;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        
        ctx.restore();
    }

    toJSON() {
        return {
            x: this.x,
            y: this.y,
            hp: this.hp,
            type: this.type
        };
    }

    static fromJSON(data) {
        return new Block(data.x, data.y, data.hp, data.type);
    }
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================

class CollisionDetector {
    // Circle (ball) vs AABB (paddle/block) - with continuous collision for high speeds
    static circleAABB(circle, rect, prevPos = null) {
        // Find closest point on rect to circle center
        const closestX = clamp(circle.pos.x, rect.x, rect.x + rect.width);
        const closestY = clamp(circle.pos.y, rect.y, rect.y + rect.height);
        
        const dx = circle.pos.x - closestX;
        const dy = circle.pos.y - closestY;
        const distSq = dx * dx + dy * dy;
        
        const rSq = circle.radius * circle.radius;
        
        // Continuous collision detection for high speeds
        // Calculate velocity magnitude
        const vel = circle.vel || { x: 0, y: 0 };
        const speedSq = vel.x * vel.x + vel.y * vel.y;
        const MAX_SPEED_SQ = 400000; // 200^2 - threshold for CCD
        
        // If moving fast, check line segment swept volume
        if (prevPos && speedSq > MAX_SPEED_SQ) {
            const moveX = circle.pos.x - prevPos.x;
            const moveY = circle.pos.y - prevPos.y;
            
            // Perform swept AABB/circle test
            // Check if the swept path intersects the rectangle
            const invEntryX = moveX !== 0 ? (rect.x - prevPos.x) / moveX : 0;
            const invExitX = moveX !== 0 ? (rect.x + rect.width - prevPos.x) / moveX : 0;
            const invEntryY = moveY !== 0 ? (rect.y - prevPos.y) / moveY : 0;
            const invExitY = moveY !== 0 ? (rect.y + rect.height - prevPos.y) / moveY : 0;
            
            const entryX = Math.min(invEntryX, invExitX);
            const entryY = Math.min(invEntryY, invExitY);
            const entryTime = Math.max(entryX, entryY);
            
            // If entry time is in [0,1], collision occurred during movement
            if (entryTime >= 0 && entryTime <= 1) {
                // Interpolate collision point
                const hitX = prevPos.x + moveX * entryTime;
                const hitY = prevPos.y + moveY * entryTime;
                
                // Determine normal based on dominant entry axis
                let normal;
                if (entryX > entryY) {
                    normal = new Vec2(moveX > 0 ? -1 : 1, 0);
                } else {
                    normal = new Vec2(0, moveY > 0 ? -1 : 1);
                }
                
                return {
                    hit: true,
                    normal: normal,
                    penetration: circle.radius,
                    point: new Vec2(hitX, hitY),
                    continuous: true
                };
            }
        }
        
        if (distSq < rSq) {
            // Collision detected
            const dist = Math.sqrt(distSq);
            const normal = dist > 0 
                ? new Vec2(dx / dist, dy / dist) 
                : new Vec2(0, -1);  // Center collision, default to up
            
            const penetration = circle.radius - dist;
            
            return {
                hit: true,
                normal: normal,
                penetration: penetration,
                point: new Vec2(closestX, closestY),
                continuous: false
            };
        }
        
        return { hit: false };
    }

    // AABB vs AABB (for power-ups)
    static AABB(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y
        );
    }
}

// ============================================================================
// MAIN GAME CLASS
// ============================================================================

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Set canvas size
        this.width = GAME_CONFIG.canvas.width;
        this.height = GAME_CONFIG.canvas.height;
        canvas.width = this.width;
        canvas.height = this.height;
        
        // Game state
        this.state = 'waiting';  // waiting, playing, paused, gameover
        this.level = 1;
        this.levelData = null;
        
        // Entities
        this.balls = [];
        this.paddles = [];
        this.blocks = [];
        this.powerUps = [];
        this.lasers = []; // Active laser projectiles
        this.floatingTexts = []; // Floating text labels
        this.particles = new ParticleSystem();
        
        // Scoring
        this.score = { 1: 0, 2: 0 };
        this.lives = 3;
        this.combo = 0;
        this.comboTimer = 0;
        
        // Input state
        this.inputs = {
            1: this.width / 2,  // paddle 1 position
            2: this.width / 2   // paddle 2 position
        };
        
        // Power-up state
        this.activeEffects = {
            slow: 0,
            multiball: false
        };
        
        // Difficulty modifiers
        this.difficultyModifiers = null;
        
        // Event callbacks
        this.callbacks = {
            ball_miss: [],
            block_destroyed: [],
            level_complete: [],
            game_over: [],
            powerup_collect: []
        };
        
        // Network state
        this.isHost = false;
        this.lastState = null;
        this.stateHistory = [];  // For interpolation
        this.pendingInputs = []; // For prediction
        
        // Timing
        this.lastTime = 0;
        this.accumulator = 0;
        this.fixedDt = 1 / 60;  // 60 FPS physics
        
        // Stats
        this.stats = {
            blocksDestroyed: 0,
            ballsLaunched: 0,
            powerUpsCollected: 0,
            lasersFired: 0,
            shieldsUsed: 0
        };
    }

    // Event handling
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }

    emit(event, data) {
        if (this.callbacks[event]) {
            for (const cb of this.callbacks[event]) {
                cb(data);
            }
        }
    }

    // Initialize level
    init(levelData) {
        this.levelData = levelData;
        this.resetLevel();
        this.state = 'playing';
    }

    resetLevel() {
        // Clear entities
        this.balls = [];
        this.blocks = [];
        this.powerUps = [];
        this.particles.clear();
        
        // Create paddles
        const paddleY1 = this.height - GAME_CONFIG.paddle.yOffset;
        const paddleY2 = GAME_CONFIG.paddle.yOffset;
        
        this.paddles = [
            new Paddle(this.width / 2, paddleY1, false, 1),  // bottom
            new Paddle(this.width / 2, paddleY2, true, 2)    // top
        ];
        
        // Create blocks from level data
        if (this.levelData && this.levelData.blocks) {
            for (const blockData of this.levelData.blocks) {
                this.blocks.push(new Block(
                    blockData.x,
                    blockData.y,
                    blockData.hp || 1,
                    blockData.type || 'normal'
                ));
            }
        } else {
            // Generate default block layout
            this.generateDefaultBlocks();
        }
        
        // Create initial ball
        this.spawnBall(1, true);  // bottom paddle
        
        // Reset combo
        this.combo = 0;
        this.comboTimer = 0;
    }

    generateDefaultBlocks() {
        const rows = GAME_CONFIG.block.rows;
        const cols = GAME_CONFIG.block.cols;
        const blockW = GAME_CONFIG.block.width;
        const blockH = GAME_CONFIG.block.height;
        const padding = GAME_CONFIG.block.padding;
        
        const startX = (this.width - (cols * (blockW + padding))) / 2;
        const startY = 100;
        
        for (let row = 0; row < rows; row++) {
            const hp = Math.min(3, Math.floor(row / 2) + 1);
            
            for (let col = 0; col < cols; col++) {
                const x = startX + col * (blockW + padding);
                const y = startY + row * (blockH + padding);
                this.blocks.push(new Block(x, y, hp));
            }
        }
    }

    spawnBall(paddleNum, stuck = true) {
        const paddle = this.paddles[paddleNum - 1];
        const ball = new Ball(paddle.x, paddle.isTop 
            ? paddle.y + paddle.height / 2 + GAME_CONFIG.ball.radius + 2
            : paddle.y - paddle.height / 2 - GAME_CONFIG.ball.radius - 2
        );
        
        if (stuck) {
            ball.stuck = true;
            ball.stuckTo = paddle;
            ball.stuckOffset = 0;
        } else {
            // Launch toward center with deterministic angle for P2P sync
            // Use ball count as seed for variety
            const seed = this.balls.length;
            const angleVariation = ((seed * 37) % 100) / 100 - 0.5; // -0.5 to 0.5
            const angle = paddle.isTop 
                ? Math.PI / 2 + angleVariation * 0.5 
                : -Math.PI / 2 + angleVariation * 0.5;
            ball.launch(angle);
        }
        
        this.balls.push(ball);
        this.stats.ballsLaunched++;
    }

    // Set paddle position from input
    setInput(player, position) {
        // position is normalized [0, 1] or absolute x coordinate
        if (position >= 0 && position <= 1) {
            this.inputs[player] = position * this.width;
        } else {
            this.inputs[player] = position;
        }
        
        // Update paddle position
        const paddle = this.paddles[player - 1];
        if (paddle) {
            paddle.setPosition(this.inputs[player], this.width);
        }
    }

    // Main update loop
    update(dt) {
        if (this.state !== 'playing') return;
        
        // Cap dt to prevent huge jumps
        dt = Math.min(dt, 0.1);
        
        // Update combo timer
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) {
                this.combo = 0;
            }
        }
        
        // Update power-up effects
        this.updatePowerUpEffects(dt);
        
        // Update paddles
        for (const paddle of this.paddles) {
            paddle.update(dt);
        }
        
        // Update particles
        this.particles.update(dt);
        
        // Update power-ups
        this.updatePowerUps(dt);
        
        // Update lasers
        this.updateLasers(dt);
        
        // Update floating texts
        this.updateFloatingTexts(dt);
        
        // Update balls
        this.updateBalls(dt, true);
        
        // Update blocks
        for (const block of this.blocks) {
            block.update(dt);
        }
        
        // Check level complete
        if (this.blocks.every(b => b.destroyed)) {
            this.emit('level_complete', { level: this.level });
        }
    }

    updateBalls(dt, applyMagnet = false) {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            
            // Store previous position for continuous collision
            const prevPos = ball.pos.copy();
            
            // Apply magnet effect before movement
            if (applyMagnet && ball.active && !ball.stuck) {
                for (const paddle of this.paddles) {
                    if (paddle.magnet) {
                        const force = paddle.getMagnetForce(ball.pos.x, ball.pos.y);
                        if (force) {
                            // Apply magnetic force to velocity
                            ball.vel.x += force.fx * dt;
                            ball.vel.y += force.fy * dt;
                            // Update speed
                            ball.speed = ball.vel.length();
                        }
                    }
                }
            }
            
            ball.update(dt);
            
            // Skip collision for stuck balls
            if (ball.stuck) {
                // Check if stuck ball should launch (both players ready)
                continue;
            }
            
            // Wall collisions
            const wallHit = ball.checkWalls(this.width, this.height);
            if (wallHit) {
                // Wall hit sound/effect could go here
            }
            
            // Paddle collisions - with continuous collision detection
            for (const paddle of this.paddles) {
                const collision = CollisionDetector.circleAABB(
                    ball,
                    paddle.getBounds(),
                    prevPos
                );
                
                if (collision.hit) {
                    this.handlePaddleHit(ball, paddle, collision);
                }
            }
            
            // Block collisions - with continuous collision detection
            let collisionHappened = false;
            for (const block of this.blocks) {
                if (block.destroyed) continue;
                
                const collision = CollisionDetector.circleAABB(
                    ball,
                    block.getBounds(),
                    prevPos
                );
                
                if (collision.hit) {
                    this.handleBlockHit(ball, block, collision);
                    collisionHappened = true;
                    break;  // Only one block per frame
                }
            }
            
            // Sub-step collision for high speeds if no collision detected
            // This handles the case where ball moves through thin objects
            if (!collisionHappened) {
                const speed = ball.vel.length();
                const subSteps = Math.ceil(speed * dt / GAME_CONFIG.ball.radius);
                if (subSteps > 1) {
                    const stepDt = dt / subSteps;
                    for (let step = 1; step < subSteps; step++) {
                        const interpPos = prevPos.add(ball.vel.mul(stepDt * step));
                        const interpBall = { pos: interpPos, vel: ball.vel, radius: ball.radius };
                        
                        // Check blocks at interpolated position
                        for (const block of this.blocks) {
                            if (block.destroyed) continue;
                            
                            const subCollision = CollisionDetector.circleAABB(
                                interpBall,
                                block.getBounds()
                            );
                            
                            if (subCollision.hit) {
                                // Move ball to collision point
                                ball.pos.x = interpPos.x;
                                ball.pos.y = interpPos.y;
                                this.handleBlockHit(ball, block, subCollision);
                                collisionHappened = true;
                                break;
                            }
                        }
                        if (collisionHappened) break;
                    }
                }
            }
            
            // Check miss
            const miss = ball.checkMiss(this.height);
            if (miss) {
                this.handleBallMiss(ball, miss, i);
            }
        }
    }

    handlePaddleHit(ball, paddle, collision) {
        // Push ball out of paddle
        ball.pos = ball.pos.add(collision.normal.mul(collision.penetration));
        
        // Calculate reflection with angle based on hit position
        const hitPos = paddle.getHitPosition(ball.pos.x);
        
        // Clamp hit position to avoid extreme angles
        // This prevents steep angles that make the ball hard to track
        const CLAMPED_HIT_POS = clamp(hitPos, -0.8, 0.8);
        
        // Maximum reflection angle (in radians) - ±50 degrees instead of ±60
        const MAX_REFLECTION_ANGLE = Math.PI / 3.6; // ~50 degrees
        
        // Base reflection
        let newAngle;
        if (paddle.isTop) {
            // Top paddle: bounce down
            newAngle = Math.PI / 2 + CLAMPED_HIT_POS * MAX_REFLECTION_ANGLE;
        } else {
            // Bottom paddle: bounce up
            newAngle = -Math.PI / 2 - CLAMPED_HIT_POS * MAX_REFLECTION_ANGLE;
        }
        
        // Ensure minimum vertical velocity (prevents horizontal gliding)
        const MIN_VERTICAL_ANGLE = 0.3; // ~17 degrees from horizontal
        if (Math.abs(newAngle) < MIN_VERTICAL_ANGLE || 
            Math.abs(newAngle - Math.PI) < MIN_VERTICAL_ANGLE ||
            Math.abs(newAngle) > Math.PI - MIN_VERTICAL_ANGLE) {
            newAngle = newAngle > 0 
                ? (paddle.isTop ? Math.PI / 2 + 0.3 : -Math.PI / 2 - 0.3)
                : (paddle.isTop ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3);
        }
        
        // Apply velocity with deterministic adjustment
        // Use no randomness for P2P sync, or deterministic random based on hit position
        ball.vel = new Vec2(
            Math.cos(newAngle) * ball.speed,
            Math.sin(newAngle) * ball.speed
        );
        
        // Increase speed (already capped in increaseSpeed)
        ball.increaseSpeed();
        
        // Check sticky power-up
        if (paddle.sticky && !ball.stuck) {
            // 30% chance to stick - deterministic based on combo count for sync
            const stickChance = (this.combo * 17) % 100 / 100;
            if (stickChance < 0.3) {
                ball.stuck = true;
                ball.stuckTo = paddle;
                ball.stuckOffset = ball.pos.x - paddle.x;
            }
        }
        
        // Visual feedback
        this.particles.spark(
            collision.point.x,
            collision.point.y,
            collision.normal.x,
            collision.normal.y,
            paddle.color
        );

        // Audio feedback
        if (typeof audioSynth !== 'undefined') {
            audioSynth.paddleHit();
        }
        
        // Increment combo
        this.combo++;
        this.comboTimer = 2.0;  // 2 second combo window
    }

    handleBlockHit(ball, block, collision) {
        // Push ball out
        ball.pos = ball.pos.add(collision.normal.mul(collision.penetration));
        
        // Reflect based on normal
        ball.reflect(collision.normal);
        
        // Damage block
        const destroyed = block.hit();
        
        // Award score based on combo
        const baseScore = (4 - block.hp) * 10;
        const comboMultiplier = 1 + Math.floor(this.combo / 3) * 0.5;
        const points = Math.floor(baseScore * comboMultiplier);
        
        // Determine which player gets the score based on ball direction
        const playerNum = ball.vel.y > 0 ? 2 : 1;
        this.score[playerNum] += points;
        
        if (destroyed) {
            this.stats.blocksDestroyed++;
            
            // Particle explosion - deterministic seed based on block position
            const seedOffset = (block.x + block.y) % 1000;
            this.particles.explode(
                block.x + block.width / 2,
                block.y + block.height / 2,
                GAME_CONFIG.colors.blocks[block.maxHp],
                12,
                seedOffset
            );
            
            // Chance to spawn power-up - deterministic based on blocks destroyed
            if ((this.stats.blocksDestroyed * 17) % 100 < GAME_CONFIG.powerUps.chance * 100) {
                this.spawnPowerUp(block.x + block.width / 2, block.y + block.height / 2);
            }
            
            // Emit event
            this.emit('block_destroyed', {
                block: block,
                player: playerNum,
                points: points,
                combo: this.combo
            });
        } else {
            // Just spark for hit
            this.particles.spark(
                collision.point.x,
                collision.point.y,
                collision.normal.x,
                collision.normal.y,
                GAME_CONFIG.colors.blocks[block.hp]
            );
        }
    }

    handleBallMiss(ball, side, index) {
        // Find the paddle that was supposed to catch this ball
        const paddleIndex = side === 'bottom' ? 0 : 1;
        const paddle = this.paddles[paddleIndex];
        
        // Check if paddle has shield
        if (paddle && paddle.shield) {
            paddle.useShield();
            this.stats.shieldsUsed++;
            
            // Bounce ball back instead of losing it
            ball.vel.y = -ball.vel.y;
            ball.pos.y = side === 'bottom' ? this.height - ball.radius - 10 : ball.radius + 10;
            
            // Create shield burst effect
            this.particles.explode(
                ball.pos.x,
                ball.pos.y,
                '#00FFFF',
                20,
                (ball.pos.x + ball.pos.y) % 1000
            );
            
            // Add floating text
            this.addFloatingText(paddle.x, paddle.y, 'SHIELD!', '#00FFFF');
            
            // Audio
            if (typeof audioSynth !== 'undefined') {
                audioSynth.powerUp();
            }
            
            return; // Don't remove the ball
        }
        
        // Remove ball
        this.balls.splice(index, 1);
        
        // Lose life if no balls remain
        if (this.balls.length === 0) {
            this.lives--;
            this.combo = 0;
            
            this.emit('ball_miss', {
                side: side,
                lives: this.lives,
                player: side === 'bottom' ? 1 : 2
            });
            
            if (this.lives <= 0) {
                this.state = 'gameover';
                this.emit('game_over', {
                    score: this.score,
                    level: this.level,
                    stats: this.stats
                });
            } else {
                // Respawn ball after delay
                setTimeout(() => {
                    if (this.state === 'playing') {
                        this.spawnBall(1, true);
                    }
                }, 1500);
            }
        }
    }

    spawnPowerUp(x, y) {
        // Clamp spawn position to canvas bounds with padding
        const PADDING = 20;
        const clampedX = clamp(x, PADDING, this.width - PADDING);
        const clampedY = clamp(y, PADDING, this.height / 2); // Power-ups only in top half
        
        // Deterministic power-up type based on position and destroyed count
        const seed = Math.floor(clampedX + clampedY + this.stats.blocksDestroyed);
        const type = PowerUp.randomType(seed);
        this.powerUps.push(new PowerUp(clampedX, clampedY, type));
    }

    updatePowerUps(dt) {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const pu = this.powerUps[i];
            pu.update(dt);
            
            // Check paddle collection
            for (const paddle of this.paddles) {
                if (CollisionDetector.AABB(pu.getBounds(), paddle.getBounds())) {
                    this.collectPowerUp(pu, paddle);
                    this.powerUps.splice(i, 1);
                    break;
                }
            }
            
            // Remove if off screen
            if (pu.pos.y > this.height + 50 || pu.pos.y < -50) {
                this.powerUps.splice(i, 1);
            }
        }
    }

    collectPowerUp(powerUp, paddle) {
        this.stats.powerUpsCollected++;
        const props = PowerUp.prototype.types[powerUp.type];
        
        switch (powerUp.type) {
            case 'expand':
                paddle.expand(props.duration);
                this.addFloatingText(paddle.x, paddle.y - 30, 'EXPAND!', props.color);
                break;
            case 'multiball':
                this.spawnMultiball();
                this.addFloatingText(paddle.x, paddle.y - 30, 'MULTIBALL!', props.color);
                break;
            case 'slow':
                this.activeEffects.slow = props.duration;
                this.applySlowEffect();
                this.addFloatingText(paddle.x, paddle.y - 30, 'SLOW!', props.color);
                break;
            case 'sticky':
                paddle.enableSticky(props.duration);
                this.addFloatingText(paddle.x, paddle.y - 30, 'STICKY!', props.color);
                break;
            case 'laser':
                paddle.enableLaser(props.duration);
                this.addFloatingText(paddle.x, paddle.y - 30, 'LASER ON!', props.color);
                break;
            case 'magnet':
                paddle.enableMagnet(props.duration);
                this.addFloatingText(paddle.x, paddle.y - 30, 'MAGNET!', props.color);
                break;
            case 'shield':
                paddle.enableShield();
                this.addFloatingText(paddle.x, paddle.y - 30, 'SHIELD READY!', props.color);
                break;
        }
        
        this.emit('powerup_collect', {
            type: powerUp.type,
            player: paddle.playerNum
        });
        
        // Visual
        this.particles.explode(
            powerUp.pos.x,
            powerUp.pos.y,
            props.color,
            20
        );
    }
    
    addFloatingText(x, y, text, color) {
        this.floatingTexts.push(new FloatingText(x, y, text, color));
    }

    spawnMultiball() {
        // Get active ball as source
        const sourceBall = this.balls.find(b => b.active);
        if (!sourceBall) return;
        
        // Create 2 new balls with fixed angle variations (deterministic for P2P sync)
        // Use source ball position to derive pseudo-random angles
        const baseAngle = Math.atan2(sourceBall.vel.y, sourceBall.vel.x);
        const angleOffsets = [-0.3, 0.3]; // Fixed angles instead of random
        
        for (const offset of angleOffsets) {
            const ball = new Ball(sourceBall.pos.x, sourceBall.pos.y);
            const angle = baseAngle + offset;
            ball.launch(angle);
            ball.speed = sourceBall.speed;
            this.balls.push(ball);
        }
    }

    applySlowEffect() {
        for (const ball of this.balls) {
            ball.speed = ball.baseSpeed * 0.7;
            ball.vel = ball.vel.normalize().mul(ball.speed);
        }
    }

    updatePowerUpEffects(dt) {
        if (this.activeEffects.slow > 0) {
            this.activeEffects.slow -= dt;
            if (this.activeEffects.slow <= 0) {
                // Restore ball speeds
                for (const ball of this.balls) {
                    ball.speed = Math.min(ball.speed / 0.7, GAME_CONFIG.ball.maxSpeed);
                    ball.vel = ball.vel.normalize().mul(ball.speed);
                }
            }
        }
    }
    
    updateLasers(dt) {
        for (let i = this.lasers.length - 1; i >= 0; i--) {
            const laser = this.lasers[i];
            laser.update(dt);
            
            // Check block collisions
            let hit = false;
            for (const block of this.blocks) {
                if (block.destroyed) continue;
                
                if (CollisionDetector.AABB(laser.getBounds(), block.getBounds())) {
                    // Instant destroy for laser
                    block.hp = 0;
                    block.destroyed = true;
                    
                    // Explosion effect
                    this.particles.explode(
                        block.x + block.width / 2,
                        block.y + block.height / 2,
                        GAME_CONFIG.colors.blocks[block.maxHp],
                        12,
                        (block.x + block.y) % 1000
                    );
                    
                    // Score
                    const playerNum = laser.fromPlayer;
                    this.score[playerNum] += 50;
                    
                    hit = true;
                    break; // Laser destroyed, can only hit one block
                }
            }
            
            if (!laser.active || hit) {
                this.lasers.splice(i, 1);
            }
        }
    }
    
    updateFloatingTexts(dt) {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].update(dt);
            if (!this.floatingTexts[i].active) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }
    
    // Shoot laser for a player
    shootLaser(playerNum) {
        const paddle = this.paddles[playerNum - 1];
        if (!paddle.laser) return null;
        
        const laser = paddle.shoot();
        if (laser) {
            this.lasers.push(laser);
            this.stats.lasersFired++;
        }
        return laser;
    }

    // Launch stuck ball - deterministic for P2P sync
    launchBall(playerNum) {
        const stuckBall = this.balls.find(b => b.stuck && b.stuckTo && b.stuckTo.playerNum === playerNum);
        if (stuckBall) {
            // Use ball index + launched count as seed for angle
            const seed = this.stats.ballsLaunched + stuckBall.pos.x;
            const angleVariation = ((seed * 23) % 100) / 100 - 0.5; // -0.5 to 0.5
            const angle = stuckBall.stuckTo.isTop 
                ? Math.PI / 2 + angleVariation * 0.5
                : -Math.PI / 2 + angleVariation * 0.5;
            stuckBall.launch(angle);
            return true;
        }
        return false;
    }

    // Rendering
    render() {
        // Clear canvas - use dirty rect if enabled
        if (this.dirtyRectManager && this.dirtyRectManager.hasDirtyRects()) {
            // Clear only dirty rectangles
            for (const rect of this.dirtyRectManager.getDirtyRects()) {
                this.ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
            }
        } else {
            // Full clear
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
        
        // Draw grid background (subtle) - skip on low-end if many particles
        if (!this.mobileScaler || this.mobileScaler.shouldRenderEffects() || this.particles.getCount() < 20) {
            this.renderBackground();
        }
        
        // Draw blocks
        for (const block of this.blocks) {
            block.render(this.ctx);
        }
        
        // Draw paddles
        for (const paddle of this.paddles) {
            paddle.render(this.ctx);
        }
        
        // Draw balls
        for (const ball of this.balls) {
            ball.render(this.ctx);
        }
        
        // Draw power-ups
        for (const pu of this.powerUps) {
            pu.render(this.ctx);
        }
        
        // Draw lasers
        for (const laser of this.lasers) {
            laser.render(this.ctx);
        }
        
        // Draw floating texts
        for (const text of this.floatingTexts) {
            text.render(this.ctx);
        }
        
        // Draw particles
        this.particles.render(this.ctx);
        
        // Draw UI overlay
        this.renderUI();
        
        // Clear dirty rects after render
        if (this.dirtyRectManager) {
            this.dirtyRectManager.clear();
        }
    }

    renderBackground() {
        this.ctx.save();
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = 1;
        
        const gridSize = 40;
        
        for (let x = 0; x < this.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }

    renderUI() {
        this.ctx.save();
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = 'bold 16px monospace';
        this.ctx.textAlign = 'left';
        
        // Lives
        this.ctx.fillText(`LIVES: ${this.lives}`, 10, 25);
        
        // Level
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`LEVEL ${this.level}`, this.width / 2, 25);
        
        // Scores
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = GAME_CONFIG.colors.paddle1;
        this.ctx.fillText(`P1: ${this.score[1]}`, this.width - 100, this.height - 15);
        
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = GAME_CONFIG.colors.paddle2;
        this.ctx.fillText(`P2: ${this.score[2]}`, this.width - 10, 25);
        
        // Combo
        if (this.combo > 1) {
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = '#FFAA00';
            this.ctx.font = 'bold 24px monospace';
            this.ctx.fillText(`${this.combo}x COMBO!`, this.width / 2, this.height / 2);
        }
        
        // Blocks remaining
        const remaining = this.blocks.filter(b => !b.destroyed).length;
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#888888';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`BLOCKS: ${remaining}`, 10, this.height - 15);
        
        this.ctx.restore();
    }

// Network serialization - Get state for network sync
    getState() {
        // Compress state for network transmission
        const balls = this.balls.map(b => ({
            x: Math.round(b.pos.x * 10) / 10, // Round to 1 decimal
            y: Math.round(b.pos.y * 10) / 10,
            vx: Math.round(b.vel.x * 10) / 10,
            vy: Math.round(b.vel.y * 10) / 10,
            a: b.active ? 1 : 0
        }));
        
        const paddles = this.paddles.map(p => ({
            x: Math.round(p.x * 10) / 10,
            w: p.width | 0, // Cast to int
            e: p.expanded ? 1 : 0,
            s: p.sticky ? 1 : 0,
            l: p.laser ? 1 : 0,
            m: p.magnet ? 1 : 0,
            h: p.shield ? 1 : 0,
            ls: p.laserShots | 0
        }));
        
        return {
            ts: Date.now(), // Short property name
            st: this.state === 'playing' ? 1 : 0,
            lv: this.level,
            sc: this.score,
            li: this.lives,
            bl: balls,
            pd: paddles,
            blc: this.blocks
                .filter(b => !b.destroyed)
                .map(b => ({
                    x: Math.round(b.x),
                    y: Math.round(b.y),
                    h: b.hp,
                    t: b.type === 'shield' ? 1 : 0
                })),
            pu: this.powerUps.map(p => ({
                x: Math.round(p.pos.x),
                y: Math.round(p.pos.y),
                t: p.getTypeChar() // Use type char for compact serialization
            })),
            in: this.inputs
        };
    }

    // Apply state from network (for guest/interpolation)
    setState(state) {
        // Store for interpolation
        this.stateHistory.push({
            timestamp: state.ts || state.timestamp,
            state: state
        });
        
        // Keep only last 100ms of history
        const now = Date.now();
        this.stateHistory = this.stateHistory.filter(h => now - h.timestamp < 100);
        
        // Apply state (handle both compressed and uncompressed)
        this.state = (state.st === 1 || state.state === 'playing') ? 'playing' : state.state || state.st;
        this.level = state.lv || state.level;
        this.score = state.sc || state.score;
        this.lives = state.li || state.lives;
        this.inputs = state.in || state.inputs;
        
        // Update balls
        const stateBalls = state.bl || state.balls;
        if (stateBalls) {
            if (stateBalls.length === this.balls.length) {
                // Update existing balls
                for (let i = 0; i < stateBalls.length; i++) {
                    const sb = stateBalls[i];
                    const newBall = {
                        pos: { x: sb.x, y: sb.y },
                        vel: { x: sb.vx || 0, y: sb.vy || 0 },
                        active: sb.a === 1 || sb.active
                    };
                    // Interpolate position if close
                    if (distance(this.balls[i].pos.x, this.balls[i].pos.y, newBall.pos.x, newBall.pos.y) < 50) {
                        this.balls[i].pos.x = lerp(this.balls[i].pos.x, newBall.pos.x, 0.3);
                        this.balls[i].pos.y = lerp(this.balls[i].pos.y, newBall.pos.y, 0.3);
                    } else {
                        this.balls[i].pos.x = newBall.pos.x;
                        this.balls[i].pos.y = newBall.pos.y;
                    }
                    this.balls[i].vel.x = newBall.vel.x;
                    this.balls[i].vel.y = newBall.vel.y;
                    this.balls[i].active = newBall.active;
                }
            } else {
                // Recreate balls
                for (const sb of stateBalls) {
                    const ball = new Ball(sb.x, sb.y);
                    ball.vel.x = sb.vx || 0;
                    ball.vel.y = sb.vy || 0;
                    ball.active = sb.a === 1 || sb.active;
                    this.balls.push(ball);
                }
            }
        }
        
        // Update paddles
        const statePaddles = state.pd || state.paddles;
        if (statePaddles) {
            for (let i = 0; i < statePaddles.length && i < this.paddles.length; i++) {
                const pd = statePaddles[i];
                // Smooth interpolation for remote paddle
                this.paddles[i].x = lerp(this.paddles[i].x, pd.x, 0.5);
                this.paddles[i].width = pd.w || pd.width;
                this.paddles[i].expanded = pd.e === 1 || pd.expanded;
                this.paddles[i].sticky = pd.s === 1 || pd.sticky;
                this.paddles[i].laser = pd.l === 1 || pd.laser;
                this.paddles[i].magnet = pd.m === 1 || pd.magnet;
                this.paddles[i].shield = pd.h === 1 || pd.shield;
                this.paddles[i].laserShots = pd.ls || pd.laserShots || 0;
            }
        }
        
        // Update blocks
        const stateBlocks = state.blc || state.blocks;
        if (stateBlocks && stateBlocks.length !== this.blocks.filter(b => !b.destroyed).length) {
            // Rebuild block array
            const newBlocks = [];
            for (const bd of stateBlocks) {
                const existing = this.blocks.find(b => 
                    b.x === (bd.x || 0) && b.y === (bd.y || 0) && !b.destroyed
                );
                if (existing) {
                    existing.hp = bd.h || bd.hp;
                    newBlocks.push(existing);
                } else {
                    newBlocks.push(new Block(
                        bd.x || 0, 
                        bd.y || 0, 
                        bd.h || bd.hp || 1, 
                        bd.t === 1 || bd.type === 'shield' ? 'shield' : 'normal'
                    ));
                }
            }
            this.blocks = newBlocks;
        }
        
        // Update power-ups (network serialization)
        const statePowerUps = state.pu || state.powerUps;
        if (statePowerUps) {
            this.powerUps = statePowerUps.map(p => {
                const type = p.t === 'e' ? 'expand' : 
                             p.t === 'm' ? 'multiball' :
                             p.t === 's' ? 'slow' :
                             p.t === 't' ? 'sticky' :
                             p.t === 'l' ? 'laser' :
                             p.t === 'n' ? 'magnet' :
                             p.t === 'h' ? 'shield' : 'expand';
                const pu = new PowerUp(p.x, p.y, type);
                return pu;
            });
        }
        
        this.lastState = state;
    }

    // Predictive update for local player (client-side prediction)
    predict(input) {
        const paddle = this.paddles[0]; // Local player's paddle
        if (paddle) {
            paddle.setPosition(input, this.width);
        }
        
        // Store for reconciliation
        this.pendingInputs.push({
            timestamp: Date.now(),
            input: input
        });
        
        // Clean old inputs
        const cutoff = Date.now() - 500;
        this.pendingInputs = this.pendingInputs.filter(i => i.timestamp > cutoff);
    }

    // Pause/Resume
    pause() {
        if (this.state === 'playing') {
            this.state = 'paused';
        }
    }

    resume() {
        if (this.state === 'paused') {
            this.state = 'playing';
        }
    }

    // Set host/guest mode
    setHost(isHost) {
        this.isHost = isHost;
    }

    // Get stats
    getStats() {
        return {
            ...this.stats,
            score: this.score,
            level: this.level,
            lives: this.lives
        };
    }

    // Clean up
    destroy() {
        this.state = 'stopped';
        this.balls = [];
        this.blocks = [];
        this.paddles = [];
        this.powerUps = [];
        this.lasers = [];
        this.floatingTexts = [];
        this.particles.clear();
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Make classes available globally for non-module usage
if (typeof window !== 'undefined') {
    window.Game = Game;
    window.Ball = Ball;
    window.Paddle = Paddle;
    window.Block = Block;
    window.PowerUp = PowerUp;
    window.Laser = Laser;
    window.FloatingText = FloatingText;
    window.Particle = Particle;
    window.ParticleSystem = ParticleSystem;
    window.Vec2 = Vec2;
    window.CollisionDetector = CollisionDetector;
    window.GAME_CONFIG = GAME_CONFIG;
    window.setPerformanceMonitors = setPerformanceMonitors;
}

export {
    Game,
    Ball,
    Paddle,
    Block,
    PowerUp,
    Laser,
    FloatingText,
    Particle,
    ParticleSystem,
    Vec2,
    CollisionDetector,
    GAME_CONFIG
};

// Also export as default
export default Game;
