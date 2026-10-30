import { Hono } from 'hono';
import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../db';
import { hosts } from '../db/schema';
import { verifyAuthToken, type AppVariables } from '../auth';
import type { HostRecord } from '@shared/types';

export const hostsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Auth Middleware for Hosts
hostsRouter.use('*', async (c, next) => {
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

hostsRouter.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const list = await db
    .select()
    .from(hosts)
    .where(eq(hosts.user_id, user.sub))
    .orderBy(asc(hosts.sort_order), asc(hosts.name));
  return c.json(list as HostRecord[]);
});

hostsRouter.post('/', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  try {
    const body = await c.req.json<Omit<HostRecord, 'updated_at' | 'user_id'>>();
    if (!body.name || !body.hostname || !body.username || !body.encrypted_cred) {
      return c.json({ error: '缺少主机名称、主机地址、用户名或加密凭据' }, 400);
    }

    const id = body.id || crypto.randomUUID();
    const now = Date.now();

    await db.insert(hosts).values({
      id,
      user_id: user.sub,
      name: body.name,
      group_name: body.group_name || '默认分组',
      hostname: body.hostname,
      port: body.port || 22,
      username: body.username,
      auth_type: body.auth_type || 'password',
      encrypted_cred: body.encrypted_cred,
      jump_host_id: body.jump_host_id || null,
      keepalive_interval: body.keepalive_interval ?? 30,
      sort_order: body.sort_order ?? 0,
      updated_at: now,
    });

    return c.json({ success: true, id });
  } catch (err: any) {
    console.error('POST /api/hosts error:', err);
    return c.json({ error: err.message || '保存主机数据库写入失败' }, 500);
  }
});

hostsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  try {
    const body = await c.req.json<Partial<HostRecord>>();
    const now = Date.now();
    await db
      .update(hosts)
      .set({
        ...body,
        updated_at: now,
      })
      .where(and(eq(hosts.id, id), eq(hosts.user_id, user.sub)));

    return c.json({ success: true });
  } catch (err: any) {
    console.error('PUT /api/hosts error:', err);
    return c.json({ error: err.message || '更新主机失败' }, 500);
  }
});

hostsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  try {
    await db.delete(hosts).where(and(eq(hosts.id, id), eq(hosts.user_id, user.sub)));
    return c.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/hosts error:', err);
    return c.json({ error: err.message || '删除主机失败' }, 500);
  }
});
