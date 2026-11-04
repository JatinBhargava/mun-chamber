"use client";

import type { Action } from "./types";

// The realtime server runs on Cloudflare (see worker/). Set NEXT_PUBLIC_REALTIME_URL to its address.
// In local development it defaults to port 8787 on the same machine that served the page.
function base(): string {
  const env = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (env) return env.replace(/\/$/, "");
  return `${location.protocol}//${location.hostname}:8787`;
}

type Res<T> = T & { error?: string };
const OFFLINE = "The server didn't respond. Check your connection.";

/** One-off requests that happen before you have a seat: create, peek and join. */
export async function api<T = { ok?: boolean }>(path: string, body?: unknown): Promise<Res<T>> {
  try {
    const res = await fetch(`${base()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return (await res.json()) as Res<T>;
  } catch {
    return { error: OFFLINE } as Res<T>;
  }
}

type Handler = (data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The live connection to one committee. Reconnects on its own after a drop and fires
 * "connect" each time it's back, so the room can rejoin. Events from the server: state, rtc, kicked.
 */
class Live {
  connected = false;
  private code: string | null = null;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private pending = new Map<number, (r: unknown) => void>();
  private seq = 0;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  connect(code: string) {
    if (this.code === code && this.ws) return;
    this.close();
    this.code = code;
    this.open();
  }

  close() {
    this.code = null;
    clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = null;
    this.dropped();
    ws?.close();
  }

  on(event: string, fn: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
  }

  off(event: string, fn: Handler) {
    this.handlers.get(event)?.delete(fn);
  }

  /** Fire and forget. */
  emit(t: string, d?: unknown) {
    if (this.connected) this.ws?.send(JSON.stringify({ t, d }));
  }

  /** Send and wait for the server's answer. */
  request<T>(t: string, d?: unknown): Promise<Res<T>> {
    if (!this.connected || !this.ws) return Promise.resolve({ error: "Reconnecting to the committee… try again in a moment." } as Res<T>);
    const id = ++this.seq;
    const ws = this.ws;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ error: OFFLINE } as Res<T>); }, 8000);
      this.pending.set(id, (r) => { clearTimeout(timer); resolve(r as Res<T>); });
      ws.send(JSON.stringify({ id, t, d }));
    });
  }

  private open() {
    const ws = new WebSocket(`${base().replace(/^http/, "ws")}/ws/${this.code}`);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.connected = true;
      this.retries = 0;
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 25000);
      this.fire("connect");
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws || e.data === "pong") return;
      let msg: { id?: number; t?: string; d?: unknown };
      try { msg = JSON.parse(String(e.data)); } catch { return; }
      if (typeof msg.id === "number") {
        this.pending.get(msg.id)?.(msg.d);
        this.pending.delete(msg.id);
      } else if (msg.t) {
        if (msg.t === "kicked") this.code = null; // don't reconnect
        this.fire(msg.t, msg.d);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.dropped();
      if (!this.code) return;
      const delay = Math.min(10000, 500 * 2 ** this.retries++);
      this.retryTimer = setTimeout(() => this.code && this.open(), delay);
    };
  }

  private dropped() {
    this.connected = false;
    clearInterval(this.pingTimer);
    for (const resolve of this.pending.values()) resolve({ error: OFFLINE });
    this.pending.clear();
  }

  private fire(event: string, data?: unknown) {
    for (const fn of this.handlers.get(event) ?? []) fn(data);
  }
}

let live: Live | null = null;
export function getSocket(): Live {
  if (!live) live = new Live();
  return live;
}

export const sendAction = (a: Action) => getSocket().request<{ ok?: boolean }>("action", a);

// Remember who you are in each room so a refresh doesn't lose your seat (no login needed).
export interface Session { token: string; memberId: string; name: string }

export function saveSession(code: string, s: Session) {
  try { localStorage.setItem(`mun:${code}`, JSON.stringify(s)); } catch {}
}
export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(`mun:${code}`);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function clearSession(code: string) {
  try { localStorage.removeItem(`mun:${code}`); } catch {}
}
