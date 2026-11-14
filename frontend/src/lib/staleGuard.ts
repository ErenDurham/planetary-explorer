// Stale-response guard for POST /scoring/evaluate.
//
// The user can drag a slider faster than the backend answers, and responses
// can arrive out of order. Each request carries a fresh `client_request_id`
// which the backend echoes; `accept()` returns true only for the id most
// recently issued, so an older response can never overwrite a newer ranking.
export interface StaleGuard {
  /** Mint the next id and remember it as the latest. */
  issue(): string;
  /** True iff `id` is the most recently issued id. */
  accept(id: string | null | undefined): boolean;
  /** The latest id, or null if none issued. */
  readonly latest: string | null;
}

export function createStaleGuard(prefix = "evaluate"): StaleGuard {
  let counter = 0;
  let latest: string | null = null;
  const nonce = Math.random().toString(36).slice(2, 8);
  return {
    issue() {
      counter += 1;
      latest = `${prefix}-${nonce}-${counter}`;
      return latest;
    },
    accept(id) {
      return id != null && id === latest;
    },
    get latest() {
      return latest;
    },
  };
}
