export type CharacterId = 'momo' | 'pip' | 'nori';
export type LocationId = CharacterId | 'briefing' | 'replay' | 'evidence' | 'report';
export interface Character { id: CharacterId; name: string; role: string; room: string; color: string; introduction: string; quickQuestion: string }
export interface Evidence { id: string; chapter: number; time: string; source: string; title: string; kind: string; text: string }
export interface Turn { question: string; answer: string; evidence: string | null; revealedPosition: number; timestamp: string }
export interface Verdict { suspect: CharacterId | 'none' | 'uncertain'; suspects: CharacterId[]; confidence: number; explanation: string; evidenceIds: string[]; submittedAt: string }
export interface Session {
  id: string; revision: number; startedAt: string; status: 'active' | 'closed';
  revealedPosition: number; selectedEvidence: string | null; location: LocationId;
  interviews: Record<CharacterId, Turn[]>; verdict: Verdict | null;
}
export interface CaseState {
  caseId: string; caseVersion: string; authored: boolean; mode: 'live' | 'rehearsal'; model: string | null;
  characters: Character[]; chapters: { title: string; subtitle: string }[];
  session: Session | null; records: Evidence[];
  debrief: null | { title: string; summary: string; lesson: string; findings: { character: CharacterId; classification: string; explanation: string; evidence: string[] }[] };
}
