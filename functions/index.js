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

// ════════════════════════════════════════════════════════
//  საქვაბის შემოწმება (inspections) — დღიური შეჯამება
// ════════════════════════════════════════════════════════

// ── შემოწმებების წამოღება და ფილტრი ─────────────────────
async function getInspections(hoursBack) {
  const snap = await db.collection('inspections').get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const since = Date.now() - hoursBack * 3600 * 1000;
  return all.filter(x => {
    if (!x.submittedAt) return false;
    const ms = x.submittedAt.toMillis ? x.submittedAt.toMillis() : Number(x.submittedAt);
    return ms >= since;
  }).sort((a, b) => {
    const at = a.submittedAt.toMillis ? a.submittedAt.toMillis() : Number(a.submittedAt);
    const bt = b.submittedAt.toMillis ? b.submittedAt.toMillis() : Number(b.submittedAt);
    return bt - at;
  });
}

// სტატუსი → ემოჯით ლეიბლი
function stLabel(v) {
  const m = {
    'მუშაობს':'✅ მუშაობს', 'პრობლემა':'⚠️ პრობლემა', 'არ მუშაობს':'❌ არ მუშაობს',
    'ჩართულია':'✅ ჩართულია', 'გათიშულია':'❌ გათიშულია',
    'დაზიანებულია':'❌ დაზიანებულია', 'მოსატენი':'⚠️ მოსატენი'
  };
  return v ? (m[v] || v) : '—';
}

// ── HTML builder — საქვაბის შემოწმება ────────────────────
function buildInspectionsHtml(title, list, periodLabel) {
  const total = list.length;
  const boilerIssue = list.filter(x => x.boiler && x.boiler.status !== 'მუშაობს').length;
  const waterOff = list.filter(x => x.hotwater && x.hotwater.filled === 'გათიშულია').length;
  const chillerIssue = list.filter(x => x.cooling && x.cooling.status !== 'მუშაობს').length;
  const faults = list.filter(x => {
    const h = x.hotwater || {}, c = x.cooling || {};
    return h.pump === 'დაზიანებულია' || c.pumps === 'დაზიანებულია'
      || c.expander === 'დაზიანებულია' || c.expander === 'მოსატენი';
  }).length;

  const box = (n, label, bg, color) =>
    `<td style="padding:14px 20px;text-align:center;background:${bg};border-radius:8px;min-width:80px">
      <div style="font-size:28px;font-weight:700;color:${color}">${n}</div>
      <div style="font-size:11px;color:#555;margin-top:3px">${label}</div>
    </td>`;

  const cell = v => `<td style="padding:9px 12px;border:1px solid #e5e7eb">${v}</td>`;
  const rows = list.map((x, i) => {
    const b = x.boiler || {}, h = x.hotwater || {}, c = x.cooling || {};
    const comments = [b.comment, h.comment, c.comment].filter(Boolean).join(' · ') || '—';
    return `<tr style="background:${i%2===0?'#f9fafb':'#fff'}">
      ${cell(i+1)}
      ${cell(`<strong>${x.objectName||'—'}</strong>`)}
      ${cell(x.workerName||'—')}
      ${cell(`${x.date||'—'} ${x.time||''}`)}
      ${cell(b.status ? stLabel(b.status) : '—')}
      ${cell(stLabel(h.filled))}
      ${cell(stLabel(h.pump))}
      ${cell(c.status ? stLabel(c.status) : '—')}
      ${cell(c.pumps ? stLabel(c.pumps) : '—')}
      ${cell(c.expander ? stLabel(c.expander) : '—')}
      ${cell(comments)}
    </tr>`;
  }).join('');

  return `<div style="font-family:Arial,sans-serif;max-width:1040px;margin:0 auto;padding:20px">
    <div style="background:linear-gradient(135deg,#0284c7,#4f46e5);padding:22px 26px;border-radius:12px;margin-bottom:20px">
      <h2 style="color:white;margin:0;font-size:22px">${title}</h2>
      <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:13px">📅 ${periodLabel}</p>
    </div>
    <table style="border-collapse:separate;border-spacing:10px;margin-bottom:20px"><tr>
      ${box(total,'სულ შემოწმება','#f1f5f9','#0f172a')}
      ${box(boilerIssue,'🔥 საქვაბე პრობლემა','#fef3c7','#92400e')}
      ${box(waterOff,'💧 წყალი გათიშული','#fee2e2','#991b1b')}
      ${box(chillerIssue,'❄️ ჩილერი პრობლემა','#fef3c7','#92400e')}
      ${box(faults,'🔧 ტუმბო/ბალონი ხარვეზი','#fee2e2','#991b1b')}
    </tr></table>
    ${total > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#0284c7;color:white">
        <th style="padding:10px 12px;border:1px solid #0369a1">#</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">ობიექტი</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">თანამშრომელი</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">თარიღი/დრო</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">🔥 საქვაბე</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">💧 ცხელი წყალი</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">რეცირკ. ტუმბო</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">❄️ ჩილერი</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">ცირკ. ტუმბოები</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">გამაფართოებელი</th>
        <th style="padding:10px 12px;border:1px solid #0369a1">კომენტარი</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<p style="color:#6b7280;text-align:center;padding:40px;font-size:14px">ამ პერიოდში საქვაბის შემოწმება არ მოიძებნა</p>`}
    <p style="font-size:11px;color:#9ca3af;margin-top:20px;text-align:center">✓ Work Tracker — საქვაბის შემოწმება (ავტომატური)</p>
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

// ── 5. დავალების push შეტყობინება ────────────────────────
exports.onTaskAssigned = functions
  .region('us-central1')
  .firestore.document('redirects/{docId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    const assignedTo = data.assignedTo || [];
    if (!assignedTo.length) return null;

    // Find FCM tokens of assigned workers
    const usersSnap = await db.collection('users').get();
    const tokens = usersSnap.docs
      .filter(d => {
        const ud = d.data();
        const label = ud.displayName || ud.name || '';
        return assignedTo.includes(label);
      })
      .map(d => d.data().fcmToken)
      .filter(Boolean);

    if (!tokens.length) {
      console.log('No FCM tokens found for:', assignedTo);
      return null;
    }

    const supervisor = data.supervisorName || 'სუპერვაიზერი';
    const location = data.location || '';
    const note = data.note || data.description || '';
    const body = [location, note].filter(Boolean).join(' — ') || 'ახალი დავალება';

    const msg = {
      tokens,
      notification: { title: `📬 ახალი დავალება — ${supervisor}`, body },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    };

    const result = await admin.messaging().sendEachForMulticast(msg);
    console.log(`Task push: ${result.successCount}/${tokens.length} sent`);
    return null;
  });

// ── 4. საქვაბის შემოწმება: დღიური შეჯამება 10:00 Tbilisi ──
//    (დროის შესაცვლელად შეცვალე '0 10' — წუთი/საათი)
exports.dailyBoilerReport = functions
  .region('us-central1')
  .pubsub.schedule('0 10 * * *')
  .timeZone('Asia/Tbilisi')
  .onRun(async () => {
    const list = await getInspections(24);
    const date = new Date(Date.now()+4*3600000).toISOString().slice(0,10);
    const html = buildInspectionsHtml('🔥 საქვაბის შემოწმების დღიური შეჯამება', list, `${date} · ბოლო 24 საათი`);
    await transporter.sendMail({
      from: `"საქვაბის შემოწმება" <${GMAIL_USER}>`,
      to: REPORT_EMAILS.join(', '),
      subject: `🔥 საქვაბის შემოწმება — ${date}`,
      html
    });
    console.log(`Daily boiler report sent: ${list.length} inspections`);
    return null;
  });
