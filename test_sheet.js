require('dotenv').config();
const googleSheets = require('../google_sheets');

async function testPush() {
  console.log('Sending test contract to user Google Sheet URL...');
  const result = await googleSheets.sendToGoogleSheet({
    contract_no: 'SP2608030001',
    created_at: new Date().toLocaleString('th-TH'),
    customer: {
      name: 'นาย สมชาย ใจดี (ทดสอบระบบ)',
      phone: '0812345678',
      id_card: '1-4599-00123-45-6'
    },
    model: 'iPhone 16 Pro Max',
    color: 'Titanium Natural',
    storage: '256GB',
    price: 48900,
    custom_down_payment: 8900,
    custom_monthly_payment: 6670,
    custom_installments: 6,
    pay_day: 3,
    status: 'pending'
  });
  console.log('Test Push Result:', result);
}

testPush();
