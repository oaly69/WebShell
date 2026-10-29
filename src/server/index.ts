import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { vaultRouter } from './routes/vault';
import { hostsRouter } from './routes/hosts';
import { snippetsRouter } from './routes/snippets';
import { settingsRouter } from './routes/settings';

// Export the Durable Object class for Cloudflare Workers runtime
export { SshSessionDO } from './do/SshSessionDO';

const app = new Hono<{ Bindings: Env }>();

// Middlewares
app.use('*', cors());

// Health Check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// API Routes
app.route('/api/vault', vaultRouter);
app.route('/api/hosts', hostsRouter);
app.route('/api/snippets', snippetsRouter);
app.route('/api/settings', settingsRouter);

// WebSocket Upgrade to Durable Object
app.get('/ws/ssh', async (c) => {
  const sessionId = c.req.query('sessionId') || crypto.randomUUID();
  const id = c.env.SSH_SESSION.idFromName(sessionId);
  const stub = c.env.SSH_SESSION.get(id);

  return stub.fetch(c.req.raw);
});

export default app;
