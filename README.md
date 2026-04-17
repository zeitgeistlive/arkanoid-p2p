# GOP-STOP ARKANOID P2P v1.0.0

> 🎮 Cooperative multiplayer Arkanoid — pure P2P action, no servers required

[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-brightgreen)](https://webrtc.org/)
[![PeerJS](https://img.shields.io/badge/PeerJS-1.5.2-blue)](https://peerjs.com/)
[![Version](https://img.shields.io/badge/version-1.0.0-orange)](./CHANGELOG.md)

---

## 🕹️ Overview

GOP-STOP ARKANOID is a cooperative multiplayer breakout game that runs entirely browser-to-browser via WebRTC. Two players join forces to destroy blocks, collect power-ups, and survive 20 increasingly challenging levels — all without a central game server.

### Visual Style: "Гоп-стоп"
- **Neon aesthetics** inspired by 90s post-Soviet arcade culture
- **Retro pixel fonts** (Press Start 2P, VT323, Russo One)
- **Glitch effects** and CRT scanlines
- **Electric color palette**: cyan, magenta, yellow, and neon green

---

## ✨ Features

### Core Gameplay
| Feature | Description |
|---------|-------------|
| **Cooperative Play** | Two players share lives, work together to clear levels |
| **Dual Paddles** | Host plays bottom paddle, guest plays top paddle |
| **20 Unique Levels** | Progressive difficulty with distinct patterns (grid, pyramid, diamond, fortress, wave, bullseye) |
| **7 Power-Ups** | Expand, Multiball, Slow, Sticky, Laser, Magnet, Shield |
| **3 HP Block System** | Red (1HP), Yellow (2HP), Blue (3HP) blocks |
| **Particle Effects** | Deterministically-generated explosions for P2P sync |

### Multiplayer & Networking
| Feature | Description |
|---------|-------------|
| **True P2P** | Direct connection via WebRTC DataChannel |
| **Dual Signaling** | PeerJS Cloud + Manual SDP fallback for firewall traversal |
| **TURN Support** | Free Open Relay TURN servers for NAT traversal |
| **Deterministic Physics** | Seed-based randomness ensures perfect sync |
| **Input Prediction** | Client-side prediction for responsive controls |
| **Jitter Buffer** | Smooths network timing variations |
| **Lag Compensation** | Reconciliation system for authoritative host |
| **Desync Detection** | Automatic detection and resolution of state mismatches |

### Performance & Optimization
| Feature | Description |
|---------|-------------|
| **Device Tier Scaling** | Automatic quality adjustment (low/medium/high) |
| **Object Pooling** | Pre-allocated particle system (200 particles) |
| **Dirty Rect Rendering** | Minimizes canvas redraw regions |
| **Throttled State Sync** | ~60Hz input, ~20Hz state updates |
| **Delta Compression** | Only changed state properties sent |
| **Debounced UI Updates** | 30fps cap on DOM manipulations |
| **GPU-Accelerated CSS** | transform3d for smooth transitions |

### Accessibility
| Feature | Description |
|---------|-------------|
| **Keyboard Navigation** | Full Tab/Enter/Space control |
| **Screen Reader Support** | ARIA labels, live regions, role attributes |
| **Focus Management** | Focus traps in modals, skip links |
| **Reduced Motion** | Respects prefers-reduced-motion |
| **High Contrast** | Respects prefers-contrast |

---

## 🚀 Quick Start

### 1. Host a Game
1. Open `index.html` in your browser
2. Click **CREATE ROOM**
3. Click **GENERATE CODE**
4. Share the 6-character room code with your friend

### 2. Join a Game
1. Open `index.html` in your browser
2. Click **JOIN ROOM**
3. Enter the room code
4. Click **CONNECT**

### 3. Play!
- **Arrow Keys / A-D**: Move paddle
- **Space**: Launch ball / Resume
- **Escape / P**: Pause game
- **?**: Show keyboard shortcuts

---

## 🏗️ Architecture

```
Arkanoid P2P
├── index.html          # Main HTML, CSS styling, UI structure
├── js/
│   ├── main.js         # Application orchestration, game loop
│   ├── game.js         # Game engine, physics, rendering
│   ├── network.js      # WebRTC P2P, signaling, sync protocols
│   ├── ui.js           # UI controller, screen transitions
│   ├── levels.js       # 20 level generator with patterns
│   ├── audio.js        # Web Audio API synthesizer
│   ├── performance.js  # Monitoring, optimization utilities
│   └── progression.js  # Achievements, high scores, persistence
└── css/
    └── style.css       # Retro neon styling
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical design.

---

## 🌐 Network Technology

The game uses **WebRTC DataChannel** for direct peer-to-peer communication:

- **Signaling**: PeerJS Cloud with manual SDP fallback
- **ICE Servers**: Multiple STUN + TURN for 95%+ connection success
- **DataChannel**: Reliable, ordered message delivery
- **Sync Rate**: 20Hz state updates, 30-60Hz input sync
- **Latency Compensation**: Jitter buffer + input prediction

See [NETWORK.md](./NETWORK.md) for P2P protocol details.

---

## 📊 Performance

Performance features include:

| Metric | Target | Implementation |
|--------|--------|----------------|
| Frame Rate | 60 FPS | requestAnimationFrame, delta timing |
| Particle Pool | 200 objects | Pre-allocated, zero GC churn |
| State Sync | ~20Hz | Throttled, batched, delta-compressed |
| Memory Usage | <50MB | Object pooling, lazy loading |
| Mobile Scaling | Auto-tiered | Device capability detection |

See [PERFORMANCE_OPTIMIZATIONS.md](./PERFORMANCE_OPTIMIZATIONS.md) for benchmarks.

---

## 🛠️ Development

### Prerequisites
- Modern browser (Chrome, Firefox, Edge)
- Local web server (optional, for testing)

### Local Setup
```bash
cd /path/to/arkanoid-p2p
# Option 1: Python 3
python -m http.server 8080
# Option 2: Node.js
npx serve .
# Option 3: PHP
php -S localhost:8080
```

Then open `http://localhost:8080`

### Key Commands
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Toggle performance stats overlay |
| `?` | Show keyboard shortcuts |
| `Tab` | Navigate UI elements |
| `Escape` | Pause / Back |

---

## 📦 Deployment

### Static Hosting (Recommended)
Upload the following to any static host (GitHub Pages, Netlify, Vercel, S3):
```
css/style.css
js/*.js
index.html
```

### Requirements
- HTTPS required for WebRTC (getUserMedia/getDisplayMedia)
- No server-side processing needed
- PeerJS Cloud used for initial signaling

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment options.

---

## 🎯 Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Full support |
| Firefox | 88+ | ✅ Full support |
| Edge | 90+ | ✅ Full support |
| Safari | 14+ | ⚠️ Limited (no WebRTC DataChannel) |
| Mobile Chrome | 90+ | ✅ Supported |
| Mobile Safari | 14+ | ⚠️ Limited |

---

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

---

## 🤝 Contributing

Contributions welcome! Areas of interest:
- WebGL renderer for GPU acceleration
- Level editor
- Spectator mode
- More power-up types

---

## 📜 License

MIT License — see [LICENSE](./LICENSE)

---

## 🙏 Acknowledgments

- **PeerJS** - WebRTC abstraction library
- **Original Arkanoid** - Taito Corporation, 1986
- **Open Relay** - Free TURN servers
- **Google Fonts** - Press Start 2P, VT323, Russo One

---

Made with 💚 and a touch of nostalgic post-Soviet arcade fever.
