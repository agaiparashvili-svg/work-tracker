const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

const GMAIL_USER = functions.config().gmail.user;
const GMAIL_PASS = functions.config().gmail.pass;

const REPORT_EMAILS = [
  'a.gaiparashvili@lopotaresort.com',
  'a.akhalmosulishvili@lopotaresort.com',
  'n.kakashvili@lopotaresort.com'
];

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_PASS }
});

// ── სამუშაოების წამოღება და ფილტრი ──────────────────────
async function getWorks(hoursBack) {
  const snap = await db.collection('works').get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const since = Date.now() - hoursBack * 3600 * 1000;
  return all.filter(w => {
    if (!w.submittedAt) return false;
    const ms = w.submittedAt.toMillis ? w.submittedAt.toMillis() : Number(w.submittedAt);
    return ms >= since;
  }).sort((a, b) => {
    const at = a.submittedAt.toMillis ? a.submittedAt.toMillis() : Number(a.submittedAt);
    const bt = b.submittedAt.toMillis ? b.submittedAt.toMillis() : Number(b.submittedAt);
    return bt - at;
  });
}

// ── HTML მეილის builder ───────────────────────────────────
function buildHtml(shiftLabel, works, periodLabel) {
  const total  = works.length;
  const done   = works.filter(w => w.result === 'შესრულდა').length;
  const failed = works.filter(w => w.result === 'ვერ შესრულდა').length;
  const temp   = works.filter(w => w.result === 'დროებით გაკეთდა').length;

  const box = (n, label, bg, color) =>
    `<td style="padding:14px 20px;text-align:center;background:${bg};border-radius:8px;min-width:80px">
      <div style="font-size:28px;font-weight:700;color:${color}">${n}</div>
      <div style="font-size:11px;color:#555;margin-top:3px">${label}</div>
    </td>`;

  const rows = works.map((w, i) => {
    const res = w.result === 'შესრულდა' ? '✅ შესრულდა'
      : w.result === 'ვერ შესრულდა' ? '❌ ვერ შესრულდა' : '🔧 დროებით';
    return `<tr style="background:${i%2===0?'#f9fafb':'#fff'}">
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${i+1}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb"><strong>${w.location||'—'}</strong></td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.workerName||'—'}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.category||'—'}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.date||'—'} ${w.time||''}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${res}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.damage||'—'}</td>
      <td style="padding:9px 12px;border:1px solid #e5e7eb">${w.comment||'—'}</td>
    </tr>`;
  }).join('');

  return `<div style="font-family:Arial,sans-serif;max-width:960px;margin:0 auto;padding:20px">
    <div style="background:linear-gradient(135deg,#059669,#4f46e5);padding:22px 26px;border-radius:12px;margin-bottom:20px">
      <h2 style="color:white;margin:0;font-size:22px">${shiftLabel}</h2>
      <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px">📅 ${periodLabel}</p>
    </div>
    <table style="border-collapse:separate;border-spacing:10px;margin-bottom:20px"><tr>
      ${box(total,'სულ სამუშაო','#f1f5f9','#0f172a')}
      ${box(done,'✅ შესრულდა','#dcfce7','#166534')}
      ${box(failed,'❌ ვერ შესრულდა','#fee2e2','#991b1b')}
      ${box(temp,'🔧 დროებით','#fef3c7','#92400e')}
    </tr></table>
    ${total > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#059669;color:white">
        <th style="padding:10px 12px;border:1px solid #047857">#</th>
        <th style="padding:10px 12px;border:1px solid #047857">ობიექტი</th>
        <th style="padding:10px 12px;border:1px solid #047857">შემსრულებელი</th>
        <th style="padding:10px 12px;border:1px solid #047857">კატეგორია</th>
        <th style="padding:10px 12px;border:1px solid #047857">თარიღი/დრო</th>
        <th style="padding:10px 12px;border:1px solid #047857">შედეგი</th>
        <th style="padding:10px 12px;border:1px solid #047857">დაზიანება</th>
        <th style="padding:10px 12px;border:1px solid #047857">კომენტარი</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<p style="color:#6b7280;text-align:center;padding:40px;font-size:14px">ამ პერიოდში სამუშაო ჩანაწერი არ მოიძებნა</p>`}
    <p style="font-size:11px;color:#9ca3af;margin-top:20px;text-align:center">✓ Work Tracker — ავტომატური შეტყობინება</p>
  </div>`;
}

// ── 1. ღამის ცვლა: 09:30 Tbilisi ────────────────────────
exports.morningReport = functions
  .region('us-central1')
  .pubsub.schedule('30 9 * * *')
  .timeZone('Asia/Tbilisi')
  .onRun(async () => {
    const works = await getWorks(15);
    const html = buildHtml('🌅 ღამის ცვლის შეჯამება', works, 'ბოლო 15 საათი');
    const date = new Date(Date.now()+4*3600000).toISOString().slice(0,10);
    await transporter.sendMail({
      from: `"სამუშაო Tracker" <${GMAIL_USER}>`,
      to: REPORT_EMAILS.join(', '),
      subject: `🌅 ღამის ცვლა — ${date}`,
      html
    });
    console.log(`Morning report sent: ${works.length} works`);
    return null;
  });

// ── 2. დღის ცვლა: 18:00 Tbilisi ─────────────────────────
exports.eveningReport = functions
  .region('us-central1')
  .pubsub.schedule('0 18 * * *')
  .timeZone('Asia/Tbilisi')
  .onRun(async () => {
    const works = await getWorks(9);
    const html = buildHtml('🌇 დღის ცვლის შეჯამება', works, 'ბოლო 9 საათი');
    const date = new Date(Date.now()+4*3600000).toISOString().slice(0,10);
    await transporter.sendMail({
      from: `"სამუშაო Tracker" <${GMAIL_USER}>`,
      to: REPORT_EMAILS.join(', '),
      subject: `🌇 დღის ცვლა — ${date}`,
      html
    });
    console.log(`Evening report sent: ${works.length} works`);
    return null;
  });

// ── 3. საცდელი მეილი (emailQueue trigger) ────────────────
exports.handleEmailQueue = functions
  .region('us-central1')
  .firestore.document('emailQueue/{docId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    if (data.sent) return null;
    const works = await getWorks(24);
    const html = buildHtml('🧪 საცდელი მეილი', works, 'ბოლო 24 საათი');
    const date = new Date(Date.now()+4*3600000).toISOString().slice(0,10);
    const recipients = data.recipients || REPORT_EMAILS;
    await transporter.sendMail({
      from: `"სამუშაო Tracker" <${GMAIL_USER}>`,
      to: recipients.join(', '),
      subject: `🧪 საცდელი — ${date}`,
      html
    });
    await snap.ref.update({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`Test email sent: ${works.length} works`);
    return null;
  });
