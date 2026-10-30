import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db';
import { users, hosts, snippets, userSettings } from '../db/schema';
import { verifyAuthToken, hashLoginPassword, type AppVariables } from '../auth';

export const adminRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Admin Auth Middleware
adminRouter.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Admin token required' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyAuthToken(token);

  if (!payload || payload.role !== 'admin') {
    return c.json({ error: 'Forbidden: Administrator privileges required' }, 403);
  }

  c.set('user', payload);
  await next();
});

// List all users
adminRouter.get('/users', async (c) => {
  const db = getDb(c.env.DB);
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .orderBy(desc(users.created_at));

  return c.json(allUsers);
});

// Create new user (Admin only)
adminRouter.post('/users', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    username: string;
    password: string;
    role?: 'admin' | 'user';
    kdf_salt?: string;
    verifier_cipher?: string;
  }>();

  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const usernameClean = body.username.trim().toLowerCase();
  const existing = await db.select().from(users).where(eq(users.username, usernameClean)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: '该用户名已存在' }, 400);
  }

  const userId = crypto.randomUUID();
  const passwordSalt = crypto.randomUUID();
  const passwordHash = await hashLoginPassword(body.password, passwordSalt);

  const kdfSalt = body.kdf_salt || crypto.randomUUID();
  const verifierCipher = body.verifier_cipher || 'INITIAL_VERIFIER';
  const now = Date.now();

  await db.insert(users).values({
    id: userId,
    username: usernameClean,
    password_hash: passwordHash,
    password_salt: passwordSalt,
    kdf_salt: kdfSalt,
    kdf_iterations: 600000,
    verifier_cipher: verifierCipher,
    role: body.role || 'user',
    status: 'active',
    created_at: now,
    updated_at: now,
  });

  return c.json({
    success: true,
    user: {
      id: userId,
      username: usernameClean,
      role: body.role || 'user',
      status: 'active',
      created_at: now,
    },
  });
});

// Update user status (active / disabled)
adminRouter.put('/users/:id/status', async (c) => {
  const targetId = c.req.param('id');
  const currentUser = c.get('user');

  if (targetId === currentUser.sub) {
    return c.json({ error: '不能修改自己的状态' }, 400);
  }

  const body = await c.req.json<{ status: 'active' | 'disabled' }>();
  if (!body.status || !['active', 'disabled'].includes(body.status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const db = getDb(c.env.DB);
  await db
    .update(users)
    .set({ status: body.status, updated_at: Date.now() })
    .where(eq(users.id, targetId));

  return c.json({ success: true });
});

// Delete user
adminRouter.delete('/users/:id', async (c) => {
  const targetId = c.req.param('id');
  const currentUser = c.get('user');

  if (targetId === currentUser.sub) {
    return c.json({ error: '不能删除管理员自身账号' }, 400);
  }

  const db = getDb(c.env.DB);
  await db.delete(hosts).where(eq(hosts.user_id, targetId));
  await db.delete(snippets).where(eq(snippets.user_id, targetId));
  await db.delete(userSettings).where(eq(userSettings.user_id, targetId));
  await db.delete(users).where(eq(users.id, targetId));

  return c.json({ success: true });
});
