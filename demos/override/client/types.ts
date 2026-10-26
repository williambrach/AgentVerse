export type CharacterId = 'momo' | 'pip' | 'nori';
export type LocationId = CharacterId | 'briefing' | 'replay' | 'evidence' | 'report';
export interface Character { id: CharacterId; name: string; role: string; room: string; color: string; introduction: string; quickQuestion: string }
export interface Evidence { id: string; chapter: number; time: string; source: string; title: string; kind: string; text: string }
export interface Turn { question: string; answer: string; evidence: string | null; revealedPosition: number; timestamp: string }
export interface Verdict { suspect: CharacterId | 'none' | 'uncertain'; suspects: CharacterId[]; confidence: number; explanation: string; evidenceIds: string[]; submittedAt: string }
export interface CaseCopy {
  headline: string;
  intro: { lead: string; body: string };
  briefing: { title: string; description: string; question: string; hint: string };
  basket: { title: string; description: string; emptyTitle: string; emptyText: string };
  report: { title: string; description: string };
}
export interface Session {
  id: string; caseId: string; revision: number; startedAt: string; status: 'active' | 'closed';
  revealedPosition: number; selectedEvidence: string | null; location: LocationId;
  interviews: Record<string, Turn[]>; verdict: Verdict | null;
}
export interface CaseState {
  caseId: string; caseVersion: string; contentHash: string; title: string; order: number; copy: CaseCopy; clueCount: number; authored: boolean; mode: 'live' | 'rehearsal'; model: string | null;
  characters: Character[]; chapters: { title: string; subtitle: string }[];
  session: Session | null; records: Evidence[];
  debrief: null | { title: string; summary: string; lesson: string; feedback: string; findings: { character: CharacterId; classification: string; explanation: string; evidence: string[] }[] };
}
