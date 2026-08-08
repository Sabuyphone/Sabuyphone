require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = require('./database');
const firebase = require('./firebase');
const googleSheets = require('./google_sheets');

const axios = require('axios');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const publicIdx = path.join(__dirname, 'public', 'index.html');
  const rootIdx   = path.join(__dirname, 'index.html');
  const sabuyIdx  = path.join(__dirname, 'Sabuyphone');
  if (fs.existsSync(publicIdx)) return res.sendFile(publicIdx);
  if (fs.existsSync(rootIdx))   return res.sendFile(rootIdx);
  if (fs.existsSync(sabuyIdx))  return res.sendFile(sabuyIdx);
  res.send('Sabuyphone Online Contract System Ready');
});

app.get('/admin', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const publicAdm = path.join(__dirname, 'public', 'admin.html');
  const rootAdm   = path.join(__dirname, 'admin.html');
  const sabuyAdm  = path.join(__dirname, 'admin');
  if (fs.existsSync(publicAdm)) return res.sendFile(publicAdm);
  if (fs.existsSync(rootAdm))   return res.sendFile(rootAdm);
  if (fs.existsSync(sabuyAdm))  return res.sendFile(sabuyAdm);
  res.send('Sabuyphone Admin Dashboard Ready');
});

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

const requireAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || !db.validateAdminToken(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

app.get('/api/products', (req, res) => {
  try {
    res.json({ success: true, data: db.getAllProducts() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  const p = db.getProductById(req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
  res.json({ success: true, data: p });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'ไม่พบไฟล์' });
  res.json({ success: true, filePath: `/uploads/${req.file.filename}` });
});

app.post('/api/contracts', (req, res) => {
  const { customer, product_id, documents, signature, custom_down_payment, custom_monthly_payment, custom_installments, latitude, longitude } = req.body;
  if (!customer || !product_id) {
    return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
  }
  try {
    const customerId = db.insertCustomer(customer);
    const contractNo = db.generateContractNo();
    const contractId = db.insertContract(
      contractNo, customerId, product_id,
      custom_down_payment ? Number(custom_down_payment) : null,
      custom_monthly_payment ? Number(custom_monthly_payment) : null,
      custom_installments ? Number(custom_installments) : null,
      latitude || null, longitude || null
    );

    if (documents) {
      for (const [type, filePath] of Object.entries(documents)) {
        if (filePath) db.insertDocument(contractId, type, filePath);
      }
    }
    if (signature) db.insertSignature(contractId, signature);

    const productInfo = db.getProductById(product_id);
    googleSheets.sendToGoogleSheet({
      contract_no: contractNo, customer,
      model: productInfo?.model || 'โทรศัพท์มือถือ',
      color: productInfo?.color || '',
      storage: productInfo?.storage || '',
      price: productInfo?.price || 0,
      down_payment: custom_down_payment || productInfo?.down_payment || 0,
      monthly_payment: custom_monthly_payment || productInfo?.monthly_payment || 0,
      installments: custom_installments || productInfo?.installments || 6,
      pay_day: new Date().getDate(), status: 'pending'
    });

    res.json({ success: true, contract_no: contractNo, contractId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

(async () => {
  try {
    await db.init();
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  } catch(e) {
    console.error('Failed to start:', e);
    process.exit(1);
  }
})();
