"use client";

// Start an AI practice round: the student picks a name, a country and a topic.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input, Label, Select } from "@/components/ui";
import { api, saveSession } from "@/lib/client";
import { flag } from "@/lib/countries";
import { CLEAN_BLOCK, CLEAN_BLOCK_BG } from "@/lib/layouts";
import { PRACTICE_COUNTRIES, PRACTICE_STEPS, PRACTICE_TOPICS } from "@/lib/practice";

const OTHER = "__other__";

export default function PracticePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [topic, setTopic] = useState(PRACTICE_TOPICS[0]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalTopic = topic === OTHER ? custom.trim() : topic;

  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await api<{ code: string; memberId: string; token: string }>("/api/practice", { name, country, topic: finalTopic });
    if (res.error) { setBusy(false); return setError(res.error); }
    saveSession(res.code, { token: res.token, memberId: res.memberId, name });
    router.push(`/room/${res.code}`);
  };

  return (
    <div style={{ ...CLEAN_BLOCK, background: CLEAN_BLOCK_BG }} className="min-h-dvh">
      <header className="border-b border-line bg-white/90">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 text-fg no-underline">
            <svg width="34" height="27" viewBox="0 0 40 32" aria-hidden><rect x="8" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="23" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="2" y="7" width="36" height="23" rx="5" fill="#d62839" /></svg>
            <span className="text-xl font-extrabold" style={{ fontFamily: "var(--display)" }}>MUN Chamber</span>
          </Link>
          <Link href="/#join" className="text-sm font-bold text-muted hover:text-fg">Have a code? Join</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1000px] gap-8 px-4 py-10 md:grid-cols-[1fr_380px] md:py-14">
        <section>
          <div className="text-sm font-bold text-[#15803d]">🤖 Practice with AI</div>
          <h1 className="mt-2 text-[clamp(36px,5vw,54px)] font-extrabold leading-[1] text-balance" style={{ fontFamily: "var(--display)" }}>
            A full committee round, just for you.
          </h1>
          <p className="mt-4 max-w-[32em] text-lg text-muted">
            An AI Chair runs every stage of a real committee and four AI delegates argue their countries' real positions. You answer the roll, set the agenda, speak and take questions, caucus, write and amend a resolution, vote, and get feedback at the end.
          </p>

          <ol className="mt-7 grid max-w-[34em] gap-2 sm:grid-cols-2">
            {PRACTICE_STEPS.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold" style={{ boxShadow: "0 2px 0 var(--line)" }}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#15803d] text-xs font-bold text-white">{i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>

          <ul className="mt-7 max-w-[34em] space-y-1.5 text-sm text-muted">
            <li>⏱ About 25 minutes. You can leave and come back to the same round.</li>
            <li>🎙 Use a microphone to speak aloud (live captions let the AI hear you), or type your speeches.</li>
            <li>🔊 AI delegates speak out loud. Use headphones if others are around.</li>
            <li>🔒 Practice rooms are private. Don't share personal details in your speeches.</li>
          </ul>
        </section>

        <section className="h-fit rounded-2xl border border-line bg-white p-5" style={{ boxShadow: "0 5px 0 var(--line)" }}>
          <h2 className="text-xl font-extrabold" style={{ fontFamily: "var(--display)" }}>Set up your round</h2>
          <form className="mt-4 space-y-3.5" onSubmit={(e) => { e.preventDefault(); start(); }}>
            <div>
              <Label>Your name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name is fine" maxLength={40} required />
            </div>
            <div>
              <Label>Your country</Label>
              <Select value={country} onChange={(e) => setCountry(e.target.value)} required>
                <option value="">Choose a country…</option>
                {PRACTICE_COUNTRIES.map((c) => <option key={c.name} value={c.name}>{flag(c.iso)} {c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Topic</Label>
              <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
                {PRACTICE_TOPICS.map((t) => <option key={t}>{t}</option>)}
                <option value={OTHER}>Another topic…</option>
              </Select>
              {topic === OTHER && (
                <Input className="mt-2" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Water security in the Nile basin" maxLength={120} autoFocus />
              )}
            </div>
            {error && <p className="text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={busy || !name.trim() || !country || finalTopic.length < 6}
              className="w-full rounded-[14px] bg-[#15803d] px-6 py-3 text-xl font-extrabold text-white transition active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ boxShadow: "0 6px 0 #0d5527", fontFamily: '"Baloo 2", system-ui, sans-serif' }}
            >
              {busy ? "Setting up the room…" : "Start practice"}
            </button>
            <p className="text-center text-xs text-muted">The AI delegates are played by Claude, an AI model by Anthropic.</p>
          </form>
        </section>
      </main>
    </div>
  );
}
