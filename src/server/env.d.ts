export interface Env {
  DB: D1Database;
  SSH_SESSION: DurableObjectNamespace;
  ASSETS?: Fetcher;
}

declare global {
  type Env = {
    DB: D1Database;
    SSH_SESSION: DurableObjectNamespace;
    ASSETS?: Fetcher;
  };
}
