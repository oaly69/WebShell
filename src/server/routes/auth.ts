import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../db/schema';
import { hashLoginPassword, createAuthToken, verifyAuthToken } from '../auth';

export const authRouter = new Hono<{ Bindings: Env }>();

// Check system initialization status
authRouter.get('/status', async (c) => {
  const db = getDb(c.env.DB);
  const result = await db.select({ count: sql<number>`count(*)` }).from(users);
  const count = result[0]?.count || 0;

  return c.json({
    initialized: count > 0,
    userCount: count,
  });
});

// Initialize Super Admin (first-time deployment only)
authRouter.post('/init-admin', async (c) => {
  const db = getDb(c.env.DB);
  const result = await db.select({ count: sql<number>`count(*)` }).from(users);
  const count = result[0]?.count || 0;

  if (count > 0) {
    return c.json({ error: 'System is already initialized with an admin' }, 400);
  }

  const body = await c.req.json<{
    username: string;
    password: string;
    kdf_salt: string;
    kdf_iterations?: number;
    verifier_cipher: string;
  }>();

  if (!body.username || !body.password || !body.kdf_salt || !body.verifier_cipher) {
    return c.json({ error: 'Missing required parameters' }, 400);
  }

  const userId = crypto.randomUUID();
  const passwordSalt = crypto.randomUUID();
  const passwordHash = await hashLoginPassword(body.password, passwordSalt);
  const now = Date.now();

  await db.insert(users).values({
    id: userId,
    username: body.username.trim().toLowerCase(),
    password_hash: passwordHash,
    password_salt: passwordSalt,
    kdf_salt: body.kdf_salt,
    kdf_iterations: body.kdf_iterations || 600000,
    verifier_cipher: body.verifier_cipher,
    role: 'admin',
    status: 'active',
    created_at: now,
    updated_at: now,
  });

  const token = await createAuthToken({
    id: userId,
    username: body.username.trim().toLowerCase(),
    role: 'admin',
  });

  return c.json({
    success: true,
    token,
    user: {
      id: userId,
      username: body.username.trim().toLowerCase(),
      role: 'admin',
      status: 'active',
      created_at: now,
    },
    kdf_salt: body.kdf_salt,
    kdf_iterations: body.kdf_iterations || 600000,
    verifier_cipher: body.verifier_cipher,
  });
});

// Login
authRouter.post('/login', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    username: string;
    password: string;
  }>();

  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const usernameClean = body.username.trim().toLowerCase();
  const userRows = await db.select().from(users).where(eq(users.username, usernameClean)).limit(1);

  if (userRows.length === 0) {
    return c.json({ error: '用户不存在或密码错误' }, 401);
  }

  const user = userRows[0];
  if (user.status === 'disabled') {
    return c.json({ error: '该账号已被管理员禁用' }, 403);
  }

  const expectedHash = await hashLoginPassword(body.password, user.password_salt);
  if (expectedHash !== user.password_hash) {
    return c.json({ error: '用户不存在或密码错误' }, 401);
  }

  const token = await createAuthToken({
    id: user.id,
    username: user.username,
    role: user.role as 'admin' | 'user',
  });

  return c.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
    },
    kdf_salt: user.kdf_salt,
    kdf_iterations: user.kdf_iterations,
    verifier_cipher: user.verifier_cipher,
  });
});

// Get Current User Profile
authRouter.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyAuthToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const db = getDb(c.env.DB);
  const userRows = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (userRows.length === 0 || userRows[0].status === 'disabled') {
    return c.json({ error: 'User disabled or not found' }, 401);
  }

  const user = userRows[0];
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
    },
    kdf_salt: user.kdf_salt,
    kdf_iterations: user.kdf_iterations,
    verifier_cipher: user.verifier_cipher,
  });
});

// Update Current User's Vault Verifier (for first-time vault initialization)
authRouter.put('/vault', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyAuthToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json<{
    kdf_salt: string;
    kdf_iterations?: number;
    verifier_cipher: string;
  }>();

  if (!body.kdf_salt || !body.verifier_cipher) {
    return c.json({ error: 'Missing required vault parameters' }, 400);
  }

  const db = getDb(c.env.DB);
  await db
    .update(users)
    .set({
      kdf_salt: body.kdf_salt,
      kdf_iterations: body.kdf_iterations || 600000,
      verifier_cipher: body.verifier_cipher,
      updated_at: Date.now(),
    })
    .where(eq(users.id, payload.sub));

  return c.json({ success: true });
});

