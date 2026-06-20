import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('portable schema excludes the users auth collection', () => {
  const schema = JSON.parse(readFileSync(resolve(project, 'pocketbase', 'pb_schema.json'), 'utf8'));
  assert.equal(schema.length, 17);
  assert.equal(schema.some((collection) => collection.name === 'users'), false);
  for (const collection of schema) {
    assert.ok(collection.fields.some((field) => field.name === 'created' && field.type === 'autodate'));
    assert.ok(collection.fields.some((field) => field.name === 'updated' && field.type === 'autodate'));
  }
  const subscriptions = schema.find((collection) => collection.name === 'subscriptions');
  const user = subscriptions.fields.find((field) => field.name === 'user');
  assert.deepEqual(
    { type: user.type, required: user.required, collectionId: user.collectionId, maxSelect: user.maxSelect },
    { type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
  );
  const currentPeriodEnd = subscriptions.fields.find((field) => field.name === 'current_period_end');
  assert.equal(currentPeriodEnd.type, 'date');
});

test('users migration is additive and business import cannot delete collections', () => {
  const migration = readFileSync(resolve(project, 'pocketbase', 'pb_migrations', '1781913000_apexbot_schema.js'), 'utf8');
  assert.match(migration, /findCollectionByNameOrId\("_pb_users_auth_"\)/);
  assert.match(migration, /new Field\(fieldData\)/);
  assert.match(migration, /importCollections\(businessCollections, false\)/);
  assert.doesNotMatch(migration, /const businessCollections = \[\s*\{\s*"id": "_pb_users_auth_"/);
  const patchMigration = readFileSync(resolve(project, 'pocketbase', 'pb_migrations', '1781917000_add_subscription_current_period_end.js'), 'utf8');
  assert.match(patchMigration, /findCollectionByNameOrId\("subscriptions"\)/);
  assert.doesNotMatch(patchMigration, /findCollectionByNameOrId\("_pb_users_auth_"\)/);
});
