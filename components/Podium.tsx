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
  const low = sp && ms < 10_000;
  const chair = state.members[state.chairId];

  return (
    <div className={`mx-auto w-full rounded-2xl border border-gold/30 bg-gradient-to-b from-panel to-ink text-center shadow-[0_0_40px_-12px_var(--gold)] ${compact ? "px-3 py-2.5" : "max-w-sm px-5 py-4"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold/80">The floor</div>
      {m ? (
        <>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className={compact ? "text-lg" : "text-2xl"}>{flag(m.iso)}</span>
            <span className={`truncate font-serif font-semibold ${compact ? "text-base" : "text-xl"}`}>{m.country}</span>
          </div>
          <div className="text-xs text-muted">
            {m.name}
            {sp!.kind === "yield" && " · yielded time"}
            {sp!.yieldedToQuestions && " · open to questions"}
          </div>
          <div className={`tabular font-mono font-semibold ${compact ? "mt-1 text-3xl" : "mt-2 text-4xl"} ${low ? "text-red-300" : "text-fg"}`}>{clock(ms)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full transition-[width] duration-200 ${low ? "bg-red-400" : "bg-gold"}`} style={{ width: `${pct * 100}%` }} />
          </div>
          {sp!.paused && <div className="mt-2 text-xs font-medium text-amber-300">Timer paused by the Chair</div>}
        </>
      ) : (
        <div className={compact ? "py-1.5" : "py-3"}>
          <div className={`font-serif text-muted ${compact ? "text-base" : "text-lg"}`}>{state.mode === "unmod" ? "Unmoderated caucus" : state.mode === "voting" ? "Voting procedure" : "The floor is open"}</div>
          <div className={`text-xs text-muted/70 ${compact ? "hidden lg:block" : ""}`}>
            {state.mode === "gsl" ? "The Chair will call the next speaker." : state.mode === "modcaucus" ? "Raise your placard to be recognized." : state.mode === "unmod" ? "Talk with other delegates and draft papers." : ""}
          </div>
        </div>
      )}
      {state.chairMic && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-un/15 px-2.5 py-1 text-xs text-un">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-un" /> {chair?.name ?? "The Chair"} is speaking
        </div>
      )}
    </div>
  );
}

export function CaucusTimer({ state, now }: { state: CommitteeView; now: () => number }) {
  useTicker(500);
  const c = state.caucus;
  if (!c) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-un/30 bg-un/10 px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-un">{c.kind === "mod" ? "Moderated caucus" : "Unmoderated caucus"}</div>
        <div className="truncate">{c.topic}</div>
        {c.kind === "mod" && <div className="text-xs text-muted">{c.perSpeakerSec}s per speaker</div>}
      </div>
      <div className="text-right">
        <div className="tabular font-mono text-xl font-semibold">{clock(left(c, now()))}</div>
        {c.paused && <div className="text-[10px] text-amber-300">paused</div>}
      </div>
    </div>
  );
}
