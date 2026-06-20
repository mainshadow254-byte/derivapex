// Resend email service. API key stays on the backend. Sends real emails only.
import { config } from '../config.js';

async function send({ to, subject, html }) {
  if (!config.resend.apiKey) {
    throw new Error('RESEND_API_KEY not configured — cannot send email.');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.resend.from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed (${res.status}): ${body}`);
  }
  return res.json();
}

const wrap = (title, body) => `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a">
    <h2 style="color:#4f46e5">${title}</h2>
    ${body}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
    <p style="font-size:12px;color:#64748b">ApexBot — automated trading involves real financial risk. This is not financial advice.</p>
  </div>`;

export function sendAccountNotice(to, subject, message) {
  return send({ to, subject, html: wrap(subject, `<p>${message}</p>`) });
}
