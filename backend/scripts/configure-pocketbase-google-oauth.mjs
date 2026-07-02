import 'dotenv/config';
import PocketBase from 'pocketbase';

const pbUrl = (process.env.POCKETBASE_URL || '').replace(/\/$/, '');
const email = process.env.PB_ADMIN_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL || '';
const password = process.env.PB_ADMIN_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD || '';
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

if (!pbUrl || !email || !password) {
  console.error('POCKETBASE_URL, PB_ADMIN_EMAIL, and PB_ADMIN_PASSWORD are required.');
  process.exit(1);
}
if (!clientId || !clientSecret) {
  console.error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required.');
  process.exit(1);
}

const pb = new PocketBase(pbUrl);
pb.autoCancellation(false);

await pb.collection('_superusers').authWithPassword(email, password);
const users = await pb.collections.getOne('users');
const oauth2 = {
  ...(users.oauth2 || {}),
  enabled: true,
  mappedFields: {
    id: '',
    name: 'name',
    username: '',
    avatarURL: 'avatar',
    ...(users.oauth2?.mappedFields || {}),
  },
};

const providers = (oauth2.providers || []).filter((provider) => provider.name !== 'google');
providers.push({
  name: 'google',
  displayName: 'Google',
  clientId,
  clientSecret,
  authURL: '',
  tokenURL: '',
  userInfoURL: '',
  pkce: null,
  extra: {},
});

oauth2.providers = providers;
await pb.collections.update(users.id, { oauth2 });

const authMethods = await pb.collection('users').listAuthMethods();
const google = authMethods.oauth2?.providers?.find((provider) => provider.name === 'google');

console.log(`PocketBase Google OAuth enabled at ${pbUrl}`);
console.log(`Google redirect URI: ${pbUrl}/api/oauth2-redirect`);
console.log(`Provider visible: ${Boolean(google)}`);
