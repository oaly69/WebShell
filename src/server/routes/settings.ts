import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { userSettings } from '../db/schema';
import { verifyAuthToken, type AppVariables } from '../auth';

export const settingsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Auth Middleware for Settings
settingsRouter.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.substring(7);
  const payload = await verifyAuthToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  c.set('user', payload);
  await next();
});

settingsRouter.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const rows = await db.select().from(userSettings).where(eq(userSettings.user_id, user.sub));
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return c.json(settings);
});

settingsRouter.post('/', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ key: string; value: string }>();

  if (!body.key) {
    return c.json({ error: 'Key required' }, 400);
  }

  await db
    .insert(userSettings)
    .values({ user_id: user.sub, key: body.key, value: body.value })
    .onConflictDoUpdate({
      target: [userSettings.user_id, userSettings.key],
      set: { value: body.value },
    });

  return c.json({ success: true });
});
