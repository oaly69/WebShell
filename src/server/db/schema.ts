import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const vaultMeta = sqliteTable('vault_meta', {
  id: text('id').primaryKey(), // 'default'
  kdf_salt: text('kdf_salt').notNull(),
  kdf_iterations: integer('kdf_iterations').notNull().default(600000),
  verifier_cipher: text('verifier_cipher').notNull(),
  updated_at: integer('updated_at').notNull(),
});

export const hosts = sqliteTable('hosts', {
  id: text('id').primaryKey(),
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
  title: text('title').notNull(),
  category: text('category').notNull().default('通用'),
  command: text('command').notNull(),
  auto_enter: integer('auto_enter').notNull().default(1),
  sort_order: integer('sort_order').notNull().default(0),
});

export const userSettings = sqliteTable('user_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
