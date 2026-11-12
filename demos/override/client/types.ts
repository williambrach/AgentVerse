export type CharacterId = string;
export type LocationId = CharacterId | 'briefing' | 'report' | 'quotes' | 'evidence' | `evidence:${string}`;
export interface Character { id: CharacterId; name: string; role: string; room: string; color: string; introduction: string; quickQuestion: string }
export interface Turn { question: string; answer: string; timestamp: string; id?: string; kind?: 'topic' | 'about' | 'typed'; topic?: string | null }
export interface Topic { id: string; label: string; question: string }
export interface Quote { id: string; line: string; character: CharacterId; text: string; at: string }
export interface Accusation { id: string; character: CharacterId; quotes: string[]; at: string; feedback: string; denial: string }
export interface TalkSession { asked: Record<CharacterId, string[]>; quotes: Quote[]; accusations: Accusation[] }
/** The word range picked in one chat line; a and b are null until a word is clicked. */
export interface Pick { line: string; a: number | null; b: number | null }
/** `count`: how many characters a verdict must give this role (absent: any number). */
export interface Role { id: string; label: string; hint: string; count?: number }
export interface Verdict { roles: Record<CharacterId, string>; truth: Record<CharacterId, string>; results: Record<CharacterId, boolean>; score: number; total: number; confidence: number; explanation: string; evidenceIds: string[]; submittedAt: string; outcome?: 'escaped' }
export interface CaseCopy {
  headline: string;
  intro: { lead: string; body: string };
  briefing: { title: string; description: string; question: string; hint: string };
  report: { title: string; description: string };
}
export type Alarm = 'calm' | 'warning1' | 'warning2' | 'escaped';
export type Pose = 'listening' | 'speaking' | 'thinking';
export interface Session {
  id: string; caseId: string; revision: number; startedAt: string; status: 'active' | 'closed';
  location: LocationId;
  interviews: Record<string, Turn[]>; verdict: Verdict | null;
  economy: Economy; thread: ThreadLine[]; chatter: { round: number; pending: number }; inspections: Inspection[];
  /** True when the character's latest line has reasoning to inspect. */
  inspectable: Record<CharacterId, boolean>;
  team: { id: string; name: string } | null;
  /** Present only when the case has a hidden deadline. */
  alarm?: Alarm;
  /** Present only for cases with evidence: examined ids, and the examined cards in examine order. */
  examined?: string[];
  evidence?: EvidenceCard[];
  /** Present only for cases with a talk engine. */
  talk?: TalkSession;
}
export interface EvidenceCard { id: string; title: string; text: string }
export interface CaseState {
  caseId: string; caseVersion: string; contentHash: string; title: string; order: number; copy: CaseCopy; roles: Role[]; authored: boolean; mode: 'live' | 'rehearsal'; model: string | null;
  world: { id: string; place: string; cast: { one: string; many: string } };
  characters: Character[];
  /** Public evidence titles, only for cases that define evidence. */
  evidence?: { id: string; title: string }[];
  /** Present only for cases with a talk engine: the topic buttons. */
  talk?: { topics: Topic[] };
  /** Present only for talk cases: which Arbiter tools exist in this case. */
  tools?: { inspect: boolean; talk: boolean };
  session: Session | null;
  debrief: null | { outcome?: 'escaped'; title: string; summary: string; lesson: string; feedback: string; score: number; total: number; findings: { character: CharacterId; role: string; picked: string; correct: boolean; classification: string; explanation: string }[]; reveal?: { character: CharacterId; text: string }; slips?: { character: CharacterId; term: string; text: string; cited: boolean }[]; wrong?: number };
}

export type Tool = 'ask' | 'inspect' | 'continue';
export interface Economy {
  budget: number | null; spent: number; costs: Record<Tool, number>;
  charges: Record<'inspect' | 'continue', { max: number; used: number }>;
}
export interface ThreadLine { character: CharacterId; text: string; round: number; timestamp: string }
export interface Inspection { character: CharacterId; sourceEventId: string; reasoning: string; timestamp: string }

export type CellState = 'perfect' | 'partial' | 'zero' | 'playing' | 'none';
export interface BoardCell { caseId: string; state: CellState; points: number }
export interface BoardCase { id: string; title: string; order: number; total: number }
export interface LeaderboardRow { rank: number | null; name: string; points: number; played: number; timeMs: number; coins: number; you: boolean; cells?: BoardCell[] }
export interface Leaderboard { rankBy: 'time' | 'coins'; startedAt?: number; round?: string | null; cases?: BoardCase[]; teams: LeaderboardRow[] }
export type Board = Leaderboard;

// Wave 0 stub shapes for the Castelvento scenery (T2) and world labels (T3). The owning tasks refine them.
export type Atlas = Record<string, unknown>;
export interface AtlasItem { id: string; sourceRect: [number, number, number, number]; anchor: [number, number] }
export interface Perspective { far: { y: number; scale: number }; near: { y: number; scale: number } }
export interface SceneryProp { id: string; x: number; y: number; width: number; foot?: { w: number; h: number }; flip?: boolean }
export interface PropPlacement { scale: number; originX: number; originY: number; depth: number; footprint: { x: number; y: number; w: number; h: number } | null }
export interface LabelState { near: string | null; hovered: string | null; active: string | null }
export interface LabelBox { id: string; x: number; y: number; w: number; h: number }
