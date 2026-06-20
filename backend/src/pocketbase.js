// Service PocketBase client. Authenticates as an admin so the backend can
// enforce rules the frontend is NOT allowed to perform (role changes, audit
// writes, subscription activation). The frontend never sees these credentials.
import PocketBase from 'pocketbase';
import { config } from './config.js';

const pb = new PocketBase(config.pb.url);
pb.autoCancellation(false);

let lastAuth = 0;

export async function getServicePB() {
  // Re-auth periodically / if token missing.
  const now = Date.now();
  if (!pb.authStore.isValid || now - lastAuth > 30 * 60 * 1000) {
    try {
      await pb.collection('_superusers').authWithPassword(config.pb.adminEmail, config.pb.adminPassword);
      lastAuth = now;
    } catch (e) {
      console.error('[pocketbase] Admin auth failed:', e?.message || e);
      throw new Error('Backend cannot reach PocketBase. Check POCKETBASE_URL and PB admin creds.');
    }
  }
  return pb;
}

// Verify a USER auth token coming from the frontend. Returns the user record
// or null. This is how the backend trusts "who is calling" — never the body.
export async function verifyUserToken(token) {
  if (!token) return null;
  const userPB = new PocketBase(config.pb.url);
  userPB.authStore.save(token, null);
  try {
    // refresh validates the token server-side against PB and returns the record
    const res = await userPB.collection('users').authRefresh();
    return res?.record || null;
  } catch {
    return null;
  }
}
