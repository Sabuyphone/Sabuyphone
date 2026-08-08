require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = require('./database');
const firebase = require('./firebase');
const googleSheets = require('./google_sheets');

// ─── Gemini AI (OCR via REST + axios) ────────────────────────────────────────
const axios = require('axios');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (GEMINI_API_KEY) {
  console.log('✅ Gemini API Key loaded (OCR ready)');
} else {
  console.warn('⚠️  GEMINI_API_KEY not set — ID card OCR disabled');
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Twilio ────────────────────────────────────────────────────────────────
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio initialized');
  } catch (e) {
    console.warn('⚠️  Twilio init failed:', e.message);
  }
} else {
  console.warn('⚠️  Twilio not configured — running in DEV mode (OTP shown in response)');
}

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Failsafe page routes
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const rootIdx   = path.join(__dirname, 'index.html');
  const publicIdx = path.join(__dirname, 'public', 'index.html');
  const sabuyIdx  = path.join(__dirname, 'Sabuyphone');
  if (fs.existsSync(rootIdx))   return res.sendFile(rootIdx);
  if (fs.existsSync(publicIdx)) return res.sendFile(publicIdx);
  if (fs.existsSync(sabuyIdx))  return res.sendFile(sabuyIdx);
  res.send('Sabuyphone Online Contract System Ready');
});

app.get('/admin', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const publicAdm = path.join(__dirname, 'public', 'admin.html');
  const rootAdm   = path.join(__dirname, 'admin.html');
  if (fs.existsSync(publicAdm)) return res.sendFile(publicAdm);
  if (fs.existsSync(rootAdm))   return res.sendFile(rootAdm);
  res.send('Sabuyphone Admin Dashboard Ready');
});

// ─── Multer ───────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Admin Auth Middleware ────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || !db.validateAdminToken(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════



// GET /api/products
app.get('/api/products', (req, res) => {
  try {
    res.json({ success: true, data: db.getAllProducts() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/products/:id
app.get('/api/products/:id', (req, res) => {
  const p = db.getProductById(req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
  res.json({ success: true, data: p });
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'ไม่พบไฟล์' });
  res.json({ success: true, filePath: `/uploads/${req.file.filename}` });
});

// POST /api/ocr — Gemini Vision OCR via REST API (axios)
app.post('/api/ocr', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ success: false, message: 'ยังไม่ได้ตั้งค่า Gemini API Key' });
    }

    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'ไม่พบรูปภาพ' });
    }

    const prompt = `คุณเป็นระบบ OCR ที่อ่านข้อมูลจากบัตรประชาชนไทย
กรุณาอ่านข้อมูลจากรูปภาพบัตรประชาชนนี้และส่งกลับข้อมูลในรูปแบบ JSON เท่านั้น ห้ามตอบเป็นข้อความอื่นนอกจาก JSON

โครงสร้าง JSON ที่ต้องการ:
{"name":"ชื่อ-นามสกุลเต็ม รวมคำนำหน้า","idCard":"เลขบัตร 13 หลัก รูปแบบ X-XXXX-XXXXX-XX-X","birthdate":"YYYY-MM-DD ปีค.ศ.","address":"บ้านเลขที่ หมู่ ซอย ถนน","subdistrict":"ตำบล/แขวง","district":"อำเภอ/เขต","province":"จังหวัด","postalCode":"รหัสไปรษณีย์"}

ถ้าอ่านค่าใดไม่ได้ให้ใส่ค่าว่าง ตอบกลับเป็น JSON เท่านั้น ห้ามมี markdown หรือ backtick`;

    // Try gemini-2.0-flash first, fallback to 1.5-flash
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];
    let lastError = null;

    for (const modelName of models) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
        
        const payload = {
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
        };

        console.log(`[OCR] Trying model: ${modelName}`);
        const response = await axios.post(apiUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        console.log(`[OCR] Raw response from ${modelName}:`, text.slice(0, 200));

        const jsonText = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(jsonText);

        return res.json({ success: true, data: parsed, model: modelName });

      } catch (modelErr) {
        lastError = modelErr;
        const status = modelErr.response?.status;
        const errMsg = modelErr.response?.data?.error?.message || modelErr.message;
        console.error(`[OCR] Model ${modelName} failed (${status}):`, errMsg);
        
        // Don't retry on auth errors
        if (status === 400 || status === 403) break;
      }
    }

    // All models failed
    const errDetail = lastError?.response?.data?.error?.message || lastError?.message || 'unknown';
    console.error('[OCR] All models failed. Last error:', errDetail);
    return res.status(500).json({ success: false, message: `OCR ล้มเหลว: ${errDetail}` });

  } catch (err) {
    console.error('[OCR] Unexpected error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/otp/send
app.post('/api/otp/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' });

  const otp       = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.createOTP(phone, otp, expiresAt);

  if (twilioClient) {
    try {
      const intlPhone = phone.startsWith('0') ? '+66' + phone.slice(1) : phone;
      await twilioClient.messages.create({
        body: `[สบายโฟน บ้านไผ่] รหัส OTP ของคุณ: ${otp} (หมดอายุใน 5 นาที)`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: intlPhone,
      });
      return res.json({ success: true, message: 'ส่ง OTP แล้ว ตรวจสอบ SMS ของคุณ' });
    } catch (e) {
      console.error('Twilio error:', e.message);
      return res.status(500).json({ success: false, message: 'ส่ง SMS ไม่สำเร็จ: ' + e.message });
    }
  }

  // DEV MODE — return OTP in response
  console.log(`📱 DEV OTP for ${phone}: ${otp}`);
  res.json({ success: true, message: 'ส่ง OTP (DEV MODE)', dev_otp: otp });
});

// POST /api/otp/verify
app.post('/api/otp/verify', (req, res) => {
  const { phone, otp } = req.body;
  const result = db.verifyOTP(phone, otp);
  if (result.success) return res.json({ success: true, message: 'ยืนยัน OTP สำเร็จ' });
  res.status(400).json(result);
});

// POST /api/contracts
app.post('/api/contracts', (req, res) => {
  const { customer, product_id, documents, signature, custom_down_payment, custom_monthly_payment, custom_installments, latitude, longitude } = req.body;
  if (!customer || !product_id) {
    return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
  }
  try {
    const customerId = db.insertCustomer(customer);
    const contractNo = db.generateContractNo();
    const contractId = db.insertContract(
      contractNo, 
      customerId, 
      product_id,
      custom_down_payment ? Number(custom_down_payment) : null,
      custom_monthly_payment ? Number(custom_monthly_payment) : null,
      custom_installments ? Number(custom_installments) : null,
      latitude || null,
      longitude || null
    );

    if (documents) {
      for (const [type, filePath] of Object.entries(documents)) {
        if (filePath) db.insertDocument(contractId, type, filePath);
      }
    }
    if (signature) db.insertSignature(contractId, signature);

    // Sync contract to Google Firebase Cloud
    firebase.syncContractToFirebase({
      id: contractId,
      contract_no: contractNo,
      customer,
      product_id,
      custom_down_payment,
      custom_monthly_payment,
      custom_installments,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    // Send contract details to Google Sheets
    const productInfo = db.getProductById(product_id);
    googleSheets.sendToGoogleSheet({
      contract_no: contractNo,
      customer,
      model: productInfo?.model || 'โทรศัพท์มือถือ',
      color: productInfo?.color || '',
      storage: productInfo?.storage || '',
      price: productInfo?.price || 0,
      custom_down_payment,
      custom_monthly_payment,
      custom_installments,
      status: 'pending'
    });

    res.json({ success: true, contractNo, contractId });
  } catch (e) {
    console.error('Contract error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/contracts/track?phone=xxx
app.get('/api/contracts/track', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' });
  try {
    const list = db.getContractsByPhone(phone);
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/contracts/:id/slip
app.post('/api/contracts/:id/slip', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'ไม่พบไฟล์สลิป' });
  const contractId = req.params.id;
  const filePath = `/uploads/${req.file.filename}`;
  try {
    db.updateContractSlip(contractId, filePath);
    res.json({ success: true, message: 'อัปโหลดสลิปเรียบร้อยแล้ว', filePath });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN API
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== (process.env.ADMIN_PASSWORD || 'sabaiphone123')) {
    return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
  }
  const token     = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.createAdminSession(token, expiresAt);
  res.json({ success: true, token });
});

// GET /api/admin/stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({ success: true, data: db.getStats() });
});

// GET /api/admin/contracts
app.get('/api/admin/contracts', requireAdmin, (req, res) => {
  const { status, search } = req.query;
  res.json({ success: true, data: db.getAllContracts(status, search) });
});

// GET /api/admin/contracts/:id
app.get('/api/admin/contracts/:id', requireAdmin, (req, res) => {
  const contract = db.getContractDetail(req.params.id);
  console.log('Contract detail for ID ' + req.params.id + ':', contract);
  if (!contract) return res.status(404).json({ success: false, message: 'ไม่พบสัญญา' });
  res.json({ success: true, data: contract });
});

// PUT /api/admin/contracts/:id/status
app.put('/api/admin/contracts/:id/status', requireAdmin, (req, res) => {
  const { status, imei_id, admin_note, custom_down_payment, custom_monthly_payment, custom_installments } = req.body;
  db.updateContractStatus(req.params.id, status, imei_id, admin_note, custom_down_payment, custom_monthly_payment, custom_installments);
  res.json({ success: true, message: 'อัปเดตสถานะเรียบร้อย' });
});

// DELETE /api/admin/contracts/:id
app.delete('/api/admin/contracts/:id', requireAdmin, (req, res) => {
  try {
    db.deleteContract(req.params.id);
    res.json({ success: true, message: 'ลบสัญญาเรียบร้อย' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/admin/contracts/:id/payments
app.get('/api/admin/contracts/:id/payments', requireAdmin, (req, res) => {
  try {
    const list = db.getContractPayments(req.params.id);
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/admin/contracts/:id/payments
app.post('/api/admin/contracts/:id/payments', requireAdmin, (req, res) => {
  try {
    const { installment_no, amount, payment_date, slip_path, note } = req.body;
    const paymentId = db.addPayment(req.params.id, installment_no, Number(amount), payment_date, slip_path, note);
    res.json({ success: true, message: 'บันทึกการชำระค่างวดเรียบร้อย', paymentId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/admin/reminders
app.get('/api/admin/reminders', requireAdmin, (req, res) => {
  try {
    const data = db.getDueContracts();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/admin/test-gsheet
app.post('/api/admin/test-gsheet', requireAdmin, async (req, res) => {
  try {
    const success = await googleSheets.sendToGoogleSheet({
      contract_no: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      created_at: new Date().toLocaleString('th-TH'),
      customer_name: 'ทดสอบระบบ สบายโฟน',
      phone: '0812345678',
      id_card: '1409900123456',
      model: 'iPhone 16 Pro Max',
      color: 'Desert Titanium',
      storage: '256GB',
      price: 48900,
      down_payment: 9900,
      monthly_payment: 6500,
      installments: 6,
      pay_day: 15,
      status: 'approved'
    });
    if (success) {
      res.json({ success: true, message: 'ส่งข้อมูลทดสอบไปยัง Google Sheet เรียบร้อยแล้ว!' });
    } else {
      res.status(500).json({ success: false, message: 'ไม่สามารถส่งข้อมูลได้ โปรดตรวจสอบสิทธิ์ Anyone บน Google Apps Script' });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/admin/imei
app.get('/api/admin/imei', requireAdmin, (req, res) => {
  res.json({ success: true, data: db.getAllIMEI() });
});

// GET /api/admin/imei/available/:productId
app.get('/api/admin/imei/available/:productId', requireAdmin, (req, res) => {
  res.json({ success: true, data: db.getAvailableIMEI(req.params.productId) });
});

// POST /api/admin/imei
app.post('/api/admin/imei', requireAdmin, (req, res) => {
  const { product_id, imei } = req.body;
  if (!product_id || !imei) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบ' });
  try {
    db.addIMEI(product_id, imei);
    res.json({ success: true, message: 'เพิ่ม IMEI แล้ว' });
  } catch (e) {
    res.status(400).json({ success: false, message: 'IMEI นี้มีอยู่ในระบบแล้ว' });
  }
});

// DELETE /api/admin/imei/:id
app.delete('/api/admin/imei/:id', requireAdmin, (req, res) => {
  db.deleteIMEI(req.params.id);
  res.json({ success: true, message: 'ลบ IMEI แล้ว' });
});

// GET /api/admin/products
app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json({ success: true, data: db.getAllProducts() });
});

// POST /api/admin/products
app.post('/api/admin/products', requireAdmin, (req, res) => {
  try {
    db.addProduct(req.body);
    res.json({ success: true, message: 'เพิ่มสินค้าเรียบร้อย' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/admin/products/:id
app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    db.updateProduct(req.params.id, req.body);
    res.json({ success: true, message: 'แก้ไขสินค้าเรียบร้อย' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/admin/products/:id
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    db.deleteProduct(req.params.id);
    res.json({ success: true, message: 'ลบสินค้าเรียบร้อย' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /contract/:id/print  — printable contract page
app.get('/contract/:id/print', requireAdmin, (req, res) => {
  const c = db.getContractDetail(req.params.id);
  if (!c) return res.status(404).send('ไม่พบสัญญา');

  const fmtPrice = (n) => Number(n).toLocaleString('th-TH');
  const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const payDay = c.created_at ? new Date(c.created_at.replace(' ', 'T')).getDate() : 15;

  const sigImg = c.signature_data
    ? `<img src="${c.signature_data}" style="height:64px; max-width:220px; object-fit:contain;">`
    : '<span style="font-style:italic;color:#aaa;">ไม่มีลายเซ็น</span>';

  // Find uploaded identity document paths
  const idCardDoc = c.documents?.find(d => d.doc_type === 'id_card_front');
  const selfieDoc = c.documents?.find(d => d.doc_type === 'selfie');

  res.send(`<!DOCTYPE html><html lang="th">
<head><meta charset="UTF-8"><title>สัญญาผ่อน ${c.contract_no} - SABUYPHONE</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Sarabun', sans-serif; font-size:12px; color:#1e293b; padding:20px; background:#fff; line-height: 1.5; }
  .page { max-width:740px; margin:auto; background:#fff; border:1px solid #e2e8f0; padding:30px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.03); }
  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px double #f59e0b; padding-bottom:16px; margin-bottom:16px; }
  .logo-box { display:flex; align-items:center; gap:12px; }
  .logo-img { width:50px; height:50px; object-fit:contain; }
  .company-name { font-size:22px; font-weight:800; color:#d97706; letter-spacing:0.5px; }
  .contract-title { font-size:15px; font-weight:700; text-align:right; color:#1e293b; }
  .contract-no { color:#475569; font-size:12px; font-weight:600; }
  table { width:100%; border-collapse:collapse; margin-bottom:14px; margin-top:4px; }
  th { background:#f1f5f9; color:#1e293b; padding:6px 10px; text-align:left; font-size:11px; font-weight:700; border:1px solid #e2e8f0; }
  td { padding:6px 10px; border:1px solid #e2e8f0; }
  .section-title { font-weight:700; font-size:13px; margin:18px 0 6px; color:#d97706; display:flex; align-items:center; gap:6px; border-bottom:1px solid #fed7aa; padding-bottom:4px; }
  .terms-list { list-style:decimal; padding-left:20px; }
  .terms-list li { margin-bottom:6px; font-size:11px; color:#334155; }
  .sig-row { display:flex; justify-content:space-around; margin-top:35px; text-align:center; }
  .sig-box { width:220px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; min-height:100px; }
  .sig-line { border-top:1px solid #475569; margin-top:10px; padding-top:4px; font-size:11px; color:#334155; width:100%; }
  .footer-note { text-align:center; font-size:11px; color:#64748b; margin-top:20px; border-top:1px dashed #cbd5e1; padding-top:12px; }
  
  /* Document Attachement Section */
  .doc-attachment-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:10px; page-break-inside:avoid; }
  .doc-attachment-card { border:1px solid #e2e8f0; border-radius:6px; padding:12px; text-align:center; background:#f8fafc; }
  .doc-attachment-title { font-weight:700; font-size:11px; color:#475569; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; }
  .doc-attachment-img { max-width:100%; max-height:160px; object-fit:contain; border-radius:4px; border:1px solid #cbd5e1; background:#fff; }

  @media print { 
    body { padding:0; background:#none; } 
    .page { border:none; padding:0; box-shadow:none; max-width:100%; } 
    .no-print { display:none; } 
  }
</style></head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-box">
      <img src="/logo.png" alt="SABUYPHONE" class="logo-img">
      <div>
        <div class="company-name">SABUYPHONE</div>
        <div style="font-size:11px;color:#64748b;font-weight:600;">สาขาบ้านไผ่ | โทร. 080-146-5222 | Line: sabuyphon_bp</div>
      </div>
    </div>
    <div class="contract-title">
      หนังสือสัญญาซื้อขายและผ่อนชำระเครื่องโทรศัพท์มือถือ<br>
      <span class="contract-no">เลขที่สัญญา: ${c.contract_no}</span><br>
      <span class="contract-no">ทำเมื่อวันที่: ${today}</span>
    </div>
  </div>

  <div class="section-title">👤 ข้อมูลผู้เช่าซื้อ / ลูกค้า</div>
  <table>
    <tr><td width="160" style="background:#f8fafc;"><strong>ชื่อ-นามสกุล</strong></td><td>${c.name}</td><td width="160" style="background:#f8fafc;"><strong>เลขบัตรประชาชน</strong></td><td>${c.id_card}</td></tr>
    <tr><td style="background:#f8fafc;"><strong>เบอร์โทรศัพท์</strong></td><td>${c.phone}</td><td style="background:#f8fafc;"><strong>วันเกิด</strong></td><td>${c.birthdate || '-'}</td></tr>
    <tr><td style="background:#f8fafc;"><strong>ที่อยู่ตามบัตรประชาชน</strong></td><td colspan="3">${[c.address,c.subdistrict,c.district,c.province,c.postal_code].filter(Boolean).join(' ')}</td></tr>
    <tr><td style="background:#f8fafc;"><strong>Facebook</strong></td><td>${c.facebook || '-'}</td><td style="background:#f8fafc;"><strong>LINE ID</strong></td><td>${c.line_id || '-'}</td></tr>
  </table>

  <div class="section-title">📦 รายละเอียดตัวเครื่องโทรศัพท์มือถือ</div>
  <table>
    <tr><td width="160" style="background:#f8fafc;"><strong>ยี่ห้อ / รุ่นสินค้า</strong></td><td>${c.brand} ${c.model}</td><td width="120" style="background:#f8fafc;"><strong>สีตัวเครื่อง</strong></td><td>${c.color}</td></tr>
    <tr><td style="background:#f8fafc;"><strong>ขนาดความจุ</strong></td><td>${c.storage}</td><td style="background:#f8fafc;"><strong>หมายเลข IMEI เครื่อง</strong></td><td><strong>${c.imei || 'รอกำหนดโดยทางร้าน'}</strong></td></tr>
  </table>

  <div class="section-title">💰 เงื่อนไขการวางเงินดาวน์และผ่อนค่างวด</div>
  <table>
    <tr><td width="200" style="background:#f8fafc;"><strong>ราคาเครื่องปกติ</strong></td><td>${fmtPrice(c.price)} บาท</td></tr>
    <tr><td style="background:#f8fafc;"><strong>จำนวนเงินดาวน์ชำระแล้ว</strong></td><td style="color:#d97706;font-weight:700;">${fmtPrice(c.down_payment)} บาท</td></tr>
    <tr><td style="background:#f8fafc;"><strong>ยอดแบ่งชำระค่างวดรายเดือน</strong></td><td><strong>${fmtPrice(c.monthly_payment)} บาท / เดือน</strong></td></tr>
    <tr><td style="background:#f8fafc;"><strong>ระยะเวลาผ่อนชำระ</strong></td><td>${c.installments} งวด (เดือน)</td></tr>
    <tr><td style="background:#f8fafc;"><strong>กำหนดชำระค่างวด</strong></td><td>ทุกวันที่ ${payDay} ของทุกเดือน</td></tr>
    <tr><td style="background:#f8fafc;"><strong>ยอดรวมสัญญาผ่อนชำระ</strong></td><td><strong>${fmtPrice(c.down_payment + c.monthly_payment * c.installments)} บาท</strong></td></tr>
  </table>

  <div class="section-title">📜 ข้อตกลงและเงื่อนไขการซื้อขายผ่อนชำระ</div>
  <ol class="terms-list">
    <li><strong>การชำระล่าช้าและการแจ้งเตือน:</strong> หากลูกค้าค้างชำระค่างวดครบ 3 วัน ทางร้านมีสิทธิ์ดำเนินการเปลี่ยนภาพพื้นหลัง (Wallpaper) ของเครื่องเพื่อแจ้งเตือนให้ดำเนินการชำระให้เรียบร้อย</li>
    <li><strong>การล็อกอุปกรณ์ชั่วคราว:</strong> หากค้างชำระครบ 7 วัน ทางร้านมีสิทธิ์ระงับการใช้งานเครื่องชั่วคราว (ล็อกเครื่อง) และอาจเรียกเก็บค่าดำเนินการระบบและปลดล็อกจำนวน 300 บาท เมื่อชำระยอดค้างครบถ้วนแล้วทางร้านจะดำเนินการปลดล็อกให้ใช้งานตามปกติ</li>
    <li><strong>การส่งคืนเครื่องเพื่อยกเลิกสัญญา:</strong> ในกรณีที่ลูกค้าไม่ต้องการผ่อนต่อ สามารถนำเครื่องมาส่งคืนกับทางร้านในสภาพปกติเพื่อยกเลิกสัญญาได้ทันที โดยจะไม่มีการดำเนินคดีหรือแจ้งความใดๆ</li>
    <li><strong>เงื่อนไขการรับเงินดาวน์คืน:</strong> หากลูกค้าติดต่อส่งคืนเครื่องกับทางร้านด้วยตนเองโดยสมัครใจ (โดยที่ร้านไม่ต้องติดตามเครื่อง) ไม่มีค่างวดค้างชำระ และตัวเครื่องอยู่ในสภาพปกติสมบูรณ์ ไม่มีร่องรอยการตก บุบ แตก เสียหาย หรือต้องส่งซ่อม ทางร้านจะพิจารณาคืนเงินให้ไม่เกิน 50% ของเงินดาวน์ที่ชำระไว้ ทั้งนี้ขึ้นอยู่กับการประเมินและดุลยพินิจของทางร้านเท่านั้น</li>
    <li><strong>ระบบรักษาสิทธิ์ของร้านค้า:</strong> การดำเนินการทั้งหมดถือเป็นส่วนหนึ่งของระบบรักษาสิทธิ์ความปลอดภัยของร้านค้า ลูกค้ารับทราบ ยินยอม และลงลายมือชื่อผูกพันตามสัญญานี้โดยไม่มีข้อโต้แย้งใดๆ</li>
  </ol>

  <!-- Attached Identity Images -->
  <div class="section-title">📎 เอกสารยืนยันตัวตนแนบท้ายสัญญา</div>
  <div class="doc-attachment-grid">
    <div class="doc-attachment-card">
      <div class="doc-attachment-title">รูปบัตรประชาชน</div>
      ${idCardDoc ? `<img src="${idCardDoc.file_path}" class="doc-attachment-img">` : '<p style="color:#94a3b8;padding:40px 0;font-size:11px;">(ไม่ได้อัปโหลดรูปบัตรประชาชน)</p>'}
    </div>
    <div class="doc-attachment-card">
      <div class="doc-attachment-title">รูปถ่ายเซลฟี่คู่บัตร</div>
      ${selfieDoc ? `<img src="${selfieDoc.file_path}" class="doc-attachment-img">` : '<p style="color:#94a3b8;padding:40px 0;font-size:11px;">(ไม่ได้อัปโหลดรูปเซลฟี่คู่บัตร)</p>'}
    </div>
  </div>

  <div class="sig-row" style="page-break-inside:avoid; margin-top:40px;">
    <div class="sig-box">
      ${sigImg}
      <div class="sig-line">(${c.name})<br>ผู้เช่าซื้อ / ลูกค้า (ลงนาม)</div>
    </div>
    <div class="sig-box">
      <div style="height:64px;display:flex;align-items:center;justify-content:center;"><span style="color:#cbd5e1;font-size:11px;">(ลงชื่อตัวแทนร้าน)</span></div>
      <div class="sig-line">(_________________________)<br>ผู้ให้เช่าซื้อ / ร้าน SABUYPHONE</div>
    </div>
  </div>

  <div class="footer-note">
    พิกัดยืนยันตัวตน GPS: ${c.latitude && c.longitude ? `${c.latitude}, ${c.longitude}` : 'ไม่ระบุพิกัด'} | เอกสารฉบับนี้จัดทำขึ้นโดยอิเล็กทรอนิกส์และลงลายมือชื่อในรูปแบบดิจิทัล มีผลผูกพันและบังคับใช้ได้ตามกฎหมาย
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 28px;background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);color:#fff;border:none;border-radius:30px;cursor:pointer;font-size:14px;font-weight:700;box-shadow:0 4px 15px rgba(217,119,6,0.3);">🖨️ พิมพ์เอกสารสัญญานี้</button>
  </div>
</div>
</body></html>`);
});

// GET /contract/:id/receipt/:paymentId — Official Receipt Page
app.get('/contract/:id/receipt/:paymentId', (req, res) => {
  const p = db.getPaymentById(req.params.paymentId);
  if (!p) return res.status(404).send('ไม่พบข้อมูลใบเสร็จรับเงิน');

  const payDateFormatted = new Date(p.payment_date.replace(' ', 'T')).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  res.send(`<!DOCTYPE html><html lang="th">
<head><meta charset="UTF-8"><title>ใบเสร็จรับเงิน - ${p.contract_no} งวดที่ ${p.installment_no}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Sarabun', sans-serif; font-size:13px; color:#1e293b; padding:30px; background:#f8fafc; }
  .receipt { max-width:600px; margin:auto; background:#fff; border:1px solid #e2e8f0; padding:32px; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.05); }
  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #10b981; padding-bottom:16px; margin-bottom:20px; }
  .brand { font-size:22px; font-weight:800; color:#059669; }
  .brand-sub { font-size:12px; color:#64748b; font-weight:600; }
  .receipt-title { font-size:18px; font-weight:800; text-align:right; color:#1e293b; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; background:#f0fdf4; padding:16px; border-radius:8px; border:1px solid #a7f3d0; }
  .info-item label { font-size:11px; color:#047857; font-weight:700; display:block; }
  .info-item span { font-size:14px; font-weight:700; color:#065f46; }
  table { width:100%; border-collapse:collapse; margin-bottom:20px; }
  th { background:#f1f5f9; padding:10px; text-align:left; border-bottom:2px solid #cbd5e1; font-weight:700; }
  td { padding:12px 10px; border-bottom:1px solid #e2e8f0; }
  .amount-total { font-size:20px; font-weight:800; color:#059669; text-align:right; }
  .footer-sig { display:flex; justify-content:space-between; margin-top:40px; text-align:center; }
  .sig-box { width:200px; border-top:1px solid #94a3b8; padding-top:6px; font-size:12px; color:#475569; }
  @media print { body { padding:0; background:none; } .receipt { border:none; box-shadow:none; padding:0; } .no-print { display:none; } }
</style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <div>
      <div class="brand">SABUYPHONE (สบายโฟน บ้านไผ่)</div>
      <div class="brand-sub">โทร: 080-146-5222 | Line: sabuyphon_bp</div>
    </div>
    <div>
      <div class="receipt-title">ใบเสร็จรับเงิน</div>
      <div style="font-size:12px;color:#64748b;text-align:right;">เลขที่: REC-${p.id.toString().padStart(6, '0')}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item"><label>ชื่อลูกค้า</label><span>${p.customer_name}</span></div>
    <div class="info-item"><label>เบอร์โทรศัพท์</label><span>${p.phone}</span></div>
    <div class="info-item"><label>เลขที่สัญญา</label><span>${p.contract_no}</span></div>
    <div class="info-item"><label>วันที่ชำระเงิน</label><span>${payDateFormatted} น.</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>รายการ</th>
        <th>งวดที่</th>
        <th style="text-align:right;">จำนวนเงิน (บาท)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>ค่างวดสินค้า:</strong> ${p.model} (${p.color})</td>
        <td><strong>งวดที่ ${p.installment_no}</strong></td>
        <td style="text-align:right;font-size:16px;font-weight:700;">${Number(p.amount).toLocaleString('th-TH')} บาท</td>
      </tr>
    </tbody>
  </table>

  <div style="background:#f8fafc;padding:12px 16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
    <span style="font-weight:700;">ยอดเงินรับชำระทั้งสิ้น</span>
    <span class="amount-total">${Number(p.amount).toLocaleString('th-TH')} บาท</span>
  </div>

  <div class="footer-sig">
    <div class="sig-box">(${p.customer_name})<br>ผู้ชำระเงิน</div>
    <div class="sig-box">(____________________)<br>ผู้รับชำระเงิน / แคชเชียร์</div>
  </div>

  <div class="no-print" style="text-align:center;margin-top:30px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#059669;color:#fff;border:none;border-radius:20px;cursor:pointer;font-weight:700;font-size:14px;">🖨️ พิมพ์ใบเสร็จรับเงิน</button>
  </div>
</div>
</body></html>`);
});

// ─── Start server ────────────────────────────────────────────────────────
(async () => {
  try {
    await db.init();
    app.listen(PORT, async () => {
      console.log(`\n🚀 Server running at http://localhost:${PORT}`);
      console.log(`📋 Admin dashboard: http://localhost:${PORT}/admin.html`);
      console.log(`📄 Customer form:   http://localhost:${PORT}/\n`);

      if (!process.env.RENDER) {
        try {
          const { startTunnel } = require('untun');
          const tunnel = await startTunnel({ port: PORT });
          const publicUrl = await tunnel.getURL();
          console.log(`\n=============================================================`);
          console.log(`🌐 100% DIRECT ONLINE HTTPS URL FOR CUSTOMERS (ZERO PROMPT):`);
          console.log(`🌐 ${publicUrl}`);
          console.log(`=============================================================\n`);
        } catch (err) {
          console.log('ℹ️ Local Tunnel notice:', err.message);
        }
      }
    });
  } catch(e) {
    console.error('Failed to start:', e);
    process.exit(1);
  }
})();
