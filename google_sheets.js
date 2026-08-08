/**
 * google_sheets.js — Google Sheets Real-time Sync Module
 * 
 * Automatically sends new contract data to your Google Sheet via Webhook (Google Apps Script)
 * so staff and owners can view live contracts instantly on their mobile phones!
 */
const axios = require('axios');

async function sendToGoogleSheet(contractData) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('ℹ️  GOOGLE_SHEET_WEBHOOK_URL not configured. Skipping Google Sheet sync.');
    return false;
  }

  try {
    const payload = {
      contract_no:      contractData.contract_no || '',
      created_at:       contractData.created_at || new Date().toLocaleString('th-TH'),
      customer_name:    contractData.customer?.name || contractData.customer_name || '',
      phone:            contractData.customer?.phone || contractData.phone || '',
      id_card:          contractData.customer?.id_card || '',
      model:            contractData.model || contractData.product_name || '',
      color:            contractData.color || '',
      storage:          contractData.storage || '',
      price:            contractData.price || 0,
      down_payment:     contractData.custom_down_payment || contractData.down_payment || 0,
      monthly_payment:  contractData.custom_monthly_payment || contractData.monthly_payment || 0,
      installments:     contractData.custom_installments || contractData.installments || 6,
      pay_day:          contractData.pay_day || new Date().getDate(),
      status:           contractData.status || 'pending',
    };

    console.log(`📊 [Google Sheet Sync] Sending contract ${payload.contract_no} to Google Sheet...`);
    const res = await axios.post(webhookUrl, payload, { timeout: 10000 });
    console.log(`✅ [Google Sheet Sync] Successfully pushed to Google Sheet! Response:`, res.status);
    return true;
  } catch (err) {
    console.error(`⚠️ [Google Sheet Sync Error]:`, err.message);
    return false;
  }
}

module.exports = {
  sendToGoogleSheet
};
