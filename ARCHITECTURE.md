# Architecture Design Document

## GOP-STOP ARKANOID P2P — Technical Architecture

---

## 1. Design Philosophy

The architecture follows these principles:

1. **Simplicity Over Complexity** — Vanilla JavaScript, no frameworks
2. **Zero Server** — True P2P via WebRTC, minimal infrastructure
3. **Deterministic Simulation** — Seed-based randomness for perfect sync
4. **Progressive Enhancement** — Works offline, graceful degradation
5. **Performance First** — 60fps target on mid-range devices

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐     │
│  │   index.html │  │  css/style  │  │   Canvas API    │     │
│  │  (DOM/ARIA)  │  │  (Neon UI)  │  │   (Rendering)   │     │
│  └─────────────┘  └─────────────┘  └─────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    main.js                            │  │
│  │  - State machine (APP_STATES)                         │  │
│  │  - Game loop orchestration                            │  │
│  │  - Module initialization                              │  │
│  │  - Jitter buffer & lag compensation                   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   ui.js      │  │   game.js    │  │   network.js    │  │
│  │  - Screen    │  │  - Physics   │  │  - WebRTC P2P   │  │
│  │  - Input     │  │  - Rendering │  │  - Signaling    │  │
│  │  - Toast     │  │  - Particles │  │  - Sync logic   │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     RESOURCE LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │    audio.js  │  │   levels.js  │  │ performance.js  │  │
│  │ - Web Audio  │  │ - Level gen  │  │ - Object pools  │  │
│  │ - Synth      │  │ - Patterns   │  │ - Monitoring    │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌──────────────┐                                            │
│  │progression.js│                                            │
│  │ - High score │                                            │
│  │ - Achievements                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Choices

### 3.1 Why Vanilla JavaScript?

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Framework** | None | Smaller bundle, no build step, easier to understand |
| **Modules** | ES6 Classes | Clean separation, modern syntax, no bundler needed |
| **State** | Direct mutation | Game state is complex; Redux/MobX overkill |
| **DOM** | Vanilla + CSS | No virtual DOM needed; simple UI transitions |
| **Rendering** | Canvas 2D | Sufficient for 2D arcade game, wide support |

### 3.2 WebRTC Over WebSockets

| Criterion | WebRTC | WebSocket |
|-----------|--------|-----------|
| Latency | <10ms direct | 50-150ms via server |
| Server Cost | $0 | $50-500/month |
| Scalability | Peer limit: 2 | Server limits apply |
| Firewall | STUN/TURN needed | Usually works |
| Complexity | Higher | Lower |

**Trade-off**: Added complexity worth it for true P2P and zero server costs.

### 3.3 Signaling Strategy

```
Primary:   PeerJS Cloud (free tier)
           ├─ WebSocket for SDP exchange
           ├─ Automatic ID generation
           └─ ICE candidate relay

Fallback:  Manual SDP Exchange
           ├─ Generate SDP offer
           ├─ Copy-paste to other peer
           └─ Create answer manually
```

**Rationale**: PeerJS Cloud handles 90% of cases. Manual SDP as fallback for corporate firewalls or PeerJS outages.

### 3.4 Physics Architecture

```javascript
// Authoritative Server Model (Host = Server)
┌──────────┐         ┌──────────┐
│  HOST    │◄────────│  GUEST   │
│(Authoritative)     │(Predicted)│
│          │         │          │
│ ┌──────┐ │         │ ┌──────┐ │
│ │Physics│ │         │ │Input │ │
│ │ Sim  │ │         │ │Pred. │ │
│ └──┬───┘ │         │ └──┬───┘ │
│    │     │  State  │    │     │
│    └─────┼────────►│    │     │
│          │ 20Hz    │    │     │
│◄─────────┼─────────┘    │     │
│  Input   │              │     │
│  60Hz    │              │     │
└──────────┘              └─────┘
```

**Why authoritative?** Prevents cheating, ensures consistency.

### 3.5 Audio System

| Option | Pros | Cons | Chosen? |
|--------|------|------|---------|
| **Web Audio API** | Synthesized, no files, procedural | Complex API | ✅ Yes |
| Audio Elements | Simple | Requires file assets | No |
| Web Audio + Samples | High quality | Asset management | No |

**Implementation**: Procedural synthesis — generates paddle hits, explosions, power-ups mathematically.

---

## 4. Modularity

### 4.1 Module Responsibilities

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `main.js` | ~2000 | Orchestration, sync algorithms, game loop |
| `game.js` | ~2500 | Physics, rendering, particle system, power-ups |
| `network.js` | ~900 | WebRTC, PeerJS, signaling, message protocol |
| `ui.js` | ~2300 | Screen management, inputs, accessibility |
| `levels.js` | ~800 | 20 level definitions, pattern generators |
| `audio.js` | ~600 | Web Audio synthesis, ambient drone |
| `performance.js` | ~700 | Monitoring, object pooling, throttling |
| `progression.js` | ~400 | LocalStorage, achievements |

### 4.2 Dependency Graph

```
main.js
├── network.js
│   └── PeerJS CDN
├── game.js
│   ├── performance.js (monitor integration)
│   └── audio.js (sound triggers)
├── ui.js
│   └── game.js (state queries)
├── levels.js
├── audio.js
├── performance.js
└── progression.js
```

---

## 5. Data Flow

### 5.1 Game State Synchronization

```
┌────────────────────────────────────────────────────────────┐
│                        GAME LOOP                           │
│                                                            │
│  1. HOST: Update physics (ball, paddles, collisions)      │
│  2. HOST: Compress state (only changes)                   │
│  3. HOST: Send state to guest (20Hz)                      │
│  4. GUEST: Render prediction                              │
│  5. GUEST: Receive state, reconcile                       │
│  6. GUEST: Send input (60Hz delta-compressed)             │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Message Types

```javascript
const MESSAGE_TYPES = {
  INIT: 'init',              // Initial handshake
  STATE: 'state',            // Full game state (host → guest)
  INPUT: 'input',            // Player input (guest → host)
  INPUT_DELTA: 'input_delta', // Compressed input
  PING: 'ping',              // Latency measurement
  PONG: 'pong',
  LEVEL_COMPLETE: 'level_complete',
  GAME_OVER: 'game_over',
  BONUS: 'bonus',
  DESYNC_CHECK: 'desync_check',
  STATE_ACK: 'state_ack'
};
```

---

## 6. State Management

### 6.1 Application States

```
LOADING → MENU → ROOM → CONNECTING → WAITING → PLAYING
                                         ↓        ↓
                                      PAUSED ←───┘   
                                         ↓
                              GAME_OVER / VICTORY
```

### 6.2 Game State Structure

```javascript
Game State:
├── ball: { x, y, vx, vy, speed, active }
├── paddles: [
│   { x, width, effects },  // Player 1 (bottom/host)
│   { x, width, effects }   // Player 2 (top/guest)
│]
├── blocks: Array<{ x, y, hp, type, color }>
├── powerUps: Array<{ x, y, type, vel }>
├── particles: Array (from object pool)
├── lasers: Array<{ x, y, vy }>
├── score: number
├── lives: number
├── level: number
└── status: 'playing' | 'paused' | 'game_over'
```

---

## 7. Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                     RENDER LOOP                              │
│                                                              │
│  1. Clear dirty rectangles (or full clear)                  │
│  2. Draw background grid (if enabled)                       │
│  3. Draw blocks                                             │
│  4. Draw power-ups                                          │
│  5. Draw particles                                          │
│  6. Draw paddles (with glow effects)                        │
│  7. Draw balls (with trails)                                │
│  8. Draw lasers                                             │
│  9. Draw UI overlay (score, lives)                          │
└─────────────────────────────────────────────────────────────┘
```

### 7.1 Dirty Rectangle Tracking

```javascript
// Optimization: Only clear changed regions
class DirtyRectManager {
    addRect(x, y, width, height)  // Mark region dirty
    mergeAll()                    // Merge overlapping rects
    clear()                       // Clear dirty regions
}

// Falls back to full clear if too many dirty regions
```

---

## 8. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **XSS via SDP** | Input sanitization, only JSON parsing |
| **Room Code Collision** | Unique code generation with availability check |
| **Denial of Service** | Message throttling, max reconnection attempts |
| **Data Integrity** | Host authoritative, input validation |
| **Privacy** | Direct P2P, no data passes through servers |

---

## 9. Scalability Limits

| Resource | Limit | Reason |
|----------|-------|--------|
| Players per game | 2 | Physics complexity, screen real estate |
| Levels | 20 | Currently defined, extensible |
| Room codes | 36^6 = 2.1B | 6-character alphanumeric |
| Particles | 200 | Object pool size |
| Max latency | ~200ms | Beyond: noticeable lag, but playable |

---

## 10. Future Architecture Considerations

### 10.1 Potential Additions

| Feature | Architecture Impact |
|---------|---------------------|
| **WebGL Renderer** | New `renderer-webgl.js`, shader pipelines |
| **3+ Players** | Rewrite physics for multi-paddle collision |
| **Spectator Mode** | One-way state broadcast, no input |
| **AI Opponent** | Deterministic AI in `game.js` |
| **Replay System** | Log all inputs, deterministic replay |

### 10.2 Migration Paths

- **To TypeScript**: Add type definitions, compile to JS
- **To React**: Component-ize screens, keep Canvas
- **To Electron**: Wrap in Electron shell, same code

---

## 11. Key Files Reference

| File | Purpose | Key Classes/Functions |
|------|---------|----------------------|
| `main.js` | Application bootstrap | `ArkanoidP2P`, `JitterBuffer`, `InputPredictor`, `LagCompensator`, `DesyncDetector` |
| `game.js` | Core game logic | `Game`, `Vec2`, `ParticleSystem`, `PowerUp`, `Ball`, `Paddle` |
| `network.js` | Networking | `NetworkModule`, `MESSAGE_TYPES`, `ICE_SERVERS` |
| `ui.js` | User interface | `UIController` |
| `levels.js` | Level data | `LevelManager`, `PATTERNS` |
| `performance.js` | Optimization | `PerformanceMonitor`, `ObjectPool`, `ThrottledStateSync`, `DirtyRectManager` |
| `audio.js` | Sound | `AudioSynth` |
| `progression.js` | Persistence | `ProgressionSystem` |

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **SDP** | Session Description Protocol — WebRTC connection metadata |
| **ICE** | Interactive Connectivity Establishment — NAT traversal |
| **STUN** | Session Traversal Utilities for NAT — public IP discovery |
| **TURN** | Traversal Using Relays around NAT — relay server fallback |
| **Jitter Buffer** | Buffer that smooths network timing variations |
| **Authoritative Server** | One peer (host) has final say on game state |
| **Prediction** | Client simulates input before server confirmation |
| **Reconciliation** | Correcting client state based on server state |
| **Delta Compression** | Only sending changed data to reduce bandwidth |
