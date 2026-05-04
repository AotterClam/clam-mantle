/**
 * `IdGenerator` — abstracted id source for new entries / revisions /
 * approvals / sessions. Use cases inject it so tests can use
 * deterministic ids and production stays on `crypto.randomUUID`.
 */
export interface IdGenerator {
  next(): string;
}

export const RandomUuidGenerator: IdGenerator = { next: () => crypto.randomUUID() };
