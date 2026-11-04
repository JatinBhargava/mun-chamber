"use client";

// Home page in the "Clean Block" style (landing page E): white and airy, with toy-brick
// buttons, block figures at desks, and the real create / join forms further down.

import { useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import JoinForm from "@/components/JoinForm";
import { LayoutPreview } from "@/components/RoomMap";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { api, saveSession } from "@/lib/client";
import { flag, UNGA, UNSC } from "@/lib/countries";
import { figureSvg } from "@/lib/figureSvg";
import { CLEAN_BLOCK, LAYOUTS, type LayoutId } from "@/lib/layouts";
import type { CommitteeType } from "@/lib/types";

const LIGHT = { ...CLEAN_BLOCK, background: "#ffffff" } as CSSProperties;

const DOTS = "radial-gradient(circle at 1px 1px, rgba(29,78,216,0.12) 1.5px, transparent 2px) 0 0 / 22px 22px, #eef6ff";

const BRICK = {
  red: { bg: "#d62839", shadow: "#8f1622", fg: "#ffffff" },
  yellow: { bg: "#ffcf3a", shadow: "#c99a12", fg: "#10213a" },
  blue: { bg: "#1d4ed8", shadow: "#133690", fg: "#ffffff" },
  green: { bg: "#15803d", shadow: "#0d5527", fg: "#ffffff" },
};
type BrickColor = keyof typeof BRICK;

function Studs({ color, size = "sm" }: { color: string; size?: "sm" | "lg" }) {
  const w = size === "lg" ? 60 : 24;
  const h = size === "lg" ? 16 : 10;
  const spots = size === "lg" ? ["14%", "44%", "74%"] : ["22%", "auto"];
  return (
    <>
      {spots.map((left, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute"
          style={{ top: -h + 1, width: w, height: h, borderRadius: `${h / 2}px ${h / 2}px 0 0`, background: color, ...(left === "auto" ? { right: "22%" } : { left }) }}
        />
      ))}
    </>
  );
}

function BrickLink({ href, color, children }: { href: string; color: BrickColor; children: ReactNode }) {
  const c = BRICK[color];
  return (
    <a
      href={href}
      className="relative inline-flex min-h-[56px] items-center rounded-[14px] px-8 py-3.5 text-[22px] font-extrabold no-underline transition active:translate-y-1"
      style={{ background: c.bg, color: c.fg, boxShadow: `0 7px 0 ${c.shadow}`, fontFamily: "var(--display)" }}
    >
      <Studs color={c.bg} />
      {children}
    </a>
  );
}

function BrickCard({ color, title, children }: { color: BrickColor; title: string; children: ReactNode }) {
  const c = BRICK[color];
  return (
    <article className="relative rounded-2xl px-6 pb-6 pt-7" style={{ background: c.bg, color: c.fg, boxShadow: `0 7px 0 ${c.shadow}` }}>
      <span aria-hidden className="absolute" style={{ top: -10, left: "20%", width: 30, height: 12, borderRadius: "6px 6px 0 0", background: c.bg }} />
      <span aria-hidden className="absolute" style={{ top: -10, right: "20%", width: 30, height: 12, borderRadius: "6px 6px 0 0", background: c.bg }} />
      <h3 className="m-0 text-[26px] font-extrabold" style={{ fontFamily: "var(--display)" }}>{title}</h3>
      <p className="mt-1.5 mb-0">{children}</p>
    </article>
  );
}

const HERO_FIGURES = [
  { x: 70, country: "India", iso: "IN" },
  { x: 195, country: "Kenya", iso: "KE" },
  { x: 320, country: "Japan", iso: "JP", speaking: true },
  { x: 445, country: "Brazil", iso: "BR", placard: true },
  { x: 570, country: "Norway", iso: "NO" },
];

const STAGES: [string, string][] = [
  ["Roll call", "present, or present and voting"],
  ["Agenda", "a motion picks the topic"],
  ["Speakers' list", "timed speeches and yields"],
  ["Moderated caucus", "nameplates up"],
  ["Unmoderated caucus", "blocs and drafting"],
  ["Draft resolutions", "sponsors and amendments"],
  ["Voting", "vote cards, veto in the Security Council"],
  ["Adjournment", "awards and a report"],
];

const FAQ: [string, string][] = [
  ["I've never run Model UN. Can I still chair?", "Yes. The Chair console shows what to do at each stage, and the app applies the voting rules for you. A student can chair too."],
  ["What devices do students need?", "A laptop, tablet or phone with a current browser. A microphone is needed only to speak aloud; written speeches work without one."],
  ["Do students need accounts or email addresses?", "No. They type the code, a name and pick a country. Refreshing the page puts them back in the same seat."],
  ["Can some join from the room and some from home?", "Yes. In the room, students use headphones or written speeches; at home they join with the same code."],
  ["Is there video?", "No. Voice and text only. The delegate holding the floor is heard live."],
  ["How many students fit in one committee?", "It is designed for committees of up to about 50 delegates."],
];

const h2 = "m-0 text-center text-[clamp(36px,4.6vw,56px)] font-extrabold leading-none text-balance";

export default function Home() {
  const router = useRouter();
  const [chairName, setChairName] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<CommitteeType>("GA");
  const [topics, setTopics] = useState("");
  const [custom, setCustom] = useState("");
  const [gsl, setGsl] = useState(90);
  const [layout, setLayout] = useState<LayoutId | null>(null);
  const room: LayoutId = layout ?? (type === "SC" ? "council" : "assembly");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const countries =
      type === "GA" ? UNGA : type === "SC" ? UNSC
      : custom.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).map((n) => ({ name: n }));
    if (countries.length < 2) return setError("Add at least two countries.");
    const topicList = topics.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!topicList.length) return setError("Add at least one agenda topic.");
    setBusy(true);
    const res = await api<{ code: string; memberId: string; token: string }>("/api/create", {
      chairName, name, type, topics: topicList, countries, gslSpeakingSec: gsl, layout: room,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    saveSession(res.code, { token: res.token, memberId: res.memberId, name: chairName });
    router.push(`/room/${res.code}`);
  };

  return (
    <div style={LIGHT} className="min-h-dvh text-[18px] leading-relaxed">
      <header className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] px-4 py-5 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 text-[#10213a] no-underline">
          <svg width="38" height="30" viewBox="0 0 40 32" aria-hidden><rect x="8" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="23" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="2" y="7" width="36" height="23" rx="5" fill="#d62839" /></svg>
          <span className="text-2xl font-extrabold" style={{ fontFamily: "var(--display)" }}>MUN Chamber</span>
        </a>
        <a href="#join" className="rounded-xl border-2 border-[#10213a] px-4 py-2 text-base font-bold text-[#10213a] no-underline hover:bg-[#10213a] hover:text-white">
          Have a code? Join
        </a>
      </header>

      {/* Hero */}
      <section id="top" className="mx-auto max-w-[1160px] px-4 pt-16 text-center sm:px-6 sm:pt-20">
        <div className="text-[15px] font-bold text-[#1d4ed8]">Model UN for classrooms and clubs</div>
        <h1 className="mx-auto mt-3 max-w-[10.5em] text-[clamp(46px,7vw,96px)] font-extrabold leading-[0.98] text-balance" style={{ fontFamily: "var(--display)" }}>
          Give every student a <span className="text-[#d62839]">seat</span> at the table.
        </h1>
        <p className="mx-auto mt-5 max-w-[33em] text-[21px] text-[#44546d]">
          Students represent countries, speak live into their own desk mic and vote on real resolutions from any device. You chair the whole committee from one screen.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3.5">
          <BrickLink href="#create" color="red">Open my committee</BrickLink>
          <span className="text-[15px] text-[#44546d]">No sign-ups for anyone. Students join with a six-letter code.</span>
        </div>

        <div className="mx-auto mt-14 max-w-[1040px] rounded-[28px] border border-[#dbe7f6] px-4 pb-5 pt-7 sm:px-6" style={{ background: DOTS }}>
          <svg viewBox="0 52 640 160" className="block w-full" role="img" aria-label="Five delegates at desks with country nameplates. Japan is speaking; Brazil holds up its nameplate to ask for the floor.">
            {HERO_FIGURES.map((f) => (
              <g
                key={f.country}
                dangerouslySetInnerHTML={{ __html: figureSvg(f.x, 150, 40, { seed: f.country, country: f.country, flag: flag(f.iso), speaking: f.speaking, placard: f.placard }) }}
              />
            ))}
          </svg>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm font-semibold">
            {["Roll call", "Speakers' list", "Caucus", "Voting"].map((s) => (
              <span key={s} className={`rounded-full px-3.5 py-1 ${s === "Speakers' list" ? "bg-[#10213a] text-white" : "border border-[#dbe7f6] bg-white text-[#44546d]"}`}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Before / After */}
      <section className="mx-auto max-w-[1160px] px-4 pt-24 sm:px-6 sm:pt-28">
        <h2 className={h2} style={{ fontFamily: "var(--display)" }}>Same students. A very different debate.</h2>
        <div className="mt-11 flex flex-wrap gap-7">
          <div className="min-w-0 flex-[1_1_420px] rounded-[22px] bg-[#f2f4f7] p-8" style={{ boxShadow: "0 7px 0 #d5dbe3" }}>
            <div className="text-lg font-extrabold tracking-[0.08em] text-[#44546d]" style={{ fontFamily: "var(--display)" }}>BEFORE</div>
            <h3 className="mt-1.5 mb-0 text-[32px] font-extrabold leading-[1.05]" style={{ fontFamily: "var(--display)" }}>A circle of desks and a phone timer</h3>
            <ul className="mt-4 flex list-disc flex-col gap-2.5 pl-6 text-[#2b3d5c]">
              <li>The same few voices fill every caucus while quiet students wait.</li>
              <li>The rules of procedure are a lot to learn and teach in the same week.</li>
              <li>Votes are a show of hands, argued about afterwards.</li>
              <li>Real committees only happen at a conference once or twice a year.</li>
            </ul>
          </div>
          <div className="relative min-w-0 flex-[1_1_420px] rounded-[22px] bg-[#ffcf3a] p-8" style={{ boxShadow: "0 7px 0 #c99a12" }}>
            <span aria-hidden className="absolute" style={{ top: -12, left: "18%", width: 34, height: 13, borderRadius: "7px 7px 0 0", background: "#ffcf3a" }} />
            <span aria-hidden className="absolute" style={{ top: -12, right: "18%", width: 34, height: 13, borderRadius: "7px 7px 0 0", background: "#ffcf3a" }} />
            <div className="text-lg font-extrabold tracking-[0.08em]" style={{ fontFamily: "var(--display)" }}>AFTER</div>
            <h3 className="mt-1.5 mb-0 text-[32px] font-extrabold leading-[1.05]" style={{ fontFamily: "var(--display)" }}>A committee where everyone has a desk</h3>
            <ul className="mt-4 flex list-disc flex-col gap-2.5 pl-6">
              <li>The speakers' list and placards give every student a turn.</li>
              <li>The Chair console explains each stage, and the app applies the voting rules.</li>
              <li>Votes are counted seat by seat the moment they close.</li>
              <li>A full committee fits into a lesson or a club meeting, any week.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* What students practise */}
      <section className="mx-auto max-w-[1160px] px-4 pt-24 sm:px-6 sm:pt-28">
        <h2 className={h2} style={{ fontFamily: "var(--display)" }}>What students practise</h2>
        <div className="mt-12 grid gap-x-5 gap-y-9 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          <BrickCard color="blue" title="Public speaking">A live mic on a real timer. The mic light turns red when it's their turn.</BrickCard>
          <BrickCard color="green" title="Negotiation">Private notes and caucuses to build blocs and trade support before the vote.</BrickCard>
          <BrickCard color="red" title="Drafting">Preambulatory and operative clauses, sponsors, signatories and amendments.</BrickCard>
          <BrickCard color="yellow" title="Taking a turn">Students lift their nameplate to be called, so quiet ones get the floor too.</BrickCard>
        </div>
      </section>

      {/* Three steps */}
      <section className="mx-auto max-w-[1160px] px-4 pt-24 sm:px-6 sm:pt-28">
        <h2 className={h2} style={{ fontFamily: "var(--display)" }}>Three steps to your first session</h2>
        <ol className="mt-11 grid list-none gap-5 p-0 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {([
            ["red", "Build the committee", "Pick a topic, the countries (General Assembly, Security Council or your own list) and a room style."],
            ["blue", "Share the code", "Write it on the board or drop it in the group chat. Students find their desk waiting."],
            ["green", "Follow the prompts", "The Chair console tells you what each stage needs, from roll call to awards."],
          ] as [BrickColor, string, string][]).map(([c, t, d], i) => (
            <li key={t} className="rounded-[18px] border border-[#e3e8ef] p-6" style={{ boxShadow: "0 6px 0 #e3e8ef" }}>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl text-[28px] font-extrabold text-white" style={{ background: BRICK[c].bg, fontFamily: "var(--display)" }}>{i + 1}</div>
              <h3 className="mt-3.5 mb-1 text-2xl font-extrabold" style={{ fontFamily: "var(--display)" }}>{t}</h3>
              <p className="m-0 text-[#44546d]">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Stage by stage + room styles */}
      <section className="mx-auto max-w-[1160px] px-4 pt-24 sm:px-6 sm:pt-28">
        <div className="flex flex-wrap gap-10 rounded-[28px] border border-[#dbe7f6] p-6 sm:p-10" style={{ background: DOTS }}>
          <div className="min-w-0 flex-[1_1_300px]">
            <h2 className="m-0 text-[44px] font-extrabold leading-none" style={{ fontFamily: "var(--display)" }}>The whole session, stage by stage</h2>
            <p className="mt-3 text-[#44546d]">Every stage of a real MUN committee, in the order your students will meet it at a conference.</p>
            <div className="mt-7"><BrickLink href="#create" color="yellow">Open my committee</BrickLink></div>
          </div>
          <ol className="m-0 grid min-w-0 flex-[1_1_440px] gap-x-7 gap-y-3 pl-6 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {STAGES.map(([t, d]) => <li key={t}><strong>{t}</strong>: {d}</li>)}
          </ol>
        </div>

        <h2 className={`${h2} mt-24`} style={{ fontFamily: "var(--display)" }}>Pick the room</h2>
        <p className="mx-auto mt-3 max-w-[32em] text-center text-[#44546d]">Five room styles, each with its own seating and colours. The Chair can switch during the session.</p>
        <div className="mt-8 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {LAYOUTS.map((l) => (
            <div key={l.id} className="rounded-2xl border border-[#e3e8ef] bg-white p-2" style={{ boxShadow: "0 5px 0 #e3e8ef" }}>
              <LayoutPreview id={l.id} />
              <div className="px-1.5 pt-2 font-bold">{l.name}</div>
              <div className="px-1.5 pb-1 text-sm text-[#44546d]">{l.tagline}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[860px] px-4 pt-24 sm:px-6 sm:pt-28">
        <h2 className={h2} style={{ fontFamily: "var(--display)" }}>Questions from teachers and club leads</h2>
        <div className="mt-7 flex flex-col gap-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="rounded-2xl border border-[#e3e8ef] px-5 py-4" style={{ boxShadow: "0 5px 0 #e3e8ef" }}>
              <summary className="cursor-pointer font-extrabold">{q}</summary>
              <p className="mt-2.5 mb-0 text-[#44546d]">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Create: the real form inside the red brick */}
      <section id="create" className="mx-auto max-w-[1160px] scroll-mt-6 px-4 pt-24 sm:px-6 sm:pt-28">
        <div className="relative rounded-[30px] bg-[#d62839] px-4 py-12 text-white sm:px-10" style={{ boxShadow: "0 10px 0 #8f1622" }}>
          <Studs color="#d62839" size="lg" />
          <h2 className="mx-auto my-0 max-w-[11em] text-center text-[clamp(40px,5.6vw,72px)] font-extrabold leading-[0.98] text-balance" style={{ fontFamily: "var(--display)" }}>
            Your next lesson or club meeting could be a committee.
          </h2>
          <p className="mx-auto mt-3.5 max-w-[30em] text-center text-xl">Build it, share the code, call the roll. No sign-ups. Nothing to install.</p>

          <form
            onSubmit={(e) => { e.preventDefault(); create(); }}
            className="mx-auto mt-9 max-w-[760px] space-y-4 rounded-[22px] bg-white p-5 text-[#10213a] sm:p-7"
            style={{ boxShadow: "0 8px 0 #8f1622" }}
            aria-label="Open a committee"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Your name</Label>
                <Input value={chairName} onChange={(e) => setChairName(e.target.value)} placeholder="Chair's name" />
              </div>
              <div>
                <Label>Committee name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DISEC" />
              </div>
            </div>
            <div>
              <Label>Committee type</Label>
              <Select value={type} onChange={(e) => setType(e.target.value as CommitteeType)}>
                <option value="GA">General Assembly ({UNGA.length} countries)</option>
                <option value="SC">Security Council (15 members, P5 veto)</option>
                <option value="custom">Custom country list</option>
              </Select>
            </div>
            {type === "custom" && (
              <div>
                <Label hint="one per line or comma separated">Countries / portfolios</Label>
                <Textarea rows={4} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={"India\nJapan\nBrazil"} />
              </div>
            )}
            <div>
              <Label hint="one per line, up to 5">Agenda topics</Label>
              <Textarea rows={3} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder={"Regulating lethal autonomous weapons\nCyber security of critical infrastructure"} />
            </div>
            <div>
              <Label hint="you can change it during the session">Room style</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {LAYOUTS.map((l) => (
                  <button key={l.id} type="button" onClick={() => setLayout(l.id)} title={l.tagline}
                    className={`rounded-xl border p-1.5 text-left transition ${room === l.id ? "border-[#d62839] ring-2 ring-[#d62839]/40" : "border-[#d5deea] hover:border-[#44546d]"}`}>
                    <LayoutPreview id={l.id} />
                    <div className="px-1 pt-1.5 text-xs font-semibold">{l.name}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="max-w-[260px]">
              <Label hint="seconds">Speakers' list speaking time</Label>
              <Input type="number" min={15} max={600} value={gsl} onChange={(e) => setGsl(Number(e.target.value))} />
            </div>
            {error && <p className="text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={busy || !chairName.trim() || !name.trim()}
              className="w-full rounded-[14px] bg-[#ffcf3a] px-6 py-3.5 text-[22px] font-extrabold text-[#10213a] transition active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ boxShadow: "0 7px 0 #c99a12", fontFamily: "var(--display)" }}
            >
              {busy ? "Opening…" : "Open my committee"}
            </button>
          </form>
        </div>
      </section>

      {/* Join: delegates with a code, as a blue brick */}
      <section id="join" className="mx-auto max-w-[1160px] scroll-mt-6 px-4 pb-20 pt-20 sm:px-6">
        <div className="relative flex flex-wrap items-center gap-8 rounded-[30px] bg-[#1d4ed8] px-5 py-10 text-white sm:px-10" style={{ boxShadow: "0 10px 0 #133690" }}>
          <Studs color="#1d4ed8" size="lg" />
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 className="m-0 text-[clamp(36px,4.6vw,56px)] font-extrabold leading-[0.98] text-balance" style={{ fontFamily: "var(--display)" }}>Got a code? Take your seat.</h2>
            <p className="mt-3.5 text-xl text-[#e4ecff]">Your Chair has a six-letter code. Type it in, pick your country and find your desk with your nameplate already on it.</p>
            <svg viewBox="-16 -26 104 42" className="mt-6 hidden w-full max-w-[300px] sm:block" aria-hidden>
              <g dangerouslySetInnerHTML={{ __html: figureSvg(0, 0, 10, { seed: "Chile", country: "Chile", flag: flag("CL") }) }} />
              <g dangerouslySetInnerHTML={{ __html: figureSvg(30, 0, 10, { seed: "Ghana", country: "Ghana", flag: flag("GH"), absent: true }) }} />
              <g dangerouslySetInnerHTML={{ __html: figureSvg(60, 0, 10, { seed: "Nepal", country: "Nepal", flag: flag("NP") }) }} />
            </svg>
          </div>
          <div className="min-w-0 flex-[1_1_380px] rounded-[22px] bg-white p-5 text-[#10213a] sm:p-7" style={{ boxShadow: "0 8px 0 #133690" }}>
            <JoinForm light />
          </div>
        </div>
      </section>

      <footer className="border-t border-[#eef1f5]">
        <div className="mx-auto flex max-w-[1160px] flex-wrap justify-between gap-3 px-4 py-6 text-[15px] text-[#44546d] sm:px-6">
          <span>MUN Chamber · Model UN for classrooms and clubs</span>
          <span>Voice only, no video. Microphones need https or localhost.</span>
        </div>
      </footer>
    </div>
  );
}
