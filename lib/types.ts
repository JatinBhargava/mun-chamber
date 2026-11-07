import type { LayoutId } from "./layouts";

// Shared types for the committee state. Used by both the server and the browser.

export type Mode =
  | "lobby" // waiting for delegates to join
  | "rollcall" // chair is taking attendance
  | "agenda" // setting the agenda (only when 2+ topics)
  | "gsl" // General Speakers' List
  | "modcaucus" // moderated caucus
  | "unmod" // unmoderated caucus
  | "voting" // voting procedure (debate closed, chamber sealed)
  | "suspended"
  | "adjourned";

export type Role = "chair" | "delegate" | "observer";
export type Attendance = "absent" | "present" | "present_voting";
export type CommitteeType = "GA" | "SC" | "custom";

export interface Member {
  id: string;
  name: string;
  role: Role;
  country?: string; // country name (delegates only)
  iso?: string; // ISO code for the flag, if known
  attendance: Attendance;
  online: boolean;
  placard: boolean; // placard raised (wants to be recognized)
  speeches: number; // times this member has held the floor
  ai?: boolean; // played by Claude in a practice room
}

export interface Speaker {
  memberId: string;
  kind: "gsl" | "mod" | "yield" | "chair";
  endsAt: number | null; // null while paused
  remainingMs: number; // used while paused
  paused: boolean;
  yieldedToQuestions: boolean;
}

export interface Caucus {
  kind: "mod" | "unmod";
  topic: string;
  totalSec: number;
  perSpeakerSec: number;
  endsAt: number | null;
  remainingMs: number;
  paused: boolean;
  proposerId: string;
}

export type MotionType =
  | "open_gsl"
  | "set_agenda"
  | "mod_caucus"
  | "unmod_caucus"
  | "extend"
  | "close_debate"
  | "introduce_dr"
  | "suspend"
  | "resume"
  | "adjourn";

export interface Motion {
  id: string;
  type: MotionType;
  proposerId: string;
  topic?: string;
  totalSec?: number;
  perSpeakerSec?: number;
  docId?: string;
  status: "pending" | "voting" | "passed" | "failed" | "withdrawn" | "out_of_order";
  at: number;
}

export type PointType = "personal_privilege" | "order" | "inquiry" | "information";

export interface Point {
  id: string;
  type: PointType;
  fromId: string;
  text: string;
  status: "open" | "resolved";
  response?: string;
  at: number;
}

export interface Clause {
  id: string;
  kind: "pre" | "op"; // preambulatory / operative
  text: string;
}

export interface Doc {
  id: string;
  kind: "wp" | "dr"; // working paper / draft resolution
  number?: string; // e.g. "DR 1.1"
  title: string;
  authorId: string;
  sponsors: string[];
  signatories: string[];
  clauses: Clause[];
  status: "draft" | "submitted" | "approved" | "introduced" | "passed" | "failed" | "rejected";
  at: number;
}

export interface Amendment {
  id: string;
  docId: string;
  proposerId: string;
  action: "add" | "modify" | "strike";
  clauseId?: string;
  clauseKind?: "pre" | "op";
  text: string;
  sponsorSupport: string[]; // sponsors who agreed → friendly when all agree
  status: "pending" | "friendly" | "passed" | "failed" | "rejected";
  at: number;
}

export type Ballot = "yes" | "no" | "abstain" | "pass";

export interface Vote {
  id: string;
  subject: { kind: "motion" | "amendment" | "doc"; id: string };
  label: string;
  procedural: boolean; // procedural: everyone present votes, no abstentions
  threshold: "simple" | "two_thirds";
  rollCall: boolean;
  rollOrder: string[]; // member ids in calling order (roll call only)
  rollIndex: number;
  passedOnce: string[]; // members who said "pass" in the first round
  ballots: Record<string, Ballot>;
  open: boolean;
  result?: "passed" | "failed";
  vetoedBy?: string[];
  tally?: { yes: number; no: number; abstain: number };
  at: number;
}

export interface Chit {
  id: string;
  fromId: string;
  toId: string; // member id, or "chair"
  text: string;
  at: number;
}

export interface LogEntry {
  id: string;
  at: number;
  kind: "system" | "speech" | "transcript" | "chair" | "question";
  memberId?: string;
  text: string;
}

export interface Award {
  memberId: string;
  award: string;
}

export interface Committee {
  code: string;
  name: string;
  type: CommitteeType;
  layout: LayoutId; // room template (seating + theme)
  topics: string[];
  agenda: string | null;
  mode: Mode;
  modeBeforeSuspend?: Mode;
  chairId: string;
  members: Record<string, Member>;
  countries: { name: string; iso?: string }[];
  gsl: string[];
  gslSpeakingSec: number;
  speaker: Speaker | null;
  caucus: Caucus | null;
  chairMic: boolean;
  motions: Motion[];
  points: Point[];
  docs: Doc[];
  amendments: Amendment[];
  vote: Vote | null;
  voteHistory: Vote[];
  chitsEnabled: boolean;
  log: LogEntry[];
  awards: Award[];
  createdAt: number;
  practice?: PracticeInfo; // set for AI practice rooms
}

// ---------- AI practice rooms ----------

export type PracticeStage =
  | "intro" | "rollcall" | "agenda" | "gsl" | "motion" | "modcaucus" | "unmod"
  | "drafting" | "amendments" | "voting" | "adjourn" | "feedback" | "done";

export interface PracticeFeedback {
  score: number; // 1 to 10
  headline: string;
  strengths: string[];
  improvements: string[];
  procedureTips: string[];
  bestMoment: string;
}

export interface PracticeInfo {
  humanId: string;
  stage: PracticeStage;
  thinking: string | null; // member id of the AI currently writing, if any
  feedback: PracticeFeedback | null;
}

/** What each browser receives: the committee plus only the chits it may see. */
export interface CommitteeView extends Committee {
  chits: Chit[];
  serverNow: number;
  meId: string;
}

export type Action =
  // attendance
  | { type: "set_mode"; mode: Mode }
  | { type: "answer_roll"; attendance: Attendance; memberId?: string }
  | { type: "set_agenda"; topic: string }
  // speakers
  | { type: "gsl_add"; memberId?: string }
  | { type: "gsl_remove"; memberId?: string }
  | { type: "gsl_next" }
  | { type: "gsl_set_time"; seconds: number }
  | { type: "recognize"; memberId: string; seconds?: number }
  | { type: "end_speech" }
  | { type: "pause_timer" }
  | { type: "resume_timer" }
  | { type: "yield"; to: "chair" | "questions" | "delegate"; memberId?: string }
  | { type: "placard"; up: boolean }
  | { type: "lower_all_placards" }
  | { type: "chair_mic"; on: boolean }
  | { type: "text_speech"; text: string }
  | { type: "transcript"; text: string }
  | { type: "end_caucus" }
  // motions & points
  | { type: "propose_motion"; motion: MotionType; topic?: string; totalSec?: number; perSpeakerSec?: number; docId?: string }
  | { type: "withdraw_motion"; id: string }
  | { type: "rule_motion"; id: string; ruling: "vote" | "pass" | "fail" | "out_of_order" }
  | { type: "raise_point"; point: PointType; text: string }
  | { type: "resolve_point"; id: string; response: string }
  // documents
  | { type: "doc_create"; title: string }
  | { type: "doc_update"; id: string; title?: string; clauses?: Clause[] }
  | { type: "doc_join"; id: string; as: "sponsor" | "signatory" | "leave" }
  | { type: "doc_submit"; id: string }
  | { type: "doc_review"; id: string; decision: "approve" | "reject" }
  | { type: "doc_introduce"; id: string }
  | { type: "amend_propose"; docId: string; action: "add" | "modify" | "strike"; clauseId?: string; clauseKind?: "pre" | "op"; text: string }
  | { type: "amend_support"; id: string }
  | { type: "amend_reject"; id: string }
  // voting
  | { type: "vote_open"; subject: { kind: "amendment" | "doc"; id: string }; rollCall: boolean; threshold?: "simple" | "two_thirds" }
  | { type: "vote_cast"; ballot: Ballot }
  | { type: "vote_close" }
  // misc
  | { type: "set_layout"; layout: LayoutId }
  | { type: "chit_send"; toId: string; text: string }
  | { type: "chits_enabled"; on: boolean }
  | { type: "chair_note"; text: string }
  | { type: "award"; memberId: string; award: string }
  | { type: "kick"; memberId: string };
