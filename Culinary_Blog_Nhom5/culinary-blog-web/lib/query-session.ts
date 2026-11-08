import type { QueryClient } from "@tanstack/react-query";

type SessionState = { user: { id: string } | null };
type SessionStore<T extends SessionState> = {
  getState: () => T;
  subscribe: (listener: (state: T, previous: T) => void) => () => void;
};

export function watchQuerySession<T extends SessionState>(client: Pick<QueryClient, "clear">, store: SessionStore<T>) {
  let previousUserId = store.getState().user?.id ?? null;
  const unsubscribe = store.subscribe(state => {
    const nextUserId = state.user?.id ?? null;
    if (nextUserId !== previousUserId) {
      previousUserId = nextUserId;
      client.clear();
    }
  });
  return unsubscribe;
}
