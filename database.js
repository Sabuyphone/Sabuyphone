/**
 * database.js — SQLite via sql.js (Pure JavaScript, no native build needed)
 * Persists to contracts.db file on disk
 */
const initSqlJs = require('sql.js');
const path = require('path');
const fs   = require('fs');
const firebase = require('./firebase');

const DB_FILE = path.join(__dirname, 'contracts.db');

// We use a synchronous wrapper pattern
let db;

function getDB() { return db; }

async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const buf = fs.readFileSync(DB_FILE);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  // Auto-save after every write
  global._dbSave = () => {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  };

  createTables();
  
  // Migration for adding custom terms and slip columns to existing DB
  try { db.run("ALTER TABLE contracts ADD COLUMN custom_down_payment INTEGER"); } catch(e){}
  try { db.run("ALTER TABLE contracts ADD COLUMN custom_monthly_payment INTEGER"); } catch(e){}
  try { db.run("ALTER TABLE contracts ADD COLUMN custom_installments INTEGER"); } catch(e){}
  try { db.run("ALTER TABLE contracts ADD COLUMN payment_slip TEXT"); } catch(e){}
  try { db.run("ALTER TABLE products ADD COLUMN image_path TEXT"); } catch(e){}
  try { db.run("ALTER TABLE contracts ADD COLUMN latitude TEXT"); } catch(e){}
  try { db.run("ALTER TABLE contracts ADD COLUMN longitude TEXT"); } catch(e){}
  
  // Set default image path for existing seeds
  try { db.run("UPDATE products SET image_path = '/iphone16promax.png' WHERE model = 'iPhone 16 Pro Max'"); } catch(e){}
  
  seedProducts();
  
  // Fix orphaned test contracts where customer_id was inserted as 0
  db.run("UPDATE contracts SET customer_id = 1 WHERE customer_id = 0");
  db.run("UPDATE documents SET contract_id = 1 WHERE contract_id = 0");
  db.run("UPDATE signatures SET contract_id = 1 WHERE contract_id = 0");
  global._dbSave();
  
  console.log('✅ Database ready');
  firebase.initFirebase();
}

function run(sql, params = []) {
  db.run(sql, params);
  global._dbSave();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function lastInsertRowid() {
  return get('SELECT last_insert_rowid() as id').id;
}

// ==================== CREATE TABLES ====================
function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      id_card TEXT NOT NULL,
      birthdate TEXT,
      phone TEXT NOT NULL,
      address TEXT,
      subdistrict TEXT,
      district TEXT,
      province TEXT,
      postal_code TEXT,
      facebook TEXT,
      line_id TEXT,
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      color TEXT NOT NULL,
      color_hex TEXT NOT NULL DEFAULT '#888888',
      storage TEXT NOT NULL,
      price INTEGER NOT NULL,
      down_payment INTEGER NOT NULL,
      monthly_payment INTEGER NOT NULL,
      installments INTEGER NOT NULL DEFAULT 6,
      payment_day INTEGER NOT NULL DEFAULT 15,
      image_path TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS imei_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      imei TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'available',
      contract_id INTEGER,
      added_at TEXT DEFAULT (datetime('now', '+7 hours'))
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      imei_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      custom_down_payment INTEGER,
      custom_monthly_payment INTEGER,
      custom_installments INTEGER,
      payment_slip TEXT,
      latitude TEXT,
      longitude TEXT,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      approved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      doc_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at TEXT DEFAULT (datetime('now', '+7 hours'))
    );
    CREATE TABLE IF NOT EXISTS signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL UNIQUE,
      signature_data TEXT NOT NULL,
      signed_at TEXT DEFAULT (datetime('now', '+7 hours'))
    );
    CREATE TABLE IF NOT EXISTS otp_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      installment_no INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      payment_date TEXT DEFAULT (datetime('now', '+7 hours')),
      slip_path TEXT,
      status TEXT NOT NULL DEFAULT 'approved',
      note TEXT,
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    );
  `);
}

// ==================== SEED PRODUCTS ====================
function seedProducts() {
  const existing = get('SELECT COUNT(*) as c FROM products').c;
  if (Number(existing) > 0) return;

  const specs = [
    // iPhone 16 Series
    { model: 'iPhone 16 Pro Max', colors: ['Desert Titanium', 'Natural Titanium', 'White Titanium', 'Black Titanium'], colorsHex: ['#B99A6B', '#D1C8B8', '#F2F1EC', '#2C2C2E'], storages: ['256GB', '512GB', '1TB'], basePrice: 48900, baseStorage: '256GB' },
    { model: 'iPhone 16 Pro', colors: ['Desert Titanium', 'Natural Titanium', 'White Titanium', 'Black Titanium'], colorsHex: ['#B99A6B', '#D1C8B8', '#F2F1EC', '#2C2C2E'], storages: ['128GB', '256GB', '512GB', '1TB'], basePrice: 39900, baseStorage: '128GB' },
    { model: 'iPhone 16 Plus', colors: ['Ultramarine', 'Teal', 'Pink', 'White', 'Black'], colorsHex: ['#3A4B8C', '#6EAFA5', '#F5B3BE', '#FFFFFF', '#1C1C1E'], storages: ['128GB', '256GB', '512GB'], basePrice: 34900, baseStorage: '128GB' },
    { model: 'iPhone 16', colors: ['Ultramarine', 'Teal', 'Pink', 'White', 'Black'], colorsHex: ['#3A4B8C', '#6EAFA5', '#F5B3BE', '#FFFFFF', '#1C1C1E'], storages: ['128GB', '256GB', '512GB'], basePrice: 29900, baseStorage: '128GB' },

    // iPhone 15 Series
    { model: 'iPhone 15 Pro Max', colors: ['Black Titanium', 'White Titanium', 'Blue Titanium', 'Natural Titanium'], colorsHex: ['#2C2C2E', '#F2F1EC', '#2F4452', '#D1C8B8'], storages: ['256GB', '512GB', '1TB'], basePrice: 44900, baseStorage: '256GB' },
    { model: 'iPhone 15 Pro', colors: ['Black Titanium', 'White Titanium', 'Blue Titanium', 'Natural Titanium'], colorsHex: ['#2C2C2E', '#F2F1EC', '#2F4452', '#D1C8B8'], storages: ['128GB', '256GB', '512GB', '1TB'], basePrice: 36900, baseStorage: '128GB' },
    { model: 'iPhone 15 Plus', colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'], colorsHex: ['#1C1C1E', '#D2E3ED', '#D1E6D3', '#F7EDCA', '#F7D6D8'], storages: ['128GB', '256GB', '512GB'], basePrice: 30900, baseStorage: '128GB' },
    { model: 'iPhone 15', colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'], colorsHex: ['#1C1C1E', '#D2E3ED', '#D1E6D3', '#F7EDCA', '#F7D6D8'], storages: ['128GB', '256GB', '512GB'], basePrice: 26900, baseStorage: '128GB' },

    // iPhone 14 Series
    { model: 'iPhone 14 Pro Max', colors: ['Space Black', 'Silver', 'Gold', 'Deep Purple'], colorsHex: ['#1F2022', '#F5F5F0', '#F5E3C3', '#3C3545'], storages: ['128GB', '256GB', '512GB', '1TB'], basePrice: 36900, baseStorage: '128GB' },
    { model: 'iPhone 14 Pro', colors: ['Space Black', 'Silver', 'Gold', 'Deep Purple'], colorsHex: ['#1F2022', '#F5F5F0', '#F5E3C3', '#3C3545'], storages: ['128GB', '256GB', '512GB', '1TB'], basePrice: 32900, baseStorage: '128GB' },
    { model: 'iPhone 14 Plus', colors: ['Midnight', 'Purple', 'Starlight', 'Blue', 'Red', 'Yellow'], colorsHex: ['#1C1C22', '#E0DBEC', '#FAF6F0', '#A2C1DB', '#E11D48', '#FED7AA'], storages: ['128GB', '256GB', '512GB'], basePrice: 26900, baseStorage: '128GB' },
    { model: 'iPhone 14', colors: ['Midnight', 'Purple', 'Starlight', 'Blue', 'Red', 'Yellow'], colorsHex: ['#1C1C22', '#E0DBEC', '#FAF6F0', '#A2C1DB', '#E11D48', '#FED7AA'], storages: ['128GB', '256GB', '512GB'], basePrice: 22900, baseStorage: '128GB' },

    // iPhone 13 Series
    { model: 'iPhone 13 Pro Max', colors: ['Graphite', 'Gold', 'Silver', 'Sierra Blue', 'Alpine Green'], colorsHex: ['#4A4B4D', '#F5E3C3', '#F5F5F0', '#98B2C6', '#3E4F3F'], storages: ['128GB', '256GB', '512GB', '1TB'], basePrice: 31900, baseStorage: '128GB' },
    { model: 'iPhone 13 Pro', colors: ['Graphite', 'Gold', 'Silver', 'Sierra Blue', 'Alpine Green'], colorsHex: ['#4A4B4D', '#F5E3C3', '#F5F5F0', '#98B2C6', '#3E4F3F'], storages: ['128GB', '256GB', '512GB', '1TB'], basePrice: 27900, baseStorage: '128GB' },
    { model: 'iPhone 13 mini', colors: ['Midnight', 'Blue', 'Pink', 'Starlight', 'Green', 'Red'], colorsHex: ['#1C1C22', '#215C88', '#FAE0E4', '#FAF6F0', '#2F4635', '#BA0C2F'], storages: ['128GB', '256GB', '512GB'], basePrice: 17900, baseStorage: '128GB' },
    { model: 'iPhone 13', colors: ['Midnight', 'Blue', 'Pink', 'Starlight', 'Green', 'Red'], colorsHex: ['#1C1C22', '#215C88', '#FAE0E4', '#FAF6F0', '#2F4635', '#BA0C2F'], storages: ['128GB', '256GB', '512GB'], basePrice: 19900, baseStorage: '128GB' },

    // iPhone 12 Series
    { model: 'iPhone 12 Pro Max', colors: ['Graphite', 'Silver', 'Gold', 'Pacific Blue'], colorsHex: ['#4A4B4D', '#F5F5F0', '#F5E3C3', '#2E5C6E'], storages: ['128GB', '256GB', '512GB'], basePrice: 27900, baseStorage: '128GB' },
    { model: 'iPhone 12 Pro', colors: ['Graphite', 'Silver', 'Gold', 'Pacific Blue'], colorsHex: ['#4A4B4D', '#F5F5F0', '#F5E3C3', '#2E5C6E'], storages: ['128GB', '256GB', '512GB'], basePrice: 24900, baseStorage: '128GB' },
    { model: 'iPhone 12 mini', colors: ['Black', 'White', 'Blue', 'Green', 'Purple', 'Red'], colorsHex: ['#1C1C1E', '#FFFFFF', '#1C3B57', '#E0F5E1', '#D1C6E1', '#BA0C2F'], storages: ['64GB', '128GB', '256GB'], basePrice: 14900, baseStorage: '64GB' },
    { model: 'iPhone 12', colors: ['Black', 'White', 'Blue', 'Green', 'Purple', 'Red'], colorsHex: ['#1C1C1E', '#FFFFFF', '#1C3B57', '#E0F5E1', '#D1C6E1', '#BA0C2F'], storages: ['64GB', '128GB', '256GB'], basePrice: 16900, baseStorage: '64GB' },

    // iPhone 11 Series
    { model: 'iPhone 11 Pro Max', colors: ['Space Gray', 'Silver', 'Midnight Green', 'Gold'], colorsHex: ['#4E4F50', '#F5F5F0', '#4B5340', '#E3D5CA'], storages: ['64GB', '256GB', '512GB'], basePrice: 20900, baseStorage: '64GB' },
    { model: 'iPhone 11 Pro', colors: ['Space Gray', 'Silver', 'Midnight Green', 'Gold'], colorsHex: ['#4E4F50', '#F5F5F0', '#4B5340', '#E3D5CA'], storages: ['64GB', '256GB', '512GB'], basePrice: 18900, baseStorage: '64GB' },
    { model: 'iPhone 11', colors: ['Black', 'Green', 'Yellow', 'Purple', 'White', 'Red'], colorsHex: ['#1C1C1E', '#A2E8DD', '#FFE29A', '#D1C6E1', '#FFFFFF', '#BA0C2F'], storages: ['64GB', '128GB', '256GB'], basePrice: 13900, baseStorage: '64GB' }
  ];

  function getPriceForStorage(basePrice, baseStorage, currentStorage) {
    const sizes = ['64GB', '128GB', '256GB', '512GB', '1TB'];
    const idxBase = sizes.indexOf(baseStorage);
    const idxCurr = sizes.indexOf(currentStorage);
    let price = basePrice;
    if (idxCurr > idxBase) {
      for (let i = idxBase + 1; i <= idxCurr; i++) {
        if (sizes[i] === '128GB') price += 2000;
        else if (sizes[i] === '256GB') price += 3000;
        else if (sizes[i] === '512GB') price += 6000;
        else if (sizes[i] === '1TB') price += 8000;
      }
    }
    return price;
  }

  function calcPricing(price) {
    let down = 0;
    let installments = 6;
    if (price < 15000) {
      down = 1900;
    } else if (price < 20000) {
      down = 2900;
    } else if (price < 25000) {
      down = 3900;
    } else if (price < 30000) {
      down = 4900;
    } else if (price < 40000) {
      down = 6900;
    } else if (price < 50000) {
      down = 8900;
      installments = 6;
    } else {
      down = 10900;
      installments = 9;
    }
    const remaining = price - down;
    const monthly = Math.round((remaining / installments) / 10) * 10;
    return { down, monthly, installments };
  }

  const stmt = `INSERT INTO products (brand,model,color,color_hex,storage,price,down_payment,monthly_payment,installments,payment_day,image_path) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;

  specs.forEach(spec => {
    spec.colors.forEach((colName, cIdx) => {
      const colHex = spec.colorsHex[cIdx] || '#888888';
      spec.storages.forEach(storSize => {
        const finalPrice = getPriceForStorage(spec.basePrice, spec.baseStorage, storSize);
        const { down, monthly, installments } = calcPricing(finalPrice);
        db.run(stmt, [
          'Apple',
          spec.model,
          colName,
          colHex,
          storSize,
          finalPrice,
          down,
          monthly,
          installments,
          15, // payment day
          spec.model === 'iPhone 16 Pro Max' ? '/iphone16promax.png' : null
        ]);
      });
    });
  });

  // Seed 5 IMEI per product
  const allP = all('SELECT id FROM products');
  allP.forEach(p => {
    for (let i = 0; i < 5; i++) {
      const imei = String(350000000000000 + p.id * 100 + i).slice(0, 15);
      try { db.run('INSERT OR IGNORE INTO imei_stock (product_id, imei) VALUES (?,?)', [p.id, imei]); } catch(e) {}
    }
  });

  global._dbSave();
  console.log(`✅ Seeded ${allP.length} products`);
}

// ==================== QUERY FUNCTIONS ====================

const getAllProducts = () =>
  all('SELECT id,brand,model,color,color_hex,storage,price,down_payment,monthly_payment,installments,payment_day,image_path FROM products WHERE active=1 ORDER BY brand,model,storage,color');

const getProductById = (id) =>
  get('SELECT * FROM products WHERE id=?', [id]);

const getAvailableIMEI = (productId) =>
  all("SELECT id,imei FROM imei_stock WHERE product_id=? AND status='available' ORDER BY imei", [productId]);

const createOTP = (phone, otp, expiresAt) => {
  run('DELETE FROM otp_sessions WHERE phone=?', [phone]);
  run('INSERT INTO otp_sessions (phone,otp_code,expires_at) VALUES (?,?,?)', [phone, otp, expiresAt]);
};

const verifyOTP = (phone, otp) => {
  const session = get('SELECT * FROM otp_sessions WHERE phone=? AND otp_code=? AND verified=0 ORDER BY created_at DESC LIMIT 1', [phone, otp]);
  if (!session) return { success:false, message:'รหัส OTP ไม่ถูกต้อง' };
  const now = new Date().toISOString();
  if (now > session.expires_at) return { success:false, message:'รหัส OTP หมดอายุแล้ว กรุณาขอใหม่' };
  run('UPDATE otp_sessions SET verified=1 WHERE id=?', [session.id]);
  return { success:true };
};

const insertCustomer = (c) => {
  run(`INSERT INTO customers (name,id_card,birthdate,phone,address,subdistrict,district,province,postal_code,facebook,line_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [c.name,c.id_card,c.birthdate,c.phone,c.address,c.subdistrict,c.district,c.province,c.postal_code,c.facebook,c.line_id]);
  return get('SELECT MAX(id) as id FROM customers').id;
};

const generateContractNo = () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const prefix = `SP${yy}${mm}${dd}`;
  const last = get("SELECT contract_no FROM contracts WHERE contract_no LIKE ? ORDER BY contract_no DESC LIMIT 1", [prefix+'%']);
  const seq  = last ? parseInt(last.contract_no.slice(-4)) + 1 : 1;
  return prefix + String(seq).padStart(4,'0');
};

const insertContract = (contractNo, customerId, productId, customDown = null, customMonthly = null, customInstallments = null, latitude = null, longitude = null) => {
  run('INSERT INTO contracts (contract_no,customer_id,product_id,custom_down_payment,custom_monthly_payment,custom_installments,latitude,longitude) VALUES (?,?,?,?,?,?,?,?)', 
    [contractNo, customerId, productId, customDown, customMonthly, customInstallments, latitude, longitude]);
  return get('SELECT MAX(id) as id FROM contracts').id;
};

const insertDocument = (contractId, docType, filePath) =>
  run('INSERT INTO documents (contract_id,doc_type,file_path) VALUES (?,?,?)', [contractId, docType, filePath]);

const insertSignature = (contractId, signatureData) => {
  run('DELETE FROM signatures WHERE contract_id=?', [contractId]);
  run('INSERT INTO signatures (contract_id,signature_data) VALUES (?,?)', [contractId, signatureData]);
};

const getAllContracts = (status, search) => {
  let q = `SELECT c.id,c.contract_no,c.status,c.created_at,c.approved_at,
                   cu.name as customer_name,cu.phone,
                   p.brand,p.model,p.color,p.storage,p.price,
                   COALESCE(c.custom_down_payment, p.down_payment) as down_payment,
                   COALESCE(c.custom_monthly_payment, p.monthly_payment) as monthly_payment,
                   COALESCE(c.custom_installments, p.installments) as installments,
                   i.imei
            FROM contracts c
            JOIN customers cu ON c.customer_id=cu.id
            JOIN products p ON c.product_id=p.id
            LEFT JOIN imei_stock i ON c.imei_id=i.id
            WHERE 1=1`;
  const params = [];
  if (status && status !== 'all') { q += ' AND c.status=?'; params.push(status); }
  if (search) {
    q += ' AND (cu.name LIKE ? OR c.contract_no LIKE ? OR cu.phone LIKE ?)';
    params.push(`%${search}%`,`%${search}%`,`%${search}%`);
  }
  q += ' ORDER BY c.created_at DESC';
  return all(q, params);
};

const getContractDetail = (id) => {
  const contract = get(`
    SELECT c.*,
           cu.name,cu.id_card,cu.birthdate,cu.phone,cu.address,cu.subdistrict,cu.district,cu.province,cu.postal_code,cu.facebook,cu.line_id,
           p.brand,p.model,p.color,p.color_hex,p.storage,p.price,
           COALESCE(c.custom_down_payment, p.down_payment) as down_payment,
           COALESCE(c.custom_monthly_payment, p.monthly_payment) as monthly_payment,
           COALESCE(c.custom_installments, p.installments) as installments,
           p.payment_day,
           i.imei,s.signature_data
    FROM contracts c
    JOIN customers cu ON c.customer_id=cu.id
    JOIN products p ON c.product_id=p.id
    LEFT JOIN imei_stock i ON c.imei_id=i.id
    LEFT JOIN signatures s ON c.id=s.contract_id
    WHERE c.id=?`, [id]);
  if (!contract) return null;
  contract.documents = all('SELECT * FROM documents WHERE contract_id=?', [id]);
  return contract;
};

const updateContractStatus = (id, status, imeiId, adminNote, customDown = null, customMonthly = null, customInstallments = null) => {
  const approvedAt = status === 'approved' ? new Date().toISOString() : null;
  if (imeiId) {
    const current = get("SELECT imei_id FROM contracts WHERE id=?", [id]);
    if (current && current.imei_id && current.imei_id !== imeiId) {
      run("UPDATE imei_stock SET status='available', contract_id=NULL WHERE id=?", [current.imei_id]);
    }
    run("UPDATE imei_stock SET status='used', contract_id=? WHERE id=?", [id, imeiId]);
  }
  
  // Clean up pricing params to numbers or nulls
  const parsedDown = customDown !== null && !isNaN(customDown) ? Number(customDown) : null;
  const parsedMonthly = customMonthly !== null && !isNaN(customMonthly) ? Number(customMonthly) : null;
  const parsedInstallments = customInstallments !== null && !isNaN(customInstallments) ? Number(customInstallments) : null;

  run(`UPDATE contracts SET 
          status=?, 
          imei_id=CASE WHEN ? IS NOT NULL THEN ? ELSE imei_id END, 
          admin_note=COALESCE(?,admin_note), 
          approved_at=COALESCE(?,approved_at),
          custom_down_payment=CASE WHEN ? IS NOT NULL THEN ? ELSE custom_down_payment END,
          custom_monthly_payment=CASE WHEN ? IS NOT NULL THEN ? ELSE custom_monthly_payment END,
          custom_installments=CASE WHEN ? IS NOT NULL THEN ? ELSE custom_installments END
       WHERE id=?`,
    [
      status, 
      imeiId || null, imeiId || null, 
      adminNote || null, 
      approvedAt,
      parsedDown, parsedDown,
      parsedMonthly, parsedMonthly,
      parsedInstallments, parsedInstallments,
      id
    ]);
};

const getContractsByPhone = (phone) => {
  const cleanPhone = phone.replace(/[-\s]/g, '');
  return all(`
    SELECT c.id, c.contract_no, c.status, c.created_at, c.admin_note, c.payment_slip,
           p.brand, p.model, p.color, p.storage, p.price,
           COALESCE(c.custom_down_payment, p.down_payment) as down_payment,
           COALESCE(c.custom_monthly_payment, p.monthly_payment) as monthly_payment,
           COALESCE(c.custom_installments, p.installments) as installments
    FROM contracts c
    JOIN customers cu ON c.customer_id = cu.id
    JOIN products p ON c.product_id = p.id
    WHERE cu.phone = ? 
       OR REPLACE(REPLACE(cu.phone, '-', ''), ' ', '') = ?
    ORDER BY c.created_at DESC
  `, [phone, cleanPhone]);
};

const updateContractSlip = (contractId, slipPath) => {
  run('UPDATE contracts SET payment_slip = ? WHERE id = ?', [slipPath, contractId]);
};

const getAllIMEI = () =>
  all('SELECT i.*,p.brand,p.model,p.color,p.storage FROM imei_stock i JOIN products p ON i.product_id=p.id ORDER BY p.brand,p.model,i.status,i.imei');

const addIMEI = (productId, imei) =>
  run('INSERT INTO imei_stock (product_id,imei) VALUES (?,?)', [productId, imei]);

const deleteIMEI = (id) =>
  run("DELETE FROM imei_stock WHERE id=? AND status='available'", [id]);

const getStats = () => {
  const total    = Number(get('SELECT COUNT(*) as c FROM contracts').c);
  const pending  = Number(get("SELECT COUNT(*) as c FROM contracts WHERE status='pending'").c);
  const approved = Number(get("SELECT COUNT(*) as c FROM contracts WHERE status='approved'").c);
  const rejected = Number(get("SELECT COUNT(*) as c FROM contracts WHERE status='rejected'").c);
  const revenue  = Number(get("SELECT COALESCE(SUM(COALESCE(c.custom_down_payment, p.down_payment) + COALESCE(c.custom_monthly_payment, p.monthly_payment) * COALESCE(c.custom_installments, p.installments)),0) as t FROM contracts c JOIN products p ON c.product_id=p.id WHERE c.status='approved'").t);
  const availIMEI= Number(get("SELECT COUNT(*) as c FROM imei_stock WHERE status='available'").c);
  const totalIMEI= Number(get("SELECT COUNT(*) as c FROM imei_stock").c);
  return { total,pending,approved,rejected,revenue,availIMEI,totalIMEI };
};

const createAdminSession = (token, expiresAt) =>
  run('INSERT INTO admin_sessions (token,expires_at) VALUES (?,?)', [token, expiresAt]);

const validateAdminToken = (token) => {
  const session = get('SELECT * FROM admin_sessions WHERE token=?', [token]);
  if (!session) return false;
  if (new Date().toISOString() > session.expires_at) {
    run('DELETE FROM admin_sessions WHERE token=?', [token]);
    return false;
  }
  return true;
};

const addProduct = (p) => {
  run(`INSERT INTO products (brand, model, color, color_hex, storage, price, down_payment, monthly_payment, installments, payment_day, image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.brand, p.model, p.color, p.color_hex || '#888888', p.storage, Number(p.price), Number(p.down_payment), Number(p.monthly_payment), Number(p.installments || 6), Number(p.payment_day || 15), p.image_path || null]);
  return get('SELECT MAX(id) as id FROM products').id;
};

const updateProduct = (id, p) => {
  run(`UPDATE products SET 
          brand=?, model=?, color=?, color_hex=?, storage=?, 
          price=?, down_payment=?, monthly_payment=?, installments=?, payment_day=?, image_path=? 
       WHERE id=?`,
    [
      p.brand, 
      p.model, 
      p.color, 
      p.color_hex || '#888888', 
      p.storage, 
      Number(p.price), 
      Number(p.down_payment), 
      Number(p.monthly_payment), 
      Number(p.installments || 6), 
      Number(p.payment_day || 15), 
      p.image_path || null, 
      id
    ]);
};

const deleteProduct = (id) => {
  run("UPDATE products SET active = 0 WHERE id = ?", [id]);
};

const deleteContract = (id) => {
  run("DELETE FROM contracts WHERE id = ?", [id]);
  run("DELETE FROM documents WHERE contract_id = ?", [id]);
  run("DELETE FROM signatures WHERE contract_id = ?", [id]);
  run("DELETE FROM payments WHERE contract_id = ?", [id]);
  firebase.deleteContractFromFirebase(id);
};

const addPayment = (contractId, installmentNo, amount, paymentDate, slipPath = null, note = '') => {
  run(`INSERT INTO payments (contract_id, installment_no, amount, payment_date, slip_path, note) VALUES (?,?,?,?,?,?)`,
    [contractId, installmentNo, amount, paymentDate || new Date().toISOString(), slipPath, note]);
  return get('SELECT MAX(id) as id FROM payments').id;
};

const getContractPayments = (contractId) => {
  return all(`SELECT * FROM payments WHERE contract_id = ? ORDER BY installment_no ASC`, [contractId]);
};

const getPaymentById = (paymentId) => {
  return get(`SELECT p.*, c.contract_no, cu.name as customer_name, cu.phone, pr.model, pr.color 
              FROM payments p 
              JOIN contracts c ON p.contract_id = c.id 
              JOIN customers cu ON c.customer_id = cu.id 
              JOIN products pr ON c.product_id = pr.id 
              WHERE p.id = ?`, [paymentId]);
};

const getDueContracts = () => {
  const contracts = all(`SELECT c.id, c.contract_no, c.created_at, c.status,
                                cu.name as customer_name, cu.phone, cu.line_id, cu.facebook,
                                p.model, p.color, p.storage,
                                COALESCE(c.custom_down_payment, p.down_payment) as down_payment,
                                COALESCE(c.custom_monthly_payment, p.monthly_payment) as monthly_payment,
                                COALESCE(c.custom_installments, p.installments) as installments,
                                c.payment_slip
                         FROM contracts c
                         JOIN customers cu ON c.customer_id = cu.id
                         JOIN products p ON c.product_id = p.id
                         WHERE c.status IN ('pending', 'approved')
                         ORDER BY c.created_at DESC`);
  
  return contracts.map(c => {
    const payDay = new Date(c.created_at.replace(' ', 'T')).getDate();
    const payments = getContractPayments(c.id);
    const paidCount = payments.length;
    const paidTotal = payments.reduce((sum, item) => sum + item.amount, 0);

    return {
      ...c,
      pay_day: payDay,
      paid_count: paidCount,
      paid_total: paidTotal,
      remaining_installments: Math.max(0, c.installments - paidCount)
    };
  });
};

module.exports = {
  init, all,
  getAllProducts, getProductById, getAvailableIMEI,
  createOTP, verifyOTP,
  insertCustomer, insertContract, insertDocument, insertSignature, generateContractNo,
  getAllContracts, getContractDetail, updateContractStatus,
  getContractsByPhone, updateContractSlip,
  getAllIMEI, addIMEI, deleteIMEI,
  getStats,
  createAdminSession, validateAdminToken,
  addProduct, updateProduct, deleteProduct, deleteContract,
  addPayment, getContractPayments, getPaymentById, getDueContracts
};
