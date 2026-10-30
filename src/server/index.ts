import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { hostsRouter } from './routes/hosts';
import { snippetsRouter } from './routes/snippets';
import { settingsRouter } from './routes/settings';
import { verifyAuthToken } from './auth';

// Export the Durable Object class for Cloudflare Workers runtime
export { SshSessionDO } from './do/SshSessionDO';

const app = new Hono<{ Bindings: Env }>();

// Middlewares
app.use('*', cors());

// Health Check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// API Routes
app.route('/api/auth', authRouter);
app.route('/api/admin', adminRouter);
app.route('/api/hosts', hostsRouter);
app.route('/api/snippets', snippetsRouter);
app.route('/api/settings', settingsRouter);

// WebSocket Upgrade to Durable Object (requires valid auth token)
app.get('/ws/ssh', async (c) => {
  const token = c.req.query('token') || c.req.header('Sec-WebSocket-Protocol');
  if (!token) {
    return new Response('Unauthorized: Missing auth token', { status: 401 });
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    return new Response('Unauthorized: Invalid or expired token', { status: 401 });
  }

  const sessionId = c.req.query('sessionId') || crypto.randomUUID();
  const id = c.env.SSH_SESSION.idFromName(`${payload.sub}_${sessionId}`);
  const stub = c.env.SSH_SESSION.get(id);

  return stub.fetch(c.req.raw);
});

export default app;
