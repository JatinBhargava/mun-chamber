// The director of an AI practice room. It runs the session one small step at a time:
// each call looks at the committee, does the next thing (an AI answers the roll, gives a speech,
// raises a placard, drafts, votes, or the Chair moves the session on) and says when to look again.
// Everything goes through the normal rules engine, exactly as if people had clicked the buttons.
//
// Order of business: roll call → agenda → speakers' list (with yields and Points of Information)
// → moderated caucus → unmoderated caucus (working papers) → draft resolutions introduced
// → amendments → voting procedure (amendments first, one roll call vote) → adjournment → feedback.

import { act, type Room } from "../lib/engine";
import type { Action, Amendment, Member, PracticeFeedback, Speaker, Vote } from "../lib/types";
import { AI, Amend, Brief, CaucusTopic, Decision, Draft, Feedback, Reply, Speech, Votes } from "./ai";

const MAX_CALLS = 60; // Claude calls per practice room; after that the AIs use plain fallback lines
const MOTION_WAIT = 20_000; // time the student gets to make the expected motion themselves
const READ_WAIT = 30_000; // time to read, sign or submit papers before draft resolutions are introduced
const VOTE_WAIT = 45_000; // time the student gets to vote before the Chair closes the vote
const ROLL_WAIT = 30_000; // time the student gets to answer when called in a roll call vote
const PLACARD_WAIT = 4_000; // pause between caucus speakers so the student can raise a placard
const CAUCUS_TURNS = 5;
const UNMOD_SEC = 150; // unmoderated caucus length
const QA_AI_AFTER = 8_000; // after a yield to questions, an AI asks if the student hasn't
const QA_WAIT = 22_000; // how long an AI speaker stays open to questions
const AMEND_AI_AFTER = 10_000; // when an AI proposes its amendment during debate
const AMEND_WAIT = 60_000; // debate time on the draft resolutions before an AI moves to close debate

type Ballot3 = "yes" | "no" | "abstain";

export interface DirectorState {
  nextAt: number | null;
  calls: number;
  stageAt: number;
  briefs: Record<string, { position: string; style: string }>; // by member id
  turn: string | null; // the AI floor turn that already has its speech
  speechEndsAt: number | null;
  pendingSpeech: { memberId: string; text: string } | null; // prepared text for the next AI turn (introductions, amendments)
  qaAi: string | null; // the AI speaker who yields to questions on the speakers' list
  qa: { key: string; since: number; asked: number; askers: string[]; answered: string[] } | null;
  caucusTurns: number;
  placardUntil: number | null;
  unmodStep: "motion" | "writing";
  docId: string | null; // the AI working paper / draft resolution
  intros: Record<string, string>; // introduction speeches by doc id
  draftStep: "approved" | "speaking";
  introQueue: string[];
  amendStep: "open" | "closing";
  aiAmended: boolean;
  voteAt: number | null;
  aiVoted: string | null; // vote id the AI ballots were decided for
  ballots: Record<string, Ballot3>;
  turnAt: number | null; // when the student's turn in a roll call vote began
  rollDone: boolean; // one resolution vote is taken by roll call
  handled: string[]; // points, motions, notes and amendments from the student already answered
}

export const newDirector = (): DirectorState => ({
  nextAt: null, calls: 0, stageAt: Date.now(), briefs: {}, turn: null, speechEndsAt: null, pendingSpeech: null,
  qaAi: null, qa: null, caucusTurns: 0, placardUntil: null, unmodStep: "motion", docId: null, intros: {},
  draftStep: "approved", introQueue: [], amendStep: "open", aiAmended: false, voteAt: null, aiVoted: null,
  ballots: {}, turnAt: null, rollDone: false, handled: [],
});

export interface Host {
  room: Room;
  ai: AI;
  speed: number; // >1 shortens every wait (local testing only)
  studentOnline: () => boolean;
  broadcast: () => void;
}

/** Runs one step. Sets d.nextAt to when the next step is due (null: wait for the student). */
export async function direct(h: Host, d: DirectorState): Promise<void> {
  const c = h.room.c;
  const p = c.practice;
  d.nextAt = null;
  if (!p || p.stage === "done") return;
  const student = c.members[p.humanId];
  if (!student || !h.studentOnline()) return; // paused until the student is back

  const now = Date.now();
  const wait = (ms: number) => Math.round(ms / h.speed);
  const chair = c.chairId;
  const ais = Object.values(c.members).filter((m) => m.ai && m.role === "delegate").sort((a, b) => (a.country ?? "").localeCompare(b.country ?? ""));
  const run = (id: string, a: Action) => {
    const r = act(h.room, id, a);
    if (r.error) console.warn("practice:", a.type, "->", r.error);
    return !r.error;
  };
  const say = (text: string) => run(chair, { type: "chair_note", text });
  const next = (ms: number) => { d.nextAt = Date.now() + wait(ms); };
  const until = (t: number) => { d.nextAt = t; };
  const ask = async <T>(who: string, fn: () => Promise<T | null>): Promise<T | null> => {
    if (d.calls >= MAX_CALLS || !h.ai.available) return null;
    d.calls++;
    p.thinking = who;
    h.broadcast();
    try { return await fn(); } finally { p.thinking = null; }
  };
  const anyone = (list: Member[]) => list[Math.floor(Math.random() * list.length)];

  // ---------- 1. Answer anything the student just did ----------

  const point = c.points.find((x) => x.fromId === student.id && x.status === "open" && !d.handled.includes(x.id));
  if (point) {
    d.handled.push(point.id);
    const r = await ask(chair, () => h.ai.ask("reply", Reply, `${context(c, d)}

You are the Chair. The delegate of ${student.country} rose to a ${point.type.replace("_", " ")} point${point.text ? `: "${point.text}"` : " (no details given)"}.
Reply as the Chair in 1-2 sentences, under 45 words. For a point of order or inquiry, explain the relevant MUN rule briefly. For personal privilege, address the problem kindly.`));
    run(chair, { type: "resolve_point", id: point.id, response: r?.text ?? "Thank you, delegate. The Chair has noted your point." });
    return next(800);
  }

  // Motions the current stage is waiting for are handled by the stage itself.
  const expects = (t: string) =>
    (p.stage === "agenda" && t === "set_agenda") ||
    (p.stage === "motion" && t === "mod_caucus") ||
    (p.stage === "unmod" && d.unmodStep === "motion" && t === "unmod_caucus") ||
    (p.stage === "unmod" && c.mode === "unmod" && t === "extend") ||
    (p.stage === "amendments" && t === "close_debate") ||
    (p.stage === "adjourn" && t === "adjourn");
  const motion = c.motions.find((m) => m.proposerId === student.id && m.status === "pending" && !d.handled.includes(m.id));
  if (motion && !expects(motion.type)) {
    d.handled.push(motion.id);
    if (motion.type === "adjourn") {
      run(chair, { type: "rule_motion", id: motion.id, ruling: "fail" });
      say("The Chair will close this practice round now and prepare your feedback.");
      p.stage = "feedback";
      return next(1000);
    }
    run(chair, { type: "rule_motion", id: motion.id, ruling: "out_of_order" });
    say(p.stage === "gsl"
      ? "Thank you, delegate. Motions are in order once the speakers' list is finished; please move it again then."
      : "Thank you, delegate. In this practice round the Chair keeps to the planned order of business, so that motion is out of order. Good instinct to use motions, though.");
    return next(800);
  }

  // A paper the student submitted to the Chair: approve it while papers can still be introduced.
  const submitted = c.docs.find((x) => x.status === "submitted" && (x.authorId === student.id || x.sponsors.includes(student.id)));
  if (submitted) {
    const open = ["intro", "rollcall", "agenda", "gsl", "motion", "modcaucus", "unmod"].includes(p.stage) || (p.stage === "drafting" && d.draftStep === "approved");
    if (open) {
      run(chair, { type: "doc_review", id: submitted.id, decision: "approve" });
      say(`Thank you, delegate of ${student.country}. The Chair approves "${submitted.title}". It will be introduced with the other draft resolutions.`);
    } else {
      run(chair, { type: "doc_review", id: submitted.id, decision: "reject" });
      say("Thank you, delegate. Draft resolutions have already been introduced, so the Chair returns your paper. Next time, submit it before the introductions.");
    }
    return next(800);
  }

  const note = [...h.room.chits].reverse().find((x) => x.fromId === student.id && !d.handled.includes(x.id));
  if (note) {
    for (const x of h.room.chits) if (x.fromId === student.id && !d.handled.includes(x.id)) d.handled.push(x.id);
    const to = c.members[note.toId];
    if (to?.ai && c.chitsEnabled) {
      const asChair = to.role === "chair";
      const r = await ask(to.id, () => h.ai.ask("reply", Reply, `${context(c, d)}

${asChair ? "You are the Chair." : `You are the delegate of ${to.country}. ${brief(d, to)}`}
The delegate of ${student.country} passed you a note: "${note.text}"
Write your reply note: 1-2 sentences, under 40 words, in character.`));
      run(to.id, { type: "chit_send", toId: student.id, text: r?.text ?? "Thank you for your note. Let's talk during the next caucus." });
    }
    d.handled = d.handled.slice(-300);
    return next(800);
  }

  // ---------- 2. Someone has the floor ----------

  const timeLeft = (sp: Speaker) => (sp.paused || sp.endsAt === null ? sp.remainingMs : sp.endsAt - Date.now());
  // Long enough for the browser to read it aloud (about 150 words a minute), within their time.
  const readFor = (text: string, sp: Speaker) =>
    wait(Math.min(Math.max(4000, timeLeft(sp) - 1500), (text.split(/\s+/).length / 2.5) * 1000 + 1500));
  const openQa = (key: string) => (d.qa?.key === key ? d.qa : (d.qa = { key, since: Date.now(), asked: 0, askers: [], answered: [] }));

  /** An AI delegate asks the speaker a Point of Information. */
  const askQuestion = async (speaker: Member, qa: NonNullable<DirectorState["qa"]>) => {
    const asker = anyone(ais.filter((m) => m.id !== speaker.id && !qa.askers.includes(m.id)));
    if (!asker) return false;
    qa.asked++;
    qa.askers.push(asker.id);
    const r = await ask(asker.id, () => h.ai.ask("question", Reply, `${context(c, d)}

You are the delegate of ${asker.country}. ${brief(d, asker)}
The delegate of ${speaker.country} has yielded to questions after their speech. Ask one pointed but polite Point of Information about what they just said: a single question, under 30 words.`));
    if (c.speaker?.memberId !== speaker.id || !c.speaker.yieldedToQuestions) return true;
    run(asker.id, { type: "raise_point", point: "information", text: r?.text?.trim() || "Could the delegate explain how their proposals would be funded and monitored?" });
    return true;
  };

  const studentFloor = async (sp: Speaker, key: string): Promise<boolean> => {
    const end = sp.paused || sp.endsAt === null ? null : sp.endsAt + 600;
    if (!sp.yieldedToQuestions) { d.nextAt = end; return true; }
    // The student yielded to questions: the AI delegates ask up to two, waiting for each answer.
    const qa = openQa(key);
    const spoke = c.log.filter((l) => l.memberId === student.id && (l.kind === "speech" || l.kind === "transcript") && l.at >= qa.since);
    const lastQ = c.log.filter((l) => l.kind === "question" && l.at >= qa.since).at(-1);
    const answered = !lastQ || spoke.some((l) => l.at > lastQ.at);
    const quiet = Date.now() - (spoke.at(-1)?.at ?? 0) > 4000;
    const ready = qa.asked === 0 ? Date.now() > qa.since + wait(1500) : answered && quiet;
    if (qa.asked < 2 && timeLeft(sp) > 15_000 && ready) {
      await askQuestion(student, qa);
      return next(1500), true;
    }
    d.nextAt = end === null ? null : Math.min(end, Date.now() + wait(2000));
    return true;
  };

  const aiQuestions = async (m: Member, sp: Speaker, key: string): Promise<boolean> => {
    const qa = openQa(key);
    if (Date.now() < (d.speechEndsAt ?? 0)) return until(d.speechEndsAt!), true;
    const q = c.log.find((l) => l.kind === "question" && l.at >= qa.since && !qa.answered.includes(l.id));
    if (q) {
      qa.answered.push(q.id);
      const from = q.memberId ? c.members[q.memberId] : undefined;
      const r = await ask(m.id, () => h.ai.ask("answer", Speech, `${context(c, d)}

You are the delegate of ${m.country}. ${brief(d, m)}
You yielded to questions. The delegate of ${from?.country ?? "another country"} asks: "${q.text.replace(/^Point of Information to [^:]+: /, "")}"
Answer in 25-45 words, directly and diplomatically.`));
      if (c.speaker?.memberId !== m.id) return true;
      const text = r?.text?.trim() || "Thank you for the question. Our delegation believes shared standards and fair funding answer that concern, and we welcome further talks.";
      run(m.id, { type: "text_speech", text });
      d.speechEndsAt = Date.now() + readFor(text, sp);
      return until(d.speechEndsAt), true;
    }
    const studentAsked = c.log.some((l) => l.kind === "question" && l.at >= qa.since && l.memberId === student.id);
    if (qa.asked === 0 && !studentAsked && Date.now() >= qa.since + wait(QA_AI_AFTER)) {
      await askQuestion(m, qa);
      return next(800), true;
    }
    if (Date.now() < qa.since + wait(QA_WAIT)) return until(qa.since + wait(QA_WAIT)), true;
    if (!run(m.id, { type: "yield", to: "chair" })) run(chair, { type: "end_speech" });
    return next(1200), true;
  };

  const floor = async (): Promise<boolean> => {
    const sp = c.speaker;
    if (!sp) return false;
    const m = c.members[sp.memberId];
    const key = `${sp.memberId}:${m?.speeches ?? 0}`;
    if (!m?.ai) return studentFloor(sp, key);
    const plansQuestions = p.stage === "gsl" && sp.kind === "gsl" && m.id === d.qaAi;
    if (d.turn !== key) {
      let text: string;
      if (d.pendingSpeech?.memberId === m.id) text = d.pendingSpeech.text;
      else {
        const caucus = c.caucus?.kind === "mod" ? c.caucus.topic : null;
        const task = sp.kind === "yield"
          ? "Another delegate yielded their remaining time to you. Respond in 30-50 words."
          : caucus
            ? `This is a moderated caucus on "${caucus}". Give a 40-70 word intervention that responds directly to at least one other delegate by country name and adds one concrete idea.`
            : `Give your opening speech on the General Speakers' List: ${plansQuestions ? "50-70" : "70-100"} words. Start with a formal address to the Chair, state your position and one or two concrete proposals, and end by inviting cooperation.`;
        const r = await ask(m.id, () => h.ai.ask("speech", Speech, `${context(c, d)}

You are the delegate of ${m.country}. ${brief(d, m)}
${task}`));
        text = r?.text?.trim() || fallbackSpeech(m, c.agenda ?? "");
      }
      // Still their turn after the wait for Claude?
      if (c.speaker?.memberId !== m.id || `${m.id}:${m.speeches}` !== key) return true;
      run(m.id, { type: "text_speech", text });
      if (d.pendingSpeech?.memberId === m.id) d.pendingSpeech = null;
      d.turn = key;
      d.speechEndsAt = Date.now() + readFor(text, sp);
      return until(d.speechEndsAt), true;
    }
    if (sp.yieldedToQuestions) return aiQuestions(m, sp, key);
    if (Date.now() < (d.speechEndsAt ?? 0)) return until(d.speechEndsAt!), true;
    if (plansQuestions && timeLeft(sp) > 15_000) {
      run(m.id, { type: "yield", to: "questions" });
      openQa(key);
      say("Delegates who wish to question the speaker may now raise a Point of Information.");
      return next(1500), true;
    }
    if (!run(m.id, { type: "yield", to: "chair" })) run(chair, { type: "end_speech" });
    return next(1200), true;
  };

  // ---------- votes ----------

  const vote = async (): Promise<boolean> => {
    const v = c.vote;
    if (!v) return false;
    if (d.aiVoted !== v.id) {
      d.aiVoted = v.id;
      d.voteAt = now;
      d.turnAt = null;
      d.ballots = {};
      if (v.procedural) for (const m of ais) d.ballots[m.id] = "yes";
      else {
        const r = await ask(chair, () => h.ai.ask("votes", Votes, `${context(c, d)}

${subjectText(c, v)}

Decide how each of these delegations votes, consistent with their positions and the debate. Usually most delegations vote yes on a resolution; a country with strong objections may vote no or abstain. Sponsors usually vote against unfriendly amendments to their own resolution.
Delegations: ${ais.map((m) => m.country).join(", ")}`));
        for (const m of ais) d.ballots[m.id] = r?.votes.find((x) => x.country === m.country)?.vote ?? "yes";
      }
      for (const m of ais) if (d.ballots[m.id] === "abstain" && m.attendance === "present_voting") d.ballots[m.id] = "yes";
      if (!v.rollCall) {
        for (const m of ais) {
          if (!c.vote || c.vote.id !== v.id) break;
          run(m.id, { type: "vote_cast", ballot: d.ballots[m.id] ?? "yes" });
        }
      }
      next(1000);
      return true;
    }

    if (v.rollCall) {
      const calling = c.members[v.rollOrder[v.rollIndex]];
      if (calling?.ai) {
        d.turnAt = null;
        run(calling.id, { type: "vote_cast", ballot: d.ballots[calling.id] ?? "yes" });
        next(1400);
        return true;
      }
      d.turnAt ??= now;
      if (now < d.turnAt + wait(ROLL_WAIT)) return until(d.turnAt + wait(ROLL_WAIT)), true;
      say(`The delegate of ${student.country} did not answer in time; the Chair closes the vote.`);
      run(chair, { type: "vote_close" });
      next(1200);
      return true;
    }

    if (v.open && !v.ballots[student.id] && now < (d.voteAt ?? now) + wait(VOTE_WAIT)) return until((d.voteAt ?? now) + wait(VOTE_WAIT)), true;
    if (c.vote?.open) {
      if (!c.vote.ballots[student.id]) say(`The delegate of ${student.country} did not vote in time; the Chair closes the vote.`);
      run(chair, { type: "vote_close" });
    }
    next(1200);
    return true;
  };

  /** Handles a stage that waits for one motion: the student gets a moment to move it, then an AI does. */
  const motionStep = async (type: "set_agenda" | "mod_caucus" | "unmod_caucus" | "close_debate" | "adjourn", aiMove: () => Promise<{ by: string; action: Action }>): Promise<"waiting" | "failed"> => {
    const recent = c.motions.filter((m) => m.type === type && m.at >= d.stageAt);
    const pending = recent.find((m) => m.status === "pending");
    if (pending) {
      run(chair, { type: "rule_motion", id: pending.id, ruling: "vote" });
      next(800);
      return "waiting";
    }
    if (recent.some((m) => m.status === "failed")) return "failed";
    if (now < d.stageAt + wait(MOTION_WAIT)) { until(d.stageAt + wait(MOTION_WAIT)); return "waiting"; }
    const m = await aiMove();
    run(m.by, m.action);
    next(1200);
    return "waiting";
  };

  const startGsl = () => {
    if (c.mode !== "gsl") run(chair, { type: "set_mode", mode: "gsl" });
    const order = ais.map((m) => m.id).sort(() => Math.random() - 0.5);
    order.splice(2, 0, student.id); // the student speaks third
    d.qaAi = order[1]; // the speaker before the student shows how yielding to questions works
    for (const id of order) run(chair, { type: "gsl_add", memberId: id });
    say(`The speakers' list is open with ${c.gslSpeakingSec} seconds per speaker. Order: ${order.map((id) => c.members[id]?.country).join(", ")}. After speaking, a delegate may yield to the Chair, to questions, or to another delegate.`);
    p.stage = "gsl";
    return next(2500);
  };

  const toUnmod = (lead: string) => {
    say(`${lead} The floor is open to motions. The Chair would welcome a motion for an unmoderated caucus, so delegates can write working papers.`);
    p.stage = "unmod";
    d.unmodStep = "motion";
    d.stageAt = Date.now();
    return next(MOTION_WAIT);
  };

  const toAdjourn = (lead: string) => {
    say(`${lead} The Chair would now entertain a motion to adjourn the meeting.`);
    p.stage = "adjourn";
    d.stageAt = Date.now();
    return next(MOTION_WAIT);
  };

  // ---------- 3. The planned order of business ----------

  switch (p.stage) {
    case "intro": {
      const r = await ask(chair, () => h.ai.ask("brief", Brief, `Topic: "${c.agenda}".
Write the Chair's welcome, and a short position and debating style for each of these AI delegations:
${ais.map((m) => `- ${m.country}: AI delegation`).join("\n")}
The student represents ${student.country}; do not include it.`));
      for (const m of ais) {
        const s = r?.stances.find((x) => x.country === m.country);
        d.briefs[m.id] = { position: s?.position ?? `${m.country} wants practical cooperation that respects national sovereignty.`, style: s?.style ?? "measured" };
      }
      say(r?.opening ?? `Good day, delegates, and welcome. Today's topic is "${c.agenda}". We begin with the roll call.`);
      run(chair, { type: "set_mode", mode: "rollcall" });
      p.stage = "rollcall";
      return next(2000);
    }

    case "rollcall": {
      const absent = ais.find((m) => m.attendance === "absent");
      if (absent) {
        run(absent.id, { type: "answer_roll", attendance: Math.random() < 0.5 ? "present" : "present_voting" });
        return next(900);
      }
      if (student.attendance === "absent") return; // waiting for the student to answer
      run(chair, { type: "set_mode", mode: "agenda" });
      say(`Thank you, delegates. Next we set the agenda. The floor is open for a motion to set the agenda to "${c.topics[0]}".`);
      p.stage = "agenda";
      d.stageAt = Date.now();
      return next(MOTION_WAIT);
    }

    case "agenda": {
      if (await vote()) return;
      if (c.mode !== "agenda") return startGsl(); // the motion passed
      const r = await motionStep("set_agenda", async () => ({ by: anyone(ais).id, action: { type: "propose_motion", motion: "set_agenda", topic: c.topics[0] } }));
      if (r === "failed") {
        say("The motion fails, but with only one topic before the committee, the Chair sets the agenda.");
        run(chair, { type: "set_agenda", topic: c.topics[0] });
        return startGsl();
      }
      return;
    }

    case "gsl": {
      if (await floor()) return;
      if (c.gsl.length) {
        run(chair, { type: "gsl_next" });
        return next(800);
      }
      say("The speakers' list is exhausted. The floor is now open to motions. Delegates may move a moderated caucus on a focused sub-topic.");
      p.stage = "motion";
      d.stageAt = now;
      return next(MOTION_WAIT);
    }

    case "motion": {
      if (await vote()) return;
      if (c.mode === "modcaucus") {
        p.stage = "modcaucus";
        d.caucusTurns = 0;
        d.placardUntil = null;
        return next(1500);
      }
      const r = await motionStep("mod_caucus", async () => {
        const mover = anyone(ais);
        const t = await ask(mover.id, () => h.ai.ask("caucusTopic", CaucusTopic, `${context(c, d)}

You are the delegate of ${mover.country}. Propose the sub-topic for a moderated caucus that would move this debate forward.`));
        return { by: mover.id, action: { type: "propose_motion", motion: "mod_caucus", topic: t?.topic ?? "Funding and accountability", totalSec: 240, perSpeakerSec: 45 } };
      });
      if (r === "failed") return toUnmod("The motion fails.");
      return;
    }

    case "modcaucus": {
      if (c.mode !== "modcaucus") return toUnmod("The moderated caucus has ended.");
      if (await floor()) return;
      if (d.caucusTurns >= CAUCUS_TURNS) {
        run(chair, { type: "end_caucus" });
        return toUnmod("Thank you, delegates. The Chair closes the moderated caucus.");
      }
      if (d.placardUntil === null) {
        // Two AI delegates who have spoken least raise their placards; the student gets a moment to do the same.
        const lastSpeaker = d.turn?.split(":")[0];
        for (const m of [...ais].filter((x) => x.id !== lastSpeaker).sort((a, b) => a.speeches - b.speeches || Math.random() - 0.5).slice(0, 2)) {
          if (!m.placard) run(m.id, { type: "placard", up: true });
        }
        d.placardUntil = now + wait(PLACARD_WAIT);
        return until(d.placardUntil);
      }
      if (now < d.placardUntil && !student.placard) return until(d.placardUntil);
      const pickAi = ais.filter((m) => m.placard).sort((a, b) => a.speeches - b.speeches)[0] ?? ais[0];
      const chosen = student.placard ? student : pickAi;
      run(chair, { type: "recognize", memberId: chosen.id });
      d.caucusTurns++;
      d.placardUntil = null;
      return next(800);
    }

    case "unmod": {
      if (await vote()) return;
      if (d.unmodStep === "motion") {
        if (c.mode === "unmod") { d.unmodStep = "writing"; return next(1500); }
        const r = await motionStep("unmod_caucus", async () => ({ by: anyone(ais).id, action: { type: "propose_motion", motion: "unmod_caucus", topic: "Writing working papers", totalSec: UNMOD_SEC } }));
        if (r === "failed") {
          say("The motion fails. The sponsors will submit their working paper directly.");
          d.unmodStep = "writing";
          return next(1000);
        }
        return;
      }

      // Writing: an AI bloc starts a working paper and invites the student to join it.
      if (!d.docId) {
        const [sponsor, cosponsor, signer] = [...ais].sort(() => Math.random() - 0.5);
        const r = await ask(sponsor.id, () => h.ai.ask("draft", Draft, `${context(c, d)}

You are the delegate of ${sponsor.country}, writing a short working paper with ${cosponsor.country} that reflects today's debate, including points the student made if they fit.`));
        const draft = r ?? fallbackDraft(c.agenda ?? "the topic");
        run(sponsor.id, { type: "doc_create", title: draft.title });
        const doc = [...c.docs].reverse().find((x) => x.authorId === sponsor.id);
        if (!doc) return toAdjourn("The Chair could not open a working paper.");
        d.docId = doc.id;
        d.intros[doc.id] = draft.introduction;
        run(sponsor.id, {
          type: "doc_update", id: doc.id,
          clauses: [
            ...draft.preambulatory.slice(0, 3).map((t, i) => ({ id: `p${i + 1}`, kind: "pre" as const, text: t })),
            ...draft.operative.slice(0, 5).map((t, i) => ({ id: `o${i + 1}`, kind: "op" as const, text: t })),
          ],
        });
        run(cosponsor.id, { type: "doc_join", id: doc.id, as: "sponsor" });
        if (signer) run(signer.id, { type: "doc_join", id: doc.id, as: "signatory" });
        run(sponsor.id, { type: "chit_send", toId: student.id, text: `We've started a working paper, "${doc.title}", in the Documents tab. Join as a sponsor to add your own clauses, or sign it as a signatory. You can also write your own paper.` });
        if (c.mode === "unmod") say("Delegates, use this unmoderated caucus to write working papers in the Documents tab. Submit a paper to the Chair before the caucus ends to have it introduced.");
        return next(2000);
      }
      const ext = c.motions.find((m) => m.type === "extend" && m.status === "pending");
      if (ext) {
        run(chair, { type: "rule_motion", id: ext.id, ruling: "vote" });
        return next(800);
      }
      if (c.mode === "unmod" && c.caucus) {
        // Look again when the caucus ends (the student's edits and notes wake the director earlier).
        return until(c.caucus.endsAt === null ? now + wait(5000) : c.caucus.endsAt + 800);
      }
      // Caucus over: the AI paper goes to the Chair and becomes a draft resolution.
      const doc = c.docs.find((x) => x.id === d.docId);
      if (doc?.status === "draft") run(doc.authorId, { type: "doc_submit", id: doc.id });
      if (doc?.status === "submitted") run(chair, { type: "doc_review", id: doc.id, decision: "approve" });
      const unsent = c.docs.find((x) => x.authorId === student.id && x.status === "draft");
      const approved = c.docs.filter((x) => x.status === "approved");
      say(`${approved.map((x) => `${x.number} "${x.title}"`).join(" and ") || "No paper"} ${approved.length === 1 ? "is" : "are"} approved. You have 30 seconds to read, sign or sponsor before introduction.${unsent ? ` Delegate of ${student.country}, your paper "${unsent.title}" hasn't been submitted yet: submit it now if you want it introduced.` : ""}`);
      p.stage = "drafting";
      d.draftStep = "approved";
      d.stageAt = Date.now();
      return next(READ_WAIT);
    }

    case "drafting": {
      if (await vote()) return;
      if (d.draftStep === "approved") {
        const mine = c.docs.find((x) => x.id === d.docId);
        const joined = !!mine && (mine.sponsors.includes(student.id) || mine.signatories.includes(student.id));
        const writing = c.docs.some((x) => x.authorId === student.id && x.status === "draft");
        if ((!joined || writing) && now < d.stageAt + wait(READ_WAIT)) return until(d.stageAt + wait(READ_WAIT));
        const docs = c.docs.filter((x) => x.status === "approved").sort((a, b) => Number(b.id === d.docId) - Number(a.id === d.docId));
        if (!docs.length) return toAdjourn("There are no draft resolutions to debate.");
        for (const x of docs) run(chair, { type: "doc_introduce", id: x.id });
        d.introQueue = docs.map((x) => x.id);
        d.draftStep = "speaking";
        return next(800);
      }
      if (await floor()) return;
      const id = d.introQueue.shift();
      if (id) {
        const doc = c.docs.find((x) => x.id === id);
        const author = doc && c.members[doc.authorId];
        if (!doc || !author) return next(300);
        if (author.ai) d.pendingSpeech = { memberId: author.id, text: d.intros[doc.id] ?? `Honourable Chair, ${doc.number} reflects the common ground we found today. We invite every delegation to support it.` };
        else say(`The Chair recognizes the delegate of ${author.country} to introduce ${doc.number}. Read your key operative clauses and say why delegates should support it.`);
        run(chair, { type: "recognize", memberId: author.id, seconds: 60 });
        return next(800);
      }
      const many = c.docs.filter((x) => x.status === "introduced").length > 1;
      say(`Debate is now open on the draft resolution${many ? "s" : ""}. Delegates may propose amendments in the Documents tab. If every sponsor agrees, an amendment is friendly and added at once; otherwise it is voted on in voting procedure.`);
      p.stage = "amendments";
      d.amendStep = "open";
      d.stageAt = Date.now();
      return next(3000);
    }

    case "amendments": {
      if (await vote()) return;
      if (await floor()) return;

      // The student proposed an amendment: the AI sponsors decide whether it is friendly.
      const theirs = c.amendments.find((a) => a.proposerId === student.id && a.status === "pending" && !d.handled.includes(a.id));
      if (theirs) {
        d.handled.push(theirs.id);
        const doc = c.docs.find((x) => x.id === theirs.docId);
        const aiSponsors = (doc?.sponsors ?? []).map((id) => c.members[id]).filter((m): m is Member => !!m?.ai);
        if (doc && aiSponsors.length) {
          const lead = aiSponsors[0];
          const r = await ask(lead.id, () => h.ai.ask("decision", Decision, `${context(c, d)}

You speak for the sponsors of ${doc.number} "${doc.title}" (${aiSponsors.map((m) => m.country).join(", ")}).
${docText(doc)}

The delegate of ${student.country} proposes this amendment: ${amendmentText(c, theirs)}
Decide whether the sponsors accept it as a friendly amendment. Accept it if it improves the text or broadens support without undermining your position.`));
          const accept = r?.accept ?? true;
          if (accept) for (const s of aiSponsors) run(s.id, { type: "amend_support", id: theirs.id });
          const pending = c.amendments.find((a) => a.id === theirs.id)?.status === "pending";
          say(accept
            ? `The sponsors of ${doc.number} accept the amendment from ${student.country}.${pending ? " It still needs every sponsor's agreement to count as friendly." : ""} ${r?.comment ?? ""}`.trim()
            : `The sponsors of ${doc.number} do not accept the amendment from ${student.country}, so it will be voted on as an unfriendly amendment. ${r?.comment ?? ""}`.trim());
        }
        return next(1000);
      }

      // Once, an AI delegate proposes an amendment and explains it. On the student's own resolution, the student decides.
      if (!d.aiAmended && now >= d.stageAt + wait(AMEND_AI_AFTER)) {
        d.aiAmended = true;
        const introduced = c.docs.filter((x) => x.status === "introduced");
        const target = introduced.find((x) => x.authorId === student.id) ?? introduced.find((x) => x.id === d.docId) ?? introduced[0];
        const proposer = target && anyone(ais.filter((m) => !target.sponsors.includes(m.id)));
        if (target && proposer) {
          const r = await ask(proposer.id, () => h.ai.ask("amendment", Amend, `${context(c, d)}

You are the delegate of ${proposer.country}. ${brief(d, proposer)}
${docText(target)}

Propose one amendment to this draft resolution that would make your delegation more comfortable supporting it: add a new operative clause, modify one, or strike one. Use the clause ids shown above.`));
          const clause = r && target.clauses.find((x) => x.id === r.clauseId);
          const action = r && (r.action === "add" || clause) ? r.action : "add";
          const text = action === "strike" ? "" : r?.text?.trim() || "Encourages regional organizations to share data and best practices with Member States;";
          run(proposer.id, { type: "amend_propose", docId: target.id, action, clauseId: action === "add" ? undefined : clause?.id, clauseKind: "op", text });
          const humanSponsors = target.sponsors.filter((id) => !c.members[id]?.ai);
          if (humanSponsors.includes(student.id) && humanSponsors.length === target.sponsors.length)
            say(`Delegate of ${student.country}, you sponsor ${target.number}, so you decide: click "Agree as sponsor" in the Documents tab to accept this amendment as friendly, or leave it and it will be voted on.`);
          else say(`The sponsors of ${target.number} have not accepted this amendment, so it will be voted on as an unfriendly amendment in voting procedure.`);
          d.pendingSpeech = { memberId: proposer.id, text: r?.speech?.trim() || `Honourable Chair, ${proposer.country} proposes this amendment to make ${target.number} more balanced and practical. We ask delegates to support it.` };
          run(chair, { type: "recognize", memberId: proposer.id, seconds: 45 });
        }
        return next(800);
      }

      if (d.amendStep === "open") {
        const lastAmend = Math.max(0, ...c.amendments.map((a) => a.at));
        const deadline = Math.max(d.stageAt + wait(AMEND_WAIT), lastAmend + wait(25_000));
        const pending = c.motions.find((m) => m.type === "close_debate" && m.status === "pending" && m.at >= d.stageAt);
        if (!pending && now < deadline) return until(deadline);
        if (!pending) {
          const mover = anyone(ais);
          run(mover.id, { type: "propose_motion", motion: "close_debate" });
        }
        const m = c.motions.find((x) => x.type === "close_debate" && x.status === "pending");
        if (m) run(chair, { type: "rule_motion", id: m.id, ruling: "vote" });
        d.amendStep = "closing";
        return next(1000);
      }
      // closing: the vote on closing debate is done
      if (c.mode !== "voting") {
        say("The motion to close debate fails, but in this practice round the Chair moves to voting procedure.");
        run(chair, { type: "set_mode", mode: "voting" });
      }
      say("We are now in voting procedure and the chamber is sealed. We vote first on unfriendly amendments, then on the draft resolutions.");
      p.stage = "voting";
      return next(1500);
    }

    case "voting": {
      if (await vote()) return;
      const introduced = new Set(c.docs.filter((x) => x.status === "introduced").map((x) => x.id));
      const am = c.amendments.find((a) => a.status === "pending" && introduced.has(a.docId));
      if (am) {
        run(chair, { type: "vote_open", subject: { kind: "amendment", id: am.id }, rollCall: false });
        return next(800);
      }
      const doc = c.docs.find((x) => introduced.has(x.id));
      if (doc) {
        const roll = !d.rollDone;
        d.rollDone = true;
        if (roll) say(`The vote on ${doc.number} will be taken by roll call. When the Chair calls your country, answer Yes, No, Abstain, or Pass to be called again at the end.`);
        run(chair, { type: "vote_open", subject: { kind: "doc", id: doc.id }, rollCall: roll });
        return next(800);
      }
      return toAdjourn("That concludes voting procedure.");
    }

    case "adjourn": {
      if (await vote()) return;
      if (c.mode === "adjourned") { p.stage = "feedback"; return next(1500); }
      const r = await motionStep("adjourn", async () => ({ by: anyone(ais).id, action: { type: "propose_motion", motion: "adjourn" } }));
      if (r === "failed") {
        say("The motion fails, but this practice round is complete, so the Chair adjourns the meeting.");
        run(chair, { type: "set_mode", mode: "adjourned" });
        p.stage = "feedback";
        return next(1500);
      }
      return;
    }

    case "feedback": {
      const r = await ask(chair, () => h.ai.ask("feedback", Feedback, `${context(c, d, 40)}

${studentRecord(h.room, student)}

You are the Chair and an experienced MUN coach. Give the student (delegate of ${student.country}) honest, encouraging, specific feedback on this practice session.
Judge: clarity and structure of speeches, staying in character for their country, responding to others, concrete proposals, and correct use of procedure (roll call, setting the agenda, yields and Points of Information, motions, placards, working papers, amendments, voting and adjournment).
If the student barely took part, say so kindly and focus on what to try next time. Score from 1 to 10.`, 4000));
      const fb: PracticeFeedback = r
        ? { ...r, score: Math.max(1, Math.min(10, Math.round(r.score))) }
        : { score: 6, headline: "Thanks for practicing. Here's what to work on next.", strengths: ["You completed a full committee session."], improvements: ["Give a structured opening speech: position, two proposals, a call to cooperate.", "Raise your placard in the moderated caucus and respond to other delegates."], procedureTips: ["Try moving a moderated caucus yourself when the floor opens."], bestMoment: "Taking part in the vote." };
      p.feedback = fb;
      const award = fb.score >= 9 ? "Best Delegate" : fb.score >= 7 ? "Outstanding Delegate" : fb.score >= 5 ? "Honourable Mention" : null;
      if (award) run(chair, { type: "award", memberId: student.id, award });
      say(`${fb.headline}${award ? ` The Chair awards ${student.country} ${award}.` : ""} Your feedback is ready.`);
      if (c.mode !== "adjourned") run(chair, { type: "set_mode", mode: "adjourned" });
      p.stage = "done";
      return;
    }
  }
}

// ---------- prompt helpers ----------

function brief(d: DirectorState, m: Member) {
  const b = d.briefs[m.id];
  return b ? `Your position: ${b.position} Your style: ${b.style}.` : "";
}

function docText(doc: Room["c"]["docs"][number]) {
  return `${doc.number ?? "Working paper"} "${doc.title}" (clause id: text):
${doc.clauses.map((x) => `${x.id}${x.kind === "pre" ? " (preambulatory)" : ""}: ${x.text}`).join("\n")}`;
}

function amendmentText(c: Room["c"], a: Amendment) {
  const doc = c.docs.find((x) => x.id === a.docId);
  const clause = doc?.clauses.find((x) => x.id === a.clauseId);
  if (a.action === "add") return `add the clause "${a.text}"`;
  if (a.action === "strike") return `strike clause ${clause?.id ?? "?"} ("${clause?.text ?? ""}")`;
  return `change clause ${clause?.id ?? "?"} ("${clause?.text ?? ""}") to "${a.text}"`;
}

function subjectText(c: Room["c"], v: Vote) {
  if (v.subject.kind === "amendment") {
    const a = c.amendments.find((x) => x.id === v.subject.id);
    const doc = a && c.docs.find((x) => x.id === a.docId);
    if (!a || !doc) return `Vote: ${v.label}`;
    const sponsors = doc.sponsors.map((id) => c.members[id]?.country).join(", ");
    return `${docText(doc)}
Sponsors: ${sponsors}.

The vote is on an unfriendly amendment by ${c.members[a.proposerId]?.country}: ${amendmentText(c, a)}.`;
  }
  const doc = c.docs.find((x) => x.id === v.subject.id);
  return doc ? `The vote is on this draft resolution.\n${docText(doc)}` : `Vote: ${v.label}`;
}

function context(c: Room["c"], d: DirectorState, entries = 18): string {
  const p = c.practice!;
  const lines = c.log
    .filter((l) => l.kind !== "system" || /moves|recognizes|introduced|passes|fails|caucus|yields|agenda|amendment|approves/i.test(l.text))
    .slice(-entries)
    .map((l) => {
      const m = l.memberId ? c.members[l.memberId] : undefined;
      const who = l.kind === "system" ? "Procedure" : l.kind === "chair" ? "Chair" : `${m?.country ?? "Delegate"}${m?.id === p.humanId ? " (student)" : ""}`;
      return `[${who}] ${l.text.slice(0, 700)}`;
    });
  const roster = Object.values(c.members)
    .filter((m) => m.role === "delegate")
    .map((m) => `- ${m.country}: ${m.id === p.humanId ? "the student" : d.briefs[m.id]?.position ?? "AI delegation"}`)
    .join("\n");
  return `Committee: General Assembly practice session. Topic: "${c.agenda}".
Delegations:
${roster}

Recent floor record (oldest first):
${lines.join("\n") || "(nothing yet)"}`;
}

function studentRecord(room: Room, s: Member): string {
  const c = room.c;
  const said = c.log.filter((l) => l.memberId === s.id).map((l) => `- ${l.kind}: ${l.text.slice(0, 600)}`);
  const yields = c.log.filter((l) => l.kind === "system" && l.text.startsWith(`${s.country} yields`)).map((l) => `- ${l.text}`);
  const motions = c.motions.filter((m) => m.proposerId === s.id).map((m) => `- moved ${m.type}${m.topic ? ` "${m.topic}"` : ""} (${m.status})`);
  const points = c.points.filter((x) => x.fromId === s.id).map((x) => `- ${x.type} point: ${x.text}`);
  const votes = c.voteHistory.map((v) => `- ${v.label}: ${v.ballots[s.id] ?? "did not vote"}`);
  const notes = room.chits.filter((x) => x.fromId === s.id).map((x) => `- note to ${c.members[x.toId]?.country ?? "the Chair"}: ${x.text.slice(0, 200)}`);
  const docs = c.docs.filter((x) => x.sponsors.includes(s.id) || x.signatories.includes(s.id)).map((x) => `- ${x.authorId === s.id ? "wrote" : x.sponsors.includes(s.id) ? "sponsored" : "signed"} ${x.number ?? x.title} (${x.status})`);
  const amends = c.amendments.filter((a) => a.proposerId === s.id).map((a) => `- proposed: ${amendmentText(c, a)} (${a.status})`);
  return `What the student did:
Attendance: ${s.attendance}. Times on the floor: ${s.speeches}.
Speeches, captions, questions and answers:
${said.join("\n") || "- none"}
Yields:
${yields.join("\n") || "- none"}
Motions:
${motions.join("\n") || "- none"}
Points:
${points.join("\n") || "- none"}
Working papers and resolutions:
${docs.join("\n") || "- none"}
Amendments:
${amends.join("\n") || "- none"}
Votes:
${votes.join("\n") || "- none"}
Notes passed:
${notes.join("\n") || "- none"}`;
}

function fallbackSpeech(m: Member, topic: string) {
  return `Honourable Chair, fellow delegates. ${m.country} takes "${topic}" seriously and supports practical, cooperative steps that respect every nation's sovereignty. We are ready to work with all delegations on a balanced resolution. Thank you.`;
}

function fallbackDraft(topic: string) {
  return {
    title: `Cooperation on ${topic}`.slice(0, 80),
    preambulatory: ["Recalling the purposes and principles of the Charter of the United Nations,", "Recognizing the need for coordinated international action,"],
    operative: ["Encourages Member States to share information and best practices;", "Calls upon Member States to support capacity building in developing countries;", "Requests the Secretary-General to report on progress at the next session."],
    introduction: "Honourable Chair, this draft reflects the common ground we heard today: cooperation, shared responsibility and support for those with less capacity. We invite every delegation to support it.",
  };
}
