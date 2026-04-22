/**
 * One-off SMTP test: verifies credentials and sends a sample email.
 *   node scripts/test-mail.js [recipient@example.com]
 * If no recipient is given, sends to ADMIN_EMAIL (or MAIL_USER).
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

async function main() {
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  if (!user || !pass) {
    console.error('MAIL_USER / MAIL_PASS are not set in .env');
    process.exit(1);
  }

  const host = process.env.MAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.MAIL_PORT || '465', 10);
  const secure = String(process.env.MAIL_SECURE || 'true') === 'true';
  const to = process.argv[2] || process.env.ADMIN_EMAIL || user;

  console.log(`[test-mail] Connecting to ${host}:${port} as ${user} ...`);
  const t = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

  await t.verify();
  console.log('[test-mail] SMTP verify OK');

  const info = await t.sendMail({
    from: `"FurniX" <${process.env.MAIL_FROM || user}>`,
    to,
    subject: 'FurniX SMTP test — you can delete this',
    text: 'If you are reading this, Gmail SMTP is configured correctly for FurniX order emails.',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #EFEAE0;border-radius:8px">
        <h2 style="color:#2D5A27;margin:0 0 8px 0">FurniX · SMTP is working</h2>
        <p style="color:#6B6B6B;margin:0 0 16px 0;font-size:13px">If you are reading this, Gmail SMTP is configured correctly for FurniX order emails. You can delete this message.</p>
        <hr style="border:none;border-top:1px solid #EFEAE0"/>
        <p style="font-size:12px;color:#6B6B6B;margin-top:16px">Sent from <code>${user}</code></p>
      </div>`,
  });

  console.log('[test-mail] Sent OK. Message ID:', info.messageId);
  console.log('[test-mail] Delivered to:', to);
}

main().catch((err) => {
  console.error('[test-mail] FAILED:', err.message);
  if (err.response) console.error('[test-mail] SMTP response:', err.response);
  process.exit(1);
});
