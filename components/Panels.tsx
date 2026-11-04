"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Action, CommitteeView, Member } from "@/lib/types";
import { describeMotion, who } from "@/lib/engine";
import { flag } from "@/lib/countries";
import { Badge, Button, Card, Empty, Eyebrow, Input, Select } from "./ui";
import { CaucusTimer } from "./Podium";

type Send = (a: Action) => Promise<{ ok?: boolean; error?: string }>;

const Country = ({ m }: { m?: Member }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5">
    <span>{flag(m?.iso)}</span>
    <span className="truncate">{m?.country ?? m?.name ?? "—"}</span>
  </span>
);

export function SpeakersPanel({ state, send, now }: { state: CommitteeView; send: Send; now: () => number }) {
  const chair = state.meId === state.chairId;
  const placards = Object.values(state.members).filter((m) => m.placard);
  return (
    <Card title={state.mode === "modcaucus" ? "Recognize speakers" : "Speakers' list"} right={<Badge>{state.gsl.length} queued</Badge>}>
      <div className="space-y-2.5">
        <CaucusTimer state={state} now={now} />
        {placards.length > 0 && (
          <div>
            <Eyebrow>✋ Placards raised</Eyebrow>
            <ul className="space-y-1">
              {placards.map((m) => (
                <li key={m.id} className="flex h-9 items-center justify-between gap-2 rounded-lg border border-gold/25 bg-gold/[0.05] px-2 text-sm">
                  <Country m={m} />
                  {chair && <Button size="sm" variant="gold" onClick={() => send({ type: "recognize", memberId: m.id })} disabled={!!state.speaker}>Recognize</Button>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          {(state.mode === "modcaucus" || placards.length > 0) && <Eyebrow>{state.mode === "modcaucus" ? "Speakers' list (resumes after caucus)" : "Speakers' list"}</Eyebrow>}
          {state.gsl.length === 0 ? <Empty>No one is on the speakers' list.</Empty> : (
            <ol className="space-y-1">
              {state.gsl.map((id, i) => (
                <li key={id} className={`group flex h-8 items-center justify-between gap-2 rounded-lg px-2 text-sm ${id === state.meId ? "bg-un/10 font-semibold" : "bg-black/[0.03]"}`}>
                  <span className="flex min-w-0 items-center gap-2"><span className="w-4 text-right font-mono text-[11px] text-muted">{i + 1}</span><Country m={state.members[id]} /></span>
                  {chair && <button className="rounded px-1 text-xs text-muted opacity-60 transition hover:text-red-700 group-hover:opacity-100" title="Remove from the list" aria-label={`Remove ${state.members[id]?.country} from the list`} onClick={() => send({ type: "gsl_remove", memberId: id })}>✕</button>}
                </li>
              ))}
            </ol>
          )}
        </div>
        {chair && <AddToList state={state} send={send} />}
      </div>
    </Card>
  );
}

function AddToList({ state, send }: { state: CommitteeView; send: Send }) {
  const [id, setId] = useState("");
  const options = Object.values(state.members).filter((m) => m.role === "delegate" && !state.gsl.includes(m.id)).sort((a, b) => (a.country ?? "").localeCompare(b.country ?? ""));
  if (!options.length) return null;
  return (
    <div className="flex gap-1.5">
      <Select value={id} onChange={(e) => setId(e.target.value)} className="h-7 py-0! text-xs">
        <option value="">Add a delegate…</option>
        {options.map((m) => <option key={m.id} value={m.id}>{flag(m.iso)} {m.country}</option>)}
      </Select>
      <Button size="sm" disabled={!id} onClick={() => { send({ type: "gsl_add", memberId: id }); setId(""); }}>Add</Button>
    </div>
  );
}

export function MotionsPanel({ state, send }: { state: CommitteeView; send: Send }) {
  const chair = state.meId === state.chairId;
  const motions = state.motions.filter((m) => m.status === "pending" || m.status === "voting");
  const points = state.points.filter((p) => p.status === "open");
  const [reply, setReply] = useState<Record<string, string>>({});
  const names = { personal_privilege: "Personal privilege", order: "Point of order", inquiry: "Parliamentary inquiry", information: "Information" };

  return (
    <Card title="Motions & points" right={motions.length + points.length ? <Badge tone="gold">{motions.length + points.length} open</Badge> : null}>
      {motions.length === 0 && points.length === 0 && <Empty>Nothing on the floor.</Empty>}
      <ul className="space-y-2">
        {points.map((p) => (
          <li key={p.id} className="rounded-lg border border-amber-400/40 bg-amber-50 p-2.5 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="gold">{names[p.type]}</Badge>
              <span className="text-xs text-muted">{who(state, p.fromId)}</span>
            </div>
            {p.text && <p className="mt-1.5 leading-snug">{p.text}</p>}
            {chair && (
              <div className="mt-2 flex gap-1.5">
                <Input className="h-7 py-0! text-xs" placeholder="Response (optional)" value={reply[p.id] ?? ""} onChange={(e) => setReply({ ...reply, [p.id]: e.target.value })} />
                <Button size="sm" onClick={() => send({ type: "resolve_point", id: p.id, response: reply[p.id] ?? "" })}>Resolve</Button>
              </div>
            )}
          </li>
        ))}
        {motions.map((m) => (
          <li key={m.id} className="rounded-lg border border-line bg-black/[0.02] p-2.5 text-[13px]">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold leading-snug">{describeMotion(state, m)}</span>
              {m.status === "voting" && <Badge tone="un">voting</Badge>}
            </div>
            <div className="mt-1 text-xs text-muted">Moved by {who(state, m.proposerId)}</div>
            {chair && m.status === "pending" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" onClick={() => send({ type: "rule_motion", id: m.id, ruling: "vote" })} disabled={!!state.vote}>Put to vote</Button>
                <Button size="sm" onClick={() => send({ type: "rule_motion", id: m.id, ruling: "pass" })} title="Pass with no objection">Pass</Button>
                <Button size="sm" onClick={() => send({ type: "rule_motion", id: m.id, ruling: "fail" })}>Fail</Button>
                <Button size="sm" variant="ghost" onClick={() => send({ type: "rule_motion", id: m.id, ruling: "out_of_order" })}>Out of order</Button>
              </div>
            )}
            {m.proposerId === state.meId && m.status === "pending" && (
              <button className="mt-1.5 text-xs text-muted hover:text-red-700" onClick={() => send({ type: "withdraw_motion", id: m.id })}>Withdraw</button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ChitsPanel({ state, send }: { state: CommitteeView; send: Send }) {
  const me = state.members[state.meId];
  const chair = state.meId === state.chairId;
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const recipients = useMemo(
    () => Object.values(state.members).filter((m) => m.id !== state.meId && m.role !== "observer").sort((a, b) => (a.role === "chair" ? -1 : b.role === "chair" ? 1 : (a.country ?? "").localeCompare(b.country ?? ""))),
    [state.members, state.meId],
  );
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [state.chits.length]);
  if (!me || me.role === "observer") return null;
  const disabled = !state.chitsEnabled && !chair;

  return (
    <Card title="Notes (chits)" right={!state.chitsEnabled ? <Badge tone="red">suspended</Badge> : chair ? <Badge>you see all notes</Badge> : null}>
      <div ref={box} className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
        {state.chits.length === 0 && <Empty>No notes yet.</Empty>}
        {state.chits.map((c) => {
          const mine = c.fromId === state.meId;
          return (
            <div key={c.id} className={`rounded-xl px-2.5 py-1.5 text-[13px] leading-snug ${mine ? "ml-8 rounded-br-sm bg-un/10" : "mr-8 rounded-bl-sm bg-black/[0.04]"}`}>
              <div className="text-[10px] font-semibold text-muted">{mine ? `To ${who(state, c.toId)}` : `${who(state, c.fromId)} → ${c.toId === state.meId ? "you" : who(state, c.toId)}`}</div>
              <div className="whitespace-pre-wrap break-words">{c.text}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 space-y-1.5">
        <Select value={to} onChange={(e) => setTo(e.target.value)} disabled={disabled} className="h-8 py-0! text-xs" aria-label="Send note to">
          <option value="">Send to…</option>
          {recipients.map((m) => <option key={m.id} value={m.id}>{m.role === "chair" ? "The Chair" : `${flag(m.iso)} ${m.country}`}</option>)}
        </Select>
        <div className="flex gap-1.5">
          <Input value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} className="h-8" maxLength={500} aria-label="Note" placeholder={disabled ? "Note passing is suspended" : "Write a note…"} onKeyDown={async (e) => {
            if (e.key === "Enter") { e.preventDefault(); if (to && text.trim()) { const r = await send({ type: "chit_send", toId: to, text }); if (!r.error) setText(""); } }
          }} />
          <Button className="h-8!" size="sm" disabled={disabled || !to || !text.trim()} onClick={async () => { const r = await send({ type: "chit_send", toId: to, text }); if (!r.error) setText(""); }}>Send</Button>
        </div>
      </div>
    </Card>
  );
}

export function FloorLog({ state }: { state: CommitteeView }) {
  const box = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | "speeches">("all");
  const entries = filter === "all" ? state.log : state.log.filter((l) => l.kind !== "system");
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [entries.length]);
  return (
    <div>
      <div className="mb-2 flex gap-1">
        {(["all", "speeches"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition ${filter === f ? "border-fg bg-fg text-white" : "border-line text-muted hover:text-fg"}`}>
            {f === "all" ? "Everything" : "Speeches & questions"}
          </button>
        ))}
      </div>
      <div ref={box} className="max-h-[340px] space-y-1 overflow-y-auto pr-1 text-[13px]">
        {entries.length === 0 && <Empty>Nothing yet.</Empty>}
        {entries.map((l) => {
          const time = new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const m = l.memberId ? state.members[l.memberId] : undefined;
          if (l.kind === "system") return (
            <div key={l.id} className="flex gap-2 px-1 leading-5 text-muted"><span className="tabular w-10 shrink-0 font-mono text-[10px] leading-5 text-muted/60">{time}</span><span>{l.text}</span></div>
          );
          const tone = l.kind === "chair" ? "border-un/40 bg-un/[0.07]" : l.kind === "question" ? "border-amber-400/30 bg-amber-400/[0.05]" : l.kind === "transcript" ? "border-line bg-black/[0.02] italic" : "border-gold/30 bg-gold/[0.05]";
          const label = l.kind === "chair" ? "The Chair" : `${flag(m?.iso)} ${m?.country ?? m?.name ?? "Delegate"}`;
          return (
            <div key={l.id} className={`rounded-lg border px-2.5 py-1.5 ${tone}`}>
              <div className="mb-0.5 flex justify-between text-[11px] text-muted">
                <span className="font-semibold text-fg/80">{label}{l.kind === "transcript" && " · live caption"}{l.kind === "question" && " · question"}</span>
                <span className="tabular font-mono">{time}</span>
              </div>
              <div className="whitespace-pre-wrap break-words">{l.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RollPanel({ state, send }: { state: CommitteeView; send: Send }) {
  const chair = state.meId === state.chairId;
  const list = Object.values(state.members).filter((m) => m.role === "delegate").sort((a, b) => (a.country ?? "").localeCompare(b.country ?? ""));
  const count = { present: list.filter((m) => m.attendance === "present").length, voting: list.filter((m) => m.attendance === "present_voting").length };
  const observers = Object.values(state.members).filter((m) => m.role === "observer");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="un">{count.present} present</Badge>
        <Badge tone="gold">{count.voting} present and voting</Badge>
        <Badge>{list.length - count.present - count.voting} not marked</Badge>
        <Badge>simple majority: {Math.floor((count.present + count.voting) / 2) + 1}</Badge>
        <Badge>two-thirds: {Math.ceil(((count.present + count.voting) * 2) / 3)}</Badge>
      </div>
      {list.length === 0 ? <Empty>No delegates yet.</Empty> : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {list.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${m.online ? "bg-emerald-400" : "bg-black/20"}`} title={m.online ? "online" : "offline"} />
                <Country m={m} />
                <span className="truncate text-xs text-muted">{m.name}</span>
              </span>
              {chair ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Select value={m.attendance} onChange={(e) => send({ type: "answer_roll", memberId: m.id, attendance: e.target.value as Member["attendance"] })} className="w-auto! py-1! text-xs">
                    <option value="absent">Not present</option>
                    <option value="present">Present</option>
                    <option value="present_voting">Present and voting</option>
                  </Select>
                  <button className="px-1 text-xs text-muted hover:text-red-700" title="Remove from committee" onClick={() => confirm(`Remove ${m.country} from the committee?`) && send({ type: "kick", memberId: m.id })}>✕</button>
                </span>
              ) : (
                <span className="text-xs text-muted">{m.attendance === "absent" ? "—" : m.attendance === "present" ? "Present" : "Present and voting"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {observers.length > 0 && <p className="text-xs text-muted">Observers: {observers.map((o) => o.name).join(", ")}</p>}
    </div>
  );
}
