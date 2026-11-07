"use client";

// In-room pieces for AI practice rounds: the coaching strip, AI voices, and the feedback card.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flag } from "@/lib/countries";
import { PRACTICE_STEPS, practiceHint } from "@/lib/practice";
import type { CommitteeView } from "@/lib/types";
import { SHADOW } from "./ui";

export function PracticeCoach({ state, voices, setVoices }: { state: CommitteeView; voices: boolean; setVoices: (on: boolean) => void }) {
  const p = state.practice!;
  const current = PRACTICE_STEPS.findIndex((s) => s.stages.includes(p.stage));
  const thinker = p.thinking ? state.members[p.thinking] : null;

  return (
    <section className="rounded-2xl border border-[#15803d]/30 bg-panel p-3" style={SHADOW} aria-label="Practice round">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[#15803d]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#15803d]">AI practice</span>
        <ol className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Round progress">
          {PRACTICE_STEPS.map((s, i) => (
            <li key={s.label} aria-current={i === current ? "step" : undefined} className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${i === current ? "bg-[#15803d] text-white" : i < current ? "text-[#15803d]" : "text-muted"}`}>
              {i < current ? "✓" : `${i + 1}.`} {s.label}
            </li>
          ))}
        </ol>
        <button
          onClick={() => setVoices(!voices)}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-xs font-bold text-muted transition hover:text-fg"
          title="Read AI speeches aloud"
          aria-pressed={voices}
        >
          {voices ? "🔊 Voices on" : "🔇 Voices off"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-[13px] font-semibold text-fg">👉 {practiceHint(state)}</p>
        {thinker && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="flex gap-0.5" aria-hidden>
              {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#15803d]" style={{ animationDelay: `${i * 120}ms` }} />)}
            </span>
            {thinker.role === "chair" ? "The Chair" : `${flag(thinker.iso)} ${thinker.country}`} is writing…
          </span>
        )}
      </div>
    </section>
  );
}

export function FeedbackCard({ state }: { state: CommitteeView }) {
  const fb = state.practice?.feedback;
  if (!fb) return null;
  const me = state.members[state.meId];
  const list = (title: string, items: string[], tone: string) => items.length > 0 && (
    <div>
      <div className={`mb-1 text-[11px] font-bold uppercase tracking-wider ${tone}`}>{title}</div>
      <ul className="space-y-1 text-[13px] leading-snug">
        {items.map((x) => <li key={x} className="flex gap-1.5"><span aria-hidden>•</span>{x}</li>)}
      </ul>
    </div>
  );
  return (
    <section className="rounded-2xl border-2 border-[#15803d]/40 bg-panel p-4" style={{ boxShadow: "0 4px 0 color-mix(in srgb, #15803d 35%, transparent)" }} aria-label="Your feedback">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#15803d] text-white" style={{ boxShadow: "0 4px 0 #0d5527" }}>
          <div className="text-center leading-none">
            <div className="text-2xl font-extrabold" style={{ fontFamily: "var(--display)" }}>{fb.score}</div>
            <div className="text-[10px] font-semibold opacity-80">out of 10</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#15803d]">Feedback for {flag(me?.iso)} {me?.country}</div>
          <h2 className="text-lg font-extrabold leading-snug" style={{ fontFamily: "var(--display)" }}>{fb.headline}</h2>
        </div>
        <Link href="/practice" className="rounded-xl bg-[#15803d] px-4 py-2 text-sm font-bold text-white no-underline" style={{ boxShadow: "0 3px 0 #0d5527" }}>
          Practice again
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {list("What went well", fb.strengths, "text-[#15803d]")}
        {list("Work on next", fb.improvements, "text-gold")}
        {list("Procedure tips", fb.procedureTips, "text-un")}
      </div>
      {fb.bestMoment && <p className="mt-4 rounded-lg bg-ink px-3 py-2 text-[13px]"><span className="font-bold">⭐ Best moment:</span> {fb.bestMoment}</p>}
    </section>
  );
}

/**
 * Reads new AI speeches, questions and Chair announcements aloud with the browser's built-in voices.
 * Each country gets its own voice. Only lines that arrive after the page opened are read.
 */
export function useAiVoices(state: CommitteeView | null) {
  const [on, setOn] = useState(true);
  const seen = useRef<string | null>(null);
  const practice = !!state?.practice;

  useEffect(() => {
    try { if (localStorage.getItem("mun:voices") === "off") setOn(false); } catch {}
  }, []);
  const set = (v: boolean) => {
    setOn(v);
    try { localStorage.setItem("mun:voices", v ? "on" : "off"); } catch {}
    if (!v && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  };

  useEffect(() => {
    if (!state || !practice || typeof speechSynthesis === "undefined") return;
    const log = state.log;
    const last = log.at(-1)?.id ?? null;
    if (seen.current === null) { seen.current = last ?? ""; return; } // don't read history on load
    const from = log.findIndex((l) => l.id === seen.current) + 1;
    seen.current = last;
    if (!on) return;
    for (const l of log.slice(from)) {
      const m = l.memberId ? state.members[l.memberId] : undefined;
      if (!m?.ai || (l.kind !== "speech" && l.kind !== "chair" && l.kind !== "question")) continue;
      const u = new SpeechSynthesisUtterance(l.text);
      const voice = pickVoice(m.role === "chair" ? "chair" : m.country ?? m.id);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = 1.03;
      speechSynthesis.speak(u);
    }
  }, [state, practice, on]);

  // Stop talking when leaving the room.
  useEffect(() => () => { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, []);

  return { on, set };
}

// macOS ships joke voices that sing, giggle or warble instead of speaking, plus a few very robotic old ones.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Fred|Good News|Hysterical|Jester|Junior|Kathy|Organ|Pipe Organ|Princess|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;
// Voices that usually sound the most natural.
const GOOD = /Google|Microsoft|Natural|Neural|Enhanced|Premium|Siri|Samantha|Daniel|Karen|Moira|Tessa|Rishi|Serena|Arthur|Martha/i;

function pickVoice(key: string): SpeechSynthesisVoice | undefined {
  const english = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en") && !NOVELTY.test(v.name));
  const good = english.filter((v) => GOOD.test(v.name));
  const all = good.length >= 3 ? good : english; // enough good voices to tell speakers apart, else any real one
  if (!all.length) return undefined;
  if (key === "chair") return all.find((v) => /en-gb/i.test(v.lang)) ?? all[0];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return all[h % all.length];
}
