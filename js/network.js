/**
 * Arkanoid P2P Network Module
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
  PING: 'ping',
  PONG: 'pong',
  LEVEL_COMPLETE: 'level_complete',
  GAME_OVER: 'game_over',
  BONUS: 'bonus'
};

const CONNECTION_STATES = {
  NEW: 'new',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  CLOSED: 'closed'
};

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

const PING_INTERVAL = 2000;
const RECONNECT_DELAY = 3000;
const PEERJS_TIMEOUT_MS = 12000;
const ICE_GATHER_TIMEOUT_MS = 8000;

// ==================== NETWORK MODULE ====================
class NetworkModule {
  constructor() {
    this._isHost = false;
    this._roomCode = null;
    this._connectionState = CONNECTION_STATES.NEW;
    this._eventListeners = new Map();
    this._latency = 0;
    this._pingIntervalId = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 3;
    this._reconnectTimerId = null;

    // PeerJS cloud mode
    this._mode = 'peerjs';
    this._peer = null;
    this._peerConn = null;

    // Manual signaling mode
    this._rtcPc = null;
    this._dataChannel = null;
    this._manualSdpResolver = null;
  }

  // ==================== ROOM CODE ====================
  _generateRoomCode() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
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
    this._roomCode = this._generateRoomCode();
    this._connectionState = CONNECTION_STATES.CONNECTING;
    console.log(`[Network] Creating room: ${this._roomCode}`);

    try {
      this._mode = 'peerjs';
      await this._createRoomViaPeerJS();
    } catch (err) {
      console.warn('[Network] PeerJS unavailable, switching to manual signaling:', err.message);
      this._destroyPeer();
      this._mode = 'manual';
      await this._createRoomManual();
    }

    return this._roomCode;
  }

  async joinRoom(code) {
    this._isHost = false;
    this._roomCode = code.toLowerCase().trim();
    this._connectionState = CONNECTION_STATES.CONNECTING;
    console.log(`[Network] Joining room: ${this._roomCode}`);

    try {
      this._mode = 'peerjs';
      await this._joinRoomViaPeerJS();
    } catch (err) {
      console.warn('[Network] PeerJS unavailable, switching to manual signaling:', err.message);
      this._destroyPeer();
      this._mode = 'manual';
      await this._joinRoomManual();
    }
  }

  send(data) {
    const message = JSON.stringify(data);

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
        () => reject(new Error('PeerJS timeout')),
        PEERJS_TIMEOUT_MS
      );

      this._peer = new Peer(this._roomCode, { debug: 1 });

      this._peer.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
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
        () => reject(new Error('PeerJS timeout')),
        PEERJS_TIMEOUT_MS
      );

      this._peer = new Peer({ debug: 1 });

      this._peer.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
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
          reject(err);
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

  _waitForIceGathering(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }

      const done = () => { if (pc.iceGatheringState === 'complete') resolve(); };
      pc.onicegatheringstatechange = done;

      // Safety timeout: resolve even if gathering stalls
      setTimeout(resolve, ICE_GATHER_TIMEOUT_MS);
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
    try {
      const message = JSON.parse(data);

      if (message.type === MESSAGE_TYPES.PING) {
        this.send({ type: MESSAGE_TYPES.PONG, timestamp: message.timestamp });
        return;
      }

      if (message.type === MESSAGE_TYPES.PONG) {
        this._latency = Date.now() - message.timestamp;
        return;
      }

      this._emit('message', message);
    } catch (err) {
      console.error('[Network] Message parse error:', err);
    }
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
    console.log(`[Network] Reconnect attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts}`);
    this._reconnectTimerId = setTimeout(async () => {
      try {
        if (this._roomCode) await this.joinRoom(this._roomCode);
      } catch (err) {
        console.error('[Network] Reconnect failed:', err);
      }
    }, RECONNECT_DELAY);
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
export const getConnectionState = () => network.getConnectionState();
export const getRoomCode = () => network.getRoomCode();
export const submitRemoteSdp = (sdp) => network.submitRemoteSdp(sdp);

export { MESSAGE_TYPES, CONNECTION_STATES, ICE_SERVERS };
export default network;
