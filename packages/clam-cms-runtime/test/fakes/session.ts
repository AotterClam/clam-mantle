import type {
  Session,
  SessionRepository,
} from "../../src/domain/port/SessionRepository.js";

/** In-memory `SessionRepository` for tests. */
export class InMemorySessions implements SessionRepository {
  private store = new Map<string, Session>();

  async read(token: string): Promise<Session | null> {
    return this.store.get(token) ?? null;
  }

  async write(session: Session): Promise<void> {
    this.store.set(session.token, session);
  }

  async invalidate(token: string): Promise<void> {
    this.store.delete(token);
  }

  /** Test helper. */
  _seed(session: Session): void {
    this.store.set(session.token, session);
  }
}
