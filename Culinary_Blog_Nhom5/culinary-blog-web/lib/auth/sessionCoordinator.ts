import { randomBytes } from "node:crypto";
import { type BackendTokens, RefreshRejected, RefreshUnavailable } from "./backendTokens";

export type StoredSession = BackendTokens & {
  state: "active" | "refreshing" | "closed";
  version: number;
  retryAt?: number;
};

export interface SessionLease {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
}

export interface SessionStore {
  create(id: string, session: StoredSession): Promise<void>;
  withLease<T>(id: string, action: (lease: SessionLease) => Promise<T>): Promise<T>;
}

// Every caller resolves a stable session ID against shared state, including stale JWT cookies and SSR.
export class SessionCoordinator {
  constructor(
    private readonly store: SessionStore,
    private readonly refresh: (token: string) => Promise<BackendTokens>,
    private readonly revoke: (token: string) => Promise<void>,
    private readonly now: () => number = Date.now,
  ) {}

  async create(tokens: BackendTokens): Promise<string> {
    const id = randomBytes(32).toString("base64url");
    await this.store.create(id, { ...tokens, state: "active", version: 0 });
    return id;
  }

  async resolve(id: string): Promise<BackendTokens> {
    return this.store.withLease(id, async (lease) => {
      const stored = await lease.read();
      if (!stored || stored.state === "closed") throw new RefreshRejected();
      if (stored.refreshTokenExpiry <= this.now() || stored.state === "refreshing") {
        // A previous owner stopped after dispatch. Never replay an old credential with an unknown outcome.
        await this.close(lease, stored);
        throw new RefreshRejected();
      }
      if (Date.parse(stored.session.accessTokenExpiry) > this.now() + 60_000) return stored;
      if (stored.retryAt && stored.retryAt > this.now()) throw new RefreshUnavailable(stored.retryAt - this.now());

      await lease.write({ ...stored, state: "refreshing" });
      try {
        const tokens = await this.refresh(stored.refreshToken);
        if (tokens.refreshToken === stored.refreshToken) throw new Error("Refresh token was not rotated.");
        const updated: StoredSession = { ...tokens, state: "active", version: stored.version + 1 };
        await lease.write(updated);
        return updated;
      } catch (error) {
        if (error instanceof RefreshUnavailable) {
          await lease.write({ ...stored, state: "active", retryAt: this.now() + error.retryAfterMs });
          throw error;
        }
        // Includes timeout, a lost response, invalid JSON, or a lost Redis lease after the backend committed.
        // Revocation follows successors on the backend. Do not refresh using the previous token again.
        await this.close(lease, stored);
        throw new RefreshRejected();
      }
    });
  }

  async logout(id: string): Promise<void> {
    await this.store.withLease(id, async (lease) => {
      const stored = await lease.read();
      if (stored) await this.close(lease, stored);
    });
  }

  private async close(lease: SessionLease, stored: StoredSession): Promise<void> {
    // Retain a tombstone until expiry so a response carrying an old session ID cannot resurrect it.
    await lease.write({ ...stored, state: "closed" });
    try {
      await this.revoke(stored.refreshToken);
    } catch {
      // The closed session will not issue another access token; a subsequent logout can retry revocation.
      console.warn("Backend session revocation is temporarily unavailable.");
    }
  }
}
