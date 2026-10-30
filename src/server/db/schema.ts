import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // UUID
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  password_salt: text('password_salt').notNull(),
  kdf_salt: text('kdf_salt').notNull(), // Salt for user's E2EE MasterKey
  kdf_iterations: integer('kdf_iterations').notNull().default(600000),
  verifier_cipher: text('verifier_cipher').notNull(), // Verifies user's E2EE MasterKey
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  status: text('status').notNull().default('active'), // 'active' | 'disabled'
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

export const hosts = sqliteTable('hosts', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().default('default'), // Multi-user isolation
  name: text('name').notNull(),
  group_name: text('group_name').notNull().default('默认分组'),
  hostname: text('hostname').notNull(),
  port: integer('port').notNull().default(22),
  username: text('username').notNull(),
  auth_type: text('auth_type').notNull(), // 'password' | 'private_key'
  encrypted_cred: text('encrypted_cred').notNull(), // E2EE AES-256-GCM ciphertext
  jump_host_id: text('jump_host_id'),
  keepalive_interval: integer('keepalive_interval').default(30),
  sort_order: integer('sort_order').notNull().default(0),
  updated_at: integer('updated_at').notNull(),
});

export const snippets = sqliteTable('snippets', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().default('default'), // Multi-user isolation
  title: text('title').notNull(),
  category: text('category').notNull().default('通用'),
  command: text('command').notNull(),
  auto_enter: integer('auto_enter').notNull().default(1),
  sort_order: integer('sort_order').notNull().default(0),
});

export const userSettings = sqliteTable('user_settings', {
  user_id: text('user_id').notNull().default('default'),
  key: text('key').notNull(),
  value: text('value').notNull(),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.key] }),
]);

// Kept for backward compatibility with existing databases
export const vaultMeta = sqliteTable('vault_meta', {
  id: text('id').primaryKey(),
  kdf_salt: text('kdf_salt').notNull(),
  kdf_iterations: integer('kdf_iterations').notNull().default(600000),
  verifier_cipher: text('verifier_cipher').notNull(),
  updated_at: integer('updated_at').notNull(),
});
