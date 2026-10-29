import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { userSettings } from '../db/schema';

export const settingsRouter = new Hono<{ Bindings: Env }>();

settingsRouter.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(userSettings);
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return c.json(settings);
});

settingsRouter.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ key: string; value: string }>();

  if (!body.key) {
    return c.json({ error: 'Key required' }, 400);
  }

  await db
    .insert(userSettings)
    .values({ key: body.key, value: body.value })
    .onConflictDoUpdate({
      target: userSettings.key,
      set: { value: body.value },
    });

  return c.json({ success: true });
});
