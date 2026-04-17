# Network Protocol Documentation

## WebRTC P2P Communication Protocol

---

## 1. Overview

GOP-STOP ARKANOID uses WebRTC DataChannel for peer-to-peer communication. This document details the signaling process, message protocol, and synchronization algorithms.

---

## 2. Connection Establishment

### 2.1 Architecture

```
┌─────────┐                     ┌─────────┐
│  HOST   │                     │  GUEST  │
│ (Peer A)│                     │ (Peer B)│
└────┬────┘                     └────┬────┘
     │                               │
     │  1. Create RTCPeerConnection  │
     │  2. Create DataChannel        │
     │  3. Create Offer (SDP)        │
     │◄──────────────────────────────┤
     │  4. Signal Offer              │
     ├───────────────────────────────►│
     │  5. Create Answer             │
     │◄──────────────────────────────┤
     │  6. ICE Candidate Exchange    │
     │◄─────────────────────────────►│
     │  7. DataChannel Open          │
     │◄─────────────────────────────►│
```

### 2.2 Signaling Methods

#### Primary: PeerJS Cloud
```javascript
// Host creates room
const peer = new Peer(roomCode, { debug: 1 });
peer.on('connection', (conn) => {
    conn.on('open', () => {
        // Connection established
    });
});

// Guest joins room
const peer = new Peer();
const conn = peer.connect(roomCode, { reliable: true });
conn.on('open', () => {
    // Connection established
});
```

#### Fallback: Manual SDP Exchange
```javascript
// If PeerJS fails, UI displays SDP for copy-paste
// Host: create offer → display SDP → wait for answer
// Guest: paste offer → create answer → display SDP → host pastes
```

### 2.3 ICE Configuration

```javascript
const ICE_SERVERS = {
  iceServers: [
    // STUN servers for public IP discovery
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // TURN servers for NAT traversal fallback
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};
```

---

## 3. Message Protocol

### 3.1 Message Types

```javascript
const MESSAGE_TYPES = {
  INIT: 'init',                    // Initial handshake
  STATE: 'state',                  // Full game state (host → guest)
  INPUT: 'input',                  // Input state
  INPUT_DELTA: 'input_delta',      // Delta-compressed input
  PING: 'ping',                    // Latency probe
  PONG: 'pong',                    // Latency response
  LEVEL_COMPLETE: 'level_complete', // Level end
  GAME_OVER: 'game_over',          // Game end
  BONUS: 'bonus',                  // Power-up collected
  DESYNC_CHECK: 'desync_check',    // Verify state consistency
  STATE_ACK: 'state_ack',          // State received acknowledgment
  BATCH: 'BATCH'                   // Multiple messages batched
};
```

### 3.2 Message Format

#### Init Message (Handshake)
```javascript
{
  type: 'init',
  data: {
    playerNum: 1 | 2,           // Player assignment
    level: number,              // Starting level
    seed: number                // Random seed for determinism
  }
}
```

#### State Message (Host → Guest)
```javascript
{
  type: 'state',
  data: {
    ball: { x, y, vx, vy },     // Ball position & velocity
    paddles: [{ x }, { x }],    // Paddle positions (normalized 0-1)
    blocks: [...],              // Array of block states
    powerUps: [...],            // Active power-ups
    score: number,
    lives: number,
    level: number,
    timestamp: number           // Send time
  },
  timestamp: number,
  sequence: number             // For ordering
}
```

#### Input Message (Guest → Host)
```javascript
{
  type: 'input',
  data: {
    x: 0.0 - 1.0,               // Paddle position (normalized)
    fire: boolean,              // Fire/shoot action
    sequence: number            // Input sequence number
  },
  timestamp: number
}
```

#### Delta Input (Compressed)
```javascript
{
  type: 'input_delta',
  data: {
    dx: -0.1 - 0.1,             // Position delta
    fire: boolean | undefined,  // Only if changed
    sequence: number
  }
}
```

### 3.3 Ping/Pong (Latency Measurement)

```javascript
// Host sends
{ type: 'ping', timestamp: performance.now() }

// Guest responds
{ type: 'pong', timestamp: originalPingTime }

// Host calculates
latency = (currentTime - originalPingTime) / 2
```

---

## 4. Synchronization Architecture

### 4.1 Authoritative Host Model

```
┌─────────────────────────────────────────────────────────────┐
│                      SYNCHRONIZATION FLOW                    │
├─────────────────────────────────────────────────────────────┤
│                                                            │
│   HOST (Authoritative)          GUEST (Predicted)         │
│   ────────────────────          ─────────────────         │
│                                                            │
│   1. Simulate physics            1. Send input (60Hz)      │
│      60Hz                                                        │
│                                                            │
│   2. Send state ───────────────► 2. Receive state (20Hz)   │
│      (20Hz)                      3. Render with interp     │
│                                                            │
│   3. Receive input ◄──────────── 4. Predict movement       │
│                                                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Deterministic Physics

Both peers use the same seeded random number generator:

```javascript
// Deterministic particle explosion
function explode(x, y, color, count, seedOffset) {
    for (let i = 0; i < count; i++) {
        // Same seed = same random values on both peers
        const angle = (Math.PI * 2 * i) / count + 
                      (Math.sin(i * 17 + seedOffset) * 0.25);
        const speed = 50 + ((i * 43 + seedOffset * 13) % 150);
        // ... create particle
    }
}
```

### 4.3 Jitter Buffer

```javascript
class JitterBuffer {
    constructor(config) {
        this.minSize = 2;          // Min packets before processing
        this.maxSize = 8;          // Max buffer depth
        this.maxDelay = 100;       // Max acceptable delay (ms)
        this.smoothingFactor = 0.3;
    }
    
    add(state, timestamp, sequence) {
        // Insert in sequence order
        // Remove duplicates
    }
    
    get() {
        // Return oldest state satisfying delay requirement
        // Apply interpolation between states
    }
}
```

### 4.4 Input Prediction (Guest)

```javascript
class InputPredictor {
    predict(dt) {
        // Calculate velocity from history
        const velocityX = (current.x - previous.x) / dt;
        
        // Predict next position
        const predictedX = current.x + velocityX * predictionTime;
        
        // Calculate confidence based on velocity consistency
        this.confidence = Math.max(0, 1 - velocityChange * 10);
        
        return { x: clamp(predictedX, 0, 1), fire: false };
    }
}
```

### 4.5 Lag Compensation (Host)

```javascript
class LagCompensator {
    recordLocalState(state, timestamp) {
        // Keep 1 second of state history (60 frames)
        this.stateHistory.push({ state, timestamp });
    }
    
    reconcile(serverState, serverTimestamp, pendingInputs) {
        // 1. Find state at server processing time
        const historical = this.getStateAtTime(serverTimestamp);
        
        // 2. Calculate error
        const error = this.calculateError(historical, serverState);
        
        // 3. If significant error, smooth correction
        if (error > threshold) {
            const smoothed = this.smoothStates(historical, serverState);
            return this.replayInputs(smoothed, pendingInputs);
        }
        
        return serverState;
    }
}
```

### 4.6 Desync Detection

```javascript
class DesyncDetector {
    checkForDesync(localState, remoteState, timestamp) {
        // Check ball position
        const ballError = distance(localState.ball, remoteState.ball);
        
        // Check paddle positions
        const paddleErrors = localState.paddles.map((p, i) => 
            Math.abs(p.x - remoteState.paddles[i].x)
        );
        
        if (ballError > threshold || paddleErrors.some(e => e > threshold)) {
            this.desyncCount++;
            return { detected: true, magnitude: maxError };
        }
        
        return { detected: false };
    }
    
    shouldForceResync() {
        // >5 desyncs in 10 seconds triggers full resync
        return this.desyncHistory.length > 5;
    }
}
```

---

## 5. Bandwidth Optimization

### 5.1 Throttled State Updates

```javascript
const STATE_UPDATE_INTERVAL = 50;  // 20Hz
const INPUT_SEND_INTERVAL = 16;    // ~60Hz (but delta compressed)
```

### 5.2 Delta Compression

```javascript
compressDelta(newState, oldState) {
    const delta = { timestamp: newState.timestamp };
    
    for (const key in newState) {
        if (key === 'timestamp') continue;
        
        // Numbers: only send if changed significantly
        if (typeof newState[key] === 'number') {
            if (Math.abs(newState[key] - oldState[key]) > threshold) {
                delta[key] = newState[key];
            }
        }
        // Complex objects: compare JSON
        else if (JSON.stringify(newState[key]) !== JSON.stringify(oldState[key])) {
            delta[key] = newState[key];
        }
    }
    
    return delta;
}
```

### 5.3 Message Batching

```javascript
// Multiple small messages combined into one
{
    type: 'BATCH',
    messages: [
        { type: 'INPUT_DELTA', ... },
        { type: 'PING', ... }
    ]
}
```

### 5.4 Bandwidth Usage

| Message Type | Frequency | Approx Size | Monthly Usage* |
|--------------|-----------|-------------|----------------|
| State Update | 20Hz | ~200 bytes | ~10 GB |
| Input | 60Hz (delta) | ~20 bytes | ~3 GB |
| Ping/Pong | 0.5Hz | ~30 bytes | ~40 MB |
| **Total** | — | — | **~13 GB** |

*2 hours play per day

---

## 6. Error Handling & Resilience

### 6.1 Reconnection Strategy

```javascript
const BASE_RECONNECT_DELAY = 1000;   // Start at 1s
const MAX_RECONNECT_DELAY = 30000;   // Cap at 30s

// Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s
reconnectDelay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, attempt),
    MAX_RECONNECT_DELAY
);
```

### 6.2 Timeout Configuration

```javascript
const CONNECTION_TIMEOUT_MS = 30000;    // Room create/join
const PEERJS_TIMEOUT_MS = 12000;        // PeerJS cloud response
const ICE_GATHER_TIMEOUT_MS = 8000;     // ICE candidate gathering
```

### 6.3 Connection States

```javascript
const CONNECTION_STATES = {
  NEW: 'new',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  CLOSED: 'closed'
};
```

---

## 7. Security

### 7.1 Room Code Generation

```javascript
// 6-character alphanumeric (excluding confusing chars)
const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
// 36^6 = 2,176,782,336 possible codes

// Collision detection: check availability before use
async function generateUniqueRoomCode(maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        const code = generateRandomRoomCode();
        if (await checkRoomAvailability(code)) {
            return code;
        }
    }
    throw new Error('Unable to generate unique code');
}
```

### 7.2 Message Validation

```javascript
// Type checking on all incoming messages
if (!isValidMessageType(data.type)) {
    console.warn('Invalid message type:', data.type);
    return;
}

// Range validation for numerical values
if (input.x < 0 || input.x > 1) {
    console.warn('Invalid paddle position');
    return;
}
```

---

## 8. Debug & Monitoring

### 8.1 Network Stats

Press `Ctrl+Shift+P` to display:

```
FPS: 60 | Frame: 16.7ms
Net: 150KB↑ 2.1MB↓ | Ping: 45ms
Mem: 34/64MB
Device: HIGH
```

### 8.2 Connection Logging

```javascript
// All network events logged with prefix
console.log('[Network] Event: connected');
console.log('[Network] State update sent:', bytes);
console.warn('[Network] Latency spike detected:', ms);
```

---

## 9. Limitations

| Limitation | Value | Reason |
|------------|-------|--------|
| Max players | 2 | Physics complexity, screen space |
| Max latency (playable) | ~200ms | Lag compensation limit |
| Recommended latency | <100ms | Optimal experience |
| Min room code entropy | 6 chars | Balance of security vs usability |
| State sync rate | 20Hz | Bandwidth/CPU tradeoff |

---

## 10. References

- [WebRTC Specification](https://www.w3.org/TR/webrtc/)
- [WebRTC DataChannel Guide](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)
- [PeerJS Documentation](https://peerjs.com/docs/)
- [Open Relay TURN](https://openrelay.metered.ca/)
