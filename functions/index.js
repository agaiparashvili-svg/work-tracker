const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// ── მეილის გამგზავნი (Gmail) ──────────────────────────────
const GMAIL_USER = functions.config().gmail.user;
const GMAIL_PASS = functions.config().gmail.pass;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_PASS }
});

// ── მიმღები მეილები ───────────────────────────────────────
const REPORT_EMAILS = [
  'a.gaiparashvili@lopotaresort.com',
  'a.akhalmosulishvili@lopotaresort.com',
  'n.kakashvili@lopotaresort.com'
];

// ── HTML რეპორტის builder ─────────────────────────────────
async function buildReport(shiftLabel, hoursBack, dateStr) {
  const since = new Date(Date.now() - hoursBack * 3600000);
  const snap = await db.collection('works')
    .where('submittedAt', '>=', since)
    .orderBy('submittedAt', 'desc')
    .get();
  const works = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const total  = works.length;
  const done   = works.filter(w => w.result === 'შესრულდა').length;
  const failed = works.filter(w => w.result === 'ვერ შესრულდა').length;
  const temp   = works.filter(w => w.result === 'დროებით გაკეთდა').length;

  const statBox = (n, label, bg, color) =>
    `<td style="padding:12px 18px;text-align:center;background:${bg};border-radius:8px">
      <div style="font-size:26px;font-weight:700;color:${color}">${n}</div>
      <div style="font-size:11px;color:#555;margin-top:3px">${label}</div>
    </td>`;

  const rows = works.map((w, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${i + 1}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb"><strong>${w.location || '—'}</strong></td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.workerName || '—'}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.category || '—'}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.time || '—'}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.result || '—'}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.damage || '—'}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.comment || '—'}</td>
    </tr>`).join('');

  return `
  <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px">
    <div style="background:linear-gradient(135deg,#059669,#4f46e5);padding:20px 24px;border-radius:12px;margin-bottom:20px">
      <h2 style="color:white;margin:0;font-size:20px">${shiftLabel}</h2>
      <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px">📅 ${dateStr} &nbsp;|&nbsp; ⏰ ${timeFrom} – ${timeTo}</p>
    </div>
    <table style="border-collapse:separate;border-spacing:10px;margin-bottom:20px">
      <tr>
        ${statBox(total,  'სულ სამუშაო',   '#f1f5f9', '#0f172a')}
        ${statBox(done,   '✅ შესრულდა',    '#dcfce7', '#166534')}
        ${statBox(failed, '❌ ვერ შესრულდა','#fee2e2', '#991b1b')}
        ${statBox(temp,   '🔧 დროებით',     '#fef3c7', '#92400e')}
      </tr>
    </table>
    ${total > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#059669;color:white">
          <th style="padding:10px 12px;border:1px solid #047857">#</th>
          <th style="padding:10px 12px;border:1px solid #047857">ობიექტი</th>
          <th style="padding:10px 12px;border:1px solid #047857">შემსრულებელი</th>
          <th style="padding:10px 12px;border:1px solid #047857">კატეგორია</th>
          <th style="padding:10px 12px;border:1px solid #047857">დრო</th>
          <th style="padding:10px 12px;border:1px solid #047857">შედეგი</th>
          <th style="padding:10px 12px;border:1px solid #047857">დაზიანება</th>
          <th style="padding:10px 12px;border:1px solid #047857">კომენტარი</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>` : `<p style="color:#6b7280;font-size:14px;text-align:center;padding:30px">ამ ცვლაში სამუშაო ჩანაწერი არ მოიძებნა</p>`}
    <p style="font-size:11px;color:#9ca3af;margin-top:20px;text-align:center">
      ✓ Work Tracker — ავტომატური შეტყობინება
    </p>
  </div>`;
}

// ── დღის თარიღი (Tbilisi UTC+4) ──────────────────────────
function todayTbilisi() {
  return new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
}

// ── 1. ღამის ცვლა: ყოველდღე 09:30 (Tbilisi) ─────────────
exports.morningReport = functions
  .region('us-central1')
  .pubsub.schedule('30 9 * * *')
  .timeZone('Asia/Tbilisi')
  .onRun(async () => {
    const date = todayTbilisi();
    const html = await buildReport('🌅 ღამის ცვლის შეჯამება', 15, date);
    await transporter.sendMail({
      from: `"სამუშაო Tracker" <${GMAIL_USER}>`,
      to: REPORT_EMAILS.join(', '),
      subject: `🌅 ღამის ცვლა — ${date}`,
      html
    });
    console.log('Morning report sent:', date);
    return null;
  });

// ── 2. დღის ცვლა: ყოველდღე 18:00 (Tbilisi) ──────────────
exports.eveningReport = functions
  .region('us-central1')
  .pubsub.schedule('0 18 * * *')
  .timeZone('Asia/Tbilisi')
  .onRun(async () => {
    const date = todayTbilisi();
    const html = await buildReport('🌇 დღის ცვლის შეჯამება', 9, date);
    await transporter.sendMail({
      from: `"სამუშაო Tracker" <${GMAIL_USER}>`,
      to: REPORT_EMAILS.join(', '),
      subject: `🌇 დღის ცვლა — ${date}`,
      html
    });
    console.log('Evening report sent:', date);
    return null;
  });

// ── 3. საცდელი მეილი (emailQueue trigger) ────────────────
exports.handleEmailQueue = functions
  .region('us-central1')
  .firestore.document('emailQueue/{docId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    if (data.sent) return null;

    const date = todayTbilisi();
    const recipients = data.recipients || REPORT_EMAILS;

    const html = await buildReport('🧪 საცდელი მეილი (ბოლო 24 საათი)', 24, date);
    await transporter.sendMail({
      from: `"სამუშაო Tracker" <${GMAIL_USER}>`,
      to: recipients.join(', '),
      subject: `🧪 საცდელი — ${date}`,
      html
    });

    await snap.ref.update({
      sent: true,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Test email sent');
    return null;
  });
