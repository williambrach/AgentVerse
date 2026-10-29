export type CharacterId = string;
export type LocationId = CharacterId | 'briefing' | 'report';
export interface Character { id: CharacterId; name: string; role: string; room: string; color: string; introduction: string; quickQuestion: string }
export interface Turn { question: string; answer: string; timestamp: string }
export interface Role { id: string; label: string; hint: string }
export interface Verdict { roles: Record<CharacterId, string>; truth: Record<CharacterId, string>; results: Record<CharacterId, boolean>; score: number; total: number; confidence: number; explanation: string; evidenceIds: string[]; submittedAt: string }
export interface CaseCopy {
  headline: string;
  intro: { lead: string; body: string };
  briefing: { title: string; description: string; question: string; hint: string };
  report: { title: string; description: string };
}
export interface Session {
  id: string; caseId: string; revision: number; startedAt: string; status: 'active' | 'closed';
  location: LocationId;
  interviews: Record<string, Turn[]>; verdict: Verdict | null;
  economy: Economy; thread: ThreadLine[]; chatter: { round: number; pending: number }; inspections: Inspection[];
}
export interface CaseState {
  caseId: string; caseVersion: string; contentHash: string; title: string; order: number; copy: CaseCopy; roles: Role[]; authored: boolean; mode: 'live' | 'rehearsal'; model: string | null;
  world: { id: string; place: string; cast: { one: string; many: string } };
  characters: Character[];
  session: Session | null;
  debrief: null | { title: string; summary: string; lesson: string; feedback: string; score: number; total: number; findings: { character: CharacterId; role: string; picked: string; correct: boolean; classification: string; explanation: string }[] };
}

export type Tool = 'ask' | 'inspect' | 'continue';
export interface Economy {
  budget: number | null; spent: number; costs: Record<Tool, number>;
  charges: Record<'inspect' | 'continue', { max: number; used: number }>;
}
export interface ThreadLine { character: CharacterId; text: string; round: number; timestamp: string }
export interface Inspection { character: CharacterId; sourceEventId: string; reasoning: string; timestamp: string }
