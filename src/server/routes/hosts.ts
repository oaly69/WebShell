import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { getDb } from '../db';
import { hosts } from '../db/schema';
import type { HostRecord } from '@shared/types';

export const hostsRouter = new Hono<{ Bindings: Env }>();

hostsRouter.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const list = await db.select().from(hosts).orderBy(asc(hosts.sort_order), asc(hosts.name));
  return c.json(list as HostRecord[]);
});

hostsRouter.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<Omit<HostRecord, 'updated_at'>>();

  const id = body.id || crypto.randomUUID();
  const now = Date.now();

  await db.insert(hosts).values({
    id,
    name: body.name,
    group_name: body.group_name || '默认分组',
    hostname: body.hostname,
    port: body.port || 22,
    username: body.username,
    auth_type: body.auth_type,
    encrypted_cred: body.encrypted_cred,
    jump_host_id: body.jump_host_id || null,
    keepalive_interval: body.keepalive_interval ?? 30,
    sort_order: body.sort_order ?? 0,
    updated_at: now,
  });

  return c.json({ success: true, id });
});

hostsRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<HostRecord>>();

  const now = Date.now();
  await db
    .update(hosts)
    .set({
      ...body,
      updated_at: now,
    })
    .where(eq(hosts.id, id));

  return c.json({ success: true });
});

hostsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  await db.delete(hosts).where(eq(hosts.id, id));
  return c.json({ success: true });
});
