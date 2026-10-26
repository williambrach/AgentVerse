export class InterviewProviderError extends Error {
  constructor(code, message, diagnostics = {}) { super(message); this.name = 'InterviewProviderError'; this.code = code; this.diagnostics = diagnostics; this.provenance = null; }
}
