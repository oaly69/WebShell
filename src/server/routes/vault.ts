import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { vaultMeta, hosts, snippets, userSettings } from '../db/schema';

export const vaultRouter = new Hono<{ Bindings: Env }>();

vaultRouter.get('/status', async (c) => {
  const db = getDb(c.env.DB);
  const result = await db.select().from(vaultMeta).where(eq(vaultMeta.id, 'default')).limit(1);

  if (result.length === 0) {
    return c.json({ initialized: false });
  }

  const meta = result[0];
  return c.json({
    initialized: true,
    salt: meta.kdf_salt,
    iterations: meta.kdf_iterations,
    verifier: meta.verifier_cipher,
    updatedAt: meta.updated_at,
  });
});

vaultRouter.post('/init', async (c) => {
  const db = getDb(c.env.DB);
  const existing = await db.select().from(vaultMeta).where(eq(vaultMeta.id, 'default')).limit(1);

  if (existing.length > 0) {
    return c.json({ error: 'Vault already initialized' }, 400);
  }

  const body = await c.req.json<{
    salt: string;
    iterations: number;
    verifier: string;
  }>();

  if (!body.salt || !body.verifier) {
    return c.json({ error: 'Invalid parameters' }, 400);
  }

  const now = Date.now();
  await db.insert(vaultMeta).values({
    id: 'default',
    kdf_salt: body.salt,
    kdf_iterations: body.iterations || 600000,
    verifier_cipher: body.verifier,
    updated_at: now,
  });

  return c.json({ success: true });
});

vaultRouter.post('/reset', async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(vaultMeta).execute();
  await db.delete(hosts).execute();
  await db.delete(snippets).execute();
  await db.delete(userSettings).execute();

  return c.json({ success: true, message: 'All data reset' });
});
