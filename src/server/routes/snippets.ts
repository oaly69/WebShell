import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { getDb } from '../db';
import { snippets } from '../db/schema';
import type { SnippetRecord } from '@shared/types';

export const snippetsRouter = new Hono<{ Bindings: Env }>();

snippetsRouter.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const list = await db
    .select()
    .from(snippets)
    .orderBy(asc(snippets.category), asc(snippets.sort_order), asc(snippets.title));
  return c.json(list as SnippetRecord[]);
});

snippetsRouter.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<Omit<SnippetRecord, 'id'>>();

  const id = crypto.randomUUID();
  await db.insert(snippets).values({
    id,
    title: body.title,
    category: body.category || '通用',
    command: body.command,
    auto_enter: body.auto_enter ?? 1,
    sort_order: body.sort_order ?? 0,
  });

  return c.json({ success: true, id });
});

snippetsRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<SnippetRecord>>();

  await db.update(snippets).set(body).where(eq(snippets.id, id));
  return c.json({ success: true });
});

snippetsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  await db.delete(snippets).where(eq(snippets.id, id));
  return c.json({ success: true });
});
