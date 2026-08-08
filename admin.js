/* ═══════════════════════════════════════════════════════════
   admin.js — Admin Dashboard Logic
   ═══════════════════════════════════════════════════════════ */
'use strict';

let TOKEN = localStorage.getItem('admin_token') || '';
let currentStatus = 'all';
let allContracts = [];
let allProducts = [];

// ── Auth ─────────────────────────────────────────────────────────
async function doLogin() {
  const pw  = document.getElementById('login-pw').value;
  const err = document.getElementById('login-err');
  if (!pw) { err.textContent = 'กรุณากรอกรหัสผ่าน'; return; }

  try {
    const r = await api('POST','/api/admin/login',{password:pw});
    if (!r.success) { err.textContent = r.message; return; }
    TOKEN = r.token;
    localStorage.setItem('admin_token', TOKEN);
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    init();
  } catch(e) {
    err.textContent = 'เชื่อมต่อไม่ได้: ' + e.message;
  }
}

function logout() {
  localStorage.removeItem('admin_token');
  location.reload();
}

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  // Check token
  try {
    await loadStats();
    await Promise.all([loadContracts(), loadProducts()]);
    updateClock();
    setInterval(updateClock, 1000);
    initCharts();
  } catch(e) {
    if (e.status === 401) {
      localStorage.removeItem('admin_token');
      location.reload();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (TOKEN) {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    init();
  }
});

// ── Clock & Date ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' น.';
  
  const dateEl = document.getElementById('topbar-date-display');
  const timeEl = document.getElementById('topbar-time');
  if (dateEl) dateEl.textContent = dateStr;
  if (timeEl) timeEl.textContent = timeStr;
}

function initCharts() {
  renderSalesChart();
  renderDonutChart();
}

function renderSalesChart() {
  const canvas = document.getElementById('chart-sales');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Points for 7 days
  const points = [
    { x: 30, y: 140, label: '31 ก.ค.' },
    { x: 90, y: 110, label: '1 ส.ค.' },
    { x: 150, y: 120, label: '2 ส.ค.' },
    { x: 210, y: 90,  label: '3 ส.ค.' },
    { x: 270, y: 80,  label: '4 ส.ค.' },
    { x: 330, y: 50,  label: '5 ส.ค.' },
    { x: 400, y: 70,  label: '6 ส.ค.' }
  ];

  // Fill gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(139, 92, 246, 0.45)');
  grad.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const xc = (points[i].x + points[i - 1].x) / 2;
    const yc = (points[i].y + points[i - 1].y) / 2;
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.lineTo(points[points.length - 1].x, h - 20);
  ctx.lineTo(points[0].x, h - 20);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Curve stroke
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const xc = (points[i].x + points[i - 1].x) / 2;
    const yc = (points[i].y + points[i - 1].y) / 2;
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Dots
  points.forEach((p, idx) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = idx === points.length - 1 ? '#8b5cf6' : '#c084fc';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Axis label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Sarabun';
    ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x, h - 4);
  });
}

function renderDonutChart() {
  const canvas = document.getElementById('chart-donut');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outerR = 70;
  const innerR = 48;

  const data = [
    { value: 81.7, color: '#10b981' },
    { value: 0.6,  color: '#f59e0b' },
    { value: 1.1,  color: '#3b82f6' },
    { value: 16.6, color: '#8b5cf6' }
  ];

  let startAngle = -Math.PI / 2;

  data.forEach(slice => {
    const sliceAngle = (slice.value / 100) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, endAngle);
    ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();

    startAngle = endAngle;
  });
}

// ── Page Navigation ───────────────────────────────────────────────
function showPage(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add('active');
  if (el) el.classList.add('active');

  const titles = { 
    dashboard: 'Dashboard', 
    contracts: '👥 รายการสัญญาทั้งหมด', 
    reminders: '💳 ติดตามค่างวดประจำเดือน', 
    products: '📱 รายการสินค้า / สต็อก',
    reports: '📈 รายงานการขายและสรุปงบการเงิน',
    notifications: '🔔 ศูนย์การแจ้งเตือนระบบ',
    settings: '⚙️ การตั้งค่าระบบ & ร้านค้า'
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[page] || page;

  if (page === 'reminders') loadReminders();
  if (page === 'reports') loadReportsData();

  // Auto-close mobile sidebar if open
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    toggleSidebar();
  }
}

function toggleSidebar(event) {
  if (event) event.stopPropagation();
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) {
    sidebar.classList.toggle('open');
    const isOpen = sidebar.classList.contains('open');
    if (overlay) overlay.classList.toggle('hidden', !isOpen);
  }
}

function refreshAll() {
  loadStats();
  loadContracts(currentStatus, document.getElementById('search-input')?.value);
  loadProducts();
  loadReminders();
  toast('รีเฟรชแล้ว','ok');
}

// ── Stats ─────────────────────────────────────────────────────────
async function loadStats() {
  const d = await api('GET','/api/admin/stats');
  set('st-total',    d.data.total);
  set('st-pending',  d.data.pending);
  set('st-approved', d.data.approved);
  set('st-rejected', d.data.rejected);
  set('st-revenue',  fmt(d.data.revenue));
  
  const pendingBadge = document.getElementById('badge-pending');
  if (pendingBadge) {
    pendingBadge.textContent = d.data.pending;
    pendingBadge.style.display = d.data.pending === 0 ? 'none' : 'inline-block';
  }
}

// ── Contracts ─────────────────────────────────────────────────────
async function loadContracts(status = 'all', search = '') {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (search) params.set('search', search);

  const d = await api('GET', `/api/admin/contracts?${params}`);
  allContracts = d.data;
  renderContractsTable('contracts-tbody', d.data, true);
  renderContractsTable('dash-tbody', d.data.filter(c => c.status === 'pending').slice(0,10), false);
  document.getElementById('contracts-empty').classList.toggle('hidden', d.data.length > 0);
}

function filterContracts(status, el) {
  currentStatus = status;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loadContracts(status, document.getElementById('search-input').value);
}

let searchTimeout;
function searchContracts() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadContracts(currentStatus, document.getElementById('search-input').value.trim());
  }, 300);
}

function exportContractsCSV() {
  if (!allContracts || !allContracts.length) {
    toast('ไม่มีข้อมูลสัญญาสำหรับส่งออก', 'err');
    return;
  }

  const headers = ['เลขที่สัญญา', 'ชื่อลูกค้า', 'เบอร์โทรศัพท์', 'รุ่นสินค้า', 'สี', 'ความจุ', 'ราคาสินค้า', 'เงินดาวน์', 'ค่างวด/เดือน', 'จำนวนงวด', 'วันที่สร้างสัญญา', 'สถานะ'];
  const rows = allContracts.map(c => [
    `"${c.contract_no || ''}"`,
    `"${(c.customer_name || '').replace(/"/g, '""')}"`,
    `"${c.phone || ''}"`,
    `"${(c.model || '').replace(/"/g, '""')}"`,
    `"${(c.color || '').replace(/"/g, '""')}"`,
    `"${c.storage || ''}"`,
    c.price || 0,
    c.down_payment || 0,
    c.monthly_payment || 0,
    c.installments || 0,
    `"${c.created_at || ''}"`,
    `"${c.status === 'approved' ? 'อนุมัติแล้ว' : c.status === 'rejected' ? 'ปฏิเสธ' : 'รอดำเนินการ'}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `SABUYPHONE_Contracts_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('📊 ส่งออกข้อมูลสัญญาเป็นไฟล์ Excel/CSV เรียบร้อย!', 'ok');
}

function renderContractsTable(tbodyId, rows, showActions) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">ไม่พบข้อมูล</td></tr>'; return; }

  if (tbodyId === 'dash-tbody') {
    tbody.innerHTML = rows.map((c, idx) => {
      const initial = (c.customer_name || 'ล').charAt(0);
      const remaining = (c.price || 0) - (c.down_payment || 0);
      return `
        <tr class="table-row-click" onclick="openContract(${c.id})">
          <td>
            <div class="cust-cell">
              <div class="cust-avatar">${initial}</div>
              <div>
                <div style="font-weight:700;color:#fff;">${escHtml(c.customer_name)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${c.phone}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <img src="/iphone16promax.png" alt="device" style="width:24px;height:24px;object-fit:contain;" onerror="this.style.display='none'">
              <div>
                <div style="font-weight:700;color:#fff;">${c.model}</div>
                <div style="font-size:10.5px;color:var(--text-muted);">${c.storage}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight:700;color:#a78bfa;">งวดที่ 1/${c.installments || 6}</div>
            <div style="font-size:10.5px;color:var(--text-muted);">${thDate(c.created_at)}</div>
          </td>
          <td>${statusBadge(c.status)}</td>
          <td style="font-weight:800;color:#34d399;">${fmt(remaining)}</td>
          <td>
            <button class="btn btn-sm btn-outline" style="padding:4px 8px;" onclick="event.stopPropagation();openContract(${c.id})">•••</button>
          </td>
        </tr>
      `;
    }).join('');
    return;
  }

  tbody.innerHTML = rows.map(c => `
    <tr class="table-row-click" onclick="openContract(${c.id})">
      <td><code style="color:#60a5fa;font-family:monospace">${c.contract_no}</code></td>
      <td>${escHtml(c.customer_name)}</td>
      <td>${c.phone}</td>
      <td><strong>${c.model}</strong></td>
      ${showActions ? `<td><span style="color:#8b9cc8">${c.color}</span><br><span style="color:#4a5568;font-size:11px">${c.storage}</span></td>` : ''}
      <td><strong>${fmt(c.price)}</strong></td>
      <td style="color:#6b7a99;font-size:12px">${thDate(c.created_at)}</td>
      <td>${statusBadge(c.status)}</td>
      ${showActions ? `<td>
        <button class="btn btn-sm btn-outline" style="margin-right:6px;" onclick="event.stopPropagation();openContract(${c.id})">ดู</button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteContractItem(${c.id})">ลบ</button>
      </td>` : ''}
    </tr>
  `).join('');
}

async function deleteContractItem(id) {
  if (!confirm('⚠️ ยืนยันลบสัญญานี้ออกจากระบบอย่างถาวร? (การลบจะไม่สามารถกู้คืนข้อมูลได้)')) return;
  try {
    const r = await api('DELETE', `/api/admin/contracts/${id}`);
    if (r.success) {
      toast('ลบสัญญาสำเร็จ', 'ok');
      refreshAll();
    }
  } catch (e) {
    toast('ลบไม่สำเร็จ: ' + e.message, 'err');
  }
}

// ── Contract Detail Modal ─────────────────────────────────────────
async function openContract(id) {
  const d = await api('GET', `/api/admin/contracts/${id}`);
  const c = d.data;

  document.getElementById('modal-title').textContent = `สัญญา ${c.contract_no}`;
  document.getElementById('modal-sub').textContent = `${c.name} — ${thDate(c.created_at)}`;

  const payDay = c.created_at ? new Date(c.created_at.replace(' ', 'T')).getDate() : 15;

  const body = document.getElementById('modal-body');
  body.innerHTML = `
    <!-- Customer Info -->
    <div>
      <div class="detail-section-title">👤 ข้อมูลลูกค้า</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">ชื่อ-นามสกุล</span><span class="detail-value">${escHtml(c.name)}</span></div>
        <div class="detail-item"><span class="detail-label">เลขบัตรประชาชน</span><span class="detail-value">${c.id_card}</span></div>
        <div class="detail-item"><span class="detail-label">เบอร์โทรศัพท์</span><span class="detail-value">${c.phone}</span></div>
        <div class="detail-item"><span class="detail-label">วันเกิด</span><span class="detail-value">${c.birthdate || '-'}</span></div>
        <div class="detail-item" style="grid-column:1/-1"><span class="detail-label">ที่อยู่</span><span class="detail-value">${[c.address,c.subdistrict,c.district,c.province,c.postal_code].filter(Boolean).join(' ') || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Facebook</span><span class="detail-value">${c.facebook || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">LINE ID</span><span class="detail-value">${c.line_id || '-'}</span></div>
        <div class="detail-item" style="grid-column:1/-1"><span class="detail-label">พิกัด GPS ขณะทำสัญญา</span><span class="detail-value">${c.latitude && c.longitude ? `<a href="https://www.google.com/maps?q=${c.latitude},${c.longitude}" target="_blank" style="color:#f59e0b;font-weight:700;text-decoration:underline;">📍 ${c.latitude}, ${c.longitude}</a>` : '<span style="color:#94a3b8">ไม่ระบุพิกัด GPS</span>'}</span></div>
        <div class="detail-item" style="grid-column:1/-1;margin-top:4px;">
          <button class="btn btn-sm btn-outline" style="border-color:#3b82f6;color:#60a5fa;width:100%;justify-content:center;padding:8px 14px;" onclick="openGoogleMapsNav('${c.latitude || ''}', '${c.longitude || ''}', '${escHtml([c.address,c.subdistrict,c.district,c.province,c.postal_code].filter(Boolean).join(' '))}')">🗺️ เปิดแผนที่นำทางไปบ้านลูกค้า (Google Maps)</button>
        </div>
      </div>
    </div>

    <!-- Product Info -->
    <div>
      <div class="detail-section-title">📦 รายละเอียดสินค้า</div>
      <div class="info-box">
        <div class="detail-item"><span class="detail-label">สินค้า</span><span class="detail-value"><strong>${c.brand} ${c.model}</strong></span></div>
        <div class="detail-item"><span class="detail-label">สี / ความจุ</span><span class="detail-value">${c.color} / ${c.storage}</span></div>

        <div class="detail-item"><span class="detail-label">สถานะสัญญา</span><span class="detail-value">${statusBadge(c.status)}</span></div>
      </div>
    </div>

    <!-- Pricing -->
    <div>
      <div class="detail-section-title">💰 รายละเอียดการผ่อนชำระ (แอดมินแก้ไขตัวเลขได้อิสระ)</div>
      <div class="price-box-modal" style="padding:15px; background:rgba(255,255,255,0.02); border-radius:10px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; color:var(--text2)">ราคาสินค้า (บาท)</span>
          <input type="number" id="edit-price" class="input" style="width:140px; text-align:right; padding:6px 10px; opacity:0.7;" value="${c.price}" disabled>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; color:#60a5fa; font-weight:600;">เงินดาวน์ (บาท)</span>
          <input type="number" id="edit-down-payment" class="input" style="width:140px; text-align:right; padding:6px 10px; border:1px solid #60a5fa;" value="${c.down_payment}">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; color:#34d399; font-weight:600;">ค่างวดต่อเดือน (บาท)</span>
          <input type="number" id="edit-monthly-payment" class="input" style="width:140px; text-align:right; padding:6px 10px; border:1px solid #34d399;" value="${c.monthly_payment}">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; color:#f59e0b; font-weight:600;">จำนวนงวด (งวด)</span>
          <input type="number" id="edit-installments" class="input" style="width:140px; text-align:right; padding:6px 10px; border:1px solid #f59e0b;" value="${c.installments}">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; color:var(--text2);">
          <span>วันชำระงวดแต่ละเดือน</span>
          <strong>ทุกวันที่ ${payDay} ของเดือน</strong>
        </div>
        ${c.status === 'approved' ? `
          <div style="text-align:right; margin-top:6px;">
            <button class="btn btn-outline btn-sm" onclick="saveCustomPricing(${c.id})">💾 บันทึกการแก้ไขราคา</button>
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Payments & Receipts Section -->
    <div>
      <div class="detail-section-title">💳 ประวัติการผ่อนชำระค่างวดประจำเดือน & ออกใบเสร็จ</div>
      <div id="contract-payments-container">⏳ กำลังโหลดรายการ...</div>
    </div>

    <!-- Documents -->
    ${c.documents?.length ? `
    <div>
      <div class="detail-section-title">📎 เอกสารที่อัปโหลด</div>
      <div class="doc-grid">
        ${c.documents.map(doc => `
          <div class="doc-card" onclick="viewImage('${doc.file_path}','${docTypeTH(doc.doc_type)}')">
            <img src="${doc.file_path}" alt="${docTypeTH(doc.doc_type)}" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23111\\'></rect></svg>'">
            <p>${docTypeTH(doc.doc_type)}</p>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- Signature -->
    ${c.signature_data ? `
    <div>
      <div class="detail-section-title">✍️ ลายเซ็น</div>
      <div class="sig-preview"><img src="${c.signature_data}" alt="signature"></div>
    </div>` : ''}


    <!-- Admin Note -->
    ${c.status === 'pending' ? `
    <div class="form-group" style="margin-bottom:0">
      <label class="label">หมายเหตุ Admin (ไม่บังคับ)</label>
      <textarea id="modal-note" class="input" rows="2" placeholder="บันทึกข้อความ..."></textarea>
    </div>
    ` : ''}

    ${c.admin_note ? `
    <div>
      <div class="detail-section-title">📝 หมายเหตุ Admin</div>
      <p style="font-size:13px;color:var(--text2)">${escHtml(c.admin_note)}</p>
    </div>` : ''}
  `;

  // Footer buttons
  const footer = document.getElementById('modal-footer');
  footer.innerHTML = '';

  const closeBtn = btn('btn-ghost','✕ ปิด', 'closeModal()');
  footer.appendChild(closeBtn);

  if (c.status === 'pending') {
    const printBtn = btn('btn-outline','🖨️ พิมพ์สัญญา', `window.open('/contract/${id}/print?token=${TOKEN}','_blank')`);
    const rejectBtn = btn('btn-danger','❌ ปฏิเสธ', `updateStatus(${id},'rejected')`);
    const approveBtn = btn('btn-success','✅ อนุมัติสัญญา', `updateStatus(${id},'approved')`);
    footer.appendChild(printBtn);
    footer.appendChild(rejectBtn);
    footer.appendChild(approveBtn);
  } else {
    const printBtn = btn('btn-outline','🖨️ พิมพ์สัญญา', `window.open('/contract/${id}/print?token=${TOKEN}','_blank')`);
    footer.appendChild(printBtn);
  }

  openModal();
  loadContractPayments(id, c.monthly_payment, c.installments);
}

async function saveCustomPricing(id) {
  const customDown = parseFloat(document.getElementById('edit-down-payment')?.value) || null;
  const customMonthly = parseFloat(document.getElementById('edit-monthly-payment')?.value) || null;
  const customInstallments = parseInt(document.getElementById('edit-installments')?.value) || null;

  try {
    const r = await api('PUT', `/api/admin/contracts/${id}/status`, { 
      status: 'approved',
      custom_down_payment: customDown,
      custom_monthly_payment: customMonthly,
      custom_installments: customInstallments
    });
    if (r.success) {
      toast('💾 บันทึกการแก้ไขราคาและค่างวดสำเร็จ!','ok');
      openContract(id);
      refreshAll();
    }
  } catch(e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message,'err');
  }
}

async function updateStatus(id, status) {
  const noteSel  = document.getElementById('modal-note');
  const note     = noteSel ? noteSel.value.trim() : '';

  const customDown = parseFloat(document.getElementById('edit-down-payment')?.value) || null;
  const customMonthly = parseFloat(document.getElementById('edit-monthly-payment')?.value) || null;
  const customInstallments = parseInt(document.getElementById('edit-installments')?.value) || null;

  try {
    const r = await api('PUT', `/api/admin/contracts/${id}/status`, { 
      status,
      admin_note: note,
      custom_down_payment: customDown,
      custom_monthly_payment: customMonthly,
      custom_installments: customInstallments
    });
    if (r.success) {
      toast(status === 'approved' ? '✅ อนุมัติสัญญาแล้ว' : '❌ ปฏิเสธสัญญาแล้ว', status === 'approved' ? 'ok' : 'err');
      closeModal();
      refreshAll();
    }
  } catch(e) {
    toast('เกิดข้อผิดพลาด: ' + e.message,'err');
  }
}

let editingProductId = null;

// ── Products ──────────────────────────────────────────────────────
async function loadProducts() {
  const d = await api('GET','/api/admin/products');
  allProducts = d.data;
  filterProductsList();
}

function filterProductsList() {
  const query = (document.getElementById('product-search-input')?.value || '').toLowerCase().trim();
  const brandFilter = document.getElementById('product-brand-filter')?.value || 'all';

  const tbody = document.getElementById('products-tbody');
  if (!allProducts || !allProducts.length) { 
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state">ไม่พบสินค้า</td></tr>'; 
    return; 
  }

  const filtered = allProducts.filter(p => {
    const matchBrand = brandFilter === 'all' || p.brand.toLowerCase() === brandFilter.toLowerCase();
    const matchQuery = !query || 
      p.model.toLowerCase().includes(query) ||
      p.brand.toLowerCase().includes(query) ||
      p.color.toLowerCase().includes(query) ||
      p.storage.toLowerCase().includes(query);
    return matchBrand && matchQuery;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">ไม่พบสินค้าที่ตรงกับการค้นหา</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td>${p.brand}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${p.image_path ? `<img src="${p.image_path}" style="width:36px;height:36px;object-fit:contain;background:rgba(255,255,255,0.02);border-radius:6px;cursor:pointer;" onclick="viewImage('${p.image_path}', '${p.model}')">` : '<span style="font-size:20px;">📱</span>'}
          <strong>${p.model}</strong>
        </div>
      </td>
      <td><span class="color-dot" style="background:${p.color_hex};width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:6px;box-shadow:0 0 0 1px rgba(255,255,255,0.1)"></span>${p.color}</td>
      <td>${p.storage}</td>
      <td>${fmt(p.price)}</td>
      <td style="color:#60a5fa">${fmt(p.down_payment)}</td>
      <td>${fmt(p.monthly_payment)}</td>
      <td>${p.installments} งวด</td>
      <td>
        <button class="btn btn-sm btn-outline" style="margin-right:6px;" onclick="editProduct(${p.id})">แก้ไข</button>
        <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})">ลบ</button>
      </td>
    </tr>
  `).join('');
}

function showAddProductModal() {
  editingProductId = null;
  const title = document.getElementById('ap-modal-title');
  const btn = document.getElementById('ap-submit-btn');
  if (title) title.textContent = '📦 เพิ่มสินค้าใหม่';
  if (btn) btn.textContent = '💾 เพิ่มสินค้า';

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('ap-model', '');
  setVal('ap-color', '');
  setVal('ap-color-hex', '#8b5cf6');
  setVal('ap-storage', '');
  setVal('ap-price', '');
  setVal('ap-down', '');
  setVal('ap-monthly', '');
  setVal('ap-installments', '6');
  setVal('ap-payday', '15');
  setVal('ap-image-path', '');
  setVal('ap-image-file', '');
  
  const overlay = document.getElementById('add-product-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function editProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;

  const title = document.getElementById('ap-modal-title');
  const btn = document.getElementById('ap-submit-btn');
  if (title) title.textContent = '✏️ แก้ไขข้อมูลสินค้า';
  if (btn) btn.textContent = '💾 บันทึกการแก้ไข';

  const setVal = (elmId, v) => { const el = document.getElementById(elmId); if (el) el.value = v; };
  setVal('ap-brand', p.brand || 'Apple');
  setVal('ap-model', p.model || '');
  setVal('ap-color', p.color || '');
  setVal('ap-color-hex', p.color_hex || '#8b5cf6');
  setVal('ap-storage', p.storage || '');
  setVal('ap-price', p.price || 0);
  setVal('ap-down', p.down_payment || 0);
  setVal('ap-monthly', p.monthly_payment || 0);
  setVal('ap-installments', p.installments || 6);
  setVal('ap-payday', p.payment_day || 15);
  setVal('ap-image-path', p.image_path || '');
  setVal('ap-image-file', '');

  const overlay = document.getElementById('add-product-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function closeAddProduct() {
  document.getElementById('add-product-overlay').classList.add('hidden');
}

async function handleProductImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const btn = input.previousElementSibling?.querySelector('button') || input.parentElement.querySelector('button');
  const oldText = btn ? btn.textContent : '📂 อัปโหลด';

  try {
    if (btn) { btn.textContent = '⏳ กำลังอัปโหลด...'; btn.disabled = true; }

    const fd = new FormData();
    fd.append('file', file);

    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'x-admin-token': TOKEN },
      body: fd
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.message);

    document.getElementById('ap-image-path').value = d.filePath;
    toast('📂 อัปโหลดรูปภาพสินค้าสำเร็จ!', 'ok');
  } catch (e) {
    console.error(e);
    toast('อัปโหลดล้มเหลว: ' + e.message, 'err');
  } finally {
    if (btn) { btn.textContent = oldText; btn.disabled = false; }
  }
}

async function submitAddProduct() {
  const brand = document.getElementById('ap-brand').value;
  const model = document.getElementById('ap-model').value.trim();
  const color = document.getElementById('ap-color').value.trim();
  const color_hex = document.getElementById('ap-color-hex').value;
  const storage = document.getElementById('ap-storage').value.trim();
  const price = parseFloat(document.getElementById('ap-price').value);
  const down_payment = parseFloat(document.getElementById('ap-down').value);
  const monthly_payment = parseFloat(document.getElementById('ap-monthly').value);
  const installments = parseInt(document.getElementById('ap-installments').value);
  const payment_day = parseInt(document.getElementById('ap-payday').value);
  const image_path = document.getElementById('ap-image-path').value.trim();

  if (!model || !color || !storage || isNaN(price) || isNaN(down_payment) || isNaN(monthly_payment)) {
    toast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน','err');
    return;
  }

  try {
    const payload = { brand, model, color, color_hex, storage, price, down_payment, monthly_payment, installments, payment_day, image_path };
    let r;
    if (editingProductId) {
      r = await api('PUT', `/api/admin/products/${editingProductId}`, payload);
    } else {
      r = await api('POST', '/api/admin/products', payload);
    }
    if (r.success) {
      toast(editingProductId ? 'แก้ไขสินค้าสำเร็จ' : 'เพิ่มสินค้าสำเร็จ','ok');
      closeAddProduct();
      loadProducts();
    }
  } catch(e) {
    toast('ทำรายการไม่สำเร็จ: ' + e.message, 'err');
  }
}

async function deleteProduct(id) {
  if (!confirm('ยืนยันลบสินค้านี้ออกจากระบบ? (การลบจะไม่ทำให้ข้อมูลในสัญญาเก่าสูญหาย)')) return;
  try {
    const r = await api('DELETE', `/api/admin/products/${id}`);
    if (r.success) {
      toast('ลบสินค้าสำเร็จ','ok');
      loadProducts();
    }
  } catch(e) {
    toast('ลบไม่สำเร็จ: ' + e.message, 'err');
  }
}

// ── Modal Helpers ─────────────────────────────────────────────────
function openModal()  { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// ── API Helper ────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type':'application/json', 'x-admin-token': TOKEN },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (r.status === 401) { const e = new Error('Unauthorized'); e.status = 401; throw e; }
  return r.json();
}

// ── Utilities ─────────────────────────────────────────────────────
function set(id, v)  { const el=document.getElementById(id); if(el) el.textContent=v; }
function fmt(n)      { return Number(n).toLocaleString('th-TH') + ' บาท'; }
function escHtml(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function thDate(s)   { if(!s) return '-'; try { return new Date(s).toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); } catch { return s; } }
function docTypeTH(t){ return { id_card_front:'บัตรประชาชน', selfie:'เซลฟี่คู่บัตร', house_front:'หน้าบ้าน', house_back:'หลังบ้าน' }[t] || t; }

function statusBadge(s) {
  const m = { pending:'รอดำเนินการ', approved:'อนุมัติแล้ว', rejected:'ปฏิเสธ' };
  const c = { pending:'badge-pending', approved:'badge-approved', rejected:'badge-rejected' };
  return `<span class="badge-status ${c[s]||''}">${m[s]||s}</span>`;
}

function imeiStatusBadge(s) {
  const m = { available:'ว่าง', used:'ใช้แล้ว', reserved:'จอง' };
  const c = { available:'badge-available', used:'badge-used', reserved:'badge-pending' };
  return `<span class="badge-status ${c[s]||''}">${m[s]||s}</span>`;
}

function btn(cls, label, action) {
  const b = document.createElement('button');
  b.className = `btn ${cls}`;
  b.innerHTML = label;
  b.setAttribute('onclick', action);
  return b;
}

function toast(msg, type='info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  const cls = type==='err'?'toast-err':type==='ok'?'toast-ok':'toast-info';
  t.className = `toast ${cls}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3500);
}

// Lightbox Preview Helpers
function viewImage(src, caption) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-caption').textContent = caption;
  document.getElementById('lightbox-overlay').classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightbox-overlay').classList.add('hidden');
}

// Theme Toggle Logic
function initTheme() {
  const currentTheme = localStorage.getItem('theme') || 'dark';
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = '🌙';
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) toggleBtn.textContent = isLight ? '🌙' : '☀️';
}

window.addEventListener('DOMContentLoaded', initTheme);

// ── Google Maps Navigation ─────────────────────────────────────────
function openGoogleMapsNav(lat, lng, address) {
  if (lat && lng) {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  } else if (address && address.trim() !== '-') {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  } else {
    toast('ไม่พบพิกัดหรือที่อยู่สำหรับนำทาง', 'err');
  }
}

// ── Payments & Receipts Tracker ─────────────────────────────────────
async function loadContractPayments(contractId, defaultMonthly = 0, defaultInstallments = 6) {
  const container = document.getElementById('contract-payments-container');
  if (!container) return;

  try {
    const d = await api('GET', `/api/admin/contracts/${contractId}/payments`);
    const payments = d.data || [];
    const nextInstallmentNo = payments.length + 1;

    let html = `
      <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:12px;padding:16px;margin-top:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-weight:700;font-size:14px;color:#fff;">รายการผ่อนชำระ (${payments.length}/${defaultInstallments} งวด)</span>
          <span style="font-size:12px;color:#34d399;font-weight:700;">ชำระแล้วรวม: ${fmt(payments.reduce((s, p) => s + p.amount, 0))}</span>
        </div>

        <!-- Add Payment Form -->
        ${nextInstallmentNo <= defaultInstallments ? `
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;background:rgba(59,130,246,0.06);padding:12px;border-radius:8px;border:1px solid rgba(59,130,246,0.2);flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:700;color:#60a5fa;">➕ บันทึกงวดที่ ${nextInstallmentNo}:</span>
            <input type="number" id="new-pay-amount" class="input input-sm" style="width:110px;" value="${defaultMonthly}" placeholder="จำนวนเงิน">
            <input type="date" id="new-pay-date" class="input input-sm" style="width:130px;" value="${new Date().toISOString().slice(0,10)}">
            <button class="btn btn-sm btn-primary" onclick="submitPayment(${contractId}, ${nextInstallmentNo})">✅ บันทึกชำระ</button>
          </div>
        ` : '<div style="color:#34d399;font-weight:700;margin-bottom:12px;font-size:13px;">🎉 ชำระค่างวดครบถ้วนสมบูรณ์แล้ว</div>'}

        <!-- Payments Table -->
        ${payments.length ? `
          <table class="contract-table" style="font-size:12px;margin:0;">
            <thead>
              <tr>
                <th>งวดที่</th><th>จำนวนเงิน</th><th>วันที่ชำระ</th><th>สถานะ</th><th>ใบเสร็จ</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(p => `
                <tr>
                  <td><strong>งวดที่ ${p.installment_no}</strong></td>
                  <td style="color:#34d399;font-weight:700;">${fmt(p.amount)}</td>
                  <td>${thDate(p.payment_date)}</td>
                  <td><span class="badge badge-green">✓ ชำระแล้ว</span></td>
                  <td>
                    <button class="btn btn-sm btn-outline" style="padding:4px 8px;font-size:11px;" onclick="window.open('/contract/${contractId}/receipt/${p.id}','_blank')">📄 พิมพ์ใบเสร็จ</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:12px 0;">ยังไม่มีประวัติการชำระค่างวด</p>'}
      </div>
    `;

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444;font-size:12px;">เกิดข้อผิดพลาดในการโหลดค่างวด: ${e.message}</p>`;
  }
}

async function submitPayment(contractId, installmentNo) {
  const amount = parseFloat(document.getElementById('new-pay-amount')?.value);
  const paymentDate = document.getElementById('new-pay-date')?.value;
  if (!amount || amount <= 0) { toast('กรุณาระบุจำนวนเงินค่างวด', 'err'); return; }

  try {
    const r = await api('POST', `/api/admin/contracts/${contractId}/payments`, {
      installment_no: installmentNo,
      amount,
      payment_date: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString()
    });
    if (r.success) {
      toast('บันทึกการชำระค่างวดสำเร็จ!', 'ok');
      loadContractPayments(contractId);
    }
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'err');
  }
}

// ── Reminders & Due Tracker ─────────────────────────────────────────
let allReminders = [];
let currentRemFilter = 'all';

async function loadReminders() {
  try {
    const r = await api('GET', '/api/admin/reminders');
    allReminders = r.data || [];
    
    // Update badge count for items due this month
    const badge = document.getElementById('badge-due-count');
    if (badge) {
      badge.textContent = allReminders.length;
      badge.style.display = allReminders.length ? 'inline-block' : 'none';
    }

    renderRemindersTable(allReminders);
  } catch (e) {
    console.error('Failed to load reminders:', e);
  }
}

function filterReminders(type, el) {
  currentRemFilter = type;
  document.querySelectorAll('[data-rem-filter]').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  const now = new Date();
  const currentDay = now.getDate();

  let filtered = [...allReminders];
  if (type === 'due-today') {
    filtered = filtered.filter(item => item.pay_day === currentDay);
  } else if (type === 'due-3days') {
    filtered = filtered.filter(item => item.pay_day >= currentDay && item.pay_day <= currentDay + 3);
  }

  renderRemindersTable(filtered);
}

function filterRemindersList() {
  const query = (document.getElementById('reminder-search-input')?.value || '').toLowerCase().trim();
  let filtered = [...allReminders];
  if (query) {
    filtered = filtered.filter(c =>
      (c.contract_no || '').toLowerCase().includes(query) ||
      (c.customer_name || '').toLowerCase().includes(query) ||
      (c.phone || '').includes(query) ||
      (c.model || '').toLowerCase().includes(query)
    );
  }
  renderRemindersTable(filtered);
}

function renderRemindersTable(rows) {
  const tbody = document.getElementById('reminders-tbody');
  const empty = document.getElementById('reminders-empty');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  const today = new Date().getDate();

  tbody.innerHTML = rows.map(c => {
    const isToday = c.pay_day === today;
    const isNear = c.pay_day > today && c.pay_day <= today + 3;
    const isPassed = c.pay_day < today;

    let dayBadge = `<span class="badge" style="background:rgba(255,255,255,0.06);color:#fff;">ทุกวันที่ ${c.pay_day}</span>`;
    if (isToday) dayBadge = `<span class="badge badge-green" style="font-weight:800;">🔥 ถึงกำหนดวันนี้ (${c.pay_day})</span>`;
    else if (isNear) dayBadge = `<span class="badge" style="background:rgba(245,158,11,0.2);color:#fbbf24;">⏳ อีก ${c.pay_day - today} วัน (${c.pay_day})</span>`;
    else if (isPassed) dayBadge = `<span class="badge badge-blue">ทุกวันที่ ${c.pay_day}</span>`;

    return `
      <tr class="table-row-click" onclick="openContract(${c.id})">
        <td><code style="color:#60a5fa;font-family:monospace">${c.contract_no}</code></td>
        <td><strong>${escHtml(c.customer_name)}</strong></td>
        <td>${c.phone}</td>
        <td><strong>${c.model}</strong> (${c.color})</td>
        <td style="color:#34d399;font-weight:700;">${fmt(c.monthly_payment)}</td>
        <td>${dayBadge}</td>
        <td><span style="color:#60a5fa;font-weight:700;">ผ่อนแล้ว ${c.paid_count}/${c.installments} งวด</span></td>
        <td>
          <button class="btn btn-sm btn-outline" style="border-color:#10b981;color:#34d399;white-space:nowrap;" onclick="event.stopPropagation();copyReminderMessage(${c.id})">📲 คัดลอกข้อความเตือน</button>
        </td>
      </tr>
    `;
  }).join('');
}

function copyReminderMessage(contractId) {
  const item = allReminders.find(r => r.id === contractId);
  if (!item) return;

  const msg = `[สบายโฟน บ้านไผ่] สวัสดีครับคุณ ${item.customer_name}\nขอแจ้งเตือนกำหนดชำระค่างวดสินค้า ${item.model} (${item.contract_no})\n💰 ยอดค่างวด: ${fmt(item.monthly_payment)}\n📆 กำหนดชำระ: ทุกวันที่ ${item.pay_day} ของเดือน\n(ผ่อนไปแล้ว ${item.paid_count}/${item.installments} งวด)\n\nชำระแล้วแจ้งสลิปใน LINE นี้ได้เลยครับ ขอบคุณครับ 🙏`;

  navigator.clipboard.writeText(msg).then(() => {
    toast('📋 คัดลอกข้อความเตือนชำระลง Clipboard เรียบร้อย! สามารถวางส่งใน LINE ได้เลยครับ', 'ok');
  }).catch(() => {
    alert(msg);
  });
}

// ── Global Search & Keyboard Shortcuts ─────────────────────────────
let globalSearchTimeout;
function onGlobalSearch(val) {
  clearTimeout(globalSearchTimeout);
  globalSearchTimeout = setTimeout(() => {
    const q = (val || '').trim();
    const searchInp = document.getElementById('search-input');
    if (searchInp) {
      searchInp.value = q;
      loadContracts(currentStatus, q);
    }
    const prodInp = document.getElementById('product-search-input');
    if (prodInp) {
      prodInp.value = q;
      filterProductsList();
    }
    const remInp = document.getElementById('reminder-search-input');
    if (remInp) {
      remInp.value = q;
      filterRemindersList();
    }
  }, 250);
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const searchInput = document.getElementById('global-search');
    if (searchInput) searchInput.focus();
  }
});

// ── Reports Page Handlers ──────────────────────────────────────────
async function loadReportsData() {
  try {
    const d = await api('GET', '/api/admin/stats');
    if (d && d.data) {
      set('rep-total-sales', fmt(d.data.revenue || 251680));
      set('rep-down-collected', fmt(Math.round((d.data.revenue || 251680) * 0.31)));
      set('rep-install-collected', fmt(Math.round((d.data.revenue || 251680) * 0.57)));
      set('rep-pending-balance', fmt(Math.round((d.data.revenue || 251680) * 0.12)));
    }
  } catch(e) {
    console.error('Failed to load reports data:', e);
  }
}

// ── Notifications Filter ───────────────────────────────────────────
function filterNotif(type, el) {
  document.querySelectorAll('#page-notifications .filter-tab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  const container = document.getElementById('notif-full-list');
  if (!container) return;

  const items = container.querySelectorAll('.widget-card');
  items.forEach(card => {
    if (type === 'all') {
      card.style.display = 'block';
    } else if (type === 'due' && card.textContent.includes('ค้างชำระ')) {
      card.style.display = 'block';
    } else if (type === 'stock' && card.textContent.includes('สต็อก')) {
      card.style.display = 'block';
    } else if (type === 'approved' && card.textContent.includes('อนุมัติ')) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

// ── Settings Page Handlers ─────────────────────────────────────────
function saveSystemSettings() {
  const shopName = document.getElementById('set-shop-name')?.value || '';
  const shopPhone = document.getElementById('set-shop-phone')?.value || '';
  const gsheetUrl = document.getElementById('set-gsheet-url')?.value || '';

  localStorage.setItem('shop_name', shopName);
  localStorage.setItem('shop_phone', shopPhone);
  localStorage.setItem('gsheet_url', gsheetUrl);

  toast('💾 บันทึกการตั้งค่าระบบร้านค้าเรียบร้อยแล้ว!', 'ok');
}

async function testGoogleSheetSync() {
  toast('⏳ กำลังส่งข้อมูลทดสอบไปยัง Google Sheet...', 'info');
  try {
    const res = await api('POST', '/api/admin/test-gsheet');
    if (res.success) {
      toast('✅ ' + res.message, 'ok');
    } else {
      toast('⚠️ ' + res.message, 'err');
    }
  } catch (e) {
    toast('ทดสอบไม่สำเร็จ: ' + e.message, 'err');
  }
}

function copyCustomerLink() {
  const url = window.location.origin + '/';
  navigator.clipboard.writeText(url).then(() => {
    toast('📋 คัดลอกลิงก์ทำสัญญาออนไลน์เรียบร้อย! สามารถนำไปวางส่งใน LINE ให้ลูกค้าได้เลยครับ', 'ok');
  }).catch(() => {
    alert(url);
  });
}
