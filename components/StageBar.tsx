"use client";

import type { Mode } from "@/lib/types";

export const STAGES: { mode: Mode; label: string }[] = [
  { mode: "lobby", label: "Lobby" },
  { mode: "rollcall", label: "Roll call" },
  { mode: "agenda", label: "Agenda" },
  { mode: "gsl", label: "Speakers' list" },
  { mode: "modcaucus", label: "Mod caucus" },
  { mode: "unmod", label: "Unmod caucus" },
  { mode: "voting", label: "Voting" },
  { mode: "adjourned", label: "Adjourned" },
];

export default function StageBar({ mode, onPick }: { mode: Mode; onPick?: (m: Mode) => void }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label="Session stage">
      {STAGES.map((s) => {
        const active = s.mode === mode;
        return (
          <button
            key={s.mode}
            disabled={!onPick}
            onClick={() => onPick?.(s.mode)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
              active ? "border-gold bg-gold/15 font-semibold text-gold" : "border-line text-muted enabled:hover:bg-black/5"
            } disabled:cursor-default`}
            title={onPick ? `Switch to ${s.label}` : undefined}
          >
            {s.label}
          </button>
        );
      })}
      {mode === "suspended" && <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs text-amber-700">Suspended</span>}
    </nav>
  );
}
