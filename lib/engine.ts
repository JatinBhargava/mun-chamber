// The committee engine: every rule of procedure lives here.
// Pure state changes on a Room; the realtime layer just calls these and broadcasts.

import { P5 } from "./countries";
import { LAYOUT_IDS, layoutName, type LayoutId } from "./layouts";
import type {
  Action, Amendment, Ballot, Chit, Clause, Committee, CommitteeType, CommitteeView,
  Doc, Member, Mode, Motion, MotionType, Role, Speaker, Vote,
} from "./types";

export interface Room {
  c: Committee;
  chits: Chit[];
  tokens: Map<string, string>; // secret token -> member id (lets people rejoin without login)
}

const MAX_LOG = 500;
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const roomCode = () =>
  Array.from({ length: 6 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const token = () => crypto.randomUUID();

export const MOTION_LABEL: Record<MotionType, string> = {
  open_gsl: "Open the General Speakers' List",
  set_agenda: "Set the agenda",
  mod_caucus: "Moderated caucus",
  unmod_caucus: "Unmoderated caucus",
  extend: "Extend the current caucus",
  close_debate: "Close debate (move into voting procedure)",
  introduce_dr: "Introduce draft resolution",
  suspend: "Suspend the meeting",
  resume: "Resume the meeting",
  adjourn: "Adjourn the meeting",
};

export function who(c: Committee, id?: string): string {
  if (!id) return "—";
  if (id === "chair") return "the Chair";
  const m = c.members[id];
  if (!m) return "a former member";
  if (m.role === "chair") return `Chair (${m.name})`;
  return m.country ?? m.name;
}

function log(c: Committee, kind: Committee["log"][number]["kind"], text: string, memberId?: string) {
  c.log.push({ id: uid(), at: Date.now(), kind, text, memberId });
  if (c.log.length > MAX_LOG) c.log.splice(0, c.log.length - MAX_LOG);
}

// ---------- creating and joining ----------

export interface CreateParams {
  chairName: string;
  name: string;
  type: CommitteeType;
  topics: string[];
  countries: { name: string; iso?: string }[];
  gslSpeakingSec: number;
  layout?: LayoutId;
}

export function createRoom(p: CreateParams, code: string): { room: Room; memberId: string; token: string } {
  const chairId = uid();
  const t = token();
  const topics = p.topics.map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const c: Committee = {
    code,
    name: p.name.trim().slice(0, 80) || "Committee",
    type: p.type,
    layout: p.layout && LAYOUT_IDS.includes(p.layout) ? p.layout : p.type === "SC" ? "council" : "assembly",
    topics,
    agenda: topics.length === 1 ? topics[0] : null,
    mode: "lobby",
    chairId,
    members: {
      [chairId]: { id: chairId, name: p.chairName.trim().slice(0, 40) || "Chair", role: "chair", attendance: "present", online: false, placard: false, speeches: 0 },
    },
    countries: p.countries.slice(0, 200),
    gsl: [],
    gslSpeakingSec: clamp(p.gslSpeakingSec || 90, 15, 600),
    speaker: null,
    caucus: null,
    chairMic: false,
    motions: [],
    points: [],
    docs: [],
    amendments: [],
    vote: null,
    voteHistory: [],
    chitsEnabled: true,
    log: [],
    awards: [],
    createdAt: Date.now(),
  };
  log(c, "system", `${c.name} created. Room code ${code}.`);
  return { room: { c, chits: [], tokens: new Map([[t, chairId]]) }, memberId: chairId, token: t };
}

export interface JoinParams {
  name: string;
  role: Role;
  country?: string;
  token?: string;
}

export function joinRoom(room: Room, p: JoinParams): { memberId: string; token: string } | { error: string } {
  const c = room.c;
  if (p.token && room.tokens.has(p.token)) {
    const id = room.tokens.get(p.token)!;
    if (c.members[id]) return { memberId: id, token: p.token };
  }
  if (p.role === "chair") return { error: "This room already has a chair." };
  const name = (p.name ?? "").trim().slice(0, 40);
  if (!name) return { error: "Enter your name." };
  const id = uid();
  const t = token();
  if (p.role === "delegate") {
    const country = c.countries.find((x) => x.name === p.country);
    if (!country) return { error: "Pick a country from the list." };
    if (Object.values(c.members).some((m) => m.country === country.name))
      return { error: `${country.name} is already taken.` };
    c.members[id] = { id, name, role: "delegate", country: country.name, iso: country.iso, attendance: "absent", online: false, placard: false, speeches: 0 };
    log(c, "system", `The delegate of ${country.name} (${name}) has joined.`);
  } else {
    c.members[id] = { id, name, role: "observer", attendance: "absent", online: false, placard: false, speeches: 0 };
    log(c, "system", `${name} joined as an observer.`);
  }
  room.tokens.set(t, id);
  return { memberId: id, token: t };
}

// ---------- what each person sees ----------

export function viewFor(room: Room, meId: string): CommitteeView {
  const c = room.c;
  const isChair = meId === c.chairId;
  const chits = isChair ? room.chits : room.chits.filter((x) => x.fromId === meId || x.toId === meId);
  let vote = c.vote;
  // In a secret (non roll-call) vote, delegates only see their own ballot and the running count.
  if (vote && vote.open && !vote.rollCall && !isChair) {
    const own = vote.ballots[meId];
    vote = { ...vote, ballots: own ? { [meId]: own } : {}, tally: countBallots(vote) };
  } else if (vote) {
    vote = { ...vote, tally: countBallots(vote) };
  }
  return { ...c, vote, chits: chits.slice(-200), serverNow: Date.now(), meId };
}

// ---------- helpers ----------

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}
const delegates = (c: Committee) => Object.values(c.members).filter((m) => m.role === "delegate");
export const eligibleVoters = (c: Committee) =>
  delegates(c).filter((m) => m.attendance !== "absent").sort((a, b) => (a.country ?? "").localeCompare(b.country ?? ""));

function countBallots(v: Vote) {
  const t = { yes: 0, no: 0, abstain: 0 };
  for (const b of Object.values(v.ballots)) if (b === "yes" || b === "no" || b === "abstain") t[b]++;
  return t;
}

function remaining(endsAt: number | null, paused: boolean, remainingMs: number) {
  return paused || endsAt === null ? remainingMs : Math.max(0, endsAt - Date.now());
}

function startSpeaker(c: Committee, memberId: string, kind: Speaker["kind"], seconds: number) {
  const ms = seconds * 1000;
  c.speaker = { memberId, kind, endsAt: Date.now() + ms, remainingMs: ms, paused: false, yieldedToQuestions: false };
  const m = c.members[memberId];
  if (m) { m.placard = false; m.speeches++; }
  c.gsl = c.gsl.filter((x) => x !== memberId);
}

function clearFloor(c: Committee) {
  c.speaker = null;
  for (const m of Object.values(c.members)) m.placard = false;
}

function setMode(c: Committee, mode: Mode) {
  if (c.mode === mode) return;
  const prev = c.mode;
  if (mode !== "modcaucus" && mode !== "unmod") c.caucus = null;
  if (mode === "suspended") c.modeBeforeSuspend = prev;
  clearFloor(c);
  c.mode = mode;
  if (mode === "voting") {
    c.chitsEnabled = false;
    log(c, "system", "Debate is closed. The chamber is sealed: no notes may be passed and no one may enter or leave.");
  } else if (prev === "voting") {
    c.chitsEnabled = true;
    log(c, "system", "Voting procedure has ended. The chamber is unsealed.");
  }
  const text: Partial<Record<Mode, string>> = {
    rollcall: "The Chair will now take the roll call.",
    agenda: "The committee will now set the agenda.",
    gsl: "The General Speakers' List is open.",
    unmod: "Unmoderated caucus has begun.",
    suspended: "The meeting is suspended.",
    adjourned: "The meeting is adjourned. Thank you, delegates.",
  };
  if (text[mode]) log(c, "system", text[mode]!);
}

function startCaucus(c: Committee, kind: "mod" | "unmod", topic: string, totalSec: number, perSpeakerSec: number, proposerId: string) {
  const ms = totalSec * 1000;
  setMode(c, kind === "mod" ? "modcaucus" : "unmod");
  c.caucus = { kind, topic, totalSec, perSpeakerSec, endsAt: Date.now() + ms, remainingMs: ms, paused: false, proposerId };
  if (kind === "mod") {
    log(c, "system", `Moderated caucus on "${topic}": ${fmt(totalSec)} total, ${fmt(perSpeakerSec)} per speaker (proposed by ${who(c, proposerId)}).`);
  }
}

export function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? (s ? `${m} min ${s} s` : `${m} min`) : `${s} s`;
}

function applyMotion(c: Committee, m: Motion) {
  m.status = "passed";
  switch (m.type) {
    case "open_gsl": setMode(c, "gsl"); break;
    case "set_agenda":
      c.agenda = m.topic ?? c.agenda;
      log(c, "system", `The agenda is set to "${c.agenda}".`);
      setMode(c, "gsl");
      break;
    case "mod_caucus": startCaucus(c, "mod", m.topic || "General debate", m.totalSec!, m.perSpeakerSec!, m.proposerId); break;
    case "unmod_caucus": startCaucus(c, "unmod", m.topic || "Unmoderated caucus", m.totalSec!, 0, m.proposerId); break;
    case "extend":
      if (c.caucus) {
        const add = (m.totalSec ?? 0) * 1000;
        c.caucus.totalSec += m.totalSec ?? 0;
        if (c.caucus.paused || c.caucus.endsAt === null) c.caucus.remainingMs += add;
        else c.caucus.endsAt += add;
        log(c, "system", `The caucus is extended by ${fmt(m.totalSec ?? 0)}.`);
      }
      break;
    case "close_debate": setMode(c, "voting"); break;
    case "introduce_dr": {
      const d = c.docs.find((x) => x.id === m.docId);
      if (d && d.status === "approved") introduce(c, d);
      break;
    }
    case "suspend": setMode(c, "suspended"); break;
    case "resume": setMode(c, c.modeBeforeSuspend && c.modeBeforeSuspend !== "suspended" ? c.modeBeforeSuspend : "gsl"); break;
    case "adjourn": setMode(c, "adjourned"); break;
  }
}

function introduce(c: Committee, d: Doc) {
  d.status = "introduced";
  log(c, "system", `${d.number} "${d.title}" is introduced. Sponsors: ${d.sponsors.map((s) => who(c, s)).join(", ")}.`);
}

function applyAmendment(c: Committee, a: Amendment) {
  const d = c.docs.find((x) => x.id === a.docId);
  if (!d) return;
  if (a.action === "add") d.clauses.push({ id: uid(), kind: a.clauseKind ?? "op", text: a.text });
  else if (a.action === "modify") {
    const cl = d.clauses.find((x) => x.id === a.clauseId);
    if (cl) cl.text = a.text;
  } else if (a.action === "strike") d.clauses = d.clauses.filter((x) => x.id !== a.clauseId);
}

function checkFriendly(c: Committee, a: Amendment) {
  const d = c.docs.find((x) => x.id === a.docId);
  if (!d || a.status !== "pending") return;
  if (d.sponsors.every((s) => a.sponsorSupport.includes(s))) {
    a.status = "friendly";
    applyAmendment(c, a);
    log(c, "system", `A friendly amendment to ${d.number} by ${who(c, a.proposerId)} has been added (all sponsors agreed).`);
  }
}

function openVote(c: Committee, v: Omit<Vote, "id" | "rollOrder" | "rollIndex" | "passedOnce" | "ballots" | "open" | "at">) {
  const voters = eligibleVoters(c);
  c.vote = { ...v, id: uid(), rollOrder: v.rollCall ? voters.map((m) => m.id) : [], rollIndex: 0, passedOnce: [], ballots: {}, open: true, at: Date.now() };
  log(c, "system", `Voting on: ${v.label}${v.rollCall ? " (roll call vote)" : ""}.`);
}

function closeVote(c: Committee) {
  const v = c.vote;
  if (!v) return;
  const t = countBallots(v);
  v.tally = t;
  v.open = false;
  let passed: boolean;
  const cast = t.yes + t.no;
  if (v.threshold === "two_thirds") passed = cast > 0 && t.yes >= Math.ceil((2 / 3) * cast);
  else passed = t.yes > t.no;

  if (!v.procedural && c.type === "SC") {
    // Security Council: 9 affirmative votes (scaled down if fewer members present) and no P5 "no".
    const needed = Math.min(9, Math.ceil(0.6 * eligibleVoters(c).length));
    const vetoes = Object.entries(v.ballots)
      .filter(([id, b]) => b === "no" && P5.includes(c.members[id]?.country ?? ""))
      .map(([id]) => id);
    v.vetoedBy = vetoes;
    passed = t.yes >= needed && vetoes.length === 0;
  }
  v.result = passed ? "passed" : "failed";
  const veto = v.vetoedBy?.length ? ` Vetoed by ${v.vetoedBy.map((id) => who(c, id)).join(", ")}.` : "";
  log(c, "system", `${v.label}: ${t.yes} for, ${t.no} against, ${t.abstain} abstaining. The ${v.subject.kind === "motion" ? "motion" : v.subject.kind === "doc" ? "resolution" : "amendment"} ${passed ? "passes" : "fails"}.${veto}`);

  if (v.subject.kind === "motion") {
    const m = c.motions.find((x) => x.id === v.subject.id);
    if (m) passed ? applyMotion(c, m) : (m.status = "failed");
  } else if (v.subject.kind === "amendment") {
    const a = c.amendments.find((x) => x.id === v.subject.id);
    if (a) {
      a.status = passed ? "passed" : "failed";
      if (passed) applyAmendment(c, a);
    }
  } else {
    const d = c.docs.find((x) => x.id === v.subject.id);
    if (d) d.status = passed ? "passed" : "failed";
  }
  c.voteHistory.push(v);
  c.vote = null;
}

function allVoted(c: Committee, v: Vote) {
  return eligibleVoters(c).every((m) => v.ballots[m.id] && v.ballots[m.id] !== "pass");
}

// ---------- the timer tick ----------

export function tick(room: Room): boolean {
  const c = room.c;
  const now = Date.now();
  let changed = false;
  if (c.speaker && !c.speaker.paused && c.speaker.endsAt !== null && c.speaker.endsAt <= now) {
    log(c, "system", `Time has elapsed for ${who(c, c.speaker.memberId)}.`);
    c.speaker = null;
    changed = true;
  }
  if (c.caucus && !c.caucus.paused && c.caucus.endsAt !== null && c.caucus.endsAt <= now) {
    log(c, "system", `The ${c.caucus.kind === "mod" ? "moderated" : "unmoderated"} caucus has expired.`);
    c.caucus = null;
    setMode(c, "gsl");
    changed = true;
  }
  return changed;
}

// ---------- actions ----------

type Result = { error?: string; kicked?: string };

export function act(room: Room, actorId: string, a: Action): Result {
  const c = room.c;
  const me = c.members[actorId];
  if (!me) return { error: "You are not in this committee." };
  const chair = me.role === "chair";
  const delegate = me.role === "delegate";
  const needChair = () => (chair ? null : "Only the Chair can do that.");
  const needDelegate = () => (delegate ? null : "Only delegates can do that.");
  const sealed = c.mode === "voting";
  const err = (e: string | null) => (e ? { error: e } : null);

  switch (a.type) {
    // ----- modes & attendance -----
    case "set_mode": {
      const e = err(needChair()); if (e) return e;
      if (a.mode === "modcaucus" || a.mode === "unmod") {
        startCaucus(c, a.mode === "modcaucus" ? "mod" : "unmod", a.mode === "modcaucus" ? "General debate" : "Unmoderated caucus", 600, 60, actorId);
      } else setMode(c, a.mode);
      return {};
    }
    case "answer_roll": {
      const target = a.memberId && chair ? c.members[a.memberId] : me;
      if (!target || target.role !== "delegate") return { error: "Only delegates answer the roll." };
      if (!chair && c.mode !== "rollcall" && me.attendance !== "absent")
        return { error: "You can only change attendance during roll call." };
      if (!["absent", "present", "present_voting"].includes(a.attendance)) return { error: "Invalid attendance." };
      target.attendance = a.attendance;
      if (a.attendance !== "absent")
        log(c, "system", `${target.country}: ${a.attendance === "present_voting" ? "present and voting" : "present"}${c.mode !== "rollcall" ? " (late arrival)" : ""}.`);
      return {};
    }
    case "set_agenda": {
      const e = err(needChair()); if (e) return e;
      if (!c.topics.includes(a.topic)) return { error: "Unknown topic." };
      c.agenda = a.topic;
      log(c, "system", `The agenda is set to "${a.topic}".`);
      return {};
    }

    // ----- speakers -----
    case "gsl_add": {
      const id = chair && a.memberId ? a.memberId : actorId;
      const m = c.members[id];
      if (!m || m.role !== "delegate") return { error: "Only delegates can be added to the speakers' list." };
      if (c.gsl.includes(id)) return { error: "Already on the speakers' list." };
      c.gsl.push(id);
      return {};
    }
    case "gsl_remove": {
      const id = chair && a.memberId ? a.memberId : actorId;
      c.gsl = c.gsl.filter((x) => x !== id);
      return {};
    }
    case "gsl_next": {
      const e = err(needChair()); if (e) return e;
      if (c.mode !== "gsl") return { error: "The speakers' list is not open." };
      const next = c.gsl[0];
      if (!next) return { error: "The speakers' list is empty." };
      startSpeaker(c, next, "gsl", c.gslSpeakingSec);
      log(c, "system", `${who(c, next)} has the floor for ${fmt(c.gslSpeakingSec)}.`);
      return {};
    }
    case "gsl_set_time": {
      const e = err(needChair()); if (e) return e;
      c.gslSpeakingSec = clamp(a.seconds, 15, 600);
      log(c, "system", `Speaking time on the speakers' list is set to ${fmt(c.gslSpeakingSec)}.`);
      return {};
    }
    case "recognize": {
      const e = err(needChair()); if (e) return e;
      const m = c.members[a.memberId];
      if (!m || m.role !== "delegate") return { error: "Pick a delegate." };
      const secs = c.mode === "modcaucus" && c.caucus ? c.caucus.perSpeakerSec : clamp(a.seconds ?? c.gslSpeakingSec, 10, 600);
      startSpeaker(c, m.id, c.mode === "modcaucus" ? "mod" : "gsl", secs);
      log(c, "system", `The Chair recognizes ${m.country} for ${fmt(secs)}.`);
      return {};
    }
    case "end_speech": {
      if (!c.speaker) return { error: "Nobody has the floor." };
      if (!chair && c.speaker.memberId !== actorId) return { error: "You don't have the floor." };
      log(c, "system", `${who(c, c.speaker.memberId)} ${chair ? "has been thanked by the Chair" : "yields the floor back to the Chair"}.`);
      c.speaker = null;
      return {};
    }
    case "pause_timer":
    case "resume_timer": {
      const e = err(needChair()); if (e) return e;
      const pause = a.type === "pause_timer";
      for (const t of [c.speaker, c.caucus]) {
        if (!t) continue;
        if (pause && !t.paused) { t.remainingMs = remaining(t.endsAt, false, t.remainingMs); t.endsAt = null; t.paused = true; }
        if (!pause && t.paused) { t.endsAt = Date.now() + t.remainingMs; t.paused = false; }
      }
      return {};
    }
    case "yield": {
      const s = c.speaker;
      if (!s || s.memberId !== actorId) return { error: "You don't have the floor." };
      if (a.to === "chair") {
        log(c, "system", `${who(c, actorId)} yields the remaining time to the Chair.`);
        c.speaker = null;
      } else if (a.to === "questions") {
        if (s.kind !== "gsl") return { error: "You can only yield to questions during the speakers' list." };
        s.yieldedToQuestions = true;
        log(c, "system", `${who(c, actorId)} yields to questions. Delegates may raise a Point of Information.`);
      } else {
        if (s.kind !== "gsl") return { error: "Time can only be yielded to another delegate once, on the speakers' list." };
        const to = a.memberId ? c.members[a.memberId] : undefined;
        if (!to || to.role !== "delegate" || to.id === actorId) return { error: "Pick another delegate." };
        const left = remaining(s.endsAt, s.paused, s.remainingMs);
        log(c, "system", `${who(c, actorId)} yields ${fmt(left / 1000)} to ${to.country}.`);
        startSpeaker(c, to.id, "yield", Math.max(5, Math.round(left / 1000)));
      }
      return {};
    }
    case "placard": {
      const e = err(needDelegate()); if (e) return e;
      me.placard = !!a.up;
      return {};
    }
    case "lower_all_placards": {
      const e = err(needChair()); if (e) return e;
      for (const m of Object.values(c.members)) m.placard = false;
      return {};
    }
    case "chair_mic": {
      const e = err(needChair()); if (e) return e;
      c.chairMic = !!a.on;
      return {};
    }
    case "text_speech": {
      const text = (a.text ?? "").trim().slice(0, 4000);
      if (!text) return { error: "Write something first." };
      if (!chair && c.speaker?.memberId !== actorId) return { error: "You can only speak when you have the floor." };
      log(c, "speech", text, actorId);
      return {};
    }
    case "transcript": {
      const text = (a.text ?? "").trim().slice(0, 2000);
      if (!text) return {};
      if (!chair && c.speaker?.memberId !== actorId) return {};
      log(c, "transcript", text, actorId);
      return {};
    }
    case "end_caucus": {
      const e = err(needChair()); if (e) return e;
      if (!c.caucus) return { error: "No caucus is running." };
      log(c, "system", "The Chair has ended the caucus.");
      setMode(c, "gsl");
      return {};
    }

    // ----- motions -----
    case "propose_motion": {
      const e = err(needDelegate()); if (e) return e;
      if (c.mode === "adjourned") return { error: "The meeting is adjourned." };
      if (sealed && !["suspend", "adjourn"].includes(a.motion)) return { error: "During voting procedure only motions to suspend or adjourn are in order." };
      if (c.mode === "suspended" && a.motion !== "resume" && a.motion !== "adjourn") return { error: "The meeting is suspended; move to resume or adjourn." };
      if (c.speaker && c.speaker.memberId !== actorId) return { error: "Wait until the floor is open (no one speaking)." };
      if (c.motions.some((m) => m.proposerId === actorId && m.status === "pending")) return { error: "You already have a motion pending." };
      const m: Motion = { id: uid(), type: a.motion, proposerId: actorId, status: "pending", at: Date.now() };
      if (a.motion === "mod_caucus") {
        if (!a.topic?.trim()) return { error: "A moderated caucus needs a topic." };
        m.topic = a.topic.trim().slice(0, 120);
        m.totalSec = clamp(a.totalSec ?? 600, 60, 3600);
        m.perSpeakerSec = clamp(a.perSpeakerSec ?? 60, 15, 300);
        if (m.perSpeakerSec > m.totalSec) return { error: "Speaking time can't be longer than the caucus." };
      } else if (a.motion === "unmod_caucus") {
        m.topic = a.topic?.trim().slice(0, 120) || undefined;
        m.totalSec = clamp(a.totalSec ?? 900, 60, 3600);
      } else if (a.motion === "extend") {
        if (!c.caucus) return { error: "There is no caucus to extend." };
        m.totalSec = clamp(a.totalSec ?? 300, 30, 1800);
      } else if (a.motion === "set_agenda") {
        if (!a.topic || !c.topics.includes(a.topic)) return { error: "Pick one of the committee topics." };
        m.topic = a.topic;
      } else if (a.motion === "introduce_dr") {
        const d = c.docs.find((x) => x.id === a.docId);
        if (!d || d.status !== "approved") return { error: "Pick a draft resolution approved by the Chair." };
        m.docId = d.id;
      } else if (a.motion === "resume" && c.mode !== "suspended") return { error: "The meeting isn't suspended." };
      c.motions.push(m);
      log(c, "system", `${who(c, actorId)} moves: ${describeMotion(c, m)}.`);
      return {};
    }
    case "withdraw_motion": {
      const m = c.motions.find((x) => x.id === a.id);
      if (!m || m.proposerId !== actorId || m.status !== "pending") return { error: "You can't withdraw that motion." };
      m.status = "withdrawn";
      log(c, "system", `${who(c, actorId)} withdraws their motion.`);
      return {};
    }
    case "rule_motion": {
      const e = err(needChair()); if (e) return e;
      const m = c.motions.find((x) => x.id === a.id);
      if (!m || m.status !== "pending") return { error: "That motion is not pending." };
      if (a.ruling === "vote") {
        if (c.vote) return { error: "Another vote is already open." };
        m.status = "voting";
        openVote(c, {
          subject: { kind: "motion", id: m.id },
          label: describeMotion(c, m),
          procedural: true,
          threshold: m.type === "close_debate" ? "two_thirds" : "simple",
          rollCall: false,
        });
      } else if (a.ruling === "pass") {
        log(c, "system", `With no objection, the motion (${MOTION_LABEL[m.type]}) passes.`);
        applyMotion(c, m);
      } else if (a.ruling === "fail") {
        m.status = "failed";
        log(c, "system", `The motion (${MOTION_LABEL[m.type]}) fails.`);
      } else {
        m.status = "out_of_order";
        log(c, "system", `The Chair rules the motion (${MOTION_LABEL[m.type]}) out of order.`);
      }
      return {};
    }

    // ----- points -----
    case "raise_point": {
      if (me.role === "observer") return { error: "Observers can't raise points." };
      const text = (a.text ?? "").trim().slice(0, 600);
      if (a.point === "information") {
        if (!c.speaker?.yieldedToQuestions) return { error: "The speaker has not yielded to questions." };
        if (c.speaker.memberId === actorId) return { error: "You can't question yourself." };
        if (!text) return { error: "Write your question." };
        log(c, "question", `Point of Information to ${who(c, c.speaker.memberId)}: ${text}`, actorId);
        return {};
      }
      c.points.push({ id: uid(), type: a.point, fromId: actorId, text, status: "open", at: Date.now() });
      const names = { personal_privilege: "Point of Personal Privilege", order: "Point of Order", inquiry: "Point of Parliamentary Inquiry" } as const;
      log(c, "system", `${who(c, actorId)} rises to a ${names[a.point]}.`);
      return {};
    }
    case "resolve_point": {
      const e = err(needChair()); if (e) return e;
      const p = c.points.find((x) => x.id === a.id);
      if (!p || p.status !== "open") return { error: "That point is already handled." };
      p.status = "resolved";
      p.response = (a.response ?? "").trim().slice(0, 600);
      if (p.response) log(c, "chair", `To ${who(c, p.fromId)}: ${p.response}`, actorId);
      return {};
    }

    // ----- documents -----
    case "doc_create": {
      const e = err(needDelegate()); if (e) return e;
      if (sealed) return { error: "No new papers during voting procedure." };
      const title = (a.title ?? "").trim().slice(0, 120);
      if (!title) return { error: "Give the paper a title." };
      const d: Doc = { id: uid(), kind: "wp", title, authorId: actorId, sponsors: [actorId], signatories: [], clauses: [], status: "draft", at: Date.now() };
      c.docs.push(d);
      return {};
    }
    case "doc_update": {
      const d = c.docs.find((x) => x.id === a.id);
      if (!d) return { error: "Paper not found." };
      if (!d.sponsors.includes(actorId)) return { error: "Only sponsors can edit." };
      if (d.status !== "draft") return { error: "This paper is locked. Changes now need amendments." };
      if (a.title !== undefined) d.title = a.title.trim().slice(0, 120) || d.title;
      if (a.clauses) d.clauses = sanitizeClauses(a.clauses);
      return {};
    }
    case "doc_join": {
      const e = err(needDelegate()); if (e) return e;
      const d = c.docs.find((x) => x.id === a.id);
      if (!d) return { error: "Paper not found." };
      if (!["draft", "submitted", "approved"].includes(d.status)) return { error: "Sponsors and signatories are final once a paper is introduced." };
      if (d.authorId === actorId) return { error: "The author is always a sponsor." };
      d.sponsors = d.sponsors.filter((x) => x !== actorId);
      d.signatories = d.signatories.filter((x) => x !== actorId);
      if (a.as === "sponsor") d.sponsors.push(actorId);
      if (a.as === "signatory") d.signatories.push(actorId);
      return {};
    }
    case "doc_submit": {
      const d = c.docs.find((x) => x.id === a.id);
      if (!d || !d.sponsors.includes(actorId)) return { error: "Only sponsors can submit." };
      if (d.status !== "draft") return { error: "Already submitted." };
      if (!d.clauses.some((x) => x.kind === "op" && x.text.trim())) return { error: "Add at least one operative clause first." };
      d.status = "submitted";
      log(c, "system", `${who(c, actorId)} submits "${d.title}" to the Chair.`);
      return {};
    }
    case "doc_review": {
      const e = err(needChair()); if (e) return e;
      const d = c.docs.find((x) => x.id === a.id);
      if (!d || d.status !== "submitted") return { error: "Nothing to review." };
      if (a.decision === "approve") {
        const topicNo = Math.max(1, c.agenda ? c.topics.indexOf(c.agenda) + 1 : 1);
        const n = c.docs.filter((x) => x.kind === "dr").length + 1;
        d.kind = "dr";
        d.number = `DR ${topicNo}.${n}`;
        d.status = "approved";
        log(c, "system", `The Chair approves "${d.title}" as ${d.number}.`);
      } else {
        d.status = "draft";
        log(c, "system", `The Chair returns "${d.title}" to its sponsors for changes.`);
      }
      return {};
    }
    case "doc_introduce": {
      const e = err(needChair()); if (e) return e;
      const d = c.docs.find((x) => x.id === a.id);
      if (!d || d.status !== "approved") return { error: "Only approved draft resolutions can be introduced." };
      introduce(c, d);
      return {};
    }
    case "amend_propose": {
      const e = err(needDelegate()); if (e) return e;
      if (sealed) return { error: "Amendments must be submitted before debate is closed." };
      const d = c.docs.find((x) => x.id === a.docId);
      if (!d || d.status !== "introduced") return { error: "You can only amend an introduced draft resolution." };
      const text = (a.text ?? "").trim().slice(0, 1500);
      if (a.action !== "strike" && !text) return { error: "Write the amendment text." };
      if (a.action !== "add" && !d.clauses.some((x) => x.id === a.clauseId)) return { error: "Pick a clause." };
      const am: Amendment = {
        id: uid(), docId: d.id, proposerId: actorId, action: a.action, clauseId: a.clauseId,
        clauseKind: a.clauseKind ?? "op", text, sponsorSupport: d.sponsors.includes(actorId) ? [actorId] : [],
        status: "pending", at: Date.now(),
      };
      c.amendments.push(am);
      log(c, "system", `${who(c, actorId)} proposes an amendment to ${d.number}.`);
      checkFriendly(c, am);
      return {};
    }
    case "amend_support": {
      const am = c.amendments.find((x) => x.id === a.id);
      const d = am && c.docs.find((x) => x.id === am.docId);
      if (!am || !d || am.status !== "pending") return { error: "Amendment not open." };
      if (!d.sponsors.includes(actorId)) return { error: "Only sponsors of the resolution can agree to an amendment." };
      if (!am.sponsorSupport.includes(actorId)) am.sponsorSupport.push(actorId);
      checkFriendly(c, am);
      return {};
    }
    case "amend_reject": {
      const e = err(needChair()); if (e) return e;
      const am = c.amendments.find((x) => x.id === a.id);
      if (!am || am.status !== "pending") return { error: "Amendment not open." };
      am.status = "rejected";
      return {};
    }

    // ----- voting -----
    case "vote_open": {
      const e = err(needChair()); if (e) return e;
      if (c.vote) return { error: "A vote is already open." };
      if (c.mode !== "voting") return { error: "Substantive votes happen in voting procedure. Close debate first." };
      if (eligibleVoters(c).length === 0) return { error: "No delegates are marked present. Take the roll call first." };
      if (a.subject.kind === "amendment") {
        const am = c.amendments.find((x) => x.id === a.subject.id);
        if (!am || am.status !== "pending") return { error: "That amendment is not pending." };
        const d = c.docs.find((x) => x.id === am.docId);
        openVote(c, { subject: a.subject, label: `Unfriendly amendment to ${d?.number} by ${who(c, am.proposerId)}`, procedural: false, threshold: a.threshold ?? "simple", rollCall: a.rollCall });
      } else {
        const d = c.docs.find((x) => x.id === a.subject.id);
        if (!d || d.status !== "introduced") return { error: "That resolution is not on the floor." };
        if (c.amendments.some((x) => x.docId === d.id && x.status === "pending"))
          return { error: "Vote on (or reject) the pending amendments to this resolution first." };
        openVote(c, { subject: a.subject, label: `${d.number} "${d.title}"`, procedural: false, threshold: a.threshold ?? "simple", rollCall: a.rollCall });
      }
      return {};
    }
    case "vote_cast": {
      const v = c.vote;
      if (!v || !v.open) return { error: "No vote is open." };
      if (!eligibleVoters(c).some((m) => m.id === actorId)) return { error: "Only delegates marked present can vote." };
      const b: Ballot = a.ballot;
      if (!["yes", "no", "abstain", "pass"].includes(b)) return { error: "Invalid vote." };
      if (v.procedural && (b === "abstain" || b === "pass")) return { error: "No abstentions on procedural votes." };
      if (b === "abstain" && me.attendance === "present_voting") return { error: "You answered \"present and voting\", so you can't abstain." };
      if (v.rollCall) {
        if (v.rollOrder[v.rollIndex] !== actorId) return { error: "Wait until the Chair calls your country." };
        if (b === "pass") {
          if (v.passedOnce.includes(actorId)) return { error: "You can only pass once." };
          v.passedOnce.push(actorId);
          v.rollOrder.push(actorId);
        }
        v.ballots[actorId] = b;
        v.rollIndex++;
        if (v.rollIndex >= v.rollOrder.length) closeVote(c);
      } else {
        if (b === "pass") return { error: "Passing is only allowed in a roll call vote." };
        v.ballots[actorId] = b;
        if (allVoted(c, v)) closeVote(c);
      }
      return {};
    }
    case "vote_close": {
      const e = err(needChair()); if (e) return e;
      if (!c.vote) return { error: "No vote is open." };
      closeVote(c);
      return {};
    }

    // ----- chits, notes, awards -----
    case "chit_send": {
      if (me.role === "observer") return { error: "Observers can't send notes." };
      if (!c.chitsEnabled && !chair) return { error: "Note passing is suspended." };
      const text = (a.text ?? "").trim().slice(0, 500);
      if (!text) return { error: "Write a note." };
      const toId = a.toId === "chair" ? c.chairId : a.toId;
      if (!c.members[toId] || toId === actorId) return { error: "Pick who the note is for." };
      room.chits.push({ id: uid(), fromId: actorId, toId, text, at: Date.now() });
      if (room.chits.length > 2000) room.chits.splice(0, 500);
      return {};
    }
    case "set_layout": {
      const e = err(needChair()); if (e) return e;
      if (!LAYOUT_IDS.includes(a.layout)) return { error: "Unknown room style." };
      if (c.layout === a.layout) return {};
      c.layout = a.layout;
      log(c, "system", `The committee moves to the ${layoutName(a.layout)}.`);
      return {};
    }
    case "chits_enabled": {
      const e = err(needChair()); if (e) return e;
      c.chitsEnabled = !!a.on;
      log(c, "system", `Note passing is ${a.on ? "open" : "suspended"}.`);
      return {};
    }
    case "chair_note": {
      const e = err(needChair()); if (e) return e;
      const text = (a.text ?? "").trim().slice(0, 1000);
      if (text) log(c, "chair", text, actorId);
      return {};
    }
    case "award": {
      const e = err(needChair()); if (e) return e;
      const m = c.members[a.memberId];
      if (!m || m.role !== "delegate") return { error: "Pick a delegate." };
      c.awards = c.awards.filter((x) => x.memberId !== a.memberId);
      if (a.award) c.awards.push({ memberId: a.memberId, award: a.award.slice(0, 60) });
      return {};
    }
    case "kick": {
      const e = err(needChair()); if (e) return e;
      const m = c.members[a.memberId];
      if (!m || m.role === "chair") return { error: "Can't remove that member." };
      delete c.members[a.memberId];
      c.gsl = c.gsl.filter((x) => x !== a.memberId);
      if (c.speaker?.memberId === a.memberId) c.speaker = null;
      for (const [t, id] of room.tokens) if (id === a.memberId) room.tokens.delete(t);
      log(c, "system", `${m.country ?? m.name} has been removed by the Chair.`);
      return { kicked: a.memberId };
    }
  }
  return { error: "Unknown action." };
}

export function describeMotion(c: Committee, m: Motion): string {
  switch (m.type) {
    case "mod_caucus": return `Moderated caucus on "${m.topic}", ${fmt(m.totalSec!)} total, ${fmt(m.perSpeakerSec!)} per speaker`;
    case "unmod_caucus": return `Unmoderated caucus for ${fmt(m.totalSec!)}${m.topic ? ` (${m.topic})` : ""}`;
    case "extend": return `Extend the caucus by ${fmt(m.totalSec!)}`;
    case "set_agenda": return `Set the agenda to "${m.topic}"`;
    case "introduce_dr": {
      const d = c.docs.find((x) => x.id === m.docId);
      return `Introduce ${d?.number ?? "draft resolution"}${d ? ` "${d.title}"` : ""}`;
    }
    default: return MOTION_LABEL[m.type];
  }
}

function sanitizeClauses(list: Clause[]): Clause[] {
  return (Array.isArray(list) ? list : []).slice(0, 80).map((x) => ({
    id: typeof x.id === "string" && x.id ? x.id.slice(0, 20) : uid(),
    kind: x.kind === "pre" ? "pre" : "op",
    text: String(x.text ?? "").slice(0, 1500),
  }));
}

export function online(c: Committee, members: Iterable<string>) {
  const set = new Set(members);
  for (const m of Object.values(c.members) as Member[]) m.online = set.has(m.id);
}
