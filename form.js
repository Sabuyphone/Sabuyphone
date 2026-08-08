/* ═══════════════════════════════════════════════════════════════
   form.js — Customer 5-Step Form Logic
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── State ─────────────────────────────────────────────────────────
const S = {
  step: 1,
  customer: {},
  docs: {},
  product: null,
  otpDone: false,
};

let allProducts = [];
let sigCtx, sigDrawing = false;
let otpInterval;

// ── Init ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  initSigCanvas();
  initOTPBoxes();
  updateProgress();
});

// ── Product Loading ───────────────────────────────────────────────
async function loadProducts() {
  try {
    const r = await fetch('/api/products');
    const d = await r.json();
    allProducts = d.data || [];
    buildModelSelect();
  } catch (e) {
    console.error('Load products failed:', e);
    toast('ไม่สามารถโหลดข้อมูลสินค้าได้', 'err');
  }
}

function buildModelSelect() {
  const sel = document.getElementById('sel-model');
  const seen = new Set();
  allProducts.forEach(p => {
    const key = `${p.brand}||${p.model}`;
    if (!seen.has(key)) {
      seen.add(key);
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${p.model} (${p.brand})`;
      sel.appendChild(opt);
    }
  });
}

function onModelChange() {
  const key = document.getElementById('sel-model').value;
  S.product = null;

  // Reset downstream
  ['color-section','storage-section','price-summary'].forEach(id => show(id, false));
  document.getElementById('sum-pricing').classList.add('hidden');
  document.getElementById('sum-includes').classList.add('hidden');

  if (!key) {
    document.getElementById('sum-model').textContent = 'เลือกสินค้า';
    document.getElementById('sum-variant').textContent = 'กรุณาเลือกรุ่น สี และความจุ';
    return;
  }

  const [brand, model] = key.split('||');
  const variants = allProducts.filter(p => p.brand === brand && p.model === model);

  // Unique colors
  const colorMap = new Map();
  variants.forEach(v => colorMap.set(v.color, v.color_hex));

  const colorGrid = document.getElementById('color-options');
  colorGrid.innerHTML = [...colorMap.entries()].map(([color, hex]) => {
    // Detect if swatch needs a border (light colors)
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const lum = (r*299 + g*587 + b*114)/1000;
    const border = lum > 160 ? 'border:1px solid rgba(0,0,0,0.15);' : '';
    return `<div class="color-option" data-color="${color}" data-brand="${brand}" data-model="${encodeURIComponent(model)}" onclick="selectColor(this)">
      <div class="color-swatch" style="background:${hex};${border}"></div>
      <span class="color-name">${color}</span>
    </div>`;
  }).join('');

  show('color-section', true);

  // Update summary
  document.getElementById('sum-model').textContent = model;
  document.getElementById('sum-variant').textContent = `(${brand}) — เลือกสีและความจุ`;

  // Dynamic Image preview update
  const imgBox = document.getElementById('device-image-preview-box');
  const imgEl = document.getElementById('device-preview-img');
  const sumImg = document.getElementById('sum-device-img');
  const sumEmoji = document.querySelector('.device-placeholder-emoji');

  const productWithImg = allProducts.find(p => p.brand === brand && p.model === model && p.image_path);
  const src = productWithImg ? productWithImg.image_path : '';

  if (src) {
    if (imgEl && imgBox) {
      imgEl.src = src;
      imgBox.classList.remove('hidden');
    }
    if (sumImg && sumEmoji) {
      sumImg.src = src;
      sumImg.style.display = 'block';
      sumEmoji.style.display = 'none';
    }
  } else {
    if (imgBox) imgBox.classList.add('hidden');
    if (sumImg && sumEmoji) {
      sumImg.style.display = 'none';
      sumEmoji.style.display = 'block';
    }
  }
}

function selectColor(el) {
  document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  const color  = el.dataset.color;
  const brand  = el.dataset.brand;
  const model  = decodeURIComponent(el.dataset.model);
  const variants = allProducts.filter(p => p.brand === brand && p.model === model && p.color === color);

  // Storage options
  const storages = [...new Set(variants.map(v => v.storage))];
  const sg = document.getElementById('storage-options');
  sg.innerHTML = storages.map(s =>
    `<button class="storage-btn" data-brand="${brand}" data-model="${encodeURIComponent(model)}" data-color="${color}" data-storage="${s}" onclick="selectStorage(this)">${s}</button>`
  ).join('');

  show('storage-section', true);
  show('price-summary', false);
  S.product = null;
}

function selectStorage(el) {
  document.querySelectorAll('.storage-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');

  const brand   = el.dataset.brand;
  const model   = decodeURIComponent(el.dataset.model);
  const color   = el.dataset.color;
  const storage = el.dataset.storage;

  const p = allProducts.find(x => x.brand===brand && x.model===model && x.color===color && x.storage===storage);
  if (!p) return;
  S.product = p;

  // Initialize custom states
  S.customDown = p.down_payment;
  S.customInstallments = p.installments;

  // Initialize interactive slider
  const slider = document.getElementById('slide-down');
  const minDown = p.down_payment;
  const maxDown = Math.round((p.price * 0.8) / 500) * 500;
  
  slider.min = minDown;
  slider.max = maxDown;
  slider.step = 500;
  slider.value = minDown;
  
  document.getElementById('slide-down-min').textContent = fmt(minDown);
  document.getElementById('slide-down-max').textContent = fmt(maxDown);
  document.getElementById('slide-down-val').textContent = fmt(minDown);

  // Initialize installment chips selection
  document.querySelectorAll('#inst-chips .chip-btn').forEach(btn => {
    btn.classList.remove('active');
    if (Number(btn.dataset.months) === p.installments) {
      btn.classList.add('active');
    }
  });

  // Show calculator and recalculate
  show('calculator-section', true);
  recalculatePayments();

  // Update right panel
  set('sum-price',   fmt(p.price));
  set('sum-variant', `${color} / ${storage}`);
  document.getElementById('sum-include-model') && (document.getElementById('sum-include-model').textContent = `${model}`);
  document.getElementById('sum-pricing').classList.remove('hidden');
  document.getElementById('sum-includes').classList.remove('hidden');
}

// ── Step Navigation ───────────────────────────────────────────────
function nextStep() {
  if (!validate(S.step)) return;
  if (S.step >= 5) return;
  goTo(S.step + 1);
}

function prevStep() {
  if (S.step > 1) goTo(S.step - 1);
}

function goTo(n) {
  document.getElementById(`step-${S.step}`).classList.remove('active');
  document.querySelector(`.step-node[data-step="${S.step}"]`).classList.remove('active');

  // Mark done
  const prev = document.querySelector(`.step-node[data-step="${S.step}"]`);
  if (n > S.step) {
    prev.classList.add('done');
    prev.querySelector('.step-num').textContent = '✓';
  } else {
    prev.classList.remove('done');
    prev.querySelector('.step-num').textContent = S.step;
  }

  S.step = n;
  document.getElementById(`step-${n}`).classList.add('active');
  document.querySelector(`.step-node[data-step="${n}"]`).classList.add('active');
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Step 5 init
  if (n === 5) {
    set('otp-phone', document.getElementById('f-phone').value);
    // Show selfie preview
    if (S.docs.selfie) {
      const box = document.getElementById('selfie-box');
      box.innerHTML = `<img src="${S.docs.selfie}" alt="selfie" style="width:100%;height:100%;object-fit:cover;border-radius:9px;">`;
    }
    // Delay slightly to ensure DOM has rendered Step 5
    setTimeout(resizeSigCanvas, 50);
  }
}

function updateProgress() {
  const total = 5;
  const pct   = ((S.step - 1) / (total - 1)) * 100;
  document.getElementById('progress-track').style.width = `${pct}%`;
}

// ── Validation ────────────────────────────────────────────────────
function validate(step) {
  switch (step) {
    case 1: {
      const name  = val('f-name');
      const id    = val('f-idcard').replace(/-/g,'');
      const phone = val('f-phone');
      const addr  = val('f-addr');
      if (!S.docs.id_card_front) { toast('กรุณาอัปโหลดรูปบัตรประชาชนก่อน','err'); return false; }
      if (!name)             { toast('กรุณากรอกชื่อ-นามสกุล','err'); return false; }
      if (id.length < 13)    { toast('กรุณากรอกเลขบัตรประชาชน 13 หลัก','err'); return false; }
      if (phone.length < 9)  { toast('กรุณากรอกเบอร์โทรให้ถูกต้อง','err'); return false; }
      if (!addr)             { toast('กรุณากรอกที่อยู่','err'); return false; }
      S.customer = {
        name, id_card: id, phone,
        birthdate:  val('f-birth'),
        address:    addr,
        subdistrict:val('f-sub'),
        district:   val('f-dist'),
        province:   val('f-prov'),
        postal_code:val('f-post'),
        facebook:   val('f-fb'),
        line_id:    val('f-line'),
      };
      return true;
    }
    case 2:
      if (!S.docs.selfie)        { toast('กรุณาอัปโหลดรูปเซลฟี่คู่บัตร','err'); return false; }
      if (!S.docs.house_front)   { toast('กรุณาอัปโหลดรูปหน้าบ้าน','err'); return false; }
      return true;
    case 3:
      if (!S.product) { toast('กรุณาเลือกสินค้าให้ครบ (รุ่น สี ความจุ)','err'); return false; }
      return true;
    case 4:
      if (!document.getElementById('chk-terms').checked) {
        toast('กรุณายืนยันการยอมรับเงื่อนไขสัญญา','err'); return false;
      }
      return true;
    case 5:
      if (!S.otpDone)      { toast('กรุณายืนยัน OTP ก่อน','err'); return false; }
      if (isSigEmpty())    { toast('กรุณาเซ็นลายมือในกรอบ','err'); return false; }
      return true;
  }
  return true;
}

// ── File Upload ───────────────────────────────────────────────────
function triggerUpload(inputId) {
  document.getElementById(inputId)?.click();
}

async function handleUpload(input, docType, zoneId) {
  const file = input.files[0];
  if (!file) return;

  const zone = document.getElementById(zoneId);
  zone.classList.add('uploading');

  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/upload', { method:'POST', body: fd });
    const d = await r.json();
    if (!d.success) throw new Error(d.message);

    S.docs[docType] = d.filePath;

    // Preview via FileReader (faster than hitting /uploads)
    const reader = new FileReader();
    reader.onload = (e) => {
      zone.innerHTML = `
        <div class="upload-preview">
          <img src="${e.target.result}" alt="preview" class="preview-img">
          <div class="upload-ok-badge">✓ อัปโหลดแล้ว</div>
        </div>
        <input id="${input.id}" type="file" accept="image/*" class="upload-input"
               onchange="handleUpload(this,'${docType}','${zoneId}')">`;
      zone.classList.add('uploaded');
      zone.classList.remove('uploading');
      
      if (docType === 'id_card_front') {
        runMockOCR(e.target.result);
      }
    };
    reader.readAsDataURL(file);
    toast('อัปโหลดสำเร็จ','ok');
  } catch (e) {
    toast('อัปโหลดไม่สำเร็จ: ' + e.message,'err');
    zone.classList.remove('uploading');
  }
}

// ── Signature Canvas ──────────────────────────────────────────────
function resizeSigCanvas() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas) return;
  const w = canvas.parentElement.offsetWidth;
  canvas.width  = w;
  canvas.height = 160;

  // Re-configure context after resize since resizing canvas clears it and resets attributes
  sigCtx = canvas.getContext('2d');
  sigCtx.strokeStyle = '#1e3a8a'; // Dark blue for professional ink look
  sigCtx.lineWidth   = 3;
  sigCtx.lineCap     = 'round';
  sigCtx.lineJoin    = 'round';
}

function initSigCanvas() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas) return;

  // Fit initially (will be 0 if hidden, but we resize in goTo(5) anyway)
  resizeSigCanvas();
  window.addEventListener('resize', resizeSigCanvas);

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const cl = e.touches ? e.touches[0] : e;
    // Calculate precise touch coordinates relative to canvas bounding box and scale
    const x = (cl.clientX - r.left) * (canvas.width / r.width);
    const y = (cl.clientY - r.top) * (canvas.height / r.height);
    return { x, y };
  };

  canvas.addEventListener('mousedown',  (e) => { sigDrawing = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove',  (e) => { if (!sigDrawing) return; const p = pos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });
  canvas.addEventListener('mouseup',    () => sigDrawing = false);
  canvas.addEventListener('mouseleave', () => sigDrawing = false);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); sigDrawing = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }, {passive:false});
  canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); if (!sigDrawing) return; const p = pos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }, {passive:false});
  canvas.addEventListener('touchend',   () => sigDrawing = false);
}

function clearSig() {
  const c = document.getElementById('sig-canvas');
  sigCtx.clearRect(0, 0, c.width, c.height);
}

function isSigEmpty() {
  const c = document.getElementById('sig-canvas');
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  return !data.some(v => v !== 0);
}

// ── OTP ───────────────────────────────────────────────────────────
async function sendOTP() {
  const phone = val('f-phone');
  if (!phone) { toast('ไม่พบเบอร์โทรศัพท์','err'); return; }

  const btn = document.getElementById('btn-send-otp');
  btn.disabled = true;
  btn.textContent = '⏳ กำลังส่ง...';

  try {
    const r = await fetch('/api/otp/send', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone }),
    });
    const d = await r.json();

    if (!d.success) throw new Error(d.message);

    toast('ส่ง OTP เรียบร้อย! ตรวจสอบ SMS', 'ok');
    document.getElementById('otp-boxes').style.display = 'flex';
    document.querySelectorAll('.otp-box')[0].focus();
    startOTPTimer();
    btn.textContent = '🔄 ส่ง OTP ใหม่';

    // DEV MODE
    if (d.dev_otp) {
      document.getElementById('otp-msg').innerHTML =
        `<span class="otp-info" style="color:#f59e0b;">🔧 DEV — OTP: <strong style="font-size:18px;">${d.dev_otp}</strong></span>`;
    }
  } catch (e) {
    toast('ส่ง OTP ไม่สำเร็จ: ' + e.message,'err');
    btn.disabled = false;
    btn.textContent = '📤 ส่ง OTP';
  }
}

function startOTPTimer() {
  let secs = 300;
  const el = document.getElementById('otp-timer');
  clearInterval(otpInterval);
  otpInterval = setInterval(() => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    el.textContent = `⏱ ${m}:${String(s).padStart(2,'0')}`;
    if (secs-- <= 0) {
      clearInterval(otpInterval);
      el.textContent = 'หมดเวลา';
      document.getElementById('btn-send-otp').disabled = false;
    }
  }, 1000);
}

function initOTPBoxes() {
  const boxes = document.querySelectorAll('.otp-box');
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g,'').slice(0,1);
      if (box.value && i < boxes.length - 1) boxes[i+1].focus();
      const otp = [...boxes].map(b => b.value).join('');
      if (otp.length === 6) verifyOTP(otp);
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i-1].focus();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const txt = e.clipboardData.getData('text').replace(/\D/g,'');
      [...txt.slice(0,6)].forEach((ch, j) => { if (boxes[j]) boxes[j].value = ch; });
      const otp = [...boxes].map(b => b.value).join('');
      if (otp.length === 6) verifyOTP(otp);
    });
  });
}

async function verifyOTP(otp) {
  const phone = val('f-phone');
  const msgEl = document.getElementById('otp-msg');
  msgEl.textContent = '⏳ กำลังตรวจสอบ...';
  try {
    const r = await fetch('/api/otp/verify', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone, otp }),
    });
    const d = await r.json();
    if (d.success) {
      S.otpDone = true;
      msgEl.innerHTML = '<span class="otp-ok">✅ ยืนยัน OTP สำเร็จ!</span>';
      document.getElementById('btn-submit').disabled = false;
      clearInterval(otpInterval);
      document.getElementById('otp-timer').textContent = '';
    } else {
      msgEl.innerHTML = `<span class="otp-err">❌ ${d.message}</span>`;
      document.querySelectorAll('.otp-box').forEach(b => b.value = '');
      document.querySelectorAll('.otp-box')[0].focus();
    }
  } catch (e) {
    msgEl.innerHTML = '<span class="otp-err">❌ เกิดข้อผิดพลาด</span>';
  }
}

// ── Submit Contract ───────────────────────────────────────────────
async function submitContract() {
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = '⏳ กำลังส่ง...';

  let lat = null;
  let lng = null;

  try {
    if (navigator.geolocation) {
      btn.textContent = '📍 ยืนยันพิกัด GPS...';
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
        });
        lat = String(pos.coords.latitude);
        lng = String(pos.coords.longitude);
      } catch (geoErr) {
        console.warn('Geolocation failed or timed out:', geoErr);
      }
    }
  } catch (err) {
    console.warn(err);
  }

  btn.textContent = '⏳ กำลังส่ง...';

  try {
    const sig = document.getElementById('sig-canvas').toDataURL('image/png');
    const remaining = S.product.price - S.customDown;
    const monthly = Math.round((remaining / S.customInstallments) / 10) * 10;
    const payload = {
      customer:   S.customer,
      product_id: S.product.id,
      documents:  S.docs,
      signature:  sig,
      custom_down_payment: S.customDown,
      custom_monthly_payment: monthly,
      custom_installments: S.customInstallments,
      latitude: lat,
      longitude: lng
    };

    const r = await fetch('/api/contracts', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    });
    const d = await r.json();

    if (!d.success) throw new Error(d.message);

    // Show success
    document.getElementById(`step-${S.step}`).classList.remove('active');
    document.getElementById('step-success').classList.add('active');
    set('res-contract-no', d.contractNo);
    window.scrollTo({ top: 0, behavior:'smooth' });

  } catch (e) {
    toast('ส่งสัญญาไม่สำเร็จ: ' + e.message,'err');
    btn.disabled = false;
    btn.textContent = '✅ ยืนยันและส่งสัญญา';
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function val(id)     { return (document.getElementById(id)?.value || '').trim(); }
function set(id, v)  { const el = document.getElementById(id); if (el) el.textContent = v; }
function show(id, v) {
  const el = document.getElementById(id);
  if (el) {
    if (v) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }
}
function fmt(n)      { return Number(n).toLocaleString('th-TH') + ' บาท'; }

function toast(msg, type='info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  const cls = type === 'err' ? 'toast-err' : type === 'ok' ? 'toast-ok' : 'toast-info';
  t.className = `toast ${cls}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 3500);
}

// ── NEW CUSTOM FEATURES ───────────────────────────────────────────

let localStream = null;
let currentCameraMode = 'environment';
let cameraTargetInputId = '';
let cameraTargetDocType = '';
let cameraTargetZoneId = '';

function openCamera(mode, inputId, docType, zoneId, event) {
  if (event) {
    event.stopPropagation();
  }
  cameraTargetInputId = inputId;
  cameraTargetDocType = docType;
  cameraTargetZoneId = zoneId;
  currentCameraMode = mode === 'selfie' ? 'user' : 'environment';

  const modal = document.getElementById('camera-modal');
  const video = document.getElementById('camera-video');
  const guide = document.getElementById('camera-guide');
  const guideText = document.getElementById('camera-guide-text');

  guide.className = `camera-overlay-guide ${mode}`;
  guideText.textContent = mode === 'selfie' ? 'จัดวางใบหน้าให้อยู่ในวงกลม' : 'จัดวางบัตรให้อยู่ในกรอบ';

  modal.style.display = 'flex';

  navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: currentCameraMode, width: { ideal: 1280 }, height: { ideal: 720 } } 
  }).then(stream => {
    localStream = stream;
    video.srcObject = stream;
  }).catch(err => {
    console.error('Camera access failed:', err);
    toast('ไม่สามารถเข้าถึงกล้องได้: ' + err.message, 'err');
    closeCamera();
  });
}

function closeCamera() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  document.getElementById('camera-modal').style.display = 'none';
  const video = document.getElementById('camera-video');
  video.srcObject = null;
}

function switchCamera() {
  closeCamera();
  currentCameraMode = currentCameraMode === 'user' ? 'environment' : 'user';
  openCamera(cameraTargetDocType === 'selfie' ? 'selfie' : 'document', cameraTargetInputId, cameraTargetDocType, cameraTargetZoneId);
}

function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  const ctx = canvas.getContext('2d');
  if (currentCameraMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  canvas.toBlob(blob => {
    const file = new File([blob], `${cameraTargetDocType}_capture.jpg`, { type: 'image/jpeg' });
    closeCamera();
    handleDirectUpload(file, cameraTargetDocType, cameraTargetZoneId);
  }, 'image/jpeg', 0.85);
}

async function handleDirectUpload(file, docType, zoneId) {
  const zone = document.getElementById(zoneId);
  zone.className = 'upload-zone uploading';

  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/upload', { method:'POST', body: fd });
    const d = await r.json();
    if (!d.success) throw new Error(d.message);

    S.docs[docType] = d.filePath;

    const reader = new FileReader();
    reader.onload = (e) => {
      zone.innerHTML = `
        <div class="upload-preview">
          <img src="${e.target.result}" alt="preview" class="preview-img">
          <div class="upload-ok-badge">✓ อัปโหลดแล้ว</div>
        </div>
        <input id="inp-${docType}" type="file" accept="image/*" class="upload-input"
               onchange="handleUpload(this,'${docType}','${zoneId}')">`;
      zone.className = 'upload-zone uploaded';
      
      if (docType === 'id_card_front') {
        runMockOCR(e.target.result);
      }
    };
    reader.readAsDataURL(file);
    toast('อัปโหลดสำเร็จ','ok');
  } catch (e) {
    toast('อัปโหลดไม่สำเร็จ: ' + e.message,'err');
    zone.className = 'upload-zone';
  }
}

async function runMockOCR(imageDataURL) {
  toast('🤖 ระบบกำลังสแกนอ่านข้อมูลจากบัตรด้วย AI...', 'info');

  // Attempt real AI OCR scan
  try {
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imageDataURL })
    });
    const data = await res.json();

    if (data.success && data.data) {
      const info = data.data;
      if (info.name) setVal('f-name', info.name);
      if (info.id_card) setVal('f-idcard', info.id_card);
      if (info.birthdate) setVal('f-birth', info.birthdate);
      if (info.address) setVal('f-addr', info.address);
      if (info.subdistrict) setVal('f-sub', info.subdistrict);
      if (info.district) setVal('f-dist', info.district);
      if (info.province) setVal('f-prov', info.province);
      if (info.postal_code) setVal('f-post', info.postal_code);

      setupIDCardAutoFormat();
      toast('✨ สแกนบัตรสำเร็จ! ดึงข้อมูลกรอกให้อัตโนมัติเรียบร้อย', 'ok');
      return;
    }
  } catch (err) {
    console.log('AI OCR fallback to photo assist:', err);
  }

  // Fallback to Photo Assist Panel
  const existingPanel = document.getElementById('id-photo-assist');
  if (existingPanel) existingPanel.remove();

  const panel = document.createElement('div');
  panel.id = 'id-photo-assist';
  panel.style.cssText = `
    background: var(--card, #111827);
    border: 1px solid rgba(99,179,237,0.3);
    border-radius: 16px;
    padding: 16px;
    margin-bottom: 20px;
    box-shadow: 0 4px 24px rgba(99,179,237,0.15);
    animation: fadeIn 0.4s ease;
  `;
  panel.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
      <span style="font-size:20px;">🪪</span>
      <div>
        <div style="font-weight:700; font-size:14px; color:var(--text,#fff);">รูปบัตรประชาชน — กรอกข้อมูลตามรูปด้านล่างได้เลยครับ</div>
        <div style="font-size:12px; color:var(--text-muted,#9ca3af);">กดรูปเพื่อขยาย / กดปุ่ม × เพื่อปิด</div>
      </div>
      <button onclick="document.getElementById('id-photo-assist').remove()" 
        style="margin-left:auto; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); 
               color:#ef4444; border-radius:8px; padding:4px 10px; cursor:pointer; font-size:13px;">× ปิด</button>
    </div>
    <img src="${imageDataURL}" alt="ID Card" 
      onclick="this.style.maxHeight = this.style.maxHeight === 'none' ? '180px' : 'none'"
      style="width:100%; max-height:180px; object-fit:contain; border-radius:10px; 
             cursor:zoom-in; background:#000; transition: max-height 0.3s ease;">
  `;

  const formGrid = document.querySelector('#step-1 .form-grid');
  if (formGrid) formGrid.parentNode.insertBefore(panel, formGrid);

  setupIDCardAutoFormat();
  toast('📋 กรอกข้อมูลตามรูปบัตรด้านบนได้เลยครับ — ระบบช่วย format เลขบัตรให้อัตโนมัติ', 'info');
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el && value) {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }
}

// ── Auto-format Thai ID card number while typing ────────────────────
function setupIDCardAutoFormat() {
  const idInput = document.getElementById('f-idcard');
  if (!idInput || idInput.dataset.formatted) return;
  idInput.dataset.formatted = '1';

  idInput.addEventListener('input', function() {
    let digits = this.value.replace(/\D/g, '').slice(0, 13);
    if (digits.length === 0) { this.value = ''; return; }

    // Format: X-XXXX-XXXXX-XX-X
    let formatted = digits[0] || '';
    if (digits.length > 1)  formatted += '-' + digits.slice(1, 5);
    if (digits.length > 5)  formatted += '-' + digits.slice(5, 10);
    if (digits.length > 10) formatted += '-' + digits.slice(10, 12);
    if (digits.length > 12) formatted += '-' + digits.slice(12, 13);

    this.value = formatted;
  });

  idInput.addEventListener('keydown', function(e) {
    // Allow backspace to work naturally through the dashes
    if (e.key === 'Backspace' && this.value.endsWith('-')) {
      e.preventDefault();
      this.value = this.value.slice(0, -2);
    }
  });
}



function onCalculatorChange() {
  const val = Number(document.getElementById('slide-down').value);
  document.getElementById('slide-down-val').textContent = fmt(val);
  S.customDown = val;
  recalculatePayments();
}

function selectInstallmentChip(months) {
  document.querySelectorAll('#inst-chips .chip-btn').forEach(btn => {
    btn.classList.remove('active');
    if (Number(btn.dataset.months) === months) {
      btn.classList.add('active');
    }
  });
  S.customInstallments = months;
  recalculatePayments();
}

function recalculatePayments() {
  if (!S.product) return;
  const price = S.product.price;
  const remaining = price - S.customDown;
  const monthly = Math.round((remaining / S.customInstallments) / 10) * 10;
  const total = S.customDown + monthly * S.customInstallments;

  const todayDay = new Date().getDate();
  set('ps-price',   fmt(price));
  set('ps-down',    fmt(S.customDown));
  set('ps-monthly', fmt(monthly));
  set('ps-months',  `${S.customInstallments} งวด`);
  set('ps-day',     `ทุกวันที่ ${todayDay} ของเดือน`);
  set('ps-total',   fmt(total));

  set('sum-down',    fmt(S.customDown));
  set('sum-monthly', fmt(monthly));
  set('sum-months',  `${S.customInstallments} งวด`);
  set('sum-day',     `ทุกวันที่ ${todayDay}`);
  show('price-summary', true);
}

function openTrackModal() {
  document.getElementById('track-modal').style.display = 'flex';
  document.getElementById('track-phone-input').value = '';
  document.getElementById('track-results-container').innerHTML = 
    `<p style="color:#64748b;text-align:center;margin-top:40px;">ป้อนเบอร์โทรศัพท์เพื่อค้นหาประวัติการทำสัญญาของคุณ</p>`;
}

function closeTrackModal() {
  document.getElementById('track-modal').style.display = 'none';
}

async function searchContracts() {
  const phone = document.getElementById('track-phone-input').value.trim();
  if (!phone) {
    toast('กรุณาป้อนเบอร์โทรศัพท์', 'err');
    return;
  }
  
  const container = document.getElementById('track-results-container');
  container.innerHTML = '<p style="color:#64748b;text-align:center;margin-top:40px;">⏳ กำลังค้นหาข้อมูล...</p>';
  
  try {
    const r = await fetch(`/api/contracts/track?phone=${encodeURIComponent(phone)}`);
    const d = await r.json();
    if (!d.success) throw new Error(d.message);
    
    const list = d.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color:#ef4444;text-align:center;margin-top:40px;">❌ ไม่พบสัญญาที่ลงทะเบียนกับเบอร์โทรศัพท์นี้</p>`;
      return;
    }
    
    container.innerHTML = list.map(c => {
      const active1 = 'active';
      const active2 = c.status === 'pending' ? 'active' : c.status === 'approved' || c.status === 'rejected' ? 'done' : '';
      const active3 = c.status === 'approved' ? 'done' : c.status === 'rejected' ? 'active' : '';
      const active4 = c.status === 'approved' ? 'active' : '';
      
      const statusText = c.status === 'pending' ? '⏳ รอพิจารณา' 
                       : c.status === 'approved' ? '✅ อนุมัติแล้ว' 
                       : c.status === 'rejected' ? '❌ ปฏิเสธสัญญา' : c.status;
                       
      let actionHtml = '';
      if (c.status === 'approved') {
        const payload = generatePromptPayPayload('0801465222', c.down_payment);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payload)}`;
        
        actionHtml = `
          <div class="promptpay-box">
            <span style="font-size: 13px; font-weight: 700; color: #0056ff">💳 สแกนชำระเงินดาวน์เพื่อรับเครื่อง</span>
            <img class="promptpay-logo" src="https://upload.wikimedia.org/wikipedia/commons/c/c5/PromptPay-logo.png" alt="PromptPay" style="height:24px;margin-top:6px;">
            <img class="qr-code-img" src="${qrUrl}" alt="PromptPay QR Code">
            <span class="qr-amt-label">ยอดชำระเงินดาวน์</span>
            <span class="qr-amt">${fmt(c.down_payment)}</span>
            <span style="font-size:10px;color:#ef4444;margin-top:6px;text-align:center;">* โอนเงินดาวน์เข้าพร้อมเพย์ทางร้านโดยตรง (080-146-5222)</span>
          </div>
          
          ${c.payment_slip ? `
            <div style="margin-top: 12px; padding: 10px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.4); border-radius: 10px; text-align: center; color: #6ee7b7; font-size:12px;">
              📁 ส่งสลิปหลักฐานการชำระเงินแล้ว
            </div>
            <div style="text-align:center;margin-top:8px">
              <a href="${c.payment_slip}" target="_blank" style="color:#60a5fa;font-size:11px;text-decoration:underline;">คลิกเพื่อดูสลิป</a>
            </div>
          ` : `
            <div class="slip-upload-box" id="slip-box-${c.id}" onclick="triggerSlipUpload(${c.id})">
              <span style="color:#60a5fa; font-weight:600; font-size:12px">📤 อัปโหลดหลักฐานการโอนเงิน (สลิป)</span>
              <p style="font-size: 10px; color: #94a3b8; margin: 4px 0 0 0">คลิกที่นี่เพื่อแนบไฟล์ภาพสลิปที่ชำระสำเร็จ</p>
              <input type="file" id="slip-file-${c.id}" accept="image/*" style="display:none" onchange="handleSlipUpload(this, ${c.id})">
            </div>
            <div class="slip-preview-container" id="slip-preview-box-${c.id}">
              <img id="slip-preview-${c.id}" class="slip-preview-img" src="">
            </div>
          `}
        `;
      }
      
      const formattedDate = new Date(c.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });

      return `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 16px; border-radius: 16px; margin-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
            <span style="font-size:13px; font-weight:700; color:#fff">${c.contract_no}</span>
            <span style="font-size:11px; color:#64748b">${formattedDate}</span>
          </div>
          <p style="font-size:13px; color:#e2e8f0; margin-bottom:4px">${c.model} (${c.color} / ${c.storage})</p>
          <div style="display:flex; justify-content:space-between; font-size:11px; color:#94a3b8; margin-bottom:12px">
            <span>ราคาสินค้า: ${fmt(c.price)}</span>
            <span>ค่างวด: ${fmt(c.monthly_payment)} x ${c.installments} เดือน</span>
          </div>
          
          <div class="timeline">
            <div class="timeline-item done">
              <div class="timeline-dot"></div>
              <div class="timeline-title">✓ ส่งเอกสารแล้ว</div>
            </div>
            <div class="timeline-item ${active2}">
              <div class="timeline-dot"></div>
              <div class="timeline-title">รอตรวจสอบข้อมูล</div>
              <div class="timeline-desc">ร้านกำลังตรวจสอบและคัดกรองข้อมูลผู้ซื้อ</div>
            </div>
            <div class="timeline-item ${active3}">
              <div class="timeline-dot"></div>
              <div class="timeline-title">ผลการพิจารณาสัญญา</div>
              <div class="timeline-desc">${statusText} ${c.admin_note ? `(${c.admin_note})` : ''}</div>
            </div>
            <div class="timeline-item ${active4}">
              <div class="timeline-dot"></div>
              <div class="timeline-title">รอรับเครื่อง / จัดส่ง</div>
              <div class="timeline-desc">ร้านจะนัดรับเครื่องหรือจัดส่งตามขั้นตอน</div>
            </div>
          </div>
          
          ${actionHtml}
        </div>
      `;
    }).join('');
    
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p style="color:#ef4444;text-align:center;margin-top:40px;">❌ เกิดข้อผิดพลาดในการโหลดข้อมูล: ${e.message}</p>`;
  }
}

function triggerSlipUpload(contractId) {
  document.getElementById(`slip-file-${contractId}`).click();
}

async function handleSlipUpload(input, contractId) {
  const file = input.files[0];
  if (!file) return;

  const previewImg = document.getElementById(`slip-preview-${contractId}`);
  const previewBox = document.getElementById(`slip-preview-box-${contractId}`);
  const uploadBox = document.getElementById(`slip-box-${contractId}`);

  try {
    const fd = new FormData();
    fd.append('file', file);
    
    uploadBox.innerHTML = '<span style="color:#94a3b8">⏳ กำลังอัปโหลดสลิป...</span>';

    const r = await fetch(`/api/contracts/${contractId}/slip`, {
      method: 'POST',
      body: fd
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.message);

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewBox.style.display = 'block';
      uploadBox.innerHTML = '<span style="color:#10b981; font-weight:600;">✅ อัปโหลดสลิปสำเร็จ!</span>';
      toast('ส่งหลักฐานสลิปเรียบร้อยแล้ว', 'ok');
    };
    reader.readAsDataURL(file);

  } catch(e) {
    console.error(e);
    uploadBox.innerHTML = '<span style="color:#ef4444">❌ อัปโหลดผิดพลาด คลิกซ้ำเพื่อลองใหม่</span>';
    toast('ไม่สามารถอัปโหลดสลิปได้: ' + e.message, 'err');
  }
}

function generatePromptPayPayload(targetPhone, amount) {
  let formattedPhone = targetPhone.replace(/[-\s]/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '0066' + formattedPhone.slice(1);
  }
  
  let target = formattedPhone;
  let aid = 'A000000677010111';
  let aidField = '0016' + aid;
  let phoneField = '0113' + target;
  let merchantInfo = '29' + String(aidField.length + phoneField.length).padStart(2, '0') + aidField + phoneField;
  
  let amountStr = Number(amount).toFixed(2);
  let amountField = '54' + String(amountStr.length).padStart(2, '0') + amountStr;
  
  let payload = '000201' + 
                '010212' + 
                merchantInfo +
                '5303764' + 
                amountField +
                '5802TH' + 
                '6304';
                
  let crc = crc16(payload);
  return payload + crc.toString(16).toUpperCase().padStart(4, '0');
}

function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ (x)) & 0xFFFF;
  }
  return crc;
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
