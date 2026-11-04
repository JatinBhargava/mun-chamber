"use client";

import { useState } from "react";
import type { Action, Clause, CommitteeView, Doc } from "@/lib/types";
import { uid, who } from "@/lib/engine";
import { Badge, Button, Empty, Input, Label, Select, Textarea } from "./ui";

type Send = (a: Action) => Promise<{ ok?: boolean; error?: string }>;

const STATUS: Record<Doc["status"], { label: string; tone: "default" | "un" | "gold" | "green" | "red" }> = {
  draft: { label: "Draft", tone: "default" },
  submitted: { label: "With the Chair", tone: "gold" },
  approved: { label: "Approved", tone: "un" },
  introduced: { label: "On the floor", tone: "gold" },
  passed: { label: "Adopted", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  rejected: { label: "Rejected", tone: "red" },
};

export const ordered = (cl: Clause[]) => [...cl.filter((c) => c.kind === "pre"), ...cl.filter((c) => c.kind === "op")];

export default function Documents({ state, send }: { state: CommitteeView; send: Send }) {
  const me = state.members[state.meId];
  const [title, setTitle] = useState("");
  const docs = [...state.docs].sort((a, b) => order(a) - order(b) || b.at - a.at);
  return (
    <div className="space-y-4">
      {me?.role === "delegate" && state.mode !== "voting" && state.mode !== "adjourned" && (
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title of a new working paper" />
          <Button variant="primary" disabled={!title.trim()} onClick={async () => { const r = await send({ type: "doc_create", title }); if (!r.error) setTitle(""); }}>New paper</Button>
        </div>
      )}
      {docs.length === 0 && <Empty>No papers yet. Blocs usually write working papers during the unmoderated caucus.</Empty>}
      {docs.map((d) => <DocCard key={d.id} doc={d} state={state} send={send} />)}
    </div>
  );
}

function order(d: Doc) {
  return { introduced: 0, approved: 1, submitted: 2, draft: 3, passed: 4, failed: 5, rejected: 6 }[d.status];
}

function DocCard({ doc, state, send }: { doc: Doc; state: CommitteeView; send: Send }) {
  const me = state.members[state.meId];
  const chair = state.meId === state.chairId;
  const isSponsor = doc.sponsors.includes(state.meId);
  const isSignatory = doc.signatories.includes(state.meId);
  const [open, setOpen] = useState(doc.status === "introduced" || isSponsor);
  const [editing, setEditing] = useState(false);
  const [rollCall, setRollCall] = useState(false);
  const amendments = state.amendments.filter((a) => a.docId === doc.id);
  const pendingAmendments = amendments.filter((a) => a.status === "pending");
  const membership = ["draft", "submitted", "approved"].includes(doc.status) && me?.role === "delegate" && doc.authorId !== me.id;

  return (
    <article className="rounded-xl border border-line bg-black/[0.02]">
      <button className="flex w-full items-start justify-between gap-3 p-3 text-left" onClick={() => setOpen(!open)}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {doc.number && <span className="font-mono text-xs text-gold">{doc.number}</span>}
            <span className="font-serif font-semibold">{doc.title}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            Sponsors: {doc.sponsors.map((s) => who(state, s)).join(", ")}
            {doc.signatories.length > 0 && ` · Signatories: ${doc.signatories.map((s) => who(state, s)).join(", ")}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pendingAmendments.length > 0 && <Badge tone="gold">{pendingAmendments.length} amendment{pendingAmendments.length > 1 ? "s" : ""}</Badge>}
          <Badge tone={STATUS[doc.status].tone}>{doc.kind === "wp" && doc.status === "draft" ? "Working paper" : STATUS[doc.status].label}</Badge>
          <span className="text-muted">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line p-3">
          {editing ? (
            <Editor doc={doc} send={send} onDone={() => setEditing(false)} />
          ) : (
            <ClauseView doc={doc} />
          )}

          <div className="flex flex-wrap gap-2">
            {isSponsor && doc.status === "draft" && !editing && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
            {isSponsor && doc.status === "draft" && !editing && <Button size="sm" variant="primary" onClick={() => send({ type: "doc_submit", id: doc.id })}>Submit to the Chair</Button>}
            {membership && (
              <>
                <Button size="sm" variant={isSponsor ? "primary" : "outline"} onClick={() => send({ type: "doc_join", id: doc.id, as: isSponsor ? "leave" : "sponsor" })}>{isSponsor ? "Stop sponsoring" : "Sponsor"}</Button>
                <Button size="sm" variant={isSignatory ? "primary" : "outline"} onClick={() => send({ type: "doc_join", id: doc.id, as: isSignatory ? "leave" : "signatory" })}>{isSignatory ? "Remove signature" : "Sign"}</Button>
              </>
            )}
            {chair && doc.status === "submitted" && (
              <>
                <Button size="sm" variant="gold" onClick={() => send({ type: "doc_review", id: doc.id, decision: "approve" })}>Approve as draft resolution</Button>
                <Button size="sm" onClick={() => send({ type: "doc_review", id: doc.id, decision: "reject" })}>Return for changes</Button>
              </>
            )}
            {chair && doc.status === "approved" && <Button size="sm" variant="gold" onClick={() => send({ type: "doc_introduce", id: doc.id })}>Introduce to the floor</Button>}
            {chair && doc.status === "introduced" && state.mode === "voting" && (
              <span className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={rollCall} onChange={(e) => setRollCall(e.target.checked)} /> Roll call</label>
                <Button size="sm" variant="gold" disabled={!!state.vote || pendingAmendments.length > 0} onClick={() => send({ type: "vote_open", subject: { kind: "doc", id: doc.id }, rollCall })}>
                  Vote on resolution
                </Button>
              </span>
            )}
          </div>

          {doc.status === "introduced" || amendments.length > 0 ? <Amendments doc={doc} state={state} send={send} /> : null}
        </div>
      )}
    </article>
  );
}

function ClauseView({ doc }: { doc: Doc }) {
  const list = ordered(doc.clauses);
  if (!list.length) return <Empty>No clauses yet.</Empty>;
  let op = 0;
  return (
    <div className="space-y-1.5 rounded-lg bg-ink/50 p-3 font-serif text-[15px] leading-relaxed">
      {list.map((c) => (
        <p key={c.id} className={c.kind === "pre" ? "italic text-fg/85" : ""}>
          {c.kind === "op" && <span className="mr-2 font-sans text-xs text-gold">{++op}.</span>}
          {c.text || <span className="text-muted">(empty)</span>}
        </p>
      ))}
    </div>
  );
}

function Editor({ doc, send, onDone }: { doc: Doc; send: Send; onDone: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [clauses, setClauses] = useState<Clause[]>(ordered(doc.clauses));
  const update = (id: string, patch: Partial<Clause>) => setClauses(clauses.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const save = async () => { const r = await send({ type: "doc_update", id: doc.id, title, clauses }); if (!r.error) onDone(); };

  return (
    <div className="space-y-2">
      <div>
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <p className="text-xs text-muted">
        Preambulatory clauses give background and start with words like <em>Recalling</em>, <em>Noting with concern</em>. Operative clauses are the actions and start with a verb such as <em>Urges</em>, <em>Calls upon</em>.
      </p>
      {clauses.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Select value={c.kind} onChange={(e) => update(c.id, { kind: e.target.value as Clause["kind"] })} className="w-32! shrink-0 py-1! text-xs">
            <option value="pre">Preambulatory</option>
            <option value="op">Operative</option>
          </Select>
          <Textarea rows={2} value={c.text} onChange={(e) => update(c.id, { text: e.target.value })} placeholder={c.kind === "pre" ? "Recalling…" : "Urges member states to…"} />
          <button className="px-1 text-muted hover:text-red-700" onClick={() => setClauses(clauses.filter((x) => x.id !== c.id))} aria-label="Delete clause">✕</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setClauses([...clauses, { id: uid(), kind: "pre", text: "" }])}>+ Preambulatory</Button>
        <Button size="sm" onClick={() => setClauses([...clauses, { id: uid(), kind: "op", text: "" }])}>+ Operative</Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={save}>Save</Button>
      </div>
    </div>
  );
}

function Amendments({ doc, state, send }: { doc: Doc; state: CommitteeView; send: Send }) {
  const me = state.members[state.meId];
  const chair = state.meId === state.chairId;
  const list = state.amendments.filter((a) => a.docId === doc.id);
  const [action, setAction] = useState<"add" | "modify" | "strike">("add");
  const [clauseId, setClauseId] = useState("");
  const [kind, setKind] = useState<"pre" | "op">("op");
  const [text, setText] = useState("");
  const [rollCall, setRollCall] = useState(false);
  const clauses = ordered(doc.clauses);
  const clauseLabel = (id?: string) => {
    let n = 0;
    for (const c of clauses) {
      if (c.kind === "op") n++;
      if (c.id === id) return c.kind === "op" ? `operative clause ${n}` : `preambulatory "${c.text.slice(0, 30)}…"`;
    }
    return "a removed clause";
  };
  const canPropose = me?.role === "delegate" && doc.status === "introduced" && state.mode !== "voting";

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Amendments</div>
      {list.length === 0 && <p className="text-xs text-muted">None proposed. If every sponsor agrees, an amendment is friendly and added straight away. Otherwise it is voted on before the resolution.</p>}
      {list.map((a) => (
        <div key={a.id} className="rounded-lg border border-line p-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-medium">{who(state, a.proposerId)}</span>{" "}
              <span className="text-muted">{a.action === "add" ? `adds a ${a.clauseKind === "pre" ? "preambulatory" : "operative"} clause` : a.action === "modify" ? `rewrites ${clauseLabel(a.clauseId)}` : `strikes ${clauseLabel(a.clauseId)}`}</span>
            </span>
            <Badge tone={a.status === "friendly" || a.status === "passed" ? "green" : a.status === "pending" ? "gold" : "red"}>{a.status === "pending" ? `pending · ${a.sponsorSupport.length}/${doc.sponsors.length} sponsors agree` : a.status}</Badge>
          </div>
          {a.text && <p className="mt-1 font-serif">{a.text}</p>}
          {a.status === "pending" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {doc.sponsors.includes(state.meId) && !a.sponsorSupport.includes(state.meId) && <Button size="sm" variant="primary" onClick={() => send({ type: "amend_support", id: a.id })}>Agree as sponsor</Button>}
              {chair && <Button size="sm" variant="ghost" onClick={() => send({ type: "amend_reject", id: a.id })}>Rule out</Button>}
              {chair && state.mode === "voting" && (
                <>
                  <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={rollCall} onChange={(e) => setRollCall(e.target.checked)} /> Roll call</label>
                  <Button size="sm" variant="gold" disabled={!!state.vote} onClick={() => send({ type: "vote_open", subject: { kind: "amendment", id: a.id }, rollCall })}>Vote on amendment</Button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {canPropose && (
        <div className="space-y-2 rounded-lg bg-black/[0.02] p-2.5">
          <div className="flex flex-wrap gap-2">
            <Select value={action} onChange={(e) => setAction(e.target.value as typeof action)} className="w-auto! py-1! text-xs">
              <option value="add">Add a clause</option>
              <option value="modify">Rewrite a clause</option>
              <option value="strike">Strike a clause</option>
            </Select>
            {action === "add" ? (
              <Select value={kind} onChange={(e) => setKind(e.target.value as "pre" | "op")} className="w-auto! py-1! text-xs">
                <option value="op">Operative</option>
                <option value="pre">Preambulatory</option>
              </Select>
            ) : (
              <Select value={clauseId} onChange={(e) => setClauseId(e.target.value)} className="w-auto! flex-1 py-1! text-xs">
                <option value="">Which clause?</option>
                {clauses.map((c) => <option key={c.id} value={c.id}>{clauseLabel(c.id)}</option>)}
              </Select>
            )}
          </div>
          {action !== "strike" && <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="New clause text" />}
          <Button size="sm" variant="primary" disabled={(action !== "strike" && !text.trim()) || (action !== "add" && !clauseId)} onClick={async () => {
            const r = await send({ type: "amend_propose", docId: doc.id, action, clauseId: clauseId || undefined, clauseKind: kind, text });
            if (!r.error) { setText(""); setClauseId(""); }
          }}>Propose amendment</Button>
        </div>
      )}
    </div>
  );
}
