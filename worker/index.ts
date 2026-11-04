// Realtime server on Cloudflare.
// The Worker answers create / peek / join over HTTP and hands each live connection to that
// committee's Durable Object. One Durable Object per room code holds the committee's state,
// so everyone in a committee always talks to the same place.

import { DurableObject } from "cloudflare:workers";
import { act, createRoom, joinRoom, online, roomCode, tick, viewFor, type CreateParams, type JoinParams, type Room } from "../lib/engine";
import type { Action, Chit, Committee } from "../lib/types";

interface Env {
  ROOMS: DurableObjectNamespace<CommitteeRoom>;
  ALLOWED_ORIGINS: string;
}

const CODE = /^[A-Z0-9]{6}$/;
const IDLE_MS = 24 * 3600 * 1000; // forget a committee a day after its last activity
const MAX_MESSAGE = 1_000_000;

type Reply = Record<string, unknown>;
interface Saved { c: Committee; chits: Chit[]; tokens: [string, string][] }
interface Attachment { memberId?: string }

/** Who may send audio right now: the delegate holding the floor, and the Chair when their mic is on. */
function publishers(room: Room): string[] {
  const c = room.c;
  const list: string[] = [];
  if (c.speaker && !c.speaker.paused) list.push(c.speaker.memberId);
  if (c.chairMic) list.push(c.chairId);
  return list;
}

export class CommitteeRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private alarmAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep connections open while the object sleeps; pings are answered without waking it.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Saved>("room");
      if (saved) this.room = { c: saved.c, chits: saved.chits, tokens: new Map(saved.tokens) };
      this.alarmAt = await ctx.storage.getAlarm();
    });
  }

  // ---------- called by the Worker ----------

  async create(p: CreateParams, code: string): Promise<{ code: string; memberId: string; token: string } | null> {
    if (this.room) return null; // code already in use; the Worker picks another
    const res = createRoom(p, code);
    this.room = res.room;
    await this.save();
    return { code, memberId: res.memberId, token: res.token };
  }

  async peek(): Promise<Reply> {
    const room = this.room;
    if (!room) return { error: "No committee with that code." };
    const taken = new Set(Object.values(room.c.members).map((m) => m.country));
    return { name: room.c.name, type: room.c.type, countries: room.c.countries.filter((x) => !taken.has(x.name)) };
  }

  async join(p: JoinParams): Promise<Reply> {
    const room = this.room;
    if (!room) return { error: "No committee with that code. Check the code with your Chair." };
    const res = joinRoom(room, { ...p, token: undefined }); // the join form always makes a new seat
    if ("error" in res) return res;
    await this.save();
    this.broadcast();
    return { code: room.c.code, ...res };
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // ---------- live connection ----------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return;
    let msg: { id?: number; t?: string; d?: unknown };
    try { msg = JSON.parse(raw); } catch { return; }
    const reply = (d: Reply) => { if (typeof msg.id === "number") send(ws, { id: msg.id, d }); };
    const room = this.room;
    const memberId = (ws.deserializeAttachment() as Attachment | null)?.memberId;

    if (msg.t === "join") {
      // Rejoin with the token saved on this device.
      if (!room) return reply({ error: "No committee with that code. Check the code with your Chair." });
      const p = (msg.d ?? {}) as JoinParams;
      const before = Object.keys(room.c.members).length;
      const res = joinRoom(room, { name: String(p.name ?? ""), role: "observer", token: typeof p.token === "string" ? p.token : undefined });
      if ("error" in res) return reply(res);
      ws.serializeAttachment({ memberId: res.memberId } satisfies Attachment);
      if (Object.keys(room.c.members).length !== before) await this.save();
      reply({ code: room.c.code, ...res });
      this.broadcast();
      return;
    }

    if (msg.t === "action") {
      if (!room || !memberId) return reply({ error: "Not connected to a committee." });
      const a = msg.d as Action;
      if (!a || typeof a !== "object" || typeof a.type !== "string") return reply({ error: "Bad action." });
      let res;
      try {
        res = act(room, memberId, a);
      } catch (e) {
        console.error("action failed", a.type, e);
        return reply({ error: "Something went wrong." });
      }
      if (!res.error) await this.save();
      reply(res.error ? { error: res.error } : { ok: true });
      if (res.kicked) {
        for (const s of this.sockets()) {
          if (s.memberId === res.kicked) {
            send(s.ws, { t: "kicked" });
            s.ws.serializeAttachment({} satisfies Attachment);
            s.ws.close(4001, "Removed by the Chair");
          }
        }
      }
      if (!res.error) this.broadcast();
      return;
    }

    if (msg.t === "rtc") {
      // WebRTC signalling relay for live audio. Only current publishers may start a call (send an offer).
      const m = msg.d as { to?: unknown; data?: { type?: unknown } };
      if (!room || !memberId || !m || typeof m.to !== "string" || !m.data || typeof m.data !== "object") return;
      if (JSON.stringify(m.data).length > 20000) return;
      if (m.data.type === "offer" && !publishers(room).includes(memberId)) return;
      for (const s of this.sockets()) if (s.memberId === m.to) send(s.ws, { t: "rtc", d: { from: memberId, data: m.data } });
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.broadcast(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast(ws);
  }

  // ---------- timers ----------

  async alarm() {
    this.alarmAt = null;
    const room = this.room;
    if (!room) return;
    if (tick(room)) {
      await this.save();
      this.broadcast();
      return;
    }
    if (this.lastActivity() + IDLE_MS <= Date.now() && this.sockets().length === 0) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    await this.schedule();
  }

  /** Wake up when the next speech or caucus ends, or when the room has been idle for a day. */
  private async schedule() {
    const c = this.room?.c;
    if (!c) return;
    const times = [this.lastActivity() + IDLE_MS];
    if (c.speaker && !c.speaker.paused && c.speaker.endsAt !== null) times.push(c.speaker.endsAt);
    if (c.caucus && !c.caucus.paused && c.caucus.endsAt !== null) times.push(c.caucus.endsAt);
    const at = Math.max(Date.now(), Math.min(...times));
    if (at === this.alarmAt) return;
    this.alarmAt = at;
    await this.ctx.storage.setAlarm(at);
  }

  // ---------- helpers ----------

  private lastActivity() {
    const c = this.room!.c;
    return c.log.at(-1)?.at ?? c.createdAt;
  }

  private async save() {
    const r = this.room!;
    await this.ctx.storage.put("room", { c: r.c, chits: r.chits, tokens: [...r.tokens] } satisfies Saved);
    await this.schedule();
  }

  private sockets(exclude?: WebSocket) {
    return this.ctx.getWebSockets()
      .filter((ws) => ws !== exclude && ws.readyState === WebSocket.OPEN)
      .map((ws) => ({ ws, memberId: (ws.deserializeAttachment() as Attachment | null)?.memberId }))
      .filter((s): s is { ws: WebSocket; memberId: string } => !!s.memberId);
  }

  /** Send everyone their own view (secret ballots and private notes stay private). */
  private broadcast(exclude?: WebSocket) {
    const room = this.room;
    if (!room) return;
    const sockets = this.sockets(exclude);
    online(room.c, sockets.map((s) => s.memberId));
    for (const s of sockets) send(s.ws, { t: "state", d: viewFor(room, s.memberId) });
  }
}

function send(ws: WebSocket, msg: unknown) {
  try { ws.send(JSON.stringify(msg)); } catch {}
}

// ---------- the Worker: routing and CORS ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");
    const allowed = isAllowed(origin, env.ALLOWED_ORIGINS);
    const cors: Record<string, string> = allowed && origin
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
      : {};
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors } });

    if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (origin && !allowed) return json({ error: "This site isn't allowed to use the server." }, 403);

    const [, scope, action, rawCode] = url.pathname.split("/"); // /api/<action>/<code>  or  /ws/<code>
    const room = (code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

    if (scope === "ws") {
      const code = String(action ?? "").toUpperCase();
      if (!CODE.test(code)) return new Response("Bad room code", { status: 400 });
      return room(code).fetch(req);
    }

    if (scope !== "api") {
      return url.pathname === "/" ? new Response("MUN Chamber realtime server is running.") : new Response("Not found", { status: 404 });
    }

    const body = async <T>(): Promise<T | null> => {
      if (req.method !== "POST" || Number(req.headers.get("Content-Length") ?? 0) > MAX_MESSAGE) return null;
      try {
        const v = await req.json();
        return v && typeof v === "object" ? (v as T) : null;
      } catch { return null; }
    };

    if (action === "create") {
      const p = await body<CreateParams>();
      if (!p) return json({ error: "Bad request." }, 400);
      for (let i = 0; i < 5; i++) {
        const code = roomCode();
        const res = await room(code).create(p, code);
        if (res) return json(res);
      }
      return json({ error: "Couldn't make a room code. Try again." }, 503);
    }

    const code = String(rawCode ?? "").toUpperCase().trim();
    if (!CODE.test(code)) return json({ error: "No committee with that code." });
    if (action === "peek" && req.method === "GET") return json(await room(code).peek());
    if (action === "join") {
      const p = await body<JoinParams>();
      if (!p) return json({ error: "Bad request." }, 400);
      return json(await room(code).join(p));
    }
    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

function isAllowed(origin: string | null, list: string) {
  if (!origin) return true; // not a browser cross-site request (e.g. curl)
  const allowed = (list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes("*") || allowed.includes(origin);
}
