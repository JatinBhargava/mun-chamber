"use client";

import { useEffect, useRef } from "react";
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
  const nav = useRef<HTMLElement>(null);
  // On narrow screens, keep the current stage in view (scrolls the bar only, never the page).
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>("[aria-current]");
    if (nav.current && el) nav.current.scrollTo({ left: el.offsetLeft - (nav.current.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
  }, [mode]);
  return (
    <nav ref={nav} className="no-scrollbar relative flex max-w-full gap-0.5 overflow-x-auto rounded-xl border border-line bg-ink p-0.5" aria-label="Session stage">
      {STAGES.map((s) => {
        const active = s.mode === mode;
        return (
          <button
            key={s.mode}
            disabled={!onPick}
            onClick={() => onPick?.(s.mode)}
            aria-current={active ? "step" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-xs font-semibold transition ${
              active ? "bg-panel text-gold shadow-sm ring-1 ring-line" : "text-muted enabled:hover:bg-panel/70 enabled:hover:text-fg"
            } disabled:cursor-default`}
            title={onPick ? `Switch to ${s.label}` : undefined}
          >
            {active && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />}
            {s.label}
          </button>
        );
      })}
      {mode === "suspended" && <span className="flex shrink-0 items-center rounded-[10px] bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Suspended</span>}
    </nav>
  );
}
