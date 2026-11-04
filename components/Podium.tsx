"use client";

import { flag } from "@/lib/countries";
import type { CommitteeView } from "@/lib/types";
import { useTicker } from "./useCommittee";

export function left(t: { endsAt: number | null; remainingMs: number; paused: boolean } | null, now: number) {
  if (!t) return 0;
  return t.paused || t.endsAt === null ? t.remainingMs : Math.max(0, t.endsAt - now);
}

export const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function Podium({ state, now, compact }: { state: CommitteeView; now: () => number; compact?: boolean }) {
  useTicker(250);
  const sp = state.speaker;
  const m = sp ? state.members[sp.memberId] : null;
  const ms = left(sp, now());
  const total = sp ? (sp.kind === "mod" && state.caucus ? state.caucus.perSpeakerSec : state.gslSpeakingSec) * 1000 : 1;
  const pct = sp ? Math.max(0, Math.min(1, ms / Math.max(total, ms))) : 0;
  const low = !!sp && ms < 10_000;
  const chair = state.members[state.chairId];
  const idle = state.mode === "unmod" ? "Unmoderated caucus" : state.mode === "voting" ? "Voting procedure" : state.mode === "suspended" ? "Session suspended" : state.mode === "adjourned" ? "Session adjourned" : "The floor is open";
  const sub = m
    ? [m.name, sp!.kind === "yield" && "yielded time", sp!.yieldedToQuestions && "open to questions", sp!.paused && "timer paused"].filter(Boolean).join(" · ")
    : state.mode === "gsl" ? "The Chair will call the next speaker" : state.mode === "modcaucus" ? "Raise your placard to be recognized" : state.mode === "unmod" ? "Talk with other delegates and draft papers" : "";
  const mic = state.chairMic && (
    <span className="inline-flex items-center gap-1 rounded-full bg-un/15 px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-un">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-un" /> {chair?.name ?? "Chair"} speaking
    </span>
  );
  const bar = m && (
    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
      <div className={`h-full transition-[width] duration-200 ${low ? "bg-red-400" : "bg-gold"}`} style={{ width: `${pct * 100}%` }} />
    </div>
  );

  // Small card that sits in the middle of round rooms.
  if (compact) {
    return (
      <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-gold/30 bg-panel/90 px-2.5 pb-2.5 pt-1.5 text-center shadow-[0_0_30px_-12px_var(--gold)] backdrop-blur-sm">
        <div className="flex items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-gold/80">The floor {mic}</div>
        {m ? (
          <>
            <div className="mt-0.5 flex items-center justify-center gap-1.5">
              <span>{flag(m.iso)}</span>
              <span className="truncate font-serif text-sm font-semibold">{m.country}</span>
            </div>
            <div className={`tabular font-mono text-2xl font-semibold leading-tight ${low ? "text-red-300" : "text-fg"}`}>{clock(ms)}</div>
            {sp!.paused && <div className="text-[10px] font-medium text-amber-300">paused</div>}
          </>
        ) : (
          <div className="py-1 font-serif text-sm text-muted">{idle}</div>
        )}
        {bar}
      </div>
    );
  }

  // Slim strip under the seats.
  return (
    <div className="relative mx-auto flex w-full max-w-md items-center gap-3 overflow-hidden rounded-xl border border-gold/30 bg-panel/90 px-3.5 py-2 shadow-[0_0_30px_-12px_var(--gold)] backdrop-blur-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-gold/80">The floor {mic}</div>
        {m ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-lg leading-none">{flag(m.iso)}</span>
            <span className="truncate font-serif text-lg font-semibold">{m.country}</span>
          </div>
        ) : (
          <div className="truncate font-serif text-base text-muted">{idle}</div>
        )}
        {sub && <div className={`truncate text-[11px] ${sp?.paused ? "text-amber-300" : "text-muted"}`}>{sub}</div>}
      </div>
      {m && <div className={`tabular shrink-0 font-mono text-3xl font-semibold ${low ? "text-red-300" : "text-fg"}`}>{clock(ms)}</div>}
      {bar}
    </div>
  );
}

export function CaucusTimer({ state, now }: { state: CommitteeView; now: () => number }) {
  useTicker(500);
  const c = state.caucus;
  if (!c) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-un/30 bg-un/10 px-2.5 py-1.5 text-sm">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-un">{c.kind === "mod" ? "Moderated caucus" : "Unmoderated caucus"}</div>
        <div className="truncate">{c.topic}</div>
        {c.kind === "mod" && <div className="text-xs text-muted">{c.perSpeakerSec}s per speaker</div>}
      </div>
      <div className="text-right">
        <div className="tabular font-mono text-xl font-semibold">{clock(left(c, now()))}</div>
        {c.paused && <div className="text-[10px] text-amber-700">paused</div>}
      </div>
    </div>
  );
}
