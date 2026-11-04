"use client";

import type { Action, CommitteeView } from "@/lib/types";
import { who } from "@/lib/engine";
import { flag } from "@/lib/countries";
import { Badge, Button, Empty, Select } from "./ui";
import { VoteHistory } from "./Voting";
import { ordered } from "./Documents";

type Send = (a: Action) => Promise<{ ok?: boolean; error?: string }>;

const AWARDS = ["Best Delegate", "Outstanding Delegate", "Honourable Mention", "Verbal Mention", "Best Position Paper"];

export default function Report({ state, send }: { state: CommitteeView; send: Send }) {
  const chair = state.meId === state.chairId;
  const delegates = Object.values(state.members).filter((m) => m.role === "delegate").sort((a, b) => b.speeches - a.speeches || (a.country ?? "").localeCompare(b.country ?? ""));
  const finished = state.docs.filter((d) => d.status === "passed" || d.status === "failed");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => download(state)}>Download report (.md)</Button>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>Print</Button>
      </div>

      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Delegates</h4>
        {delegates.length === 0 ? <Empty>No delegates.</Empty> : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {delegates.map((m) => {
              const award = state.awards.find((a) => a.memberId === m.id)?.award;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {flag(m.iso)} <span className="font-medium">{m.country}</span>
                    <span className="truncate text-xs text-muted">{m.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge>{m.speeches} time{m.speeches === 1 ? "" : "s"} on the floor</Badge>
                    {chair ? (
                      <Select value={award ?? ""} onChange={(e) => send({ type: "award", memberId: m.id, award: e.target.value })} className="w-auto! py-1! text-xs">
                        <option value="">No award</option>
                        {AWARDS.map((a) => <option key={a}>{a}</option>)}
                      </Select>
                    ) : award ? <Badge tone="gold">🏅 {award}</Badge> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Resolutions</h4>
        {finished.length === 0 ? <Empty>No resolution has been voted on yet.</Empty> : (
          <ul className="space-y-2">
            {finished.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span><span className="font-mono text-xs text-gold">{d.number}</span> {d.title}</span>
                <Badge tone={d.status === "passed" ? "green" : "red"}>{d.status === "passed" ? "Adopted" : "Failed"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Votes</h4>
        <VoteHistory state={state} />
      </section>
    </div>
  );
}

function download(c: CommitteeView) {
  const L: string[] = [];
  const delegates = Object.values(c.members).filter((m) => m.role === "delegate").sort((a, b) => (a.country ?? "").localeCompare(b.country ?? ""));
  L.push(`# ${c.name} — session report`, "");
  L.push(`- Room code: ${c.code}`, `- Agenda: ${c.agenda ?? "not set"}`, `- Date: ${new Date(c.createdAt).toLocaleString()}`, `- Chair: ${c.members[c.chairId]?.name}`, "");
  L.push("## Roll call", "", "| Country | Delegate | Attendance | Times on floor | Award |", "|---|---|---|---|---|");
  for (const m of delegates) {
    const att = m.attendance === "absent" ? "Absent" : m.attendance === "present" ? "Present" : "Present and voting";
    L.push(`| ${m.country} | ${m.name} | ${att} | ${m.speeches} | ${c.awards.find((a) => a.memberId === m.id)?.award ?? ""} |`);
  }
  L.push("", "## Resolutions", "");
  for (const d of c.docs.filter((x) => x.kind === "dr")) {
    L.push(`### ${d.number} — ${d.title} (${d.status})`, "", `Sponsors: ${d.sponsors.map((s) => who(c, s)).join(", ")}`, `Signatories: ${d.signatories.map((s) => who(c, s)).join(", ") || "none"}`, "");
    let n = 0;
    for (const cl of ordered(d.clauses)) L.push(cl.kind === "op" ? `${++n}. ${cl.text}` : `_${cl.text}_`, "");
  }
  L.push("## Votes", "");
  for (const v of c.voteHistory) {
    const t = v.tally ?? { yes: 0, no: 0, abstain: 0 };
    L.push(`- **${v.label}**: ${v.result} (${t.yes} yes, ${t.no} no, ${t.abstain} abstain)${v.vetoedBy?.length ? `, vetoed by ${v.vetoedBy.map((id) => who(c, id)).join(", ")}` : ""}`);
  }
  L.push("", "## Floor log", "");
  for (const l of c.log) {
    const time = new Date(l.at).toLocaleTimeString();
    L.push(l.kind === "system" ? `- ${time} — ${l.text}` : `- ${time} — **${l.kind === "chair" ? "Chair" : who(c, l.memberId)}**${l.kind === "transcript" ? " (caption)" : ""}: ${l.text}`);
  }
  const blob = new Blob([L.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${c.name.replace(/\W+/g, "-")}-${c.code}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
