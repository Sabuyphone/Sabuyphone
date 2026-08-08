const db = require('./database');
(async () => {
  await db.init();
  console.log('Contracts raw:', db.all('SELECT * FROM contracts'));
  console.log('Customers raw:', db.all('SELECT * FROM customers'));
  console.log('Products:', db.all('SELECT * FROM products LIMIT 2'));
})();
