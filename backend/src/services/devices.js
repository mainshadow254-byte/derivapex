// Device / session management service. Records real device + session activity
// from login heartbeats (user agent, IP, device id).
import { getServicePB } from '../pocketbase.js';
import { notify } from './notifications.js';
import { audit } from './audit.js';
import { sendAccountNotice } from './resend.js';

export async function touchDevice({ userId, deviceId, userAgent, ip, label }) {
  const pb = await getServicePB();
  const existing = await pb.collection('devices')
    .getFirstListItem(`user="${userId}" && device_id="${deviceId}"`).catch(() => null);

  const history = await pb.collection('devices').getFullList({ filter: `user="${userId}"` });
  const knownIps = new Set(history.map((d) => d.ip).filter(Boolean));
  const isNewDevice = !existing;
  const isNewIp = !!ip && !knownIps.has(ip);
  const suspicious = isNewDevice && history.length > 0;

  let device;
  if (existing) {
    device = await pb.collection('devices').update(existing.id, {
      user_agent: userAgent || existing.user_agent,
      ip: ip || existing.ip,
      last_seen: new Date().toISOString(),
      revoked: false,
    });
  } else {
    device = await pb.collection('devices').create({
      user: userId,
      device_id: deviceId,
      user_agent: userAgent || '',
      ip: ip || '',
      label: label || deviceLabel(userAgent),
      revoked: false,
      last_seen: new Date().toISOString(),
    });
  }
  await pb.collection('users').update(userId, { last_login: new Date().toISOString() });

  if (suspicious || isNewIp) {
    const user = await pb.collection('users').getOne(userId).catch(() => null);
    const title = suspicious ? 'New device signed in' : 'Sign-in from a new location';
    const body = `${deviceLabel(userAgent)}${ip ? ' - ' + ip : ''}. If this was not you, remove the device and change your password.`;
    await notify({
      userId,
      type: 'security',
      severity: suspicious ? 'warning' : 'info',
      title,
      body,
      meta: { deviceId, ip },
    });
    if (user?.email) sendAccountNotice(user.email, title, body).catch(() => {});
    await audit({ actorId: userId, action: 'security.new_device', target: deviceId, meta: { ip, userAgent, suspicious } });
  }
  return { device, isNew: isNewDevice, suspicious };
}

export function deviceLabel(ua = '') {
  const s = (ua || '').toLowerCase();
  let os = 'Unknown OS';
  if (s.includes('windows')) os = 'Windows';
  else if (s.includes('mac os') || s.includes('macintosh')) os = 'macOS';
  else if (s.includes('android')) os = 'Android';
  else if (s.includes('iphone') || s.includes('ipad') || s.includes('ios')) os = 'iOS';
  else if (s.includes('linux')) os = 'Linux';
  let browser = 'Browser';
  if (s.includes('edg/')) browser = 'Edge';
  else if (s.includes('chrome')) browser = 'Chrome';
  else if (s.includes('firefox')) browser = 'Firefox';
  else if (s.includes('safari')) browser = 'Safari';
  return `${browser} on ${os}`;
}

export async function listDevices(userId) {
  const pb = await getServicePB();
  return pb.collection('devices').getFullList({ filter: `user="${userId}"`, sort: '-last_seen' });
}

export async function revokeDevice(userId, deviceRowId) {
  const pb = await getServicePB();
  const d = await pb.collection('devices').getOne(deviceRowId).catch(() => null);
  if (!d || d.user !== userId) return false;
  await pb.collection('devices').update(deviceRowId, { revoked: true });
  await audit({ actorId: userId, action: 'security.device_revoked', target: d.device_id });
  return true;
}

export async function revokeAll(userId, exceptDeviceId = null) {
  const pb = await getServicePB();
  const all = await pb.collection('devices').getFullList({ filter: `user="${userId}"` });
  let count = 0;
  for (const d of all) {
    if (exceptDeviceId && d.device_id === exceptDeviceId) continue;
    await pb.collection('devices').update(d.id, { revoked: true });
    count++;
  }
  await audit({ actorId: userId, action: 'security.logout_all', meta: { count } });
  return count;
}

export async function adminListSessions({ page = 1, perPage = 100 } = {}) {
  const pb = await getServicePB();
  const result = await pb.collection('devices').getList(page, perPage, { sort: '-last_seen', expand: 'user' });
  return {
    ...result,
    items: result.items.map((device) => ({
      id: device.id,
      user: device.user,
      device_id: device.device_id,
      user_agent: device.user_agent,
      ip: device.ip,
      label: device.label,
      revoked: device.revoked,
      last_seen: device.last_seen,
      location: device.location,
      created: device.created,
      expand: device.expand?.user ? {
        user: {
          id: device.expand.user.id,
          email: device.expand.user.email,
          name: device.expand.user.name || '',
        },
      } : {},
    })),
  };
}

export async function adminTerminate(deviceRowId) {
  const pb = await getServicePB();
  const d = await pb.collection('devices').getOne(deviceRowId).catch(() => null);
  if (!d) return false;
  await pb.collection('devices').update(d.id, { revoked: true });
  await audit({ actorEmail: 'admin', action: 'security.admin_terminate_session', target: d.device_id });
  return true;
}

export async function suspiciousLogins() {
  const pb = await getServicePB();
  const all = await pb.collection('devices').getFullList({ sort: '-last_seen', expand: 'user' });
  const byUser = new Map();
  for (const d of all) {
    const u = d.user;
    const e = byUser.get(u) || { user: u, email: d.expand?.user?.email || u, ips: new Set(), devices: 0, last: d.last_seen };
    if (d.ip) e.ips.add(d.ip);
    e.devices++;
    byUser.set(u, e);
  }
  return [...byUser.values()]
    .map((e) => ({ user: e.user, email: e.email, distinctIps: e.ips.size, devices: e.devices, last_seen: e.last }))
    .filter((e) => e.distinctIps > 1 || e.devices > 2)
    .sort((a, b) => b.distinctIps - a.distinctIps);
}
