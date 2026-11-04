"use client";

import type { Action, Ballot, CommitteeView, Vote } from "@/lib/types";
import { eligibleVoters, who } from "@/lib/engine";
import { flag, P5 } from "@/lib/countries";
import { Badge, Button, Empty } from "./ui";

type Send = (a: Action) => Promise<{ ok?: boolean; error?: string }>;

const B_LABEL: Record<Ballot, string> = { yes: "Yes", no: "No", abstain: "Abstain", pass: "Pass" };

export function VoteBanner({ state, send }: { state: CommitteeView; send: Send }) {
  const v = state.vote;
  if (!v) return null;
  const me = state.members[state.meId];
  const chair = state.meId === state.chairId;
  const voters = eligibleVoters(state);
  const canVote = voters.some((m) => m.id === state.meId);
  const myBallot = v.ballots[state.meId];
  const calling = v.rollCall ? v.rollOrder[v.rollIndex] : undefined;
  const myTurn = !v.rollCall || calling === state.meId;
  const t = v.tally ?? { yes: 0, no: 0, abstain: 0 };
  const cast = Object.keys(v.ballots).length;
  const options: Ballot[] = v.procedural ? ["yes", "no"] : ["yes", "no", "abstain"];
  if (v.rollCall && !v.procedural && !v.passedOnce.includes(state.meId)) options.push("pass");
  const isP5 = state.type === "SC" && !v.procedural && P5.includes(me?.country ?? "");

  return (
    <div className="rounded-2xl border-2 border-gold/60 bg-panel p-3" style={{ boxShadow: "0 3px 0 color-mix(in srgb, var(--gold) 45%, transparent)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gold">
            {v.procedural ? "Procedural vote" : "Substantive vote"} · {v.threshold === "two_thirds" ? "two-thirds majority" : state.type === "SC" && !v.procedural ? "9 votes, no P5 veto" : "simple majority"}
            {v.rollCall && " · roll call"}
          </div>
          <div className="mt-0.5 font-serif text-base font-extrabold leading-snug">{v.label}</div>
        </div>
        <div className="tabular flex gap-3 rounded-lg bg-ink px-2.5 py-1 font-mono text-sm font-semibold">
          <span className="text-emerald-700">Yes {t.yes}</span>
          <span className="text-red-700">No {t.no}</span>
          {!v.procedural && <span className="text-muted">Abst. {t.abstain}</span>}
          <span className="text-muted">{v.rollCall || chair ? `${cast}/${voters.length}` : ""}</span>
        </div>
      </div>

      {v.rollCall && calling && (
        <p className="mt-2 text-sm">
          Calling: <span className="font-semibold">{flag(state.members[calling]?.iso)} {who(state, calling)}</span>
          {calling === state.meId && <span className="ml-2 text-gold">It's your turn.</span>}
        </p>
      )}

      {canVote && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {options.map((b) => (
            <Button key={b} variant={myBallot === b ? (b === "yes" ? "primary" : b === "no" ? "danger" : "gold") : "outline"} disabled={!myTurn} onClick={() => send({ type: "vote_cast", ballot: b })}>
              {B_LABEL[b]}{b === "no" && isP5 ? " (veto)" : ""}
            </Button>
          ))}
          {myBallot && !v.rollCall && <span className="text-xs text-muted">You voted {B_LABEL[myBallot]}. You can change it until the vote closes.</span>}
          {me?.attendance === "present_voting" && !v.procedural && <span className="text-xs text-muted">Present and voting: no abstaining.</span>}
        </div>
      )}
      {!canVote && me?.role === "delegate" && <p className="mt-2 text-xs text-muted">You're not marked present, so you can't vote. Send the Chair a note.</p>}

      {(v.rollCall || chair) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {voters.map((m) => {
            const b = v.ballots[m.id];
            return (
              <span key={m.id} className={`rounded-md border px-1.5 py-0.5 text-[11px] ${b === "yes" ? "border-emerald-400/40 text-emerald-700" : b === "no" ? "border-red-400/40 text-red-700" : b ? "border-line text-muted" : "border-line text-muted/50"}`}>
                {flag(m.iso)} {m.country}{b ? `: ${B_LABEL[b]}` : ""}
              </span>
            );
          })}
        </div>
      )}

      {chair && (
        <div className="mt-2.5 flex justify-end">
          <Button variant="gold" onClick={() => send({ type: "vote_close" })}>Close vote and announce result</Button>
        </div>
      )}
    </div>
  );
}

export function VoteHistory({ state }: { state: CommitteeView }) {
  if (!state.voteHistory.length) return <Empty>No votes yet.</Empty>;
  return (
    <ul className="space-y-2">
      {[...state.voteHistory].reverse().map((v) => <VoteRow key={v.id} v={v} state={state} />)}
    </ul>
  );
}

function VoteRow({ v, state }: { v: Vote; state: CommitteeView }) {
  const t = v.tally ?? { yes: 0, no: 0, abstain: 0 };
  return (
    <li className="rounded-lg border border-line px-3 py-2 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{v.label}</span>
        <Badge tone={v.result === "passed" ? "green" : "red"}>{v.result === "passed" ? "Passed" : "Failed"}</Badge>
      </div>
      <div className="tabular mt-1 font-mono text-xs text-muted">
        {t.yes} yes · {t.no} no{!v.procedural && ` · ${t.abstain} abstain`} {v.procedural ? "· procedural" : ""}{v.rollCall ? " · roll call" : ""}
      </div>
      {v.vetoedBy && v.vetoedBy.length > 0 && <div className="mt-1 text-xs text-red-700">Vetoed by {v.vetoedBy.map((id) => who(state, id)).join(", ")}</div>}
      {v.rollCall && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(v.ballots).map(([id, b]) => (
            <span key={id} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">{who(state, id)}: {B_LABEL[b]}</span>
          ))}
        </div>
      )}
    </li>
  );
}
