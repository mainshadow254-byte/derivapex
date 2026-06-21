// Append-only audit log. Every admin/sensitive action calls this.
import { getServicePB } from '../pocketbase.js';
import { notifyAdminError, notifyAdminTelegram } from './adminAlerts.js';

export async function audit({ actorId, actorEmail, action, target = '', meta = {}, ip = '' }) {
  try {
    const pb = await getServicePB();
    await pb.collection('audit_logs').create({
      actor: actorId || '',
      actor_email: actorEmail || '',
      action,
      target: String(target || ''),
      meta: JSON.stringify(meta || {}),
      ip: ip || '',
    });
    if (/^(admin\.|user\.disable|security\.admin_)/.test(action)) {
      void notifyAdminTelegram({
        category: 'admin_action', title: action,
        message: `Administrative action completed by ${actorEmail || actorId || 'unknown actor'}.`,
        meta: { target, ip },
      });
    }
  } catch (e) {
    // Never let audit failure crash a request, but make it loud in server logs.
    console.error('[audit] failed to write log:', e?.message || e, { action, actorEmail });
    void notifyAdminError('Audit log write failed', e, { action });
  }
}
