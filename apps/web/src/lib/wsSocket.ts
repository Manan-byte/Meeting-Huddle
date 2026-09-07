/**
 * @file wsSocket — minimal Socket.IO-compatible client over raw WebSocket.
 *
 * Speaks the Huddle Worker protocol:
 *   client → server: { e: event, d: data, ack?: number }
 *   server → client: { e: event, d: data, ack?: number }
 *
 * Presents a socket.io-client-shaped API (on/off/once/emit/close, `.id`,
 * `connect`/`disconnect` events) so the existing app components keep working
 * unchanged. Adds auto-reconnect with backoff; if the client was in a room,
 * it re-emits CREATE_ROOM/JOIN_ROOM on reconnect so the server re-syncs
 * room state + chat history.
 */

type Listener = (payload?: unknown) => void;

interface PendingAck {
  resolve: (value: unknown) => void;
}

export class WsSocket {
  id: string | null = null;
  connected = false;

  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private ackSeq = 0;
  private pendingAcks = new Map<number, PendingAck>();
  private buffer: { e: string; d?: unknown; ack?: number }[] = [];
  private closed = false;
  private reconnectDelay = 500;
  /** Last room entry payload (create/join) so we can re-sync on reconnect. */
  private lastRoomPayload: { e: string; d: unknown } | null = null;
  private shouldRejoin = false;

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);

    this.ws.onopen = () => {
      this.reconnectDelay = 500;
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (!msg || typeof msg.e !== "string") return;

        // Ack responses resolve pending emit callbacks.
        if (msg.ack !== undefined) {
          const pending = this.pendingAcks.get(msg.ack);
          if (pending) {
            this.pendingAcks.delete(msg.ack);
            pending.resolve(msg.d);
          }
          return;
        }

        if (msg.e === "connect") {
          this.id = (msg.d as { id?: string })?.id ?? null;
          this.connected = true;
          this.dispatch("connect");
          this.flush();
          if (this.shouldRejoin && this.lastRoomPayload) {
            this.emit(this.lastRoomPayload.e, this.lastRoomPayload.d);
          }
          return;
        }

        this.dispatch(msg.e, msg.d);
      } catch {
        /* ignore malformed */
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.dispatch("disconnect");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      /* close follows */
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    setTimeout(() => {
      if (this.closed) return;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
  }

  private flush(): void {
    while (this.buffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const item = this.buffer.shift()!;
      this.ws.send(JSON.stringify(item));
    }
  }

  private rawSend(item: { e: string; d?: unknown; ack?: number }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(item));
    } else {
      // Buffer while disconnected (bounded, oldest dropped).
      if (this.buffer.length >= 100) this.buffer.shift();
      this.buffer.push(item);
    }
  }

  private dispatch(e: string, payload?: unknown): void {
    const set = this.listeners.get(e);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[wsSocket] listener '${e}' error:`, err);
      }
    }
  }

  on(event: string, cb: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return this;
  }

  once(event: string, cb: Listener): this {
    const wrapper: Listener = (payload) => {
      this.off(event, wrapper);
      cb(payload);
    };
    this.on(event, wrapper);
    return this;
  }

  off(event: string, cb: Listener): this {
    this.listeners.get(event)?.delete(cb);
    return this;
  }

  emit(event: string, data?: unknown, ack?: (res: unknown) => void): this {
    // Track room entry for reconnect re-sync.
    if (event === "room:create" || event === "room:join") {
      this.lastRoomPayload = { e: event, d: data };
      this.shouldRejoin = true;
    }
    if (event === "room:leave") {
      this.lastRoomPayload = null;
      this.shouldRejoin = false;
    }

    let ackId: number | undefined;
    if (typeof ack === "function") {
      ackId = ++this.ackSeq;
      this.pendingAcks.set(ackId, { resolve: ack });
    }
    this.rawSend({ e: event, d: data, ack: ackId });
    return this;
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}
