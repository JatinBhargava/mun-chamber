"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { flag } from "@/lib/countries";
import { clearSession } from "@/lib/client";
import type { Member } from "@/lib/types";
import { ChairConsole, DelegateBar } from "./Controls";
import Documents from "./Documents";
import JoinForm from "./JoinForm";
import { ChitsPanel, FloorLog, MotionsPanel, RollPanel, SpeakersPanel } from "./Panels";
import RoomMap from "./RoomMap";
import { CLEAN_BLOCK, CLEAN_BLOCK_BG, LAYOUTS, themeStyle } from "@/lib/layouts";
import Report from "./Report";
import StageBar from "./StageBar";
import { Badge, Button, Card, SHADOW } from "./ui";
import { useCommittee } from "./useCommittee";
import { useVoice } from "./useVoice";
import { VoteBanner, VoteHistory } from "./Voting";

type Tab = "floor" | "roll" | "docs" | "votes" | "report";

export default function Chamber({ code }: { code: string }) {
  const { state, status, error, toast, setToast, send, now, rejoin } = useCommittee(code);
  const [tab, setTab] = useState<Tab>("floor");
  const [copied, setCopied] = useState(false);

  const publishers = useMemo(() => {
    if (!state) return [];
    const list: string[] = [];
    if (state.speaker && !state.speaker.paused) list.push(state.speaker.memberId);
    if (state.chairMic) list.push(state.chairId);
    return list;
  }, [state]);
  const peers = useMemo(() => (state ? Object.values(state.members).filter((m) => m.online && m.id !== state.meId).map((m) => m.id) : []), [state]);
  const voice = useVoice(state?.meId, publishers, peers);

  if (status === "need-join") {
    return (
      <Centered>
        <div className="w-full max-w-md">
          <BrickLogo />
          <Card title={`Join committee ${code}`} className="mt-5">
            <JoinForm initialCode={code} onJoined={rejoin} light />
          </Card>
        </div>
      </Centered>
    );
  }
  if (status === "kicked") return <Centered><Message title="You were removed from this committee by the Chair." /></Centered>;
  if (status === "error") return <Centered><Message title={error ?? "Something went wrong."} /></Centered>;
  if (!state) return <Centered><p className="text-muted">Entering the chamber…</p></Centered>;

  const me = state.members[state.meId];
  const chair = state.meId === state.chairId;
  const docsOpen = state.docs.filter((d) => d.status === "submitted" || d.status === "introduced").length;
  const listening = voice.listeningTo.filter((id) => id !== state.meId).map((id) => state.members[id]);

  const onSeat = chair
    ? (m: Member) => {
        if (state.speaker) return setToast("Someone already has the floor. End their speech first.");
        if (state.mode !== "gsl" && state.mode !== "modcaucus") return setToast("You can recognize speakers during the speakers' list or a moderated caucus.");
        send({ type: "recognize", memberId: m.id });
      }
    : undefined;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/room/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { setToast(`Room code: ${code}`); }
  };

  const tabs: [Tab, string, number?][] = [
    ["floor", "Floor log"],
    ["roll", "Roll call"],
    ["docs", "Documents", docsOpen],
    ["votes", "Votes", state.voteHistory.length],
    ["report", "Report"],
  ];
  const identity = chair ? `Chair · ${me?.name}` : me?.role === "observer" ? `Observer · ${me?.name}` : `${flag(me?.iso)} ${me?.country}`;

  return (
    <div style={{ ...CLEAN_BLOCK, background: CLEAN_BLOCK_BG }} className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2.5 px-3 pt-2 sm:px-4">
          <Link href="/" title="MUN Chamber home" aria-label="MUN Chamber home" className="shrink-0">
            <svg width="30" height="24" viewBox="0 0 40 32" aria-hidden><rect x="8" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="23" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="2" y="7" width="36" height="23" rx="5" fill="#d62839" /></svg>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-xl font-extrabold leading-tight" style={{ fontFamily: "var(--display)" }}>{state.name}</h1>
              <span className="hidden sm:inline-flex"><Badge tone="un">{state.type === "SC" ? "Security Council" : state.type === "GA" ? "General Assembly" : "Committee"}</Badge></span>
            </div>
            <p className="truncate text-xs text-muted">{state.agenda ? <>Agenda: {state.agenda}</> : <em>Agenda not yet set</em>}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {voice.audioBlocked && <Button size="sm" variant="gold" onClick={voice.unblockAudio}>🔊 Tap to hear</Button>}
            {listening.length > 0 && !voice.audioBlocked && (
              <span className="hidden md:inline-flex"><Badge tone="green">🔊 {listening.map((m) => m?.role === "chair" ? "Chair" : m?.country).join(", ")}</Badge></span>
            )}
            <button onClick={copyInvite} className="flex h-8 items-center gap-1.5 rounded-lg border-2 border-fg bg-panel px-2 font-mono text-[13px] font-bold tracking-widest transition hover:bg-fg hover:text-white" title="Copy invite link">
              {copied ? "Copied!" : code}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
            </button>
            <span className="hidden max-w-44 truncate sm:inline-flex"><Badge tone={chair ? "gold" : me?.role === "observer" ? "default" : "un"}>{identity}</Badge></span>
            <button
              onClick={() => { if (confirm("Leave this committee on this device?")) { clearSession(code); location.href = "/"; } }}
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-muted transition hover:bg-black/5 hover:text-fg"
              title="Leave this committee"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-[1400px] px-3 pb-2 pt-1.5 sm:px-4">
          <StageBar mode={state.mode} onPick={chair ? (m) => send({ type: "set_mode", mode: m }) : undefined} />
        </div>
      </header>

      {/* Phone order: room and controls, then the side panels, then the tabs. Desktop: tabs under the room, panels on the right. */}
      <div className="mx-auto grid max-w-[1400px] items-start gap-3 px-3 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4 lg:py-4">
        <main className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
          <VoteBanner state={state} send={send} />

          <section aria-label={`The room: ${LAYOUTS.find((l) => l.id === state.layout)?.name ?? ""}`} className="overflow-hidden rounded-2xl border border-line bg-panel" style={SHADOW}>
            <div className="overflow-hidden p-3" style={{ ...themeStyle(state.layout), fontFamily: "Inter, system-ui, sans-serif" }}>
              <RoomMap state={state} now={now} onSeat={onSeat} hint={chair && (state.mode === "gsl" || state.mode === "modcaucus") ? "Click a seat to recognize" : undefined} />
            </div>
            <div className="border-t border-line bg-panel p-3">
              {chair ? <ChairConsole state={state} send={send} voice={voice} /> : <DelegateBar state={state} send={send} voice={voice} />}
            </div>
          </section>
        </main>

        <aside className="min-w-0 space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <SpeakersPanel state={state} send={send} now={now} />
          <MotionsPanel state={state} send={send} />
          <ChitsPanel state={state} send={send} />
        </aside>

        <section className="min-w-0 rounded-2xl border border-line bg-panel lg:col-start-1 lg:row-start-2" style={SHADOW}>
          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line p-1.5" role="tablist">
            {tabs.map(([t, label, count]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold transition ${tab === t ? "bg-un text-white" : "text-muted hover:bg-black/5 hover:text-fg"}`}
              >
                {label}
                {!!count && <span className={`rounded-full px-1.5 text-[10px] leading-4 ${tab === t ? "bg-white/25" : "bg-black/[0.07]"}`}>{count}</span>}
              </button>
            ))}
          </div>
          <div className="p-3">
            {tab === "floor" && <FloorLog state={state} />}
            {tab === "roll" && <RollPanel state={state} send={send} />}
            {tab === "docs" && <Documents state={state} send={send} />}
            {tab === "votes" && <VoteHistory state={state} />}
            {tab === "report" && <Report state={state} send={send} />}
          </div>
        </section>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" onClick={() => setToast(null)}>
          <div className="max-w-md rounded-xl border-2 border-red-600 bg-white px-4 py-2.5 text-sm font-semibold text-red-700" style={{ boxShadow: "0 4px 0 #b91c1c" }} role="status">{toast}</div>
        </div>
      )}
    </div>
  );
}


function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ ...CLEAN_BLOCK, background: CLEAN_BLOCK_BG }} className="flex min-h-dvh items-center justify-center p-4">{children}</div>;
}

function BrickLogo() {
  return (
    <Link href="/" className="flex items-center justify-center gap-2.5 text-fg no-underline">
      <svg width="38" height="30" viewBox="0 0 40 32" aria-hidden><rect x="8" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="23" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="2" y="7" width="36" height="23" rx="5" fill="#d62839" /></svg>
      <span className="text-2xl font-extrabold" style={{ fontFamily: "var(--display)" }}>MUN Chamber</span>
    </Link>
  );
}

function Message({ title }: { title: string }) {
  return (
    <div className="text-center">
      <p className="mb-4 text-lg">{title}</p>
      <Link href="/" className="font-bold text-un underline">Back to the start</Link>
    </div>
  );
}
