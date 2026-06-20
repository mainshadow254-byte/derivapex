import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeConfig } from '../src/config.js';

function productionConfig(overrides = {}) {
  return {
    nodeEnv: 'production',
    tokenEncKey: 'replace-with-a-long-random-secret',
    pb: { url: 'https://pb.example.com', adminEmail: 'admin@example.com', adminPassword: 'secret' },
    telegram: { botToken: '', usePolling: false },
    publicBackendUrl: 'https://api.example.com',
    ai: { apiKey: '' },
    ...overrides,
  };
}

test('valid production configuration passes startup validation', () => {
  assert.doesNotThrow(() => validateRuntimeConfig(productionConfig()));
});

test('production requires token encryption key and remote PocketBase', () => {
  assert.throws(
    () => validateRuntimeConfig(productionConfig({
      tokenEncKey: '',
      pb: { url: 'http://127.0.0.1:8090', adminEmail: '', adminPassword: '' },
    })),
    /TOKEN_ENC_KEY[\s\S]*POCKETBASE_URL[\s\S]*PB_ADMIN_EMAIL/,
  );
});
