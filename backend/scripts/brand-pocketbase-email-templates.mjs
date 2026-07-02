import 'dotenv/config';
import PocketBase from 'pocketbase';

const pbUrl = (process.env.POCKETBASE_URL || '').replace(/\/$/, '');
const email = process.env.PB_ADMIN_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL || '';
const password = process.env.PB_ADMIN_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD || '';
const appUrl = (process.env.PUBLIC_APP_URL || process.env.HOSTINGER_FRONTEND_URL || 'https://derivsignalhub.com').replace(/\/$/, '');

if (!pbUrl || !email || !password) {
  console.error('POCKETBASE_URL, PB_ADMIN_EMAIL, and PB_ADMIN_PASSWORD are required.');
  process.exit(1);
}

const brandFooter = `
<p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.5">
  ApexBot by DerivSignalHub. Automated trading tools involve risk and do not guarantee profit.
</p>`;

const verificationUrl = `${appUrl}/verify.html?token={TOKEN}`;
const resetUrl = `${appUrl}/reset.html?token={TOKEN}`;

const verificationBody = `
<p>Hello,</p>
<p>Thank you for joining ApexBot on DerivSignalHub.</p>
<p>Click the button below to verify your email address and continue setting up your account.</p>
<p><a href="${verificationUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Verify email</a></p>
<p>If you did not recently register, you can safely ignore this email.</p>
<p>Thanks,<br/>The ApexBot team</p>
${brandFooter}`;

const resetBody = `
<p>Hello,</p>
<p>We received a request to reset your ApexBot password.</p>
<p>Click the button below to choose a new password.</p>
<p><a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Reset password</a></p>
<p>If you did not request this, you can safely ignore this email.</p>
<p>Thanks,<br/>The ApexBot team</p>
${brandFooter}`;

const pb = new PocketBase(pbUrl);
pb.autoCancellation(false);

await pb.collection('_superusers').authWithPassword(email, password);
const settings = await pb.settings.getAll().catch(() => null);
if (settings?.meta) {
  await pb.settings.update({
    meta: {
      ...settings.meta,
      appName: 'ApexBot',
      appUrl,
      senderName: process.env.RESEND_FROM_NAME || settings.meta.senderName || 'ApexBot Production',
      senderAddress: process.env.RESEND_FROM_EMAIL || settings.meta.senderAddress || 'noreply@derivsignalhub.com',
    },
  });
}
const users = await pb.collections.getOne('users');
const options = { ...(users.options || {}) };

function mergeTemplate(existing, subject, actionUrl, body) {
  return {
    ...(existing || {}),
    subject,
    actionUrl,
    body,
  };
}

const nextTemplates = {
  verificationTemplate: mergeTemplate(
    users.verificationTemplate || options.verificationTemplate,
    'Verify your ApexBot email',
    verificationUrl,
    verificationBody,
  ),
  resetPasswordTemplate: mergeTemplate(
    users.resetPasswordTemplate || options.resetPasswordTemplate,
    'Reset your ApexBot password',
    resetUrl,
    resetBody,
  ),
  authAlert: {
    ...(users.authAlert || {}),
    enabled: true,
    emailTemplate: mergeTemplate(
      users.authAlert?.emailTemplate,
      'ApexBot login from a new location',
      '',
      `<p>Hello,</p>
<p>We noticed a login to your ApexBot account from a new location:</p>
<p><em>{ALERT_INFO}</em></p>
<p><strong>If this was not you, change your ApexBot password immediately.</strong></p>
<p>If this was you, you can safely ignore this email.</p>
<p>Thanks,<br/>The ApexBot team</p>
${brandFooter}`,
    ),
  },
};

await pb.collections.update(users.id, nextTemplates);
console.log(`PocketBase email templates branded for ApexBot at ${pbUrl}`);
console.log(`Verification URL: ${appUrl}/verify.html?token={TOKEN}`);
console.log(`Reset URL: ${appUrl}/reset.html?token={TOKEN}`);
