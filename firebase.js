/**
 * firebase.js — Google Firebase Cloud Firestore Connector
 * 
 * Synchronizes contracts, customers, products, and documents to Google Firebase Firestore.
 */
const path = require('path');
const fs = require('fs');

let admin = null;
let db = null;
let isFirebaseConnected = false;

function initFirebase() {
  try {
    admin = require('firebase-admin');
  } catch (e) {
    console.log('ℹ️  firebase-admin package not installed yet. Running in local mode.');
    return false;
  }

  // 1. Check for firebase-service-account.json file
  const keyPath = path.join(__dirname, 'firebase-service-account.json');
  
  if (fs.existsSync(keyPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      db = admin.firestore();
      isFirebaseConnected = true;
      console.log('✅ Google Firebase Cloud Firestore connected via service account file!');
      return true;
    } catch (err) {
      console.error('⚠️  Failed to initialize Firebase from JSON file:', err.message);
    }
  }

  // 2. Check for environment variables in .env
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        })
      });
      db = admin.firestore();
      isFirebaseConnected = true;
      console.log('✅ Google Firebase Cloud Firestore connected via .env environment keys!');
      return true;
    } catch (err) {
      console.error('⚠️  Failed to initialize Firebase from .env:', err.message);
    }
  }

  console.log('ℹ️  Google Firebase is not configured yet. System running smoothly in Local Mode.');
  return false;
}

// Sync helper functions
async function syncContractToFirebase(contractData) {
  if (!isFirebaseConnected || !db) return;
  try {
    const docId = String(contractData.id || contractData.contract_no);
    await db.collection('contracts').doc(docId).set({
      ...contractData,
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log(`☁️ [Firebase Sync] Contract ${contractData.contract_no} synced to Cloud Firestore.`);
  } catch (err) {
    console.error(`⚠️ [Firebase Sync Error] Contract ${contractData.contract_no}:`, err.message);
  }
}

async function syncProductToFirebase(productData) {
  if (!isFirebaseConnected || !db) return;
  try {
    const docId = String(productData.id);
    await db.collection('products').doc(docId).set({
      ...productData,
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log(`☁️ [Firebase Sync] Product ${productData.model} synced to Cloud Firestore.`);
  } catch (err) {
    console.error(`⚠️ [Firebase Sync Error] Product:`, err.message);
  }
}

async function deleteContractFromFirebase(contractId) {
  if (!isFirebaseConnected || !db) return;
  try {
    await db.collection('contracts').doc(String(contractId)).delete();
    console.log(`☁️ [Firebase Sync] Contract ID ${contractId} deleted from Cloud Firestore.`);
  } catch (err) {
    console.error(`⚠️ [Firebase Sync Error] Delete contract:`, err.message);
  }
}

module.exports = {
  initFirebase,
  isConnected: () => isFirebaseConnected,
  getFirestore: () => db,
  syncContractToFirebase,
  syncProductToFirebase,
  deleteContractFromFirebase,
};
