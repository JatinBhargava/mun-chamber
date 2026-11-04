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
import { Badge, Button, Card } from "./ui";
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

  return (
    <div style={{ ...CLEAN_BLOCK, background: CLEAN_BLOCK_BG }} className="min-h-dvh">
    <div className="mx-auto max-w-7xl px-4 pb-16">
      {/* top bar */}
      <header className="sticky top-0 z-30 -mx-4 mb-5 border-b border-line bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href="/" title="MUN Chamber home" aria-label="MUN Chamber home" className="shrink-0">
                <svg width="32" height="26" viewBox="0 0 40 32" aria-hidden><rect x="8" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="23" y="2" width="9" height="6" rx="2" fill="#b81f2e" /><rect x="2" y="7" width="36" height="23" rx="5" fill="#d62839" /></svg>
              </Link>
              <h1 className="truncate text-2xl font-extrabold leading-none" style={{ fontFamily: "var(--display)" }}>{state.name}</h1>
              <Badge tone="un">{state.type === "SC" ? "Security Council" : state.type === "GA" ? "General Assembly" : "Committee"}</Badge>
            </div>
            <p className="truncate text-xs text-muted">Agenda: {state.agenda ?? <em>not yet set</em>}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {voice.audioBlocked && <Button size="sm" variant="gold" onClick={voice.unblockAudio}>🔊 Click to hear the speaker</Button>}
            {listening.length > 0 && !voice.audioBlocked && <Badge tone="green">🔊 {listening.map((m) => m?.role === "chair" ? "Chair" : m?.country).join(", ")}</Badge>}
            <button onClick={copyInvite} className="rounded-xl border-2 border-fg bg-panel px-3 py-1 font-mono text-sm font-bold tracking-widest hover:bg-fg hover:text-white" title="Copy invite link">
              {copied ? "Copied!" : code}
            </button>
            <Badge tone={chair ? "gold" : me?.role === "observer" ? "default" : "un"}>
              {chair ? `Chair · ${me?.name}` : me?.role === "observer" ? `Observer · ${me?.name}` : `${flag(me?.iso)} ${me?.country}`}
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Leave this committee on this device?")) { clearSession(code); location.href = "/"; } }}>Leave</Button>
          </div>
        </div>
        <div className="mt-3">
          <StageBar mode={state.mode} onPick={chair ? (m) => send({ type: "set_mode", mode: m }) : undefined} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-4">
          <VoteBanner state={state} send={send} />

          <section
            aria-label={`The room: ${LAYOUTS.find((l) => l.id === state.layout)?.name ?? ""}`}
            className="rounded-[26px] p-4"
            style={{ ...themeStyle(state.layout), boxShadow: "0 8px 0 rgba(16,33,58,0.22)", fontFamily: "Inter, system-ui, sans-serif" }}
          >
            <RoomMap state={state} now={now} onSeat={onSeat} hint={chair ? "Click a seat to recognize that delegate" : undefined} />
          </section>

          {chair ? <ChairConsole state={state} send={send} voice={voice} /> : <DelegateBar state={state} send={send} voice={voice} />}

          <div className="rounded-2xl border border-line bg-panel" style={{ boxShadow: "0 5px 0 var(--line)" }}>
            <div className="flex gap-1 overflow-x-auto border-b border-line px-2 pt-2">
              {([
                ["floor", "Floor"],
                ["roll", "Roll call"],
                ["docs", `Documents${docsOpen ? ` (${docsOpen})` : ""}`],
                ["votes", "Votes"],
                ["report", "Report"],
              ] as [Tab, string][]).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-t-xl px-3.5 py-2 text-sm font-bold ${tab === t ? "bg-un text-white" : "text-muted hover:text-fg"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === "floor" && <FloorLog state={state} />}
              {tab === "roll" && <RollPanel state={state} send={send} />}
              {tab === "docs" && <Documents state={state} send={send} />}
              {tab === "votes" && <VoteHistory state={state} />}
              {tab === "report" && <Report state={state} send={send} />}
            </div>
          </div>
        </main>

        <aside className="space-y-4">
          <SpeakersPanel state={state} send={send} now={now} />
          <MotionsPanel state={state} send={send} />
          <ChitsPanel state={state} send={send} />
        </aside>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" onClick={() => setToast(null)}>
          <div className="max-w-md rounded-xl border-2 border-red-600 bg-white px-4 py-2.5 text-sm font-semibold text-red-700" style={{ boxShadow: "0 5px 0 #b91c1c" }} role="status">{toast}</div>
        </div>
      )}
    </div>
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
