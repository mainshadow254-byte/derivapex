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

const verificationBody = `
<p>Hello,</p>
<p>Thank you for joining ApexBot on DerivSignalHub.</p>
<p>Click the button below to verify your email address and continue setting up your account.</p>
<p><a href="{APP_URL}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Verify email</a></p>
<p>If you did not recently register, you can safely ignore this email.</p>
<p>Thanks,<br/>The ApexBot team</p>
${brandFooter}`;

const resetBody = `
<p>Hello,</p>
<p>We received a request to reset your ApexBot password.</p>
<p>Click the button below to choose a new password.</p>
<p><a href="{APP_URL}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Reset password</a></p>
<p>If you did not request this, you can safely ignore this email.</p>
<p>Thanks,<br/>The ApexBot team</p>
${brandFooter}`;

const pb = new PocketBase(pbUrl);
pb.autoCancellation(false);

await pb.collection('_superusers').authWithPassword(email, password);
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

const nextOptions = {
  ...options,
  verificationTemplate: mergeTemplate(
    options.verificationTemplate,
    'Verify your ApexBot email',
    `${appUrl}/verify.html?token={TOKEN}`,
    verificationBody,
  ),
  resetPasswordTemplate: mergeTemplate(
    options.resetPasswordTemplate,
    'Reset your ApexBot password',
    `${appUrl}/reset.html?token={TOKEN}`,
    resetBody,
  ),
};

await pb.collections.update(users.id, { options: nextOptions });
console.log(`PocketBase email templates branded for ApexBot at ${pbUrl}`);
console.log(`Verification URL: ${appUrl}/verify.html?token={TOKEN}`);
console.log(`Reset URL: ${appUrl}/reset.html?token={TOKEN}`);
