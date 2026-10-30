import { Hono } from 'hono';
import { eq, and, or, asc } from 'drizzle-orm';
import { getDb } from '../db';
import { snippets } from '../db/schema';
import { verifyAuthToken, type AppVariables } from '../auth';
import type { SnippetRecord } from '@shared/types';

export const snippetsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Auth Middleware for Snippets
snippetsRouter.use('*', async (c, next) => {
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

snippetsRouter.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);

  if (user.role === 'admin') {
    try {
      await db.update(snippets).set({ user_id: user.sub }).where(eq(snippets.user_id, 'default'));
    } catch (e) {
      console.error('Auto-claim default snippets error:', e);
    }
  }

  const list = await db
    .select()
    .from(snippets)
    .where(
      user.role === 'admin'
        ? or(eq(snippets.user_id, user.sub), eq(snippets.user_id, 'default'))
        : eq(snippets.user_id, user.sub)
    )
    .orderBy(asc(snippets.category), asc(snippets.sort_order), asc(snippets.title));
  return c.json(list as SnippetRecord[]);
});

snippetsRouter.post('/', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const body = await c.req.json<Omit<SnippetRecord, 'id' | 'user_id'>>();

  const id = crypto.randomUUID();
  await db.insert(snippets).values({
    id,
    user_id: user.sub,
    title: body.title,
    category: body.category || '通用',
    command: body.command,
    auto_enter: body.auto_enter ?? 1,
    sort_order: body.sort_order ?? 0,
  });

  return c.json({ success: true, id });
});

snippetsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<SnippetRecord>>();

  await db
    .update(snippets)
    .set(body)
    .where(
      user.role === 'admin'
        ? and(eq(snippets.id, id), or(eq(snippets.user_id, user.sub), eq(snippets.user_id, 'default')))
        : and(eq(snippets.id, id), eq(snippets.user_id, user.sub))
    );

  return c.json({ success: true });
});

snippetsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  await db
    .delete(snippets)
    .where(
      user.role === 'admin'
        ? and(eq(snippets.id, id), or(eq(snippets.user_id, user.sub), eq(snippets.user_id, 'default')))
        : and(eq(snippets.id, id), eq(snippets.user_id, user.sub))
    );
  return c.json({ success: true });
});
