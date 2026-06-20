import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const usersId = '_pb_users_auth_';

const text = (name, extra = {}) => ({ name, type: 'text', ...extra });
const bool = (name, extra = {}) => ({ name, type: 'bool', ...extra });
const number = (name, extra = {}) => ({ name, type: 'number', ...extra });
const date = (name, extra = {}) => ({ name, type: 'date', ...extra });
const autodate = (name, onUpdate) => ({ name, type: 'autodate', onCreate: true, onUpdate });
const email = (name, extra = {}) => ({ name, type: 'email', ...extra });
const select = (name, values, extra = {}) => ({ name, type: 'select', values, maxSelect: 1, ...extra });
const relation = (name, collectionId, extra = {}) => ({
  name, type: 'relation', collectionId, maxSelect: 1, cascadeDelete: false, ...extra,
});
const locked = (name, id, fields, indexes = []) => ({
  id, name, type: 'base', system: false,
  listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  fields: [...fields, autodate('created', false), autodate('updated', true)], indexes,
});

const ids = {
  admins: 'apxadmins000001', subscriptions: 'apxsubs00000001', payments: 'apxpayments00001',
  bots: 'apxbots00000001', audit_logs: 'apxaudit0000001', plans: 'apxplans0000001',
  system_settings: 'apxsettings0001', trades: 'apxtrades000001', strategies: 'apxstrategy0001',
  copy_follows: 'apxcopyfollow01', marketplace_listings: 'apxmarketlist01', bot_reviews: 'apxbotreviews01',
  bot_installs: 'apxbotinstall01', notifications: 'apxnotify000001', notification_prefs: 'apxnotifypref01',
  devices: 'apxdevices00001', watchlists: 'apxwatchlist001',
};

const protectedSignupFields = [
  'role', 'subscription_plan', 'subscription_status', 'subscription_expires_at',
  'telegram_verified', 'telegram_verified_at', 'telegram_user_id', 'telegram_pairing_token', 'telegram_pairing_expires_at', 'deriv_connected',
  'deriv_token', 'deriv_loginid', 'deriv_currency', 'deriv_account_id', 'device_limit',
  'last_login', 'status', 'disabled',
];
const createRule = protectedSignupFields.map((field) => `@request.body.${field}:isset = false`).join(' && ');

const schema = [
  {
    id: usersId, name: 'users', type: 'auth', system: false,
    listRule: 'id = @request.auth.id', viewRule: 'id = @request.auth.id',
    createRule, updateRule: null, deleteRule: null,
    passwordAuth: { enabled: true, identityFields: ['email'] },
    fields: [
      text('telegram_username', { max: 64 }),
      text('telegram_user_id', { max: 64, hidden: true }),
      bool('telegram_verified', { hidden: true }),
      date('telegram_verified_at', { hidden: true }),
      text('telegram_pairing_token', { max: 255, hidden: true }),
      date('telegram_pairing_expires_at', { hidden: true }),
      select('role', ['user', 'admin'], { hidden: true }),
      select('subscription_plan', ['free', 'starter', 'standard', 'premium', 'elite'], { hidden: true }),
      select('subscription_status', ['inactive', 'active', 'expired', 'canceled'], { hidden: true }),
      date('subscription_expires_at', { hidden: true }),
      bool('deriv_connected', { hidden: true }),
      text('deriv_token', { max: 4096, hidden: true }),
      text('deriv_loginid', { max: 80, hidden: true }),
      text('deriv_currency', { max: 12, hidden: true }),
      text('deriv_account_id', { max: 80, hidden: true }),
      number('device_limit', { min: 1, max: 100, hidden: true }),
      date('last_login', { hidden: true }),
      select('status', ['active', 'suspended', 'disabled'], { hidden: true }),
      bool('disabled', { hidden: true }),
    ],
    indexes: [
      'CREATE INDEX `idx_users_status` ON `users` (`status`)',
      'CREATE INDEX `idx_users_telegram_pairing` ON `users` (`telegram_pairing_token`)',
      'CREATE INDEX `idx_users_telegram_user_id` ON `users` (`telegram_user_id`)',
    ],
  },
  locked('admins', ids.admins, [
    relation('user', usersId, { required: true, cascadeDelete: true }), email('email', { required: true }),
    select('level', ['admin']), bool('active'), text('approved_by', { max: 64 }),
  ], [
    'CREATE UNIQUE INDEX `idx_admins_user` ON `admins` (`user`)',
    'CREATE UNIQUE INDEX `idx_admins_email` ON `admins` (`email`)',
    'CREATE INDEX `idx_admins_active` ON `admins` (`active`)',
  ]),
  locked('subscriptions', ids.subscriptions, [
    relation('user', usersId, { required: true, cascadeDelete: true }),
    select('plan', ['free', 'starter', 'standard', 'premium', 'elite'], { required: true }),
    select('status', ['active', 'expired', 'replaced', 'canceled'], { required: true }),
    date('expires_at'), date('current_period_end'), text('provider', { max: 80 }), text('payment_ref', { max: 255 }),
  ], [
    'CREATE INDEX `idx_subscriptions_user` ON `subscriptions` (`user`)',
    'CREATE INDEX `idx_subscriptions_status_expiry` ON `subscriptions` (`status`, `expires_at`)',
    "CREATE UNIQUE INDEX `idx_subscriptions_one_active` ON `subscriptions` (`user`) WHERE `status` = 'active'",
  ]),
  locked('payments', ids.payments, [
    relation('user', usersId, { required: true, cascadeDelete: true }), number('amount', { min: 0 }),
    text('currency', { max: 12 }), select('status', ['pending', 'succeeded', 'failed', 'refunded'], { required: true }),
    text('provider', { max: 80 }), text('payment_ref', { max: 255 }), text('event_type', { max: 120 }),
    date('paid_at'), text('meta', { max: 20000 }),
  ], [
    'CREATE INDEX `idx_payments_user` ON `payments` (`user`)',
    'CREATE INDEX `idx_payments_status` ON `payments` (`status`)',
    "CREATE UNIQUE INDEX `idx_payments_provider_ref` ON `payments` (`provider`, `payment_ref`) WHERE `payment_ref` != ''",
  ]),
  locked('bots', ids.bots, [
    relation('user', usersId, { required: true, cascadeDelete: true }), text('name', { required: true, max: 160 }),
    select('format', ['xml', 'json', 'unknown']), text('symbol', { max: 80 }), text('content', { max: 1000000, hidden: true }),
    bool('validated'), select('status', ['inactive', 'running', 'stopped']),
  ], ['CREATE INDEX `idx_bots_user_status` ON `bots` (`user`, `status`)']),
  locked('audit_logs', ids.audit_logs, [
    text('actor', { max: 64 }), text('actor_email', { max: 255 }), text('action', { required: true, max: 160 }),
    text('target', { max: 255 }), text('meta', { max: 20000 }), text('ip', { max: 128 }),
  ], [
    'CREATE INDEX `idx_audit_actor` ON `audit_logs` (`actor`)',
    'CREATE INDEX `idx_audit_action` ON `audit_logs` (`action`)',
  ]),
  {
    ...locked('plans', ids.plans, [
      text('plan', { required: true, max: 40 }), text('label', { required: true, max: 80 }),
      number('price', { required: true, min: 0 }), text('features', { max: 5000 }),
    ], ['CREATE UNIQUE INDEX `idx_plans_plan` ON `plans` (`plan`)']),
    listRule: '', viewRule: '',
  },
  locked('system_settings', ids.system_settings, [
    text('key', { required: true, max: 120 }), text('value', { max: 20000 }),
  ], ['CREATE UNIQUE INDEX `idx_system_settings_key` ON `system_settings` (`key`)']),
  locked('strategies', ids.strategies, [
    relation('owner', usersId, { required: true, cascadeDelete: true }), text('name', { required: true, max: 160 }),
    text('description', { max: 10000 }), select('category', ['forex', 'synthetic', 'crypto', 'mixed']),
    text('symbol', { max: 80 }), number('risk_score', { min: 0, max: 100 }),
    select('status', ['draft', 'published', 'paused']), text('provider_name', { max: 160 }), date('published_at'),
  ], [
    'CREATE INDEX `idx_strategies_status_category` ON `strategies` (`status`, `category`)',
    'CREATE INDEX `idx_strategies_owner` ON `strategies` (`owner`)',
  ]),
  locked('trades', ids.trades, [
    relation('user', usersId, { required: true, cascadeDelete: true }), text('symbol', { required: true, max: 80 }),
    select('mode', ['demo', 'real'], { required: true }), select('source', ['manual', 'bot', 'copy', 'scanner'], { required: true }),
    text('contract_type', { max: 80 }), number('stake'), number('entry_price'), number('exit_price'), number('profit'),
    select('status', ['open', 'won', 'lost', 'closed', 'cancelled'], { required: true }), text('contract_id', { max: 120 }),
    relation('bot', ids.bots), relation('strategy', ids.strategies), date('opened_at'), date('closed_at'), text('meta', { max: 20000 }),
  ], [
    'CREATE INDEX `idx_trades_user_opened` ON `trades` (`user`, `opened_at`)',
    'CREATE INDEX `idx_trades_user_status` ON `trades` (`user`, `status`)',
    'CREATE INDEX `idx_trades_strategy_opened` ON `trades` (`strategy`, `opened_at`)',
    'CREATE INDEX `idx_trades_bot_opened` ON `trades` (`bot`, `opened_at`)',
    'CREATE UNIQUE INDEX `idx_trades_contract_id` ON `trades` (`contract_id`) WHERE `contract_id` != \'\'',
  ]),
  locked('copy_follows', ids.copy_follows, [
    relation('follower', usersId, { required: true, cascadeDelete: true }),
    relation('strategy', ids.strategies, { required: true, cascadeDelete: true }),
    select('status', ['active', 'paused', 'stopped']), number('capital_allocation', { min: 0 }),
    number('risk_max_daily_loss', { min: 0 }), number('risk_max_per_trade', { min: 0 }), date('started_at'),
  ], [
    'CREATE UNIQUE INDEX `idx_copy_follower_strategy` ON `copy_follows` (`follower`, `strategy`)',
    'CREATE INDEX `idx_copy_strategy_status` ON `copy_follows` (`strategy`, `status`)',
  ]),
  locked('marketplace_listings', ids.marketplace_listings, [
    relation('bot', ids.bots), relation('seller', usersId, { required: true, cascadeDelete: true }),
    text('title', { required: true, max: 180 }), text('description', { max: 10000 }),
    select('category', ['trading', 'signal', 'ai', 'automation']), number('price', { min: 0 }), bool('published'),
    number('downloads', { min: 0 }), select('risk_rating', ['low', 'medium', 'high']), date('published_at'),
  ], [
    'CREATE INDEX `idx_market_published_category` ON `marketplace_listings` (`published`, `category`)',
    'CREATE INDEX `idx_market_seller` ON `marketplace_listings` (`seller`)',
  ]),
  locked('bot_reviews', ids.bot_reviews, [
    relation('listing', ids.marketplace_listings, { required: true, cascadeDelete: true }),
    relation('user', usersId, { required: true, cascadeDelete: true }), number('rating', { min: 1, max: 5 }),
    text('review', { max: 5000 }),
  ], ['CREATE UNIQUE INDEX `idx_reviews_listing_user` ON `bot_reviews` (`listing`, `user`)']),
  locked('bot_installs', ids.bot_installs, [
    relation('listing', ids.marketplace_listings, { required: true, cascadeDelete: true }),
    relation('user', usersId, { required: true, cascadeDelete: true }), bool('purchased'),
  ], [
    'CREATE UNIQUE INDEX `idx_installs_listing_user` ON `bot_installs` (`listing`, `user`)',
    'CREATE INDEX `idx_installs_user` ON `bot_installs` (`user`)',
  ]),
  locked('notifications', ids.notifications, [
    relation('user', usersId, { required: true, cascadeDelete: true }),
    select('type', ['market', 'scanner', 'volatility', 'trading', 'copy', 'bot', 'telegram', 'payment', 'subscription', 'security']),
    text('title', { required: true, max: 200 }), text('body', { max: 10000 }),
    select('severity', ['info', 'success', 'warning', 'error']), bool('read'), text('meta', { max: 20000 }),
  ], [
    'CREATE INDEX `idx_notifications_user` ON `notifications` (`user`)',
    'CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user`, `read`)',
  ]),
  locked('notification_prefs', ids.notification_prefs, [
    relation('user', usersId, { required: true, cascadeDelete: true }), text('prefs', { max: 10000 }),
  ], ['CREATE UNIQUE INDEX `idx_notification_prefs_user` ON `notification_prefs` (`user`)']),
  locked('devices', ids.devices, [
    relation('user', usersId, { required: true, cascadeDelete: true }), text('device_id', { required: true, max: 160 }),
    text('user_agent', { max: 1000 }), text('ip', { max: 128 }), text('label', { max: 200 }),
    bool('revoked'), date('last_seen'), text('location', { max: 255 }),
  ], [
    'CREATE UNIQUE INDEX `idx_devices_user_device` ON `devices` (`user`, `device_id`)',
    'CREATE INDEX `idx_devices_user_last_seen` ON `devices` (`user`, `last_seen`)',
  ]),
  locked('watchlists', ids.watchlists, [
    relation('user', usersId, { required: true, cascadeDelete: true }), text('name', { required: true, max: 120 }),
    text('symbols', { max: 20000 }), bool('is_favorites'),
  ], [
    'CREATE INDEX `idx_watchlists_user` ON `watchlists` (`user`)',
    "CREATE UNIQUE INDEX `idx_watchlists_one_favorites` ON `watchlists` (`user`) WHERE `is_favorites` = TRUE",
  ]),
];

// Never pass a partial auth collection to importCollections: PocketBase treats
// omitted auth fields as deletions. The portable JSON import intentionally
// contains business collections only; the migration below extends users
// additively with Field operations.
const usersSchema = schema[0];
const businessSchema = schema.slice(1);
const json = JSON.stringify(businessSchema, null, 2) + '\n';
writeFileSync(join(here, 'pb_schema.json'), json);

const migration = `/// <reference path="../pb_data/types.d.ts" />\n` +
  `// Generated by pocketbase/build-schema.mjs for PocketBase 0.39.x.\n` +
  `// The existing users auth collection is extended, never imported/replaced.\n` +
  `migrate((app) => {\n` +
  `  const users = app.findCollectionByNameOrId(${JSON.stringify(usersId)});\n` +
  `  const customFields = ${JSON.stringify(usersSchema.fields, null, 2)};\n\n` +
  `  for (const fieldData of customFields) {\n` +
  `    const existing = users.fields.getByName(fieldData.name);\n` +
  `    if (existing) fieldData.id = existing.id;\n` +
  `    users.fields.add(new Field(fieldData));\n` +
  `  }\n\n` +
  `  // Preserve every existing auth/system field while applying ApexBot rules.\n` +
  `  users.listRule = ${JSON.stringify(usersSchema.listRule)};\n` +
  `  users.viewRule = ${JSON.stringify(usersSchema.viewRule)};\n` +
  `  users.createRule = ${JSON.stringify(usersSchema.createRule)};\n` +
  `  users.updateRule = null;\n` +
  `  users.deleteRule = null;\n` +
  `  const userIndexes = ${JSON.stringify(usersSchema.indexes, null, 2)};\n` +
  `  for (const index of userIndexes) {\n` +
  `    if (!users.indexes.includes(index)) users.indexes.push(index);\n` +
  `  }\n` +
  `  app.save(users);\n\n` +
  `  const businessCollections = ${JSON.stringify(businessSchema, null, 2)};\n` +
  `  return app.importCollections(businessCollections, false);\n}, (app) => {\n` +
  `  // Deliberately non-destructive: rolling back must not delete production data.\n  return null;\n});\n`;
writeFileSync(join(here, 'pb_migrations', '1781913000_apexbot_schema.js'), migration);

const autodateMigration = `/// <reference path="../pb_data/types.d.ts" />\n` +
  `// Add PocketBase autodate fields required by backend sorting and reporting.\n` +
  `migrate((app) => {\n` +
  `  const names = ${JSON.stringify(businessSchema.map((c) => c.name), null, 2)};\n` +
  `  for (const name of names) {\n` +
  `    const collection = app.findCollectionByNameOrId(name);\n` +
  `    if (!collection.fields.getByName("created")) {\n` +
  `      collection.fields.add(new Field({ name: "created", type: "autodate", onCreate: true, onUpdate: false }));\n` +
  `    }\n` +
  `    if (!collection.fields.getByName("updated")) {\n` +
  `      collection.fields.add(new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true }));\n` +
  `    }\n` +
  `    app.save(collection);\n` +
  `  }\n` +
  `}, (app) => { return null; });\n`;
writeFileSync(join(here, 'pb_migrations', '1781915000_add_business_autodates.js'), autodateMigration);

console.log(`Wrote ${businessSchema.length} business collections and an additive users migration.`);
