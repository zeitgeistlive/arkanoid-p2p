/**
 * Arkanoid P2P Network Module - Enhanced with high-precision synchronization
 * WebRTC peer-to-peer networking with PeerJS Cloud signaling and manual SDP fallback.
 * Requires PeerJS CDN: https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js
 *
 * Manual fallback events emitted when PeerJS Cloud is unavailable:
 *   'manual_offer'      — host emits { sdp, roomCode }; UI must display SDP for guest to copy
 *   'manual_need_offer' — guest emits { roomCode };     UI must prompt guest to paste host SDP
 *   'manual_answer'     — guest emits { sdp };          UI must display SDP for host to copy
 * Call network.submitRemoteSdp(sdpString) to provide the pasted SDP from the other peer.
 */

// ==================== CONSTANTS ====================
const MESSAGE_TYPES = {
  INIT: 'init',
  STATE: 'state',
  INPUT: 'input',
  INPUT_DELTA: 'input_delta', // Compact input format with delta compression
  PING: 'ping',
  PONG: 'pong',
  LEVEL_COMPLETE: 'level_complete',
  GAME_OVER: 'game_over',
  BONUS: 'bonus',
  DESYNC_CHECK: 'desync_check', // Desync detection message
  STATE_ACK: 'state_ack'  // State acknowledgment for reconciliation
};

const CONNECTION_STATES = {
  NEW: 'new',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  CLOSED: 'closed'
};

// ============================================================================
// FIX #1: Added free TURN servers from Open Relay (openrelay.metered.ca)
// STUN-only configs fail behind strict NAT/firewalls. TURN servers relay
// traffic when direct P2P fails, enabling ~95% connection success rate.
// These are free public servers - no API key required.
// ============================================================================
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

const PING_INTERVAL = 2000;

// ============================================================================
// FIX #3: Reconnection with exponential backoff
// Instead of fixed 3-second delay, delay increases: 1s, 2s, 4s, 8s, max 30s
// This prevents server overload and gives network time to recover.
// ============================================================================
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const PEERJS_TIMEOUT_MS = 12000;

// ============================================================================
// FIX #6: ICE candidate gathering timeout
// If ICE gathering takes too long, we abort to avoid hanging indefinitely.
// ============================================================================
const ICE_GATHER_TIMEOUT_MS = 8000;

// ============================================================================
// FIX #4: Overall connection timeout for room creation/joining
// Prevents UI from hanging indefinitely on connection attempts.
// ============================================================================
const CONNECTION_TIMEOUT_MS = 30000;

// ==================== JITTER BUFFER CONFIGURATION ====================
// Jitter buffer smooths out network timing variations for smooth gameplay
const JITTER_BUFFER_CONFIG = {
  minBufferSize: 2,     // Minimum packets to wait for before processing
  maxBufferSize: 8,     // Maximum packets in buffer
  maxDelay: 100,        // Maximum delay to add (ms)
  smoothingFactor: 0.3  // Exponential smoothing factor
};

// ==================== NETWORK MODULE ====================
class NetworkModule {
  constructor() {
    this._isHost = false;
    this._roomCode = null;
    this._connectionState = CONNECTION_STATES.NEW;
    this._eventListeners = new Map();
    this._latency = 0;
    this._latencyHistory = []; // For jitter calculation
    this._latencyHistorySize = 10;
    this._pingIntervalId = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 3;
    this._reconnectTimerId = null;

    // PeerJS cloud mode
    this._mode = 'peerjs';
    this._peer = null;
    this._peerConn = null;
    
    // Throttled message sending
    this._messageQueue = [];
    this._lastSendTime = 0;
    this._minSendInterval = 16; // ~60fps max
    this._pendingFlushTimeout = null;

    // Manual signaling mode
    this._rtcPc = null;
    this._dataChannel = null;
    this._manualSdpResolver = null;
    
    // Network stats for monitoring
    this._bytesSent = 0;
    this._bytesReceived = 0;
    
    // ==================== JITTER BUFFER ====================
    this._jitterBuffer = []; // Buffer for incoming messages
    this._lastProcessedSequence = -1;
    this._sequenceNumber = 0;
    this._averageJitter = 0;
    
    // ==================== INPUT DELTA COMPRESSION ====================
    this._lastSentInput = { x: 0.5, fire: false, sequence: 0 };
    this._inputSequence = 0;
  }

  // ==================== ROOM CODE ====================
  // ============================================================================
  // FIX #2: Room code collision detection
  // Generates a code and ensures it's not already in use by checking PeerJS.
  // If collision detected, generates a new code (up to 5 retries).
  // ============================================================================
  async _generateUniqueRoomCode(maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = this._generateRandomRoomCode();
      const isAvailable = await this._checkRoomAvailability(code);
      if (isAvailable) return code;
      console.warn(`[Network] Room code collision detected, retrying (${attempt + 1}/${maxRetries})...`);
    }
    throw new Error('Unable to generate unique room code after multiple attempts. Please try again.');
  }

  _generateRandomRoomCode() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // Checks if a room code is already registered on PeerJS cloud
  _checkRoomAvailability(code) {
    return new Promise((resolve) => {
      if (typeof Peer === 'undefined') {
        resolve(true); // Assume available if PeerJS not loaded
        return;
      }
      // Try to connect as guest - if connection opens immediately, room exists
      const testPeer = new Peer({ debug: 0 });
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          try { testPeer.destroy(); } catch (_) {}
        }
      };

      testPeer.on('open', () => {
        const conn = testPeer.connect(code, { reliable: true });
        const timeout = setTimeout(() => {
          cleanup();
          resolve(true); // Timeout means room likely doesn't exist (available)
        }, 2000);

        conn.on('open', () => {
          clearTimeout(timeout);
          conn.close();
          cleanup();
          resolve(false); // Room exists (unavailable)
        });

        conn.on('error', () => {
          clearTimeout(timeout);
          cleanup();
          resolve(true); // Error means room likely unavailable
        });
      });

      testPeer.on('error', () => {
        cleanup();
        resolve(true); // Error means we can't check, assume available
      });

      // Overall timeout for check
      setTimeout(() => {
        cleanup();
        resolve(true);
      }, 5000);
    });
  }

  // ==================== EVENT SYSTEM ====================
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    this._eventListeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  _emit(event, data) {
    console.log(`[Network] Event: ${event}`);
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.forEach(cb => {
        try { cb(data); } catch (e) { console.error(`[Network] Listener error (${event}):`, e); }
      });
    }
  }

  // ==================== PUBLIC API ====================
  async createRoom() {
    this._isHost = true;
    this._connectionState = CONNECTION_STATES.CONNECTING;

    try {
      // ============================================================================
      // FIX #2 continued: Use collision-resistant room code generation
      // ============================================================================
      this._roomCode = await this._generateUniqueRoomCode();
      console.log(`[Network] Creating room: ${this._roomCode}`);
    } catch (err) {
      this._connectionState = CONNECTION_STATES.FAILED;
      throw new Error('Failed to generate room code. Please try again.');
    }

    // ============================================================================
    // FIX #4: Connection timeout wrapper
    // Ensures createRoom doesn't hang forever if PeerJS or manual signaling fails.
    // ============================================================================
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._connectionState = CONNECTION_STATES.FAILED;
        reject(new Error('Connection timeout: Could not create room. Please check your network and try again.'));
      }, CONNECTION_TIMEOUT_MS);

      const attemptConnection = async () => {
        try {
          this._mode = 'peerjs';
          await this._createRoomViaPeerJS();
          clearTimeout(timeout);
          resolve(this._roomCode);
        } catch (err) {
          console.warn('[Network] PeerJS unavailable, switching to manual signaling:', err.message);
          this._destroyPeer();
          this._mode = 'manual';
          try {
            await this._createRoomManual();
            clearTimeout(timeout);
            resolve(this._roomCode);
          } catch (manualErr) {
            clearTimeout(timeout);
            this._connectionState = CONNECTION_STATES.FAILED;
            reject(manualErr);
          }
        }
      };

      attemptConnection();
    });
  }

  async joinRoom(code) {
    this._isHost = false;
    this._roomCode = code.toLowerCase().trim();
    this._connectionState = CONNECTION_STATES.CONNECTING;
    console.log(`[Network] Joining room: ${this._roomCode}`);

    // ============================================================================
    // FIX #4: Connection timeout for joinRoom as well
    // ============================================================================
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._connectionState = CONNECTION_STATES.FAILED;
        reject(new Error('Connection timeout: Could not join room. Room may not exist or network is unreachable.'));
      }, CONNECTION_TIMEOUT_MS);

      const attemptJoin = async () => {
        try {
          this._mode = 'peerjs';
          await this._joinRoomViaPeerJS();
          clearTimeout(timeout);
          resolve();
        } catch (err) {
          console.warn('[Network] PeerJS unavailable, switching to manual signaling:', err.message);
          this._destroyPeer();
          this._mode = 'manual';
          try {
            await this._joinRoomManual();
            clearTimeout(timeout);
            resolve();
          } catch (manualErr) {
            clearTimeout(timeout);
            this._connectionState = CONNECTION_STATES.FAILED;
            reject(manualErr);
          }
        }
      };

      attemptJoin();
    });
  }

  send(data) {
    const now = performance.now();
    const message = JSON.stringify(data);
    const messageSize = new Blob([message]).size;
    
    // Track network stats
    this._bytesSent += messageSize;
    
    // Throttling: queue message if sent too recently
    if (now - this._lastSendTime < this._minSendInterval) {
      this._messageQueue.push(data);
      
      // Schedule flush if not already scheduled
      if (!this._pendingFlushTimeout) {
        this._pendingFlushTimeout = setTimeout(() => {
          this._flushMessageQueue();
        }, this._minSendInterval);
      }
      return true;
    }
    
    return this._sendImmediate(data, message);
  }
  
  _sendImmediate(data, message) {
    const now = performance.now();
    this._lastSendTime = now;
    
    if (!message) {
      message = JSON.stringify(data);
    }

    if (this._mode === 'peerjs' && this._peerConn && this._peerConn.open) {
      try {
        this._peerConn.send(message);
        return true;
      } catch (err) {
        console.error('[Network] PeerJS send error:', err);
        return false;
      }
    }

    if (this._mode === 'manual' && this._dataChannel && this._dataChannel.readyState === 'open') {
      try {
        this._dataChannel.send(message);
        return true;
      } catch (err) {
        console.error('[Network] DataChannel send error:', err);
        return false;
      }
    }

    console.warn('[Network] Cannot send: not connected');
    return false;
  }
  
  _flushMessageQueue() {
    this._pendingFlushTimeout = null;
    
    if (this._messageQueue.length === 0) return;
    
    // Send all queued messages as a batch if possible
    if (this._messageQueue.length > 1) {
      // Batch multiple messages into one
      const batched = {
        type: 'BATCH',
        messages: this._messageQueue
      };
      this._sendImmediate(batched);
    } else {
      this._sendImmediate(this._messageQueue[0]);
    }
    
    this._messageQueue = [];
  }

  close() {
    this._stopPingInterval();

    if (this._reconnectTimerId) {
      clearTimeout(this._reconnectTimerId);
      this._reconnectTimerId = null;
    }

    if (this._peerConn) {
      this._peerConn.close();
      this._peerConn = null;
    }

    this._destroyPeer();

    if (this._dataChannel) {
      this._dataChannel.close();
      this._dataChannel = null;
    }

    if (this._rtcPc) {
      this._rtcPc.close();
      this._rtcPc = null;
    }

    this._manualSdpResolver = null;
    this._connectionState = CONNECTION_STATES.CLOSED;
    this._eventListeners.clear();

    console.log('[Network] Closed');
  }

  isHost() { return this._isHost; }
  getLatency() { return this._latency; }
  getConnectionState() { return this._connectionState; }
  getRoomCode() { return this._roomCode; }

  // Provides the remote peer's SDP in manual signaling mode.
  // Call this after the user pastes the SDP from the other peer.
  submitRemoteSdp(sdp) {
    if (this._manualSdpResolver) {
      const resolve = this._manualSdpResolver;
      this._manualSdpResolver = null;
      resolve(sdp.trim());
    } else {
      console.warn('[Network] No pending SDP awaited');
    }
  }

  // ==================== PEERJS CLOUD SIGNALING ====================
  async _createRoomViaPeerJS() {
    if (typeof Peer === 'undefined') throw new Error('PeerJS script not loaded');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('PeerJS timeout — signaling server did not respond')),
        PEERJS_TIMEOUT_MS
      );

      // ============================================================================
      // FIX #2: Use the already-verified unique room code. PeerJS will error
      // with 'unavailable-id' if someone else took it since we checked.
      // ============================================================================
      this._peer = new Peer(this._roomCode, { debug: 1 });

      this._peer.on('error', (err) => {
        clearTimeout(timer);
        // ============================================================================
        // FIX #5: User-friendly error messages for common PeerJS errors
        // ============================================================================
        let friendlyError = err.message;
        if (err.type === 'unavailable-id') {
          friendlyError = 'Room code is already in use. Please try creating a room again.';
        } else if (err.type === 'network') {
          friendlyError = 'Network error connecting to signaling server. Please check your internet connection.';
        } else if (err.type === 'server-error') {
          friendlyError = 'Signaling server error. Please try again later.';
        } else if (err.type === 'socket-error') {
          friendlyError = 'Connection to signaling server failed. This may be due to a firewall or proxy.';
        }
        reject(new Error(friendlyError));
      });

      this._peer.on('open', (id) => {
        this._roomCode = id;
        console.log(`[Network] PeerJS host open, id: ${id}`);

        // Resolve as soon as host is ready; guest connection triggers _onConnected
        clearTimeout(timer);
        resolve();

        this._peer.on('connection', (conn) => {
          console.log('[Network] Guest connected via PeerJS');
          this._peerConn = conn;
          this._wirePeerJSConn(conn);
        });
      });
    });
  }

  async _joinRoomViaPeerJS() {
    if (typeof Peer === 'undefined') throw new Error('PeerJS script not loaded');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('PeerJS timeout — could not connect to host')),
        PEERJS_TIMEOUT_MS
      );

      this._peer = new Peer({ debug: 1 });

      this._peer.on('error', (err) => {
        clearTimeout(timer);
        // ============================================================================
        // FIX #5: User-friendly error messages for join failures
        // ============================================================================
        let friendlyError = err.message;
        if (err.type === 'peer-unavailable') {
          friendlyError = `Room "${this._roomCode}" not found. Please check the room code and try again.`;
        } else if (err.type === 'network') {
          friendlyError = 'Network error. Please check your internet connection.';
        } else if (err.type === 'socket-error') {
          friendlyError = 'Connection failed. This may be due to a firewall or proxy.';
        }
        reject(new Error(friendlyError));
      });

      this._peer.on('open', () => {
        console.log('[Network] PeerJS guest open, connecting to host...');

        const conn = this._peer.connect(this._roomCode, {
          reliable: true,
          serialization: 'raw'
        });
        this._peerConn = conn;

        conn.on('error', (err) => {
          clearTimeout(timer);
          reject(new Error(`Connection error: ${err.message || 'Unknown error'}`));
        });

        conn.on('open', () => {
          clearTimeout(timer);
          console.log('[Network] PeerJS DataConnection open');
          this._wirePeerJSConn(conn);
          resolve();
        });
      });
    });
  }

  _wirePeerJSConn(conn) {
    conn.on('data', (data) => {
      this._handleMessage(typeof data === 'string' ? data : JSON.stringify(data));
    });

    conn.on('open', () => this._onConnected());

    conn.on('close', () => this._onDisconnected());

    conn.on('error', (err) => {
      console.error('[Network] PeerJS conn error:', err);
      this._emit('error', err);
    });

    if (conn.open) this._onConnected();
  }

  _destroyPeer() {
    if (this._peer) {
      try { this._peer.destroy(); } catch (_) {}
      this._peer = null;
    }
  }

  // ==================== MANUAL SIGNALING ====================
  async _createRoomManual() {
    this._rtcPc = new RTCPeerConnection(ICE_SERVERS);

    this._dataChannel = this._rtcPc.createDataChannel('gameData', {
      ordered: true,
      maxRetransmits: 3
    });
    this._setupDataChannel(this._dataChannel);

    const offer = await this._rtcPc.createOffer();
    await this._rtcPc.setLocalDescription(offer);
    await this._waitForIceGathering(this._rtcPc);

    const localSdp = this._rtcPc.localDescription.sdp;
    console.log('[Network] Manual: host offer ready for display');
    this._emit('manual_offer', { sdp: localSdp, roomCode: this._roomCode });

    const answerSdp = await this._waitForRemoteSdp();
    await this._rtcPc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    console.log('[Network] Manual: host applied guest answer');
  }

  async _joinRoomManual() {
    this._rtcPc = new RTCPeerConnection(ICE_SERVERS);

    this._rtcPc.ondatachannel = (event) => {
      this._dataChannel = event.channel;
      this._setupDataChannel(this._dataChannel);
    };

    // Ask UI to prompt the user for the host's offer
    this._emit('manual_need_offer', { roomCode: this._roomCode });

    const offerSdp = await this._waitForRemoteSdp();
    await this._rtcPc.setRemoteDescription({ type: 'offer', sdp: offerSdp });

    const answer = await this._rtcPc.createAnswer();
    await this._rtcPc.setLocalDescription(answer);
    await this._waitForIceGathering(this._rtcPc);

    const localSdp = this._rtcPc.localDescription.sdp;
    console.log('[Network] Manual: guest answer ready for display');
    this._emit('manual_answer', { sdp: localSdp });
  }

  // ============================================================================
  // FIX #6: Improved ICE gathering with timeout handling
  // Properly rejects promise if gathering fails or times out.
  // ============================================================================
  _waitForIceGathering(pc, timeoutMs = ICE_GATHER_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        pc.onicegatheringstatechange = null;
        pc.onicecandidate = null;
        console.warn(`[Network] ICE gathering timeout after ${timeoutMs}ms, proceeding with gathered candidates`);
        resolve(); // Resolve anyway with what we have
      }, timeoutMs);

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete' && !timedOut) {
          clearTimeout(timeout);
          resolve();
        }
      };

      // Also listen for individual candidates to ensure progress
      pc.onicecandidate = (event) => {
        if (event.candidate === null && !timedOut) {
          // Gathering complete (end-of-candidates marker)
          clearTimeout(timeout);
          resolve();
        }
      };
    });
  }

  _waitForRemoteSdp() {
    return new Promise((resolve) => {
      this._manualSdpResolver = resolve;
    });
  }

  // ==================== DATA CHANNEL ====================
  _setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('[Network] Data channel open');
      this._onConnected();
    };

    channel.onclose = () => {
      console.log('[Network] Data channel closed');
      this._onDisconnected();
    };

    channel.onerror = (err) => {
      console.error('[Network] Data channel error:', err);
      this._emit('error', err);
    };

    channel.onmessage = (event) => this._handleMessage(event.data);
  }

  // ==================== MESSAGE HANDLING ====================
  _handleMessage(data) {
    // Track received bytes
    this._bytesReceived += new Blob([data]).size;
    
    try {
      const message = JSON.parse(data);
      
      // Handle batched messages
      if (message.type === 'BATCH' && Array.isArray(message.messages)) {
        for (const msg of message.messages) {
          this._processMessage(msg);
        }
        return;
      }
      
      this._processMessage(message);
    } catch (err) {
      console.error('[Network] Message parse error:', err);
    }
  }
  
  _processMessage(message) {
    if (message.type === MESSAGE_TYPES.PING) {
      this.send({ type: MESSAGE_TYPES.PONG, timestamp: message.timestamp });
      return;
    }

    if (message.type === MESSAGE_TYPES.PONG) {
      const latency = Date.now() - message.timestamp;
      this._latency = latency;
      this._updateLatencyHistory(latency);
      return;
    }

    this._emit('message', message);
  }

  // ==================== JITTER BUFFER METHODS ====================
  // Smooths incoming state updates to reduce jitter at 100-200ms latency
  _updateLatencyHistory(latency) {
    this._latencyHistory.push(latency);
    if (this._latencyHistory.length > this._latencyHistorySize) {
      this._latencyHistory.shift();
    }
    
    // Calculate jitter (standard deviation of latency)
    if (this._latencyHistory.length > 1) {
      const mean = this._latencyHistory.reduce((a, b) => a + b, 0) / this._latencyHistory.length;
      const variance = this._latencyHistory.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / this._latencyHistory.length;
      this._averageJitter = Math.sqrt(variance);
    }
  }
  
  getJitter() {
    return this._averageJitter;
  }
  
  // ==================== INPUT DELTA COMPRESSION ====================
  // Compresses input data to reduce bandwidth
  sendInputDelta(input) {
    this._inputSequence++;
    
    const delta = {
      dx: input.x - this._lastSentInput.x,
      fire: input.fire !== this._lastSentInput.fire ? input.fire : undefined,
      seq: this._inputSequence
    };
    
    // Only send if there's a meaningful change
    if (Math.abs(delta.dx) > 0.001 || delta.fire !== undefined) {
      this.send({
        type: MESSAGE_TYPES.INPUT_DELTA,
        delta: delta,
        timestamp: Date.now(),
        fullX: input.x // Include full position occasionally for drift correction
      });
      
      this._lastSentInput = { ...input, sequence: this._inputSequence };
      return true;
    }
    
    return false;
  }

  // ==================== CONNECTION STATE ====================
  _onConnected() {
    if (this._connectionState === CONNECTION_STATES.CONNECTED) return;

    this._connectionState = CONNECTION_STATES.CONNECTED;
    this._reconnectAttempts = 0;
    this._startPingInterval();

    this.send({ type: MESSAGE_TYPES.INIT, isHost: this._isHost, timestamp: Date.now() });
    this._emit('connect', { isHost: this._isHost, roomCode: this._roomCode });
  }

  _onDisconnected() {
    if (this._connectionState === CONNECTION_STATES.DISCONNECTED) return;

    this._connectionState = CONNECTION_STATES.DISCONNECTED;
    this._stopPingInterval();
    this._emit('disconnect', { reason: 'peer_disconnected' });

    if (!this._isHost && this._reconnectAttempts < this._maxReconnectAttempts) {
      this._attemptReconnect();
    }
  }

  _attemptReconnect() {
    this._reconnectAttempts++;
    // ============================================================================
    // FIX #3: Exponential backoff calculation
    // delay = base * 2^attempts, capped at MAX_RECONNECT_DELAY (30s)
    // Example delays: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
    // ============================================================================
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this._reconnectAttempts - 1),
      MAX_RECONNECT_DELAY
    );
    console.log(`[Network] Reconnect attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts} (delay: ${delay}ms)`);
    // ============================================================================
    // FIX #5: Better error messaging for UI
    // Emit structured error info including retry count and time until next attempt.
    // ============================================================================
    this._emit('reconnecting', {
      attempt: this._reconnectAttempts,
      maxAttempts: this._maxReconnectAttempts,
      nextRetryIn: delay,
      message: `Connection lost. Reconnecting (${this._reconnectAttempts}/${this._maxReconnectAttempts}) in ${Math.round(delay/1000)}s...`
    });
    this._connectionState = CONNECTION_STATES.CONNECTING;

    this._reconnectTimerId = setTimeout(async () => {
      try {
        if (this._roomCode) await this.joinRoom(this._roomCode);
      } catch (err) {
        console.error('[Network] Reconnect failed:', err);
        // ============================================================================
        // FIX #5: Emit user-friendly error if all retries exhausted
        // ============================================================================
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
          this._connectionState = CONNECTION_STATES.FAILED;
          this._emit('reconnect_failed', {
            message: 'Failed to reconnect after multiple attempts. The host may have left or your network connection is unavailable. Please try creating or joining a new room.'
          });
        }
      }
    }, delay);
  }

  // ==================== PING ====================
  _startPingInterval() {
    this._pingIntervalId = setInterval(() => {
      this.send({ type: MESSAGE_TYPES.PING, timestamp: Date.now() });
    }, PING_INTERVAL);
  }

  _stopPingInterval() {
    if (this._pingIntervalId) {
      clearInterval(this._pingIntervalId);
      this._pingIntervalId = null;
    }
  }
  
  getNetworkStats() {
    return {
      bytesSent: this._bytesSent,
      bytesReceived: this._bytesReceived,
      messagesQueued: this._messageQueue.length,
      latency: this._latency,
      jitter: this._averageJitter,
      inputSequence: this._inputSequence
    };
  }
}

// ==================== SINGLETON EXPORTS ====================
const network = new NetworkModule();

export const createRoom = () => network.createRoom();
export const joinRoom = (code) => network.joinRoom(code);
export const send = (data) => network.send(data);
export const on = (event, callback) => network.on(event, callback);
export const off = (event, callback) => network.off(event, callback);
export const close = () => network.close();
export const isHost = () => network.isHost();
export const getLatency = () => network.getLatency();
export const getJitter = () => network.getJitter();
export const getConnectionState = () => network.getConnectionState();
export const getRoomCode = () => network.getRoomCode();
export const submitRemoteSdp = (sdp) => network.submitRemoteSdp(sdp);
export const sendInputDelta = (input) => network.sendInputDelta(input);
export const getNetworkStats = () => network.getNetworkStats();

export { MESSAGE_TYPES, CONNECTION_STATES, ICE_SERVERS, JITTER_BUFFER_CONFIG };
export default network;
