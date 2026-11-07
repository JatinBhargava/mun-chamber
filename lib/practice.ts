// AI practice rooms: one student, an AI Chair and four AI delegates.
// Shared by the server (setup) and the browser (stage list and coaching hints).

import { UNGA, type Country } from "./countries";
import { createRoom, uid, type Room } from "./engine";
import type { CommitteeView, PracticeStage } from "./types";

export const PRACTICE_TOPICS = [
  "Regulating lethal autonomous weapons",
  "Climate finance for vulnerable nations",
  "Global governance of artificial intelligence",
  "Cybersecurity of critical infrastructure",
  "Vaccine equity and pandemic preparedness",
  "Protecting people displaced by climate change",
  "Reducing plastic pollution in the oceans",
  "Food security in conflict zones",
];

// The AI delegates come from different regions so the debate has real disagreement.
const REGIONS: string[][] = [
  ["United States", "United Kingdom", "France", "Germany", "Canada", "Australia", "Japan", "Republic of Korea", "Norway", "Netherlands"],
  ["China", "Russian Federation", "Iran", "Cuba", "Venezuela", "Viet Nam"],
  ["India", "Brazil", "Indonesia", "Mexico", "Türkiye", "Saudi Arabia", "Pakistan", "Argentina", "Malaysia"],
  ["South Africa", "Nigeria", "Kenya", "Egypt", "Ghana", "Ethiopia", "Bangladesh", "Philippines"],
];

export const PRACTICE_COUNTRIES: Country[] = UNGA.filter((c) => !c.name.includes("Observer"));

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Four AI countries, one per region, never the student's own. */
export function pickAiCountries(human: string): Country[] {
  const chosen: Country[] = [];
  for (const region of REGIONS) {
    const options = region.filter((n) => n !== human && !chosen.some((c) => c.name === n));
    const name = pick(options);
    const c = UNGA.find((x) => x.name === name);
    if (c) chosen.push(c);
  }
  return chosen;
}

export interface PracticeParams { name: string; country: string; topic: string }

/** Checks the form before anything is created (so bad requests don't use up the daily limit). */
export function practiceError(p: Partial<PracticeParams>): string | null {
  if (!String(p.name ?? "").trim()) return "Enter your name.";
  if (!PRACTICE_COUNTRIES.some((c) => c.name === p.country)) return "Pick your country.";
  if (String(p.topic ?? "").trim().length < 6) return "Pick or write a topic.";
  return null;
}

/** Builds the room: AI Chair, four AI delegates and the student. Returns the student's seat. */
export function createPracticeRoom(p: PracticeParams, code: string): { room: Room; memberId: string; token: string } | { error: string } {
  const problem = practiceError(p);
  if (problem) return { error: problem };
  const name = p.name.trim().slice(0, 40);
  const topic = p.topic.trim().replace(/\s+/g, " ").slice(0, 120);
  const human = PRACTICE_COUNTRIES.find((c) => c.name === p.country)!;

  const ai = pickAiCountries(human.name);
  const countries = [human, ...ai].sort((a, b) => a.name.localeCompare(b.name));
  const { room, token } = createRoom(
    { chairName: "AI Chair", name: "Practice Committee", type: "GA", topics: [topic], countries, gslSpeakingSec: 60, layout: "roundtable" },
    code,
  );
  const c = room.c;
  c.members[c.chairId].ai = true;
  // The chair's token from createRoom is not handed out: the AI Chair never connects.
  room.tokens.clear();

  for (const country of ai) {
    const id = uid();
    c.members[id] = { id, name: `AI delegate of ${country.name}`, role: "delegate", country: country.name, iso: country.iso, attendance: "absent", online: true, placard: false, speeches: 0, ai: true };
  }
  const humanId = uid();
  const humanToken = crypto.randomUUID();
  c.members[humanId] = { id: humanId, name, role: "delegate", country: human.name, iso: human.iso, attendance: "absent", online: false, placard: false, speeches: 0 };
  room.tokens.set(humanToken, humanId);
  c.practice = { humanId, stage: "intro", thinking: null, feedback: null };
  c.log = [];
  c.log.push({ id: uid(), at: Date.now(), kind: "system", text: `Practice session on "${topic}". You are the delegate of ${human.name}.` });
  return { room, memberId: humanId, token: humanToken };
}

// ---------- what the student sees ----------

export const PRACTICE_STEPS: { stages: PracticeStage[]; label: string }[] = [
  { stages: ["intro", "rollcall"], label: "Roll call" },
  { stages: ["agenda"], label: "Agenda" },
  { stages: ["gsl"], label: "Speeches" },
  { stages: ["motion", "modcaucus"], label: "Mod caucus" },
  { stages: ["unmod"], label: "Unmod caucus" },
  { stages: ["drafting"], label: "Resolutions" },
  { stages: ["amendments"], label: "Amendments" },
  { stages: ["voting"], label: "Voting" },
  { stages: ["adjourn"], label: "Adjourn" },
  { stages: ["feedback", "done"], label: "Feedback" },
];

/** One line telling the student what to do right now. */
export function practiceHint(s: CommitteeView): string {
  const p = s.practice;
  if (!p) return "";
  const me = s.members[s.meId];
  if (!me) return "";
  const sp = s.speaker;
  const speaking = sp?.memberId === me.id;
  const place = s.gsl.indexOf(me.id);
  if (speaking) {
    if (sp.yieldedToQuestions) return "You yielded to questions. Answer each Point of Information as it appears, by voice or by typing, then yield to the Chair.";
    if (p.stage === "drafting") return "Introduce your draft resolution: read your key operative clauses and say why delegates should support it, then yield to the Chair.";
    return p.stage === "gsl"
      ? "You have the floor. Speak into your mic (captions are on so the AI delegates hear you) or type your speech. Then yield to the Chair, or yield to questions to take Points of Information."
      : "You have the floor. Speak into your mic (captions are on so the AI delegates hear you) or type your speech, then yield to the Chair.";
  }
  if (sp?.yieldedToQuestions) return `${s.members[sp.memberId]?.country ?? "The speaker"} has yielded to questions. Click "Ask the speaker a question" to raise a Point of Information.`;
  const v = s.vote;
  if (v?.rollCall) {
    // After passing, a delegate is called again at the end, so look at whose turn it is, not at the ballot.
    if (v.rollOrder[v.rollIndex] === me.id) return v.passedOnce.includes(me.id)
      ? "Roll call vote: you passed earlier, and the Chair is calling your country again. Answer Yes, No or Abstain."
      : "Roll call vote: the Chair is calling your country. Answer Yes, No, Abstain, or Pass to be called again at the end.";
    return "Roll call vote: countries answer one at a time. Wait until the Chair calls your country.";
  }
  if (v && !v.ballots[me.id]) {
    if (v.procedural) return "A procedural vote is open: vote Yes or No on the motion.";
    return v.subject.kind === "amendment"
      ? "Vote on the unfriendly amendment: Yes, No or Abstain. Would it make the resolution better for your country?"
      : "Vote on the resolution: Yes, No or Abstain. Think about your country's position.";
  }
  switch (p.stage) {
    case "intro": return "The Chair is opening the session…";
    case "rollcall": return me.attendance === "absent" ? "Answer the roll call: click Present, or Present and voting." : "Roll call answered. Next the committee sets the agenda.";
    case "agenda": return "Set the agenda. Try it: click Make a motion → Set the agenda, then vote Yes.";
    case "gsl": return place >= 0 ? `Opening speeches. You are #${place + 1} on the speakers' list: prepare your country's position (about ${s.gslSpeakingSec} seconds).` : "Listen to the other delegates and note points you can answer in the caucus.";
    case "motion": return "The floor is open to motions. Try it: click Make a motion → Moderated caucus, and pick a focused sub-topic.";
    case "modcaucus": return me.placard ? "Placard up. The Chair will recognize you soon: keep it short and respond to what others said." : "Moderated caucus: raise your placard to speak (about 45 seconds). Respond to the other delegates directly.";
    case "unmod": return s.mode === "unmod"
      ? "Unmoderated caucus: open the Documents tab. Join the working paper as a sponsor to add your own clauses, sign it, or write your own paper and submit it to the Chair."
      : "The floor is open. Try it: click Make a motion → Unmoderated caucus, so delegates can write working papers.";
    case "drafting": return "Draft resolutions are being introduced. Read them in the Documents tab, and sign or sponsor before they're introduced.";
    case "amendments": return "Debate on the draft resolutions. Propose an amendment in the Documents tab, or move to close debate (Make a motion → Close debate) when you're ready to vote.";
    case "voting": return "Voting procedure: unfriendly amendments first, then the draft resolutions. The chamber is sealed.";
    case "adjourn": return "Voting is over. End the session properly: click Make a motion → Adjourn the meeting.";
    case "feedback": return "The Chair is writing your feedback…";
    case "done": return "Session complete. Read your feedback below, or start another practice round.";
  }
}
