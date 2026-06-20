import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(resolve(project, 'frontend', 'js', 'config.js'), 'utf8');
const demoTerminal = readFileSync(resolve(project, 'frontend', 'demo-terminal.html'), 'utf8');

function loadFor(hostname, protocol = 'http:', overrides = {}) {
  const window = {
    location: { hostname, protocol, origin: `${protocol}//${hostname}` },
    ...overrides,
  };
  vm.runInNewContext(source, { window, fetch: async () => ({ json: async () => ({}) }) });
  return window.APEX;
}

test('127.0.0.1 frontend uses 127.0.0.1 backend and PocketBase', () => {
  const config = loadFor('127.0.0.1');
  assert.equal(config.API_BASE, 'http://127.0.0.1:8787/api');
  assert.equal(config.POCKETBASE_URL, 'http://127.0.0.1:8090');
});

test('localhost frontend uses localhost backend and PocketBase', () => {
  const config = loadFor('localhost');
  assert.equal(config.API_BASE, 'http://localhost:8787/api');
  assert.equal(config.POCKETBASE_URL, 'http://localhost:8090');
});

test('production frontend can point to Railway backend and external PocketBase', () => {
  const config = loadFor('apexbot.example.com', 'https:', {
    APEX_CONFIG: {
      API_BASE_URL: 'https://apexbot-api.up.railway.app/api',
      POCKETBASE_URL: 'https://pb.example.com',
    },
  });
  assert.equal(config.API_BASE, 'https://apexbot-api.up.railway.app/api');
  assert.equal(config.POCKETBASE_URL, 'https://pb.example.com');
});

test('demo chart analysis accepts the backend reasons object contract', () => {
  assert.match(demoTerminal, /Object\.values\(a\.reasons \|\| \{\}\)/);
  assert.doesNotMatch(demoTerminal, /a\.reasons\.map/);
  assert.match(demoTerminal, /a\.trend\?\.bias/);
  assert.match(demoTerminal, /a\.volatility\?\.level/);
});
