"use client";

import { useState } from "react";
import type { Action, CommitteeView, MotionType, PointType } from "@/lib/types";
import { MOTION_LABEL } from "@/lib/engine";
import { flag } from "@/lib/countries";
import { LAYOUTS, type LayoutId } from "@/lib/layouts";
import { Badge, Button, Input, Label, Modal, Select, Textarea } from "./ui";
import { transcriptionSupported, useTranscript, type useVoice } from "./useVoice";

type Send = (a: Action) => Promise<{ ok?: boolean; error?: string }>;
type Voice = ReturnType<typeof useVoice>;

// ---------------- Delegate ----------------

export function DelegateBar({ state, send, voice }: { state: CommitteeView; send: Send; voice: Voice }) {
  const me = state.members[state.meId];
  const [motionOpen, setMotionOpen] = useState(false);
  const [pointOpen, setPointOpen] = useState<PointType | null>(null);
  if (!me || me.role !== "delegate") return null;
  const onGsl = state.gsl.includes(me.id);
  const speaking = state.speaker?.memberId === me.id;
  const canQuestion = state.speaker?.yieldedToQuestions && !speaking;

  return (
    <div className="space-y-3">
      {(state.mode === "rollcall" || me.attendance === "absent") && state.mode !== "adjourned" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold/10 p-3">
          <div className="text-sm">
            <span className="font-semibold">{state.mode === "rollcall" ? "Roll call." : "You're not marked present."}</span>{" "}
            <span className="text-muted">"Present and voting" means you can't abstain on resolutions.</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={me.attendance === "present" ? "primary" : "outline"} onClick={() => send({ type: "answer_roll", attendance: "present" })}>Present</Button>
            <Button size="sm" variant={me.attendance === "present_voting" ? "gold" : "outline"} onClick={() => send({ type: "answer_roll", attendance: "present_voting" })}>Present and voting</Button>
          </div>
        </div>
      )}

      {speaking && <FloorPanel state={state} send={send} voice={voice} />}

      <div className="flex flex-wrap gap-2">
        <Button variant={me.placard ? "gold" : "outline"} onClick={() => send({ type: "placard", up: !me.placard })} title="Raise your placard to be recognized by the Chair">
          🪧 {me.placard ? "Lower placard" : "Raise placard"}
        </Button>
        <Button onClick={() => send({ type: onGsl ? "gsl_remove" : "gsl_add" })} disabled={speaking}>
          {onGsl ? "Leave speakers' list" : "Join speakers' list"}
        </Button>
        <Button onClick={() => setMotionOpen(true)} disabled={state.mode === "adjourned"}>Make a motion</Button>
        <Select className="w-auto!" value="" onChange={(e) => e.target.value && setPointOpen(e.target.value as PointType)}>
          <option value="">Raise a point…</option>
          <option value="personal_privilege">Personal privilege</option>
          <option value="order">Point of order</option>
          <option value="inquiry">Parliamentary inquiry</option>
          <option value="information" disabled={!canQuestion}>Point of information (question)</option>
        </Select>
        {canQuestion && <Button variant="primary" onClick={() => setPointOpen("information")}>Ask the speaker a question</Button>}
      </div>

      <MotionModal open={motionOpen} onClose={() => setMotionOpen(false)} state={state} send={send} />
      <PointModal type={pointOpen} onClose={() => setPointOpen(null)} send={send} />
    </div>
  );
}

function FloorPanel({ state, send, voice }: { state: CommitteeView; send: Send; voice: Voice }) {
  const [text, setText] = useState("");
  const [captions, setCaptions] = useState(false);
  const [yieldTo, setYieldTo] = useState("");
  useTranscript(captions && voice.live && !voice.muted);
  const sp = state.speaker!;
  const others = Object.values(state.members).filter((m) => m.role === "delegate" && m.id !== state.meId).sort((a, b) => (a.country ?? "").localeCompare(b.country ?? ""));

  return (
    <div className="space-y-3 rounded-xl border border-gold/50 bg-gold/[0.07] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-serif text-lg font-semibold text-gold">You have the floor</div>
        <div className="flex items-center gap-2">
          {voice.micError ? <Badge tone="red">Mic unavailable</Badge> : voice.live ? <Badge tone={voice.muted ? "default" : "green"}>{voice.muted ? "Muted" : "● Live"}</Badge> : <Badge>Connecting mic…</Badge>}
          {voice.live && <Button size="sm" onClick={voice.toggleMute}>{voice.muted ? "Unmute" : "Mute"}</Button>}
          {transcriptionSupported() && voice.live && (
            <Button size="sm" variant={captions ? "primary" : "outline"} onClick={() => setCaptions(!captions)} title="Post live captions of your speech to the floor log">
              Captions {captions ? "on" : "off"}
            </Button>
          )}
        </div>
      </div>
      {voice.micError && <p className="text-xs text-red-700">{voice.micError}</p>}
      <div>
        <Label hint="(posted to the floor log)">Written speech</Label>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Honourable Chair, fellow delegates…" />
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="primary" disabled={!text.trim()} onClick={async () => { const r = await send({ type: "text_speech", text }); if (!r.error) setText(""); }}>Deliver</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-gold/20 pt-3">
        <span className="mr-1 text-xs font-medium text-muted">Yield to:</span>
        <Button size="sm" onClick={() => send({ type: "yield", to: "chair" })}>The Chair</Button>
        {sp.kind === "gsl" && !sp.yieldedToQuestions && <Button size="sm" onClick={() => send({ type: "yield", to: "questions" })}>Questions</Button>}
        {sp.kind === "gsl" && (
          <div className="flex gap-1">
            <Select className="w-44! py-1! text-xs" value={yieldTo} onChange={(e) => setYieldTo(e.target.value)}>
              <option value="">Another delegate…</option>
              {others.map((m) => <option key={m.id} value={m.id}>{flag(m.iso)} {m.country}</option>)}
            </Select>
            <Button size="sm" disabled={!yieldTo} onClick={() => send({ type: "yield", to: "delegate", memberId: yieldTo })}>Yield</Button>
          </div>
        )}
      </div>
    </div>
  );
}

const MOTIONS_BY_MODE: Record<string, MotionType[]> = {
  lobby: ["set_agenda", "open_gsl", "suspend", "adjourn"],
  rollcall: ["set_agenda", "open_gsl", "suspend", "adjourn"],
  agenda: ["set_agenda", "suspend", "adjourn"],
  gsl: ["mod_caucus", "unmod_caucus", "introduce_dr", "close_debate", "suspend", "adjourn"],
  modcaucus: ["extend", "mod_caucus", "unmod_caucus", "introduce_dr", "close_debate", "suspend", "adjourn"],
  unmod: ["extend", "mod_caucus", "unmod_caucus", "introduce_dr", "close_debate", "suspend", "adjourn"],
  voting: ["suspend", "adjourn"],
  suspended: ["resume", "adjourn"],
  adjourned: [],
};

function MotionModal({ open, onClose, state, send }: { open: boolean; onClose: () => void; state: CommitteeView; send: Send }) {
  const options = MOTIONS_BY_MODE[state.mode] ?? [];
  const [type, setType] = useState<MotionType | "">("");
  const [topic, setTopic] = useState("");
  const [total, setTotal] = useState(10);
  const [per, setPer] = useState(60);
  const [docId, setDocId] = useState("");
  const t = type || options[0];
  const approved = state.docs.filter((d) => d.status === "approved");

  const submit = async () => {
    const r = await send({
      type: "propose_motion",
      motion: t,
      topic: t === "set_agenda" ? topic || state.topics[0] : topic,
      totalSec: total * 60,
      perSpeakerSec: per,
      docId: docId || approved[0]?.id,
    });
    if (!r.error) { onClose(); setTopic(""); setType(""); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Make a motion">
      {options.length === 0 ? (
        <p className="text-sm text-muted">No motions are in order right now.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>Motion</Label>
            <Select value={t} onChange={(e) => setType(e.target.value as MotionType)}>
              {options.map((o) => <option key={o} value={o}>{MOTION_LABEL[o]}</option>)}
            </Select>
          </div>
          {t === "set_agenda" && (
            <div>
              <Label>Topic</Label>
              <Select value={topic || state.topics[0]} onChange={(e) => setTopic(e.target.value)}>
                {state.topics.map((x) => <option key={x}>{x}</option>)}
              </Select>
            </div>
          )}
          {(t === "mod_caucus" || t === "unmod_caucus") && (
            <div>
              <Label hint={t === "unmod_caucus" ? "optional" : undefined}>Topic</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Funding mechanisms" />
            </div>
          )}
          {(t === "mod_caucus" || t === "unmod_caucus" || t === "extend") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t === "extend" ? "Extra minutes" : "Total minutes"}</Label>
                <Input type="number" min={1} max={60} value={total} onChange={(e) => setTotal(Number(e.target.value))} />
              </div>
              {t === "mod_caucus" && (
                <div>
                  <Label>Seconds per speaker</Label>
                  <Input type="number" min={15} max={300} step={15} value={per} onChange={(e) => setPer(Number(e.target.value))} />
                </div>
              )}
            </div>
          )}
          {t === "introduce_dr" && (
            <div>
              <Label>Draft resolution</Label>
              {approved.length ? (
                <Select value={docId || approved[0].id} onChange={(e) => setDocId(e.target.value)}>
                  {approved.map((d) => <option key={d.id} value={d.id}>{d.number} — {d.title}</option>)}
                </Select>
              ) : <p className="text-sm text-muted">No draft resolution has been approved by the Chair yet.</p>}
            </div>
          )}
          {t === "close_debate" && <p className="text-xs text-muted">Needs a two-thirds majority. The chamber is then sealed and resolutions are voted on.</p>}
          <Button variant="primary" className="w-full" onClick={submit} disabled={t === "introduce_dr" && !approved.length}>Propose motion</Button>
        </div>
      )}
    </Modal>
  );
}

const POINT_INFO: Record<PointType, { title: string; hint: string }> = {
  personal_privilege: { title: "Point of Personal Privilege", hint: "Something stops you from taking part, e.g. you can't hear the speaker." },
  order: { title: "Point of Order", hint: "The rules of procedure were not followed. Say which rule." },
  inquiry: { title: "Point of Parliamentary Inquiry", hint: "A question to the Chair about the rules of procedure." },
  information: { title: "Point of Information", hint: "A short question to the speaker, who has yielded to questions." },
};

function PointModal({ type, onClose, send }: { type: PointType | null; onClose: () => void; send: Send }) {
  const [text, setText] = useState("");
  if (!type) return null;
  const info = POINT_INFO[type];
  return (
    <Modal open onClose={onClose} title={info.title}>
      <p className="mb-3 text-sm text-muted">{info.hint}</p>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={type === "information" ? "Your question…" : "Briefly explain…"} autoFocus />
      <Button variant="primary" className="mt-3 w-full" onClick={async () => { const r = await send({ type: "raise_point", point: type, text }); if (!r.error) { setText(""); onClose(); } }}>
        Rise to this point
      </Button>
    </Modal>
  );
}

// ---------------- Chair ----------------

const CHAIR_HINT: Record<string, string> = {
  lobby: "Share the room code. When delegates have joined, start the roll call.",
  rollcall: "Delegates answer Present or Present and voting. You can also mark them in the Roll tab. Then set the agenda or open the speakers' list.",
  agenda: "Delegates move to set the agenda. Put the motion to a vote, then the speakers' list opens.",
  gsl: "Call the next speaker. Between speeches, take motions for caucuses. Approved draft resolutions can be introduced.",
  modcaucus: "Recognize delegates with raised placards (click their seat or use the list). The caucus ends when its time runs out.",
  unmod: "Delegates lobby and write papers. Review submitted working papers in the Documents tab.",
  voting: "The chamber is sealed. Vote on unfriendly amendments first, then each draft resolution.",
  suspended: "The meeting is suspended. Resume when ready.",
  adjourned: "Give awards in the Report tab and export the session report.",
};

export function ChairConsole({ state, send, voice }: { state: CommitteeView; send: Send; voice: Voice }) {
  const [note, setNote] = useState("");
  const [gslTime, setGslTime] = useState(state.gslSpeakingSec);
  const sp = state.speaker;
  const paused = sp?.paused ?? state.caucus?.paused;
  const anyPlacards = Object.values(state.members).some((m) => m.placard);

  return (
    <div className="space-y-3 rounded-xl border border-un/30 bg-un/[0.06] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-un">Chair console</div>
        <p className="text-xs text-muted">{CHAIR_HINT[state.mode]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {state.mode === "gsl" && <Button variant="gold" onClick={() => send({ type: "gsl_next" })} disabled={!state.gsl.length || !!sp}>Next speaker ▸</Button>}
        {sp && <Button onClick={() => send({ type: "end_speech" })}>Thank speaker (end)</Button>}
        {(sp || state.caucus) && <Button onClick={() => send({ type: paused ? "resume_timer" : "pause_timer" })}>{paused ? "Resume timer" : "Pause timer"}</Button>}
        {state.caucus && <Button onClick={() => send({ type: "end_caucus" })}>End caucus</Button>}
        <Button variant={state.chairMic ? "primary" : "outline"} onClick={() => send({ type: "chair_mic", on: !state.chairMic })}>
          🎙 {state.chairMic ? (voice.micError ? "Mic error" : voice.muted ? "Mic muted" : "Mic live") : "Chair mic"}
        </Button>
        {state.chairMic && voice.live && <Button size="sm" onClick={voice.toggleMute}>{voice.muted ? "Unmute" : "Mute"}</Button>}
        {anyPlacards && <Button onClick={() => send({ type: "lower_all_placards" })}>Lower all placards</Button>}
        <Button onClick={() => send({ type: "chits_enabled", on: !state.chitsEnabled })} disabled={state.mode === "voting"}>
          {state.chitsEnabled ? "Suspend note passing" : "Allow note passing"}
        </Button>
      </div>
      {voice.micError && state.chairMic && <p className="text-xs text-red-700">{voice.micError}</p>}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Announcement to the committee…" onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { send({ type: "chair_note", text: note }); setNote(""); } }} />
          <Button onClick={() => { send({ type: "chair_note", text: note }); setNote(""); }} disabled={!note.trim()}>Announce</Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-muted">Speech time</span>
          <Input type="number" className="w-20!" min={15} max={600} value={gslTime} onChange={(e) => setGslTime(Number(e.target.value))} />
          <Button size="sm" onClick={() => send({ type: "gsl_set_time", seconds: gslTime })} disabled={gslTime === state.gslSpeakingSec}>Set</Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-xs text-muted">Room style</span>
        <Select value={state.layout} onChange={(e) => send({ type: "set_layout", layout: e.target.value as LayoutId })}>
          {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.name}: {l.tagline}</option>)}
        </Select>
      </div>
      {state.topics.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-muted">Agenda</span>
          <Select value={state.agenda ?? ""} onChange={(e) => e.target.value && send({ type: "set_agenda", topic: e.target.value })}>
            <option value="">Not set</option>
            {state.topics.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </div>
      )}
    </div>
  );
}
