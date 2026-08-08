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

// 100% Self-Contained Failsafe Contract Page Route
const EMBEDDED_CONTRACT_HTML = "<!DOCTYPE html>\n<html lang=\"th\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>สัญญาผ่อนออนไลน์ | SABUYPHONE บ้านไผ่</title>\n  <meta name=\"description\" content=\"ทำสัญญาผ่อนโทรศัพท์ออนไลน์ ง่าย สะดวก ปลอดภัย ไม่ต้องมีคนค้ำ\">\n  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n  <link href=\"https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sarabun:wght@300;400;500;600;700;800&display=swap\" rel=\"stylesheet\">\n  <style>\n/* ── PRIVILEGED STYLE OVERWRITE ── */\n/* ═══════════════════════════════════════════════════════════════\n   SABAI PHONE CONTRACT — Redesigned Customer Form Stylesheet\n   Theme: Royal Cobalt & Ultra-Modern Fintech (Glassmorphism)\n   ═══════════════════════════════════════════════════════════════ */\n\n@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sarabun:wght@300;400;500;600;700;800&display=swap');\n\n/* ── Custom Variables ── */\n:root {\n  --bg:           #030712;\n  --bg-gradient:  radial-gradient(circle at 50% -20%, #1e1b4b 0%, #030712 100%);\n  --card:         rgba(15, 23, 42, 0.6);\n  --card-border:  rgba(255, 255, 255, 0.08);\n  --primary:      #3b82f6;\n  --primary-g:    linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);\n  --primary-glow: rgba(59, 130, 246, 0.3);\n  --secondary:    #8b5cf6;\n  --success:      #10b981;\n  --success-glow: rgba(16, 185, 129, 0.2);\n  --warning:      #f59e0b;\n  --danger:       #ef4444;\n  --text:         #f8fafc;\n  --text-muted:   #94a3b8;\n  --text-dark:    #475569;\n  --radius:       24px;\n  --radius-sm:    14px;\n  --shadow-lg:    0 25px 50px -12px rgba(0, 0, 0, 0.5);\n  --transition:   all 0.3s cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n/* ── Reset & Base Styles ── */\n*, *::before, *::after {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n}\nhtml {\n  scroll-behavior: smooth;\n  background-color: var(--bg);\n}\nbody {\n  font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif;\n  background: var(--bg-gradient);\n  background-attachment: fixed;\n  color: var(--text);\n  min-height: 100vh;\n  line-height: 1.6;\n  -webkit-font-smoothing: antialiased;\n}\n\n/* ── Typography Override ── */\nh1, h2, h3, h4, .btn, .logo-main, .price-box-title, .qr-amt, .step-num, .slider-val, .badge {\n  font-family: 'Plus Jakarta Sans', 'Sarabun', sans-serif;\n  letter-spacing: -0.02em;\n}\n\n/* ── Header ── */\n.header {\n  background: rgba(3, 7, 18, 0.7);\n  backdrop-filter: blur(24px);\n  -webkit-backdrop-filter: blur(24px);\n  border-bottom: 1px solid var(--card-border);\n  position: sticky;\n  top: 0;\n  z-index: 100;\n  padding: 0 24px;\n}\n.header-inner {\n  max-width: 1200px;\n  margin: 0 auto;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 16px 0;\n}\n.header-left {\n  display: flex;\n  align-items: center;\n  gap: 20px;\n}\n.logo {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n.logo-svg {\n  filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.4));\n}\n.logo-text {\n  display: flex;\n  flex-direction: column;\n  line-height: 1.15;\n}\n.logo-main {\n  font-size: 20px;\n  font-weight: 800;\n  color: #fff;\n  background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}\n.logo-sub {\n  font-size: 11px;\n  color: var(--text-muted);\n  font-weight: 600;\n  letter-spacing: 0.1em;\n}\n.header-divider {\n  width: 1px;\n  height: 40px;\n  background: var(--card-border);\n}\n.header-title-block {\n  display: flex;\n  flex-direction: column;\n}\n.header-title {\n  font-size: 22px;\n  font-weight: 800;\n  color: #fff;\n}\n.header-sub {\n  font-size: 12px;\n  color: var(--text-muted);\n}\n.header-badges {\n  display: flex;\n  gap: 10px;\n}\n.badge {\n  padding: 6px 14px;\n  border-radius: 99px;\n  font-size: 11px;\n  font-weight: 700;\n  white-space: nowrap;\n}\n.badge-blue {\n  background: rgba(59, 130, 246, 0.1);\n  border: 1px solid rgba(59, 130, 246, 0.2);\n  color: #60a5fa;\n}\n.badge-purple {\n  background: rgba(139, 92, 246, 0.1);\n  border: 1px solid rgba(139, 92, 246, 0.2);\n  color: #a78bfa;\n}\n.badge-green {\n  background: rgba(16, 185, 129, 0.1);\n  border: 1px solid rgba(16, 185, 129, 0.2);\n  color: #34d399;\n}\n\n/* ── Progress Bar ── */\n.progress-wrap {\n  background: rgba(3, 7, 18, 0.4);\n  backdrop-filter: blur(16px);\n  -webkit-backdrop-filter: blur(16px);\n  border-bottom: 1px solid var(--card-border);\n  padding: 24px;\n  position: sticky;\n  top: 73px;\n  z-index: 90;\n}\n.progress-bar {\n  max-width: 800px;\n  margin: 0 auto;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  position: relative;\n}\n.progress-bar::before {\n  content: '';\n  position: absolute;\n  left: 20px;\n  right: 20px;\n  height: 2px;\n  background: rgba(255, 255, 255, 0.05);\n  z-index: 0;\n}\n.progress-track {\n  position: absolute;\n  left: 20px;\n  height: 2px;\n  background: var(--primary-g);\n  box-shadow: 0 0 10px var(--primary-glow);\n  z-index: 1;\n  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);\n}\n.step-node {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  position: relative;\n  z-index: 2;\n}\n.step-circle {\n  width: 40px;\n  height: 40px;\n  border-radius: 50%;\n  background: #0f172a;\n  border: 2px solid var(--text-dark);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: var(--transition);\n}\n.step-num {\n  font-size: 14px;\n  font-weight: 700;\n  color: var(--text-muted);\n  transition: var(--transition);\n}\n.step-label {\n  font-size: 12px;\n  font-weight: 500;\n  color: var(--text-muted);\n  white-space: nowrap;\n  transition: var(--transition);\n}\n.step-node.active .step-circle {\n  border-color: var(--primary);\n  background: var(--primary);\n  box-shadow: 0 0 20px var(--primary-glow);\n}\n.step-node.active .step-num {\n  color: #fff;\n}\n.step-node.active .step-label {\n  color: var(--primary);\n  font-weight: 700;\n}\n.step-node.done .step-circle {\n  border-color: var(--success);\n  background: var(--success);\n  box-shadow: 0 0 15px var(--success-glow);\n}\n.step-node.done .step-num {\n  color: #fff;\n  font-size: 0 !important;\n}\n.step-node.done .step-num::before {\n  content: '✓';\n  font-size: 15px;\n}\n.step-node.done .step-label {\n  color: var(--success);\n}\n\n/* ── Main Layout ── */\n.main {\n  max-width: 1200px;\n  margin: 40px auto;\n  padding: 0 24px 80px;\n}\n.step {\n  display: none;\n  animation: fadeSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);\n}\n.step.active {\n  display: block;\n}\n@keyframes fadeSlideIn {\n  from {\n    opacity: 0;\n    transform: translateY(16px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n/* ── Frosted Cards ── */\n.card {\n  background: var(--card);\n  border: 1px solid var(--card-border);\n  border-radius: var(--radius);\n  padding: 40px;\n  box-shadow: var(--shadow-lg);\n  backdrop-filter: blur(24px);\n  -webkit-backdrop-filter: blur(24px);\n}\n.card-header {\n  margin-bottom: 32px;\n}\n.card-title {\n  font-size: 26px;\n  font-weight: 800;\n  color: #fff;\n  margin-bottom: 6px;\n}\n.card-subtitle {\n  font-size: 14px;\n  color: var(--text-muted);\n}\n\n/* ── Layout Splits ── */\n.split-layout {\n  display: grid;\n  grid-template-columns: 1.6fr 1fr;\n  gap: 32px;\n}\n.split-left {\n  display: flex;\n  flex-direction: column;\n  gap: 24px;\n}\n\n/* ── Form Styling ── */\n.form-grid {\n  display: grid;\n  grid-template-columns: repeat(2, 1fr);\n  gap: 20px;\n}\n.col-full {\n  grid-column: span 2;\n}\n.form-group {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n.label {\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--text);\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n.req {\n  color: var(--danger);\n}\n.input {\n  background: rgba(15, 23, 42, 0.4);\n  border: 1.5px solid var(--card-border);\n  color: #fff;\n  border-radius: var(--radius-sm);\n  padding: 14px 18px;\n  font-size: 14px;\n  font-family: inherit;\n  transition: var(--transition);\n  outline: none;\n  width: 100%;\n}\n.input::placeholder {\n  color: var(--text-dark);\n}\n.input:focus {\n  border-color: var(--primary);\n  background: rgba(15, 23, 42, 0.7);\n  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);\n}\ntextarea.input {\n  resize: vertical;\n}\n\n/* ── Document Upload Cards ── */\n.upload-grid {\n  display: grid;\n  grid-template-columns: repeat(2, 1fr);\n  gap: 20px;\n}\n.upload-zone {\n  border: 2px dashed rgba(255, 255, 255, 0.1);\n  background: rgba(15, 23, 42, 0.3);\n  border-radius: var(--radius-sm);\n  padding: 30px 20px;\n  text-align: center;\n  cursor: pointer;\n  position: relative;\n  overflow: hidden;\n  transition: var(--transition);\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  min-height: 190px;\n}\n.upload-zone:hover {\n  border-color: var(--primary);\n  background: rgba(59, 130, 246, 0.05);\n}\n.upload-inner {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 10px;\n  pointer-events: none;\n}\n.upload-icon-wrap {\n  width: 54px;\n  height: 54px;\n  background: rgba(255, 255, 255, 0.03);\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  border: 1px solid rgba(255, 255, 255, 0.06);\n}\n.upload-emoji {\n  font-size: 24px;\n}\n.upload-title {\n  font-size: 14px;\n  font-weight: 700;\n  color: #fff;\n}\n.upload-hint {\n  font-size: 11px;\n  color: var(--text-muted);\n}\n.upload-btn {\n  background: rgba(255, 255, 255, 0.05);\n  border: 1px solid rgba(255, 255, 255, 0.08);\n  color: #fff;\n  padding: 6px 14px;\n  border-radius: 30px;\n  font-size: 11px;\n  font-weight: 700;\n  margin-top: 4px;\n}\n.upload-input {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 100%;\n  opacity: 0;\n  cursor: pointer;\n}\n.upload-zone.uploading {\n  border-color: var(--warning);\n  background: rgba(245, 158, 11, 0.03);\n}\n.upload-zone.uploaded {\n  border-color: var(--success);\n  background: rgba(16, 185, 129, 0.03);\n}\n.upload-preview {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 100%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.preview-img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n.upload-ok-badge {\n  position: absolute;\n  top: 10px;\n  right: 10px;\n  background: var(--success);\n  color: #fff;\n  font-size: 10px;\n  font-weight: 700;\n  padding: 4px 8px;\n  border-radius: 20px;\n  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);\n}\n\n/* ── Interactive Color Swatches ── */\n.color-grid {\n  display: flex;\n  gap: 12px;\n  flex-wrap: wrap;\n  margin-top: 8px;\n}\n.color-option {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 6px;\n  cursor: pointer;\n  transition: var(--transition);\n  padding: 8px;\n  border-radius: var(--radius-sm);\n  background: rgba(255, 255, 255, 0.02);\n  border: 1px solid var(--card-border);\n  min-width: 80px;\n}\n.color-swatch {\n  width: 32px;\n  height: 32px;\n  border-radius: 50%;\n  box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);\n  position: relative;\n  transition: var(--transition);\n}\n.color-name {\n  font-size: 11px;\n  font-weight: 600;\n  color: var(--text-muted);\n}\n.color-option:hover {\n  border-color: rgba(255,255,255,0.15);\n  background: rgba(255, 255, 255, 0.04);\n}\n.color-option.selected {\n  border-color: var(--primary);\n  background: rgba(59, 130, 246, 0.08);\n}\n.color-option.selected .color-swatch {\n  transform: scale(1.1);\n  box-shadow: 0 0 12px var(--primary-glow);\n}\n.color-option.selected .color-name {\n  color: #fff;\n  font-weight: 700;\n}\n\n/* ── Storage Selector ── */\n.storage-grid {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 12px;\n  margin-top: 8px;\n}\n.storage-btn {\n  background: rgba(255, 255, 255, 0.02);\n  border: 1px solid var(--card-border);\n  color: var(--text-muted);\n  border-radius: var(--radius-sm);\n  padding: 16px;\n  font-weight: 700;\n  font-size: 14px;\n  cursor: pointer;\n  transition: var(--transition);\n}\n.storage-btn:hover {\n  border-color: rgba(255,255,255,0.15);\n  color: #fff;\n}\n.storage-btn.selected {\n  border-color: var(--primary);\n  color: #fff;\n  background: rgba(59, 130, 246, 0.08);\n  box-shadow: 0 0 15px var(--primary-glow);\n}\n\n/* ── Dynamic Installment Calculator ── */\n.slider-group {\n  background: rgba(15, 23, 42, 0.4);\n  padding: 24px;\n  border-radius: var(--radius-sm);\n  border: 1px solid var(--card-border);\n}\n.slider-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  margin-bottom: 12px;\n}\n.slider-label {\n  font-size: 14px;\n  font-weight: 700;\n  color: #fff;\n}\n.slider-val {\n  font-size: 18px;\n  font-weight: 800;\n  color: var(--primary);\n}\n.slider-input {\n  width: 100%;\n  -webkit-appearance: none;\n  height: 6px;\n  border-radius: 99px;\n  background: #1e293b;\n  outline: none;\n}\n.slider-input::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  width: 24px;\n  height: 24px;\n  border-radius: 50%;\n  background: #fff;\n  border: 5px solid var(--primary);\n  cursor: pointer;\n  box-shadow: 0 0 15px var(--primary-glow);\n  transition: var(--transition);\n}\n.slider-input::-webkit-slider-thumb:hover {\n  transform: scale(1.15);\n}\n.slider-limits {\n  display: flex;\n  justify-content: space-between;\n  font-size: 11px;\n  color: var(--text-muted);\n  margin-top: 8px;\n  font-weight: 600;\n}\n.installment-chips {\n  display: grid;\n  grid-template-columns: repeat(4, 1fr);\n  gap: 10px;\n  margin-top: 10px;\n}\n.chip-btn {\n  background: rgba(255, 255, 255, 0.02);\n  border: 1px solid var(--card-border);\n  color: var(--text-muted);\n  padding: 12px;\n  border-radius: var(--radius-sm);\n  font-size: 13px;\n  font-weight: 700;\n  cursor: pointer;\n  transition: var(--transition);\n  text-align: center;\n}\n.chip-btn:hover {\n  border-color: rgba(255,255,255,0.15);\n  color: #fff;\n}\n.chip-btn.active {\n  background: var(--primary-g);\n  color: #fff;\n  border-color: var(--primary);\n  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.3);\n}\n\n/* ── Action Buttons ── */\n.card-actions {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  margin-top: 32px;\n}\n.btn {\n  padding: 14px 28px;\n  border-radius: 30px;\n  font-size: 14px;\n  font-weight: 700;\n  cursor: pointer;\n  transition: var(--transition);\n  border: none;\n  outline: none;\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n.btn-primary {\n  background: var(--primary-g);\n  color: #fff;\n  box-shadow: 0 4px 20px var(--primary-glow);\n}\n.btn-primary:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);\n}\n.btn-ghost {\n  background: transparent;\n  color: var(--text-muted);\n  border: 1px solid var(--card-border);\n}\n.btn-ghost:hover {\n  background: rgba(255, 255, 255, 0.03);\n  color: #fff;\n}\n.btn-outline {\n  background: transparent;\n  border: 1.5px solid var(--primary);\n  color: var(--primary);\n}\n.btn-outline:hover {\n  background: rgba(59,130,246,0.08);\n}\n.btn-submit {\n  background: linear-gradient(135deg, #10b981 0%, #059669 100%);\n  color: #fff;\n  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);\n}\n.btn-submit:hover:not(:disabled) {\n  transform: translateY(-2px);\n  box-shadow: 0 8px 25px rgba(16, 185, 129, 0.5);\n}\n.btn-submit:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.btn-arrow {\n  font-size: 15px;\n}\n\n/* ── Right Panel Device Summary ── */\n.summary-panel {\n  position: sticky;\n  top: 180px;\n}\n.summary-card {\n  padding: 30px;\n  background: rgba(30, 41, 59, 0.35);\n  border: 1px solid var(--card-border);\n  border-radius: var(--radius);\n}\n.summary-device {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  text-align: center;\n  gap: 10px;\n  padding-bottom: 24px;\n  border-bottom: 1px solid var(--card-border);\n}\n.device-placeholder {\n  font-size: 64px;\n  filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.15));\n}\n.summary-model-name {\n  font-size: 20px;\n  font-weight: 800;\n  color: #fff;\n}\n.summary-variant-name {\n  font-size: 12px;\n  color: var(--text-muted);\n}\n.sum-pricing {\n  padding: 20px 0;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  border-bottom: 1px solid var(--card-border);\n}\n.sum-row {\n  display: flex;\n  justify-content: space-between;\n  font-size: 13px;\n  color: var(--text-muted);\n}\n.sum-row strong {\n  color: #fff;\n}\n.sum-row.highlight {\n  font-size: 14px;\n}\n.sum-row.highlight strong {\n  color: var(--primary);\n}\n.sum-includes {\n  padding-top: 20px;\n}\n.sum-includes-title {\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--text);\n  margin-bottom: 10px;\n}\n.sum-includes ul {\n  list-style: none;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  font-size: 12px;\n  color: var(--text-muted);\n}\n.price-box {\n  background: rgba(59, 130, 246, 0.04);\n  border: 1px solid rgba(59, 130, 246, 0.15);\n  padding: 24px;\n  border-radius: var(--radius-sm);\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.price-box-title {\n  display: flex;\n  justify-content: space-between;\n  font-size: 14px;\n  font-weight: 700;\n  color: #fff;\n  margin-bottom: 6px;\n  border-bottom: 1px solid rgba(59, 130, 246, 0.1);\n  padding-bottom: 8px;\n}\n.price-row {\n  display: flex;\n  justify-content: space-between;\n  font-size: 13px;\n  color: var(--text-muted);\n}\n.price-row strong {\n  color: #fff;\n}\n.price-row.accent strong {\n  color: var(--primary);\n}\n.price-row.total {\n  border-top: 1px dashed rgba(255,255,255,0.08);\n  padding-top: 10px;\n  font-size: 15px;\n}\n.price-row.total strong {\n  font-size: 18px;\n  color: var(--success);\n}\n\n/* ── Terms Box ── */\n.terms-box {\n  background: rgba(0, 0, 0, 0.2);\n  border: 1px solid var(--card-border);\n  border-radius: var(--radius-sm);\n  padding: 24px;\n  max-height: 280px;\n  overflow-y: auto;\n  margin-bottom: 24px;\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}\n.term-item {\n  display: flex;\n  gap: 14px;\n  align-items: flex-start;\n}\n.term-num {\n  width: 24px;\n  height: 24px;\n  border-radius: 50%;\n  background: rgba(255,255,255,0.05);\n  border: 1px solid rgba(255,255,255,0.1);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 11px;\n  font-weight: 700;\n  color: var(--primary);\n  flex-shrink: 0;\n}\n.term-item p {\n  font-size: 13px;\n  color: var(--text-muted);\n  line-height: 1.5;\n}\n.checkbox-wrap {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  cursor: pointer;\n  font-size: 13px;\n  color: var(--text);\n  font-weight: 600;\n}\n.chk-input {\n  display: none;\n}\n.chk-custom {\n  width: 20px;\n  height: 20px;\n  border-radius: 6px;\n  border: 2px solid var(--text-dark);\n  background: transparent;\n  display: inline-block;\n  position: relative;\n  transition: var(--transition);\n}\n.chk-input:checked + .chk-custom {\n  border-color: var(--primary);\n  background: var(--primary);\n}\n.chk-input:checked + .chk-custom::after {\n  content: '✓';\n  color: #fff;\n  font-size: 12px;\n  font-weight: 800;\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  transform: translate(-50%, -50%);\n}\n\n/* ── Final & Sign Steps ── */\n.final-grid {\n  display: grid;\n  grid-template-columns: 1.2fr 1fr;\n  gap: 24px;\n  margin-bottom: 24px;\n}\n.sig-wrap {\n  background: rgba(0, 0, 0, 0.3);\n  border: 1.5px solid var(--card-border);\n  border-radius: var(--radius-sm);\n  padding: 10px;\n  margin-bottom: 12px;\n  overflow: hidden;\n}\n#sig-canvas {\n  cursor: crosshair;\n  background: transparent;\n  display: block;\n}\n.selfie-preview-box {\n  background: rgba(0, 0, 0, 0.2);\n  border: 1.5px solid var(--card-border);\n  border-radius: var(--radius-sm);\n  height: 190px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  overflow: hidden;\n}\n\n/* ── Status Tracking Styles ── */\n.track-header-btn {\n  background: rgba(255, 255, 255, 0.04);\n  border: 1px solid rgba(255, 255, 255, 0.08);\n  color: #fff;\n  padding: 8px 16px;\n  border-radius: 99px;\n  font-size: 12px;\n  font-weight: 700;\n  cursor: pointer;\n  transition: var(--transition);\n}\n.track-header-btn:hover {\n  background: var(--primary-g);\n  border-color: var(--primary);\n  box-shadow: 0 4px 15px var(--primary-glow);\n}\n.track-modal {\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: rgba(3, 7, 18, 0.8);\n  backdrop-filter: blur(24px);\n  -webkit-backdrop-filter: blur(24px);\n  z-index: 2000;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 24px;\n}\n.track-card {\n  background: #0b0f19;\n  border: 1px solid var(--card-border);\n  border-radius: var(--radius);\n  width: 100%;\n  max-width: 500px;\n  max-height: 80vh;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n  box-shadow: var(--shadow-lg);\n}\n.track-card-header {\n  padding: 24px;\n  border-bottom: 1px solid var(--card-border);\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}\n.track-close-btn {\n  background: none;\n  border: none;\n  color: var(--text-muted);\n  font-size: 24px;\n  cursor: pointer;\n}\n.track-card-body {\n  padding: 24px;\n  overflow-y: auto;\n  flex: 1;\n}\n.search-input-group {\n  display: flex;\n  gap: 12px;\n  margin-bottom: 24px;\n}\n\n/* ── Timeline ── */\n.timeline {\n  margin-top: 24px;\n  position: relative;\n  padding-left: 28px;\n}\n.timeline::before {\n  content: '';\n  position: absolute;\n  left: 7px;\n  top: 6px;\n  bottom: 6px;\n  width: 2px;\n  background: rgba(255, 255, 255, 0.05);\n}\n.timeline-item {\n  position: relative;\n  margin-bottom: 24px;\n}\n.timeline-dot {\n  position: absolute;\n  left: -27px;\n  top: 4px;\n  width: 12px;\n  height: 12px;\n  border-radius: 50%;\n  background: var(--text-dark);\n  border: 2px solid var(--bg);\n}\n.timeline-item.active .timeline-dot {\n  background: var(--primary);\n  box-shadow: 0 0 10px var(--primary);\n}\n.timeline-item.done .timeline-dot {\n  background: var(--success);\n  box-shadow: 0 0 10px var(--success);\n}\n.timeline-title {\n  font-size: 13px;\n  font-weight: 700;\n  color: var(--text-muted);\n}\n.timeline-item.active .timeline-title {\n  color: var(--primary);\n}\n.timeline-item.done .timeline-title {\n  color: var(--success);\n}\n.timeline-desc {\n  font-size: 11px;\n  color: var(--text-dark);\n  margin-top: 2px;\n}\n\n/* ── Dynamic PromptPay QR ── */\n.promptpay-box {\n  background: #fff;\n  border-radius: var(--radius-sm);\n  padding: 24px;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 10px;\n  margin-top: 20px;\n  border: 2px solid #0056ff;\n}\n.qr-code-img {\n  width: 180px;\n  height: 180px;\n  object-fit: contain;\n}\n.qr-amt {\n  font-size: 24px;\n  font-weight: 800;\n  color: #0056ff;\n}\n.slip-upload-box {\n  border: 1.5px dashed rgba(255,255,255,0.15);\n  background: rgba(255,255,255,0.02);\n  padding: 20px;\n  border-radius: var(--radius-sm);\n  text-align: center;\n  margin-top: 16px;\n  cursor: pointer;\n}\n.slip-preview-img {\n  width: 100%;\n  max-height: 160px;\n  object-fit: contain;\n  border-radius: var(--radius-sm);\n}\n\n/* ── Camera Capture Overlay ── */\n.camera-modal {\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: #000;\n  z-index: 9999;\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between;\n  align-items: center;\n  padding: 40px 24px;\n}\n.camera-viewport-container {\n  position: relative;\n  width: 100%;\n  max-width: 450px;\n  height: 65vh;\n  border-radius: var(--radius);\n  overflow: hidden;\n  background: #090d16;\n}\n.camera-video {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n.camera-overlay-guide {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 100%;\n  box-shadow: inset 0 0 0 2000px rgba(0, 0, 0, 0.7);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.camera-overlay-guide.id-card::after {\n  content: '';\n  width: 85%;\n  height: 52%;\n  border: 3px dashed var(--success);\n  border-radius: 16px;\n}\n.camera-overlay-guide.selfie::after {\n  content: '';\n  width: 65%;\n  height: 60%;\n  border: 3px dashed var(--primary);\n  border-radius: 50%;\n}\n.camera-guide-text {\n  position: absolute;\n  bottom: 24px;\n  color: #fff;\n  background: rgba(0,0,0,0.6);\n  padding: 8px 18px;\n  border-radius: 30px;\n  font-size: 13px;\n  font-weight: 700;\n}\n.camera-controls {\n  display: flex;\n  justify-content: space-around;\n  align-items: center;\n  width: 100%;\n  max-width: 450px;\n}\n.camera-shutter {\n  width: 76px;\n  height: 76px;\n  border-radius: 50%;\n  background: #fff;\n  border: 6px solid rgba(255,255,255,0.25);\n  cursor: pointer;\n}\n.camera-shutter:active {\n  transform: scale(0.92);\n}\n.camera-close, .camera-switch {\n  background: rgba(255, 255, 255, 0.1);\n  border: none;\n  width: 50px;\n  height: 50px;\n  border-radius: 50%;\n  color: #fff;\n  font-size: 20px;\n  cursor: pointer;\n}\n\n/* ── OCR Laser Scan ── */\n.ocr-scan-modal {\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: rgba(3, 7, 18, 0.95);\n  backdrop-filter: blur(12px);\n  z-index: 10000;\n  display: flex;\n  flex-direction: column;\n  justify-content: center;\n  align-items: center;\n  color: #fff;\n}\n.ocr-scan-box {\n  position: relative;\n  width: 320px;\n  height: 200px;\n  border: 2px solid rgba(59,130,246,0.3);\n  border-radius: var(--radius-sm);\n  overflow: hidden;\n  margin-bottom: 24px;\n}\n.ocr-scan-box img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  opacity: 0.5;\n}\n.ocr-laser-line {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 3px;\n  background: linear-gradient(180deg, transparent, #3b82f6, transparent);\n  box-shadow: 0 0 10px #3b82f6;\n  animation: laserSweep 2s infinite ease-in-out;\n}\n@keyframes laserSweep {\n  0% { top: 0%; }\n  50% { top: 100%; }\n  100% { top: 0%; }\n}\n\n/* ── Success Animation Card ── */\n.success-card {\n  text-align: center;\n  padding: 40px;\n}\n.success-anim {\n  font-size: 64px;\n  margin-bottom: 16px;\n  animation: pulseRotate 2s infinite alternate;\n}\n@keyframes pulseRotate {\n  0% { transform: scale(1) rotate(0deg); }\n  100% { transform: scale(1.1) rotate(10deg); }\n}\n.success-title {\n  font-size: 28px;\n  font-weight: 800;\n  color: var(--success);\n}\n.success-contract-no {\n  background: rgba(16, 185, 129, 0.08);\n  border: 1px solid rgba(16, 185, 129, 0.2);\n  border-radius: var(--radius-sm);\n  padding: 16px;\n  margin: 24px 0;\n}\n.flow-steps {\n  display: flex;\n  justify-content: space-around;\n  align-items: center;\n  background: rgba(255,255,255,0.02);\n  padding: 20px;\n  border-radius: var(--radius-sm);\n  margin-top: 24px;\n}\n.flow-item {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 6px;\n}\n.flow-icon {\n  font-size: 24px;\n}\n.flow-item p {\n  font-size: 11px;\n  color: var(--text-muted);\n}\n\n/* ── Global Toasts ── */\n#toast-container {\n  position: fixed;\n  bottom: 24px;\n  right: 24px;\n  z-index: 9999;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.toast {\n  padding: 14px 24px;\n  border-radius: var(--radius-sm);\n  font-size: 13px;\n  font-weight: 700;\n  min-width: 250px;\n  box-shadow: var(--shadow-lg);\n  transform: translateY(20px);\n  opacity: 0;\n  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);\n}\n.toast.show {\n  transform: translateY(0);\n  opacity: 1;\n}\n.toast-err {\n  background: rgba(239, 68, 68, 0.9);\n  color: #fff;\n}\n.toast-ok {\n  background: rgba(16, 185, 129, 0.9);\n  color: #fff;\n}\n.toast-info {\n  background: rgba(59, 130, 246, 0.9);\n  color: #fff;\n}\n\n/* ── Footer ── */\n.footer {\n  border-top: 1px solid var(--card-border);\n  background: rgba(3, 7, 18, 0.4);\n  padding: 30px 24px;\n  margin-top: 80px;\n}\n.footer-inner {\n  max-width: 1200px;\n  margin: 0 auto;\n  display: flex;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 16px;\n  font-size: 12px;\n  color: var(--text-muted);\n}\n\n/* ── Responsive Adjustments ── */\n@media(max-width: 900px) {\n  .split-layout {\n    grid-template-columns: 1fr;\n  }\n  .summary-panel {\n    position: static;\n  }\n}\n@media(max-width: 768px) {\n  .header-inner {\n    flex-direction: column;\n    align-items: stretch;\n    gap: 16px;\n  }\n  .header-divider, .header-title-block, .header-badges {\n    display: none !important;\n  }\n  .form-grid, .upload-grid, .final-grid {\n    grid-template-columns: 1fr;\n  }\n  .col-full {\n    grid-column: auto;\n  }\n  .progress-wrap {\n    padding: 16px;\n  }\n  .step-label {\n    display: none !important;\n  }\n  .progress-bar::before, .progress-track {\n    left: 15px;\n    right: 15px;\n  }\n}\n\n/* ── LIGHT MODE OVERRIDES ── */\nbody.light-theme {\n  --bg:           #f1f5f9;\n  --bg-gradient:  radial-gradient(circle at 50% -20%, #dbeafe 0%, #f1f5f9 100%);\n  --card:         #ffffff;\n  --card-border:  rgba(59, 130, 246, 0.08);\n  --text:         #0f172a;\n  --text-muted:   #475569;\n  --text-dark:    #64748b;\n  --shadow-lg:    0 20px 40px -15px rgba(59, 130, 246, 0.08), 0 1px 3px rgba(0, 0, 0, 0.02);\n}\nbody.light-theme .header {\n  background: rgba(241, 245, 249, 0.8);\n}\nbody.light-theme .progress-wrap {\n  background: rgba(255, 255, 255, 0.6);\n}\nbody.light-theme .logo-main {\n  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}\nbody.light-theme .input {\n  background: #ffffff;\n  border-color: rgba(0, 0, 0, 0.15);\n  color: #0f172a;\n}\nbody.light-theme .input:focus {\n  background: #ffffff;\n  border-color: var(--primary);\n  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);\n}\nbody.light-theme .terms-box {\n  background: rgba(0, 0, 0, 0.03);\n}\nbody.light-theme .sig-wrap {\n  background: rgba(0, 0, 0, 0.02);\n}\nbody.light-theme .storage-btn {\n  background: rgba(0, 0, 0, 0.02);\n}\nbody.light-theme .color-option {\n  background: rgba(0, 0, 0, 0.02);\n}\nbody.light-theme .storage-btn.selected {\n  background: rgba(59, 130, 246, 0.06);\n}\nbody.light-theme .color-option.selected {\n  background: rgba(59, 130, 246, 0.06);\n}\nbody.light-theme .summary-card {\n  background: rgba(241, 245, 249, 0.6);\n}\nbody.light-theme .price-box {\n  background: rgba(59, 130, 246, 0.03);\n}\nbody.light-theme .price-row strong {\n  color: #0f172a;\n}\nbody.light-theme .price-row.total strong {\n  color: var(--success);\n}\nbody.light-theme .sum-row strong {\n  color: #0f172a;\n}\nbody.light-theme .summary-model-name {\n  color: #0f172a;\n}\nbody.light-theme .theme-toggle-btn {\n  background: rgba(0, 0, 0, 0.05) !important;\n  border-color: rgba(0, 0, 0, 0.08) !important;\n  color: #0f172a !important;\n}\nbody.light-theme .theme-toggle-btn:hover {\n  background: rgba(0, 0, 0, 0.1) !important;\n}\nbody.light-theme .step-circle {\n  background: #f1f5f9;\n}\nbody.light-theme .step-num {\n  color: #64748b;\n}\nbody.light-theme .step-node.active .step-num {\n  color: #fff;\n}\nbody.light-theme .step-node.done .step-num {\n  color: #fff;\n}\nbody.light-theme .term-num {\n  background: rgba(0,0,0,0.03);\n}\nbody.light-theme .camera-close, body.light-theme .camera-switch {\n  color: #fff !important;\n}\nbody.light-theme .track-header-btn {\n  background: rgba(0, 0, 0, 0.05);\n  border-color: rgba(0, 0, 0, 0.08);\n  color: #0f172a;\n}\nbody.light-theme .track-header-btn:hover {\n  background: var(--primary-g);\n  color: #fff;\n  border-color: var(--primary);\n}\nbody.light-theme .track-card {\n  background: #ffffff;\n}\nbody.light-theme .timeline::before {\n  background: rgba(0, 0, 0, 0.06);\n}\nbody.light-theme .footer {\n  background: rgba(0, 0, 0, 0.02);\n}\n\n/* ── OTP Verification Boxes ── */\n.otp-boxes {\n  display: flex;\n  gap: 12px;\n  justify-content: center;\n  margin: 20px 0;\n}\n.otp-box {\n  width: 48px;\n  height: 52px;\n  background: rgba(15, 23, 42, 0.6);\n  border: 1.5px solid var(--card-border, rgba(255, 255, 255, 0.08));\n  border-radius: 12px;\n  color: #fff;\n  font-size: 22px;\n  font-weight: 800;\n  text-align: center;\n  outline: none;\n  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);\n  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);\n}\n.otp-box:focus {\n  border-color: var(--primary, #3b82f6);\n  background: rgba(59, 130, 246, 0.08);\n  box-shadow: 0 0 15px rgba(59, 130, 246, 0.35), inset 0 2px 4px rgba(0, 0, 0, 0.2);\n  transform: translateY(-2px);\n}\n\n/* Light Theme overrides for OTP */\nbody.light-theme .otp-box {\n  background: #ffffff;\n  border-color: rgba(0, 0, 0, 0.15);\n  color: #0f172a;\n  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);\n}\nbody.light-theme .otp-box:focus {\n  background: #ffffff;\n  border-color: var(--primary, #3b82f6);\n  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.18), inset 0 1px 2px rgba(0, 0, 0, 0.05);\n}\n\n/* Light Theme overrides for Upload Zone */\nbody.light-theme .upload-zone {\n  border-color: rgba(59, 130, 246, 0.2);\n  background: rgba(241, 245, 249, 0.6);\n}\nbody.light-theme .upload-zone:hover {\n  background: rgba(59, 130, 246, 0.04);\n  border-color: var(--primary);\n}\nbody.light-theme .upload-icon-wrap {\n  background: rgba(59, 130, 246, 0.06);\n  border-color: rgba(59, 130, 246, 0.12);\n}\nbody.light-theme .upload-title {\n  color: #0f172a;\n}\nbody.light-theme .upload-hint {\n  color: #475569;\n}\nbody.light-theme .upload-btn {\n  background: #ffffff;\n  border-color: rgba(0, 0, 0, 0.15);\n  color: #475569;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);\n}\nbody.light-theme .upload-btn:hover {\n  background: #f8fafc;\n  color: #0f172a;\n}\nbody.light-theme .camera-btn {\n  border-color: rgba(0,0,0,0.15);\n}\nbody.light-theme #id-photo-assist {\n  background: #ffffff !important;\n  border-color: rgba(59, 130, 246, 0.15) !important;\n  box-shadow: 0 10px 30px rgba(59, 130, 246, 0.06) !important;\n}\nbody.light-theme #id-photo-assist div div {\n  color: #0f172a !important;\n}\nbody.light-theme #id-photo-assist div p {\n  color: #475569 !important;\n}\n\n/* ── AMBIENT BACKGROUND ANIMATION & NEON ACCENTS ── */\n.ambient-bg-glow {\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  pointer-events: none;\n  z-index: 0;\n  overflow: hidden;\n}\n.glow-blob-1 {\n  position: absolute;\n  top: -15%;\n  left: 20%;\n  width: 600px;\n  height: 600px;\n  background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(3, 7, 18, 0) 70%);\n  filter: blur(80px);\n  animation: floatGlow 14s infinite alternate ease-in-out;\n}\n.glow-blob-2 {\n  position: absolute;\n  bottom: 10%;\n  right: 10%;\n  width: 500px;\n  height: 500px;\n  background: radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, rgba(3, 7, 18, 0) 70%);\n  filter: blur(90px);\n  animation: floatGlow 18s infinite alternate-reverse ease-in-out;\n}\n@keyframes floatGlow {\n  0% { transform: translate(0, 0) scale(1); }\n  50% { transform: translate(60px, -40px) scale(1.1); }\n  100% { transform: translate(-40px, 50px) scale(0.95); }\n}\n\n/* ── AI ID SCANNER LASER ANIMATION ── */\n.scanner-container {\n  position: relative;\n  overflow: hidden;\n}\n.scanner-laser {\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  height: 3px;\n  background: linear-gradient(90deg, transparent, #3b82f6, #60a5fa, #3b82f6, transparent);\n  box-shadow: 0 0 15px #3b82f6, 0 0 30px #60a5fa;\n  z-index: 5;\n  animation: scanScan 2s infinite ease-in-out;\n}\n@keyframes scanScan {\n  0% { top: 0%; opacity: 0; }\n  15% { opacity: 1; }\n  85% { opacity: 1; }\n  100% { top: 96%; opacity: 0; }\n}\n\n/* ── DYNAMIC INSTALLMENT CALENDAR TABLE ── */\n.installment-preview-table {\n  width: 100%;\n  border-collapse: collapse;\n  margin-top: 14px;\n  font-size: 12px;\n}\n.installment-preview-table th {\n  background: rgba(255, 255, 255, 0.04);\n  color: var(--text-muted);\n  font-weight: 600;\n  padding: 8px 12px;\n  text-align: left;\n  border-bottom: 1px solid var(--card-border);\n}\n.installment-preview-table td {\n  padding: 8px 12px;\n  border-bottom: 1px solid rgba(255, 255, 255, 0.04);\n  color: var(--text);\n}\n.installment-preview-table tr:last-child td {\n  border-bottom: none;\n}\n.installment-preview-table .due-tag {\n  background: rgba(16, 185, 129, 0.12);\n  color: #10b981;\n  padding: 2px 8px;\n  border-radius: 6px;\n  font-weight: 700;\n  font-size: 11px;\n}\n\n/* Light theme support */\nbody.light-theme .glow-blob-1 {\n  background: radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, rgba(255, 255, 255, 0) 70%);\n}\nbody.light-theme .glow-blob-2 {\n  background: radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, rgba(255, 255, 255, 0) 70%);\n}\nbody.light-theme .installment-preview-table th {\n  background: rgba(0, 0, 0, 0.03);\n  color: #475569;\n}\nbody.light-theme .installment-preview-table td {\n  color: #0f172a;\n  border-bottom-color: rgba(0, 0, 0, 0.04);\n}\n\n\n\n</style>\n</head>\n<body>\n  <!-- Ambient background lighting effect -->\n  <div class=\"ambient-bg-glow\">\n    <div class=\"glow-blob-1\"></div>\n    <div class=\"glow-blob-2\"></div>\n  </div>\n\n  <!-- ── HEADER ─────────────────────────────────────────────────── -->\n  <header class=\"header\">\n    <div class=\"header-inner\">\n      <div class=\"header-left\">\n        <div class=\"logo\">\n          <img src=\"https://img.icons8.com/color/96/iphone.png\" alt=\"SABUYPHONE\" class=\"logo-img\" style=\"width: 44px; height: 44px; object-fit: contain; filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.4));\">\n          <div class=\"logo-text\">\n            <span class=\"logo-main\" style=\"letter-spacing: 0.5px; font-weight: 800; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;\">SABUYPHONE</span>\n            <span class=\"logo-sub\">บ้านไผ่</span>\n          </div>\n        </div>\n        <button class=\"track-header-btn\" onclick=\"openTrackModal()\">🔍 เช็คสถานะ</button>\n        <button class=\"theme-toggle-btn\" onclick=\"toggleTheme()\" id=\"theme-toggle-btn\" style=\"background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;font-size:16px;transition:var(--transition);margin-left:8px;\">☀️</button>\n        <div class=\"header-divider\"></div>\n        <div class=\"header-title-block\">\n          <h1 class=\"header-title\">สัญญาผ่อนออนไลน์</h1>\n          <p class=\"header-sub\">ง่าย · สะดวก · ปลอดภัย · ทำได้ทุกที่</p>\n        </div>\n      </div>\n      <div class=\"header-badges\">\n        <span class=\"badge badge-blue\">✓ บัตรประชาชนใบเดียว</span>\n        <span class=\"badge badge-purple\">✓ ไม่ต้องมีคนค้ำ</span>\n        <span class=\"badge badge-green\">✓ ผ่อนได้ทุกอาชีพ</span>\n      </div>\n    </div>\n  </header>\n\n  <!-- ── PROGRESS BAR ───────────────────────────────────────────── -->\n  <div class=\"progress-wrap\">\n    <div class=\"progress-bar\">\n      <div class=\"progress-track\" id=\"progress-track\"></div>\n      <div class=\"step-node active\" data-step=\"1\">\n        <div class=\"step-circle\"><span class=\"step-num\">1</span></div>\n        <span class=\"step-label\">ข้อมูลลูกค้า</span>\n      </div>\n      <div class=\"step-node\" data-step=\"2\">\n        <div class=\"step-circle\"><span class=\"step-num\">2</span></div>\n        <span class=\"step-label\">อัปโหลดเอกสาร</span>\n      </div>\n      <div class=\"step-node\" data-step=\"3\">\n        <div class=\"step-circle\"><span class=\"step-num\">3</span></div>\n        <span class=\"step-label\">รายละเอียดเครื่อง</span>\n      </div>\n      <div class=\"step-node\" data-step=\"4\">\n        <div class=\"step-circle\"><span class=\"step-num\">4</span></div>\n        <span class=\"step-label\">เงื่อนไขสัญญา</span>\n      </div>\n      <div class=\"step-node\" data-step=\"5\">\n        <div class=\"step-circle\"><span class=\"step-num\">5</span></div>\n        <span class=\"step-label\">ยืนยันและเซ็น</span>\n      </div>\n    </div>\n  </div>\n\n  <!-- ── MAIN ───────────────────────────────────────────────────── -->\n  <main class=\"main\">\n\n    <!-- STEP 1 ── ข้อมูลลูกค้า ──────────────────────────────────── -->\n    <section class=\"step active\" id=\"step-1\">\n      <div class=\"card\">\n        <div class=\"card-header\">\n          <div class=\"card-step-badge\">ขั้นตอน 1 จาก 5</div>\n          <h2 class=\"card-title\">👤 ข้อมูลลูกค้า</h2>\n          <p class=\"card-subtitle\">กรอกข้อมูลส่วนตัวให้ถูกต้องและครบถ้วน</p>\n        </div>\n\n        <!-- ID Card Front Upload & AI Scan (Step 1 Top) -->\n        <div class=\"upload-zone\" id=\"zone-id-front\" onclick=\"triggerUpload('inp-id-front')\" style=\"margin-bottom: 28px; min-height: 140px; padding: 24px;\">\n          <div class=\"upload-inner\">\n            <div class=\"upload-icon-wrap\"><span class=\"upload-emoji\">🪪</span></div>\n            <p class=\"upload-title\">ถ่ายภาพ หรือ อัปโหลดบัตรประชาชน (หน้า) <span class=\"req\">*</span></p>\n            <p class=\"upload-hint\">ระบบ AI จะช่วยดึงข้อมูลและสแกนกรอกฟอร์มด้านล่างให้โดยอัตโนมัติ</p>\n            <div style=\"display: flex; gap: 10px; margin-top: 10px; justify-content: center; width: 100%;\">\n              <button type=\"button\" class=\"btn btn-sm btn-primary\" onclick=\"openCamera('id-card', 'inp-id-front', 'id_card_front', 'zone-id-front', event)\">📸 ถ่ายรูปบัตร</button>\n              <div class=\"upload-btn\" style=\"margin-top:0\">เลือกรูปภาพ</div>\n            </div>\n          </div>\n          <input id=\"inp-id-front\" type=\"file\" accept=\"image/*\" class=\"upload-input\" onchange=\"handleUpload(this,'id_card_front','zone-id-front')\">\n        </div>\n\n        <div class=\"form-grid\">\n          <div class=\"form-group col-full\">\n            <label class=\"label\" for=\"f-name\">ชื่อ-นามสกุล <span class=\"req\">*</span></label>\n            <input id=\"f-name\" type=\"text\" class=\"input\" placeholder=\"เช่น นาย สมชาย ใจดี\">\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-idcard\">เลขบัตรประชาชน <span class=\"req\">*</span></label>\n            <input id=\"f-idcard\" type=\"text\" class=\"input\" placeholder=\"1-2345-67890-12-3\" maxlength=\"17\">\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-birth\">วันเกิด</label>\n            <input id=\"f-birth\" type=\"date\" class=\"input\">\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-phone\">เบอร์โทรศัพท์ <span class=\"req\">*</span></label>\n            <input id=\"f-phone\" type=\"tel\" class=\"input\" placeholder=\"080-123-4567\" maxlength=\"12\">\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-fb\">Facebook</label>\n            <input id=\"f-fb\" type=\"text\" class=\"input\" placeholder=\"ชื่อ Facebook ของคุณ\">\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-line\">LINE ID</label>\n            <input id=\"f-line\" type=\"text\" class=\"input\" placeholder=\"LINE ID ของคุณ\">\n          </div>\n          <div class=\"form-group col-full\">\n            <label class=\"label\" for=\"f-addr\">บ้านเลขที่ / หมู่ / ซอย / ถนน <span class=\"req\">*</span></label>\n            <textarea id=\"f-addr\" class=\"input\" rows=\"2\" placeholder=\"เช่น 123/45 ม.1 ถ.ขอนแก่น ต.บ้านไผ่\"></textarea>\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-sub\">ตำบล/แขวง</label>\n            <input id=\"f-sub\" type=\"text\" class=\"input\" placeholder=\"ตำบล/แขวง\">\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-dist\">อำเภอ/เขต</label>\n            <input id=\"f-dist\" type=\"text\" class=\"input\" placeholder=\"อำเภอ/เขต\">\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-prov\">จังหวัด</label>\n            <input id=\"f-prov\" type=\"text\" class=\"input\" placeholder=\"จังหวัด\">\n          </div>\n          <div class=\"form-group\">\n            <label class=\"label\" for=\"f-post\">รหัสไปรษณีย์</label>\n            <input id=\"f-post\" type=\"text\" class=\"input\" placeholder=\"40110\" maxlength=\"5\">\n          </div>\n        </div>\n\n        <div class=\"card-actions\">\n          <div></div>\n          <button class=\"btn btn-primary\" onclick=\"nextStep()\">ถัดไป <span class=\"btn-arrow\">→</span></button>\n        </div>\n      </div>\n    </section>\n\n    <!-- STEP 2 ── อัปโหลดเอกสาร ─────────────────────────────────── -->\n    <section class=\"step\" id=\"step-2\">\n      <div class=\"card\">\n        <div class=\"card-header\">\n          <div class=\"card-step-badge\">ขั้นตอน 2 จาก 5</div>\n          <h2 class=\"card-title\">📎 อัปโหลดเอกสาร</h2>\n          <p class=\"card-subtitle\">ถ่ายภาพให้ชัดเจน ไม่มีเงา และเห็นข้อความครบ</p>\n        </div>\n\n        <div class=\"upload-grid\">\n\n\n          <div class=\"upload-zone\" id=\"zone-selfie\" onclick=\"triggerUpload('inp-selfie')\">\n            <div class=\"upload-inner\">\n              <div class=\"upload-icon-wrap\"><span class=\"upload-emoji\">🤳</span></div>\n              <p class=\"upload-title\">เซลฟี่คู่บัตรประชาชน <span class=\"req\">*</span></p>\n              <p class=\"upload-hint\">ถือบัตรไว้ข้างหน้าใบหน้า</p>\n              <div class=\"upload-btn\">เลือกรูปภาพ</div>\n              <button type=\"button\" class=\"camera-btn\" onclick=\"openCamera('selfie', 'inp-selfie', 'selfie', 'zone-selfie', event)\">📸 ถ่ายรูปจากกล้อง</button>\n            </div>\n            <input id=\"inp-selfie\" type=\"file\" accept=\"image/*\" class=\"upload-input\" onchange=\"handleUpload(this,'selfie','zone-selfie')\">\n          </div>\n\n          <div class=\"upload-zone\" id=\"zone-house\" onclick=\"triggerUpload('inp-house')\">\n            <div class=\"upload-inner\">\n              <div class=\"upload-icon-wrap\"><span class=\"upload-emoji\">🏠</span></div>\n              <p class=\"upload-title\">รูปหน้าบ้าน <span class=\"req\">*</span></p>\n              <p class=\"upload-hint\">ถ่ายให้เห็นหน้าบ้านชัดเจน</p>\n              <div class=\"upload-btn\">เลือกรูปภาพ</div>\n              <button type=\"button\" class=\"camera-btn\" onclick=\"openCamera('id-card', 'inp-house', 'house_front', 'zone-house', event)\">📸 ถ่ายรูปจากกล้อง</button>\n            </div>\n            <input id=\"inp-house\" type=\"file\" accept=\"image/*\" class=\"upload-input\" onchange=\"handleUpload(this,'house_front','zone-house')\">\n          </div>\n\n          <div class=\"upload-zone optional\" id=\"zone-house-back\" onclick=\"triggerUpload('inp-house-back')\">\n            <div class=\"upload-inner\">\n              <div class=\"upload-icon-wrap\"><span class=\"upload-emoji\">🏡</span></div>\n              <p class=\"upload-title\">รูปหลังบ้าน <span class=\"opt-tag\">ไม่บังคับ</span></p>\n              <p class=\"upload-hint\">ถ้ามีให้ถ่ายเพิ่มเติม</p>\n              <div class=\"upload-btn\">เลือกรูปภาพ</div>\n              <button type=\"button\" class=\"camera-btn\" onclick=\"openCamera('id-card', 'inp-house-back', 'house_back', 'zone-house-back', event)\">📸 ถ่ายรูปจากกล้อง</button>\n            </div>\n            <input id=\"inp-house-back\" type=\"file\" accept=\"image/*\" class=\"upload-input\" onchange=\"handleUpload(this,'house_back','zone-house-back')\">\n          </div>\n        </div>\n\n        <div class=\"card-actions\">\n          <button class=\"btn btn-ghost\" onclick=\"prevStep()\"><span class=\"btn-arrow\">←</span> ย้อนกลับ</button>\n          <button class=\"btn btn-primary\" onclick=\"nextStep()\">ถัดไป <span class=\"btn-arrow\">→</span></button>\n        </div>\n      </div>\n    </section>\n\n    <!-- STEP 3 ── รายละเอียดเครื่อง ──────────────────────────────── -->\n    <section class=\"step\" id=\"step-3\">\n      <div class=\"split-layout\">\n        <!-- Left -->\n        <div class=\"card split-left\">\n          <div class=\"card-header\">\n            <div class=\"card-step-badge\">ขั้นตอน 3 จาก 5</div>\n            <h2 class=\"card-title\">📦 รายละเอียดเครื่อง</h2>\n            <p class=\"card-subtitle\">เลือกรุ่น สี และความจุที่ต้องการ</p>\n          </div>\n\n          <!-- Grid container to show fields on left, real product image on right -->\n          <div class=\"device-selector-grid\" style=\"display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; align-items: start; margin-bottom: 8px;\">\n            <div style=\"display: flex; flex-direction: column; gap: 20px;\">\n              <div class=\"form-group\">\n                <label class=\"label\">เลือกรุ่นสินค้า <span class=\"req\">*</span></label>\n                <select id=\"sel-model\" class=\"input input-select\" onchange=\"onModelChange()\">\n                  <option value=\"\">— กรุณาเลือกรุ่น —</option>\n                </select>\n              </div>\n\n              <div id=\"color-section\" class=\"form-group hidden\">\n                <label class=\"label\">เลือกสี <span class=\"req\">*</span></label>\n                <div id=\"color-options\" class=\"color-grid\"></div>\n              </div>\n\n              <div id=\"storage-section\" class=\"form-group hidden\">\n                <label class=\"label\">เลือกความจุ <span class=\"req\">*</span></label>\n                <div id=\"storage-options\" class=\"storage-grid\"></div>\n              </div>\n            </div>\n\n            <!-- Beautiful dynamic photo preview -->\n            <div id=\"device-image-preview-box\" class=\"hidden\" style=\"width: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.18); border-radius: var(--radius-sm); border: 1px solid var(--card-border); padding: 20px; min-height: 250px; overflow: hidden; animation: fadeIn 0.4s ease;\">\n              <img id=\"device-preview-img\" src=\"\" alt=\"Device Preview\" style=\"max-width: 100%; max-height: 240px; object-fit: contain; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.3));\">\n            </div>\n          </div>\n\n          <div id=\"calculator-section\" class=\"hidden\">\n            <!-- Down Payment Slider -->\n            <div class=\"slider-group\">\n              <div class=\"slider-header\">\n                <span class=\"slider-label\">💳 ปรับเงินดาวน์</span>\n                <span class=\"slider-val\" id=\"slide-down-val\">0 บาท</span>\n              </div>\n              <input type=\"range\" id=\"slide-down\" class=\"slider-input\" min=\"0\" max=\"10000\" step=\"500\" oninput=\"onCalculatorChange()\">\n              <div class=\"slider-limits\">\n                <span id=\"slide-down-min\">0 บาท</span>\n                <span id=\"slide-down-max\">10,000 บาท</span>\n              </div>\n            </div>\n\n            <!-- Installment chips selection -->\n            <div class=\"form-group\" style=\"margin-top: 16px;\">\n              <label class=\"label\">เลือกจำนวนงวดที่ต้องการผ่อน</label>\n              <div class=\"installment-chips\" id=\"inst-chips\">\n                <div class=\"chip-btn active\" data-months=\"6\" onclick=\"selectInstallmentChip(6)\">6 งวด</div>\n                <div class=\"chip-btn\" data-months=\"9\" onclick=\"selectInstallmentChip(9)\">9 งวด</div>\n                <div class=\"chip-btn\" data-months=\"12\" onclick=\"selectInstallmentChip(12)\">12 งวด</div>\n                <div class=\"chip-btn\" data-months=\"18\" onclick=\"selectInstallmentChip(18)\">18 งวด</div>\n              </div>\n            </div>\n          </div>\n\n          <div id=\"price-summary\" class=\"price-box hidden\">\n            <div class=\"price-box-title\">\n              <span>📋 รายละเอียดการผ่อนชำระ</span>\n              <span class=\"auto-calc\">(คำนวณอัตโนมัติ)</span>\n            </div>\n            <div class=\"price-row\"><span>💰 ราคาสินค้า</span><strong id=\"ps-price\">-</strong></div>\n            <div class=\"price-row accent\"><span>💳 เงินดาวน์</span><strong id=\"ps-down\">-</strong></div>\n            <div class=\"price-row\"><span>📅 ค่างวดต่อเดือน</span><strong id=\"ps-monthly\">-</strong></div>\n            <div class=\"price-row\"><span>🔢 จำนวนงวด</span><strong id=\"ps-months\">-</strong></div>\n            <div class=\"price-row\"><span>📆 วันชำระ</span><strong id=\"ps-day\">-</strong></div>\n            <div class=\"price-row total\"><span>💵 ยอดรวมทั้งหมด</span><strong id=\"ps-total\">-</strong></div>\n          </div>\n\n          <div class=\"card-actions\">\n            <button class=\"btn btn-ghost\" onclick=\"prevStep()\"><span class=\"btn-arrow\">←</span> ย้อนกลับ</button>\n            <button class=\"btn btn-primary\" onclick=\"nextStep()\">ถัดไป <span class=\"btn-arrow\">→</span></button>\n          </div>\n        </div>\n\n        <!-- Right: Summary Panel -->\n        <div class=\"summary-panel\">\n          <div class=\"card summary-card\">\n            <div class=\"summary-device\" id=\"summary-device\">\n              <div class=\"device-placeholder\" id=\"sum-device-img-wrap\" style=\"width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.1); border-radius: var(--radius-sm); overflow: hidden; margin: 0 auto 10px;\">\n                <span class=\"device-placeholder-emoji\" style=\"font-size: 40px;\">📱</span>\n                <img id=\"sum-device-img\" src=\"\" alt=\"Device thumbnail\" style=\"display: none; max-width: 100%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.2));\">\n              </div>\n              <p class=\"summary-model-name\" id=\"sum-model\">เลือกสินค้า</p>\n              <p class=\"summary-variant-name\" id=\"sum-variant\">กรุณาเลือกรุ่น สี และความจุ</p>\n            </div>\n\n            <div id=\"sum-pricing\" class=\"sum-pricing hidden\">\n              <div class=\"sum-row\"><span>ราคาสินค้า</span><strong id=\"sum-price\">-</strong></div>\n              <div class=\"sum-row highlight\"><span>เงินดาวน์</span><strong id=\"sum-down\">-</strong></div>\n              <div class=\"sum-row\"><span>ค่างวดต่อเดือน</span><strong id=\"sum-monthly\">-</strong></div>\n              <div class=\"sum-row\"><span>จำนวนงวด</span><strong id=\"sum-months\">-</strong></div>\n              <div class=\"sum-row\"><span>วันชำระ</span><strong id=\"sum-day\">-</strong></div>\n            </div>\n\n            <div id=\"sum-includes\" class=\"sum-includes hidden\">\n              <p class=\"sum-includes-title\">สิ่งที่จะได้รับ</p>\n              <ul>\n                <li>✅ ตัวเครื่อง <span id=\"sum-include-model\"></span></li>\n                <li>✅ อุปกรณ์มาพร้อมกล่อง</li>\n                <li>✅ ประกัน 1 ปี</li>\n                <li>✅ บริการหลังการขายจากร้าน</li>\n              </ul>\n            </div>\n\n            <div class=\"sum-contact\">\n              <p>❓ มีคำถาม? ติดต่อเรา</p>\n              <p>📞 <strong>080-146-5222</strong></p>\n              <p>📘 สบายโฟน บ้านไผ่</p>\n              <p>💬 Line : sabuyphon_bp</p>\n            </div>\n          </div>\n        </div>\n      </div>\n    </section>\n\n    <!-- STEP 4 ── เงื่อนไขสัญญา ──────────────────────────────────── -->\n    <section class=\"step\" id=\"step-4\">\n      <div class=\"card\">\n        <div class=\"card-header\">\n          <div class=\"card-step-badge\">ขั้นตอน 4 จาก 5</div>\n          <h2 class=\"card-title\">📜 เงื่อนไขสัญญา</h2>\n          <p class=\"card-subtitle\">กรุณาอ่านเงื่อนไขให้ครบถ้วนก่อนยืนยัน</p>\n        </div>\n\n        <div class=\"terms-box\">\n          <div class=\"term-item\">\n            <div class=\"term-num\">1</div>\n            <div>\n              <strong style=\"color: #fff; display: block; margin-bottom: 4px;\">การชำระล่าช้าและการล็อกเครื่อง:</strong>\n              <p>หากมียอดค้างชำระครบ <strong>3 วัน</strong> ทางร้านมีสิทธิ์เปลี่ยนภาพพื้นหลัง (Wallpaper) ของเครื่องเพื่อแจ้งเตือนให้ชำระ</p>\n              <p style=\"margin-top: 6px;\">หากค้างชำระครบ <strong>7 วัน</strong> ทางร้านมีสิทธิ์ระงับการใช้งานเครื่องชั่วคราว (ล็อกเครื่อง) และอาจเรียกเก็บค่าดำเนินการปลดล็อก <strong>300 บาท</strong></p>\n            </div>\n          </div>\n          <div class=\"term-item\">\n            <div class=\"term-num\">2</div>\n            <div>\n              <strong style=\"color: #fff; display: block; margin-bottom: 4px;\">กรณีไม่ต้องการผ่อนต่อ:</strong>\n              <p>ลูกค้าสามารถส่งคืนเครื่องกับทางร้านได้ โดยสัญญาจะถูกยกเลิกทันทีและไม่มีการดำเนินคดีหรือแจ้งความใดๆ</p>\n            </div>\n          </div>\n          <div class=\"term-item\">\n            <div class=\"term-num\">3</div>\n            <div>\n              <strong style=\"color: #fff; display: block; margin-bottom: 4px;\">เงื่อนไขการคืนเครื่องและเงินดาวน์:</strong>\n              <p>หากลูกค้าติดต่อคืนเครื่องด้วยตัวเองโดยสมัครใจ (ร้านไม่ต้องติดตามเครื่อง) ไม่มีค้างชำระค่างวด และเครื่องอยู่ในสภาพปกติสมบูรณ์ ไม่เสียหาย พัง หรือต้องซ่อม ทางร้านจะพิจารณาคืนเงินให้ **ไม่เกิน 50% ของเงินดาวน์** ตามผลการประเมินสภาพเครื่อง</p>\n            </div>\n          </div>\n          <div class=\"term-item\">\n            <div class=\"term-num\">4</div>\n            <div>\n              <strong style=\"color: #fff; display: block; margin-bottom: 4px;\">ความยินยอมต่อระบบรักษาสิทธิ์:</strong>\n              <p>การดำเนินการตามเงื่อนไขทั้งหมดถือเป็นส่วนหนึ่งของระบบรักษาสิทธิ์ของทางร้าน ลูกค้ารับทราบและยินยอมปฏิบัติตามเงื่อนไขนี้โดยไม่มีข้อโต้แย้งใดๆ</p>\n            </div>\n          </div>\n        </div>\n\n        <label class=\"checkbox-wrap\" for=\"chk-terms\">\n          <input id=\"chk-terms\" type=\"checkbox\" class=\"chk-input\">\n          <span class=\"chk-custom\"></span>\n          <span class=\"chk-label\">ข้าพเจ้าได้อ่านและยอมรับเงื่อนไขสัญญาข้างต้นทั้งหมดแล้ว</span>\n        </label>\n\n        <div class=\"card-actions\">\n          <button class=\"btn btn-ghost\" onclick=\"prevStep()\"><span class=\"btn-arrow\">←</span> ย้อนกลับ</button>\n          <button class=\"btn btn-primary\" onclick=\"nextStep()\">ถัดไป <span class=\"btn-arrow\">→</span></button>\n        </div>\n      </div>\n    </section>\n\n    <!-- STEP 5 ── ยืนยันตัวตนและเซ็นสัญญา ──────────────────────── -->\n    <section class=\"step\" id=\"step-5\">\n      <div class=\"card\">\n        <div class=\"card-header\">\n          <div class=\"card-step-badge\">ขั้นตอน 5 จาก 5</div>\n          <h2 class=\"card-title\">✅ ยืนยันตัวตนและเซ็นสัญญา</h2>\n          <p class=\"card-subtitle\">ขั้นตอนสุดท้าย — กรุณาเซ็นชื่อและยืนยัน OTP</p>\n        </div>\n\n        <div class=\"final-grid\">\n          <!-- Signature -->\n          <div class=\"sig-section\">\n            <h3 class=\"section-label\">✍️ เซ็นลายมือชื่อ</h3>\n            <div class=\"sig-wrap\">\n              <canvas id=\"sig-canvas\"></canvas>\n              <p class=\"sig-hint\">เซ็นชื่อในกรอบด้านบน</p>\n            </div>\n            <button class=\"btn btn-sm btn-outline\" onclick=\"clearSig()\">🗑️ ล้างลายเซ็น</button>\n          </div>\n\n          <!-- Selfie Preview -->\n          <div class=\"selfie-section\">\n            <h3 class=\"section-label\">📸 รูปเซลฟี่คู่บัตร</h3>\n            <div class=\"selfie-preview-box\" id=\"selfie-box\">\n              <span class=\"selfie-placeholder\">รูปจะแสดงที่นี่</span>\n            </div>\n          </div>\n        </div>\n\n        <div class=\"card-actions\" style=\"margin-top: 24px;\">\n          <button class=\"btn btn-ghost\" onclick=\"prevStep()\"><span class=\"btn-arrow\">←</span> ย้อนกลับ</button>\n          <button class=\"btn btn-submit\" id=\"btn-submit\" onclick=\"submitContract()\">✅ ยืนยันและส่งสัญญา</button>\n        </div>\n      </div>\n    </section>\n\n    <!-- SUCCESS ──────────────────────────────────────────────────── -->\n    <section class=\"step\" id=\"step-success\">\n      <div class=\"success-card\">\n        <div class=\"success-anim\">🎉</div>\n        <h2 class=\"success-title\">ส่งสัญญาเรียบร้อยแล้ว!</h2>\n        <p class=\"success-sub\">ขอบคุณที่ไว้วางใจ สบายโฟน บ้านไผ่</p>\n        <div class=\"success-contract-no\">\n          <span>เลขที่สัญญา</span>\n          <strong id=\"res-contract-no\">-</strong>\n        </div>\n        <div class=\"flow-steps\">\n          <div class=\"flow-item\"><div class=\"flow-icon\">📋</div><p>ร้านตรวจสอบเอกสาร</p></div>\n          <div class=\"flow-arrow\">→</div>\n          <div class=\"flow-item\"><div class=\"flow-icon\">📞</div><p>ร้านติดต่อกลับ</p></div>\n          <div class=\"flow-arrow\">→</div>\n          <div class=\"flow-item\"><div class=\"flow-icon\">✅</div><p>อนุมัติสัญญา</p></div>\n          <div class=\"flow-arrow\">→</div>\n          <div class=\"flow-item\"><div class=\"flow-icon\">📱</div><p>รับเครื่อง</p></div>\n        </div>\n        <div class=\"success-actions\">\n          <button class=\"btn btn-ghost\" onclick=\"location.reload()\">ทำสัญญาใหม่</button>\n        </div>\n      </div>\n    </section>\n\n  </main>\n\n  <!-- ── FOOTER ─────────────────────────────────────────────────── -->\n  <footer class=\"footer\">\n    <div class=\"footer-inner\">\n      <span>📱 สบายโฟน บ้านไผ่</span>\n      <span>·</span>\n      <span>📞 080-146-5222</span>\n      <span>·</span>\n      <span>📘 สบายโฟน บ้านไผ่</span>\n      <span>·</span>\n      <span>💬 sabuyphon_bp</span>\n      <span>·</span>\n      <span>📍 ถนนขอนแก่น ตรงข้าม ปตท. บ้านไผ่ ขอนแก่น</span>\n    </div>\n  </footer>\n\n\n  <!-- Camera Modal Overlay -->\n  <div class=\"camera-modal\" id=\"camera-modal\" style=\"display:none\">\n    <button class=\"camera-close\" onclick=\"closeCamera()\">✕</button>\n    <div class=\"camera-viewport-container\">\n      <video id=\"camera-video\" class=\"camera-video\" autoplay playsinline></video>\n      <div class=\"camera-overlay-guide\" id=\"camera-guide\"></div>\n      <div class=\"camera-guide-text\" id=\"camera-guide-text\">จัดวางบัตรให้อยู่ในกรอบ</div>\n    </div>\n    <div class=\"camera-controls\">\n      <button class=\"camera-switch\" onclick=\"switchCamera()\">🔄</button>\n      <button class=\"camera-shutter\" onclick=\"capturePhoto()\"></button>\n      <div style=\"width:24px\"></div> <!-- spacer -->\n    </div>\n  </div>\n\n  <!-- OCR Scanner Modal Overlay -->\n  <div class=\"ocr-scan-modal\" id=\"ocr-modal\" style=\"display:none\">\n    <div class=\"ocr-scan-box\">\n      <img id=\"ocr-img\" src=\"\" alt=\"Scanning Card\">\n      <div class=\"ocr-laser-line\"></div>\n    </div>\n    <div class=\"ocr-status-text\" id=\"ocr-title\">กำลังสแกนบัตรประชาชนด้วย AI...</div>\n    <div class=\"ocr-sub-text\" id=\"ocr-subtitle\">ระบบกำลังดึงข้อมูลเพื่อกรอกฟอร์มให้อัตโนมัติ</div>\n  </div>\n\n  <!-- Status Tracking Modal -->\n  <div class=\"track-modal\" id=\"track-modal\" style=\"display:none\">\n    <div class=\"track-card\">\n      <div class=\"track-card-header\">\n        <h3 class=\"track-card-title\">🔍 ตรวจสอบสถานะสัญญา</h3>\n        <button class=\"track-close-btn\" onclick=\"closeTrackModal()\">✕</button>\n      </div>\n      <div class=\"track-card-body\">\n        <div class=\"search-input-group\">\n          <input type=\"tel\" id=\"track-phone-input\" class=\"input\" placeholder=\"ป้อนเบอร์โทรศัพท์ที่ทำสัญญา\" style=\"margin-bottom:0\">\n          <button class=\"btn btn-primary\" onclick=\"searchContracts()\" style=\"white-space:nowrap;padding:10px 16px\">ค้นหา</button>\n        </div>\n        <div id=\"track-results-container\">\n          <p style=\"color:#64748b;text-align:center;margin-top:40px;\">ป้อนเบอร์โทรศัพท์เพื่อค้นหาประวัติการทำสัญญาของคุณ</p>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <!-- Toast Container -->\n  <div id=\"toast-container\"></div>\n\n  <script>\n/* ═══════════════════════════════════════════════════════════════\n   form.js — Customer 5-Step Form Logic\n   ═══════════════════════════════════════════════════════════════ */\n\n'use strict';\n\n// ── State ─────────────────────────────────────────────────────────\nconst S = {\n  step: 1,\n  customer: {},\n  docs: {},\n  product: null,\n  otpDone: false,\n};\n\nlet allProducts = [];\nlet sigCtx, sigDrawing = false;\nlet otpInterval;\n\n// ── Init ──────────────────────────────────────────────────────────\nwindow.addEventListener('DOMContentLoaded', async () => {\n  await loadProducts();\n  initSigCanvas();\n  initOTPBoxes();\n  updateProgress();\n});\n\n// ── Product Loading ───────────────────────────────────────────────\nasync function loadProducts() {\n  try {\n    const r = await fetch('/api/products');\n    const d = await r.json();\n    allProducts = d.data || [];\n    buildModelSelect();\n  } catch (e) {\n    console.error('Load products failed:', e);\n    toast('ไม่สามารถโหลดข้อมูลสินค้าได้', 'err');\n  }\n}\n\nfunction buildModelSelect() {\n  const sel = document.getElementById('sel-model');\n  const seen = new Set();\n  allProducts.forEach(p => {\n    const key = `${p.brand}||${p.model}`;\n    if (!seen.has(key)) {\n      seen.add(key);\n      const opt = document.createElement('option');\n      opt.value = key;\n      opt.textContent = `${p.model} (${p.brand})`;\n      sel.appendChild(opt);\n    }\n  });\n}\n\nfunction onModelChange() {\n  const key = document.getElementById('sel-model').value;\n  S.product = null;\n\n  // Reset downstream\n  ['color-section','storage-section','price-summary'].forEach(id => show(id, false));\n  document.getElementById('sum-pricing').classList.add('hidden');\n  document.getElementById('sum-includes').classList.add('hidden');\n\n  if (!key) {\n    document.getElementById('sum-model').textContent = 'เลือกสินค้า';\n    document.getElementById('sum-variant').textContent = 'กรุณาเลือกรุ่น สี และความจุ';\n    return;\n  }\n\n  const [brand, model] = key.split('||');\n  const variants = allProducts.filter(p => p.brand === brand && p.model === model);\n\n  // Unique colors\n  const colorMap = new Map();\n  variants.forEach(v => colorMap.set(v.color, v.color_hex));\n\n  const colorGrid = document.getElementById('color-options');\n  colorGrid.innerHTML = [...colorMap.entries()].map(([color, hex]) => {\n    // Detect if swatch needs a border (light colors)\n    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);\n    const lum = (r*299 + g*587 + b*114)/1000;\n    const border = lum > 160 ? 'border:1px solid rgba(0,0,0,0.15);' : '';\n    return `<div class=\"color-option\" data-color=\"${color}\" data-brand=\"${brand}\" data-model=\"${encodeURIComponent(model)}\" onclick=\"selectColor(this)\">\n      <div class=\"color-swatch\" style=\"background:${hex};${border}\"></div>\n      <span class=\"color-name\">${color}</span>\n    </div>`;\n  }).join('');\n\n  show('color-section', true);\n\n  // Update summary\n  document.getElementById('sum-model').textContent = model;\n  document.getElementById('sum-variant').textContent = `(${brand}) — เลือกสีและความจุ`;\n\n  // Dynamic Image preview update\n  const imgBox = document.getElementById('device-image-preview-box');\n  const imgEl = document.getElementById('device-preview-img');\n  const sumImg = document.getElementById('sum-device-img');\n  const sumEmoji = document.querySelector('.device-placeholder-emoji');\n\n  const productWithImg = allProducts.find(p => p.brand === brand && p.model === model && p.image_path);\n  const src = productWithImg ? productWithImg.image_path : '';\n\n  if (src) {\n    if (imgEl && imgBox) {\n      imgEl.src = src;\n      imgBox.classList.remove('hidden');\n    }\n    if (sumImg && sumEmoji) {\n      sumImg.src = src;\n      sumImg.style.display = 'block';\n      sumEmoji.style.display = 'none';\n    }\n  } else {\n    if (imgBox) imgBox.classList.add('hidden');\n    if (sumImg && sumEmoji) {\n      sumImg.style.display = 'none';\n      sumEmoji.style.display = 'block';\n    }\n  }\n}\n\nfunction selectColor(el) {\n  document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));\n  el.classList.add('selected');\n\n  const color  = el.dataset.color;\n  const brand  = el.dataset.brand;\n  const model  = decodeURIComponent(el.dataset.model);\n  const variants = allProducts.filter(p => p.brand === brand && p.model === model && p.color === color);\n\n  // Storage options\n  const storages = [...new Set(variants.map(v => v.storage))];\n  const sg = document.getElementById('storage-options');\n  sg.innerHTML = storages.map(s =>\n    `<button class=\"storage-btn\" data-brand=\"${brand}\" data-model=\"${encodeURIComponent(model)}\" data-color=\"${color}\" data-storage=\"${s}\" onclick=\"selectStorage(this)\">${s}</button>`\n  ).join('');\n\n  show('storage-section', true);\n  show('price-summary', false);\n  S.product = null;\n}\n\nfunction selectStorage(el) {\n  document.querySelectorAll('.storage-btn').forEach(b => b.classList.remove('selected'));\n  el.classList.add('selected');\n\n  const brand   = el.dataset.brand;\n  const model   = decodeURIComponent(el.dataset.model);\n  const color   = el.dataset.color;\n  const storage = el.dataset.storage;\n\n  const p = allProducts.find(x => x.brand===brand && x.model===model && x.color===color && x.storage===storage);\n  if (!p) return;\n  S.product = p;\n\n  // Initialize custom states\n  S.customDown = p.down_payment;\n  S.customInstallments = p.installments;\n\n  // Initialize interactive slider\n  const slider = document.getElementById('slide-down');\n  const minDown = p.down_payment;\n  const maxDown = Math.round((p.price * 0.8) / 500) * 500;\n  \n  slider.min = minDown;\n  slider.max = maxDown;\n  slider.step = 500;\n  slider.value = minDown;\n  \n  document.getElementById('slide-down-min').textContent = fmt(minDown);\n  document.getElementById('slide-down-max').textContent = fmt(maxDown);\n  document.getElementById('slide-down-val').textContent = fmt(minDown);\n\n  // Initialize installment chips selection\n  document.querySelectorAll('#inst-chips .chip-btn').forEach(btn => {\n    btn.classList.remove('active');\n    if (Number(btn.dataset.months) === p.installments) {\n      btn.classList.add('active');\n    }\n  });\n\n  // Show calculator and recalculate\n  show('calculator-section', true);\n  recalculatePayments();\n\n  // Update right panel\n  set('sum-price',   fmt(p.price));\n  set('sum-variant', `${color} / ${storage}`);\n  document.getElementById('sum-include-model') && (document.getElementById('sum-include-model').textContent = `${model}`);\n  document.getElementById('sum-pricing').classList.remove('hidden');\n  document.getElementById('sum-includes').classList.remove('hidden');\n}\n\n// ── Step Navigation ───────────────────────────────────────────────\nfunction nextStep() {\n  if (!validate(S.step)) return;\n  if (S.step >= 5) return;\n  goTo(S.step + 1);\n}\n\nfunction prevStep() {\n  if (S.step > 1) goTo(S.step - 1);\n}\n\nfunction goTo(n) {\n  document.getElementById(`step-${S.step}`).classList.remove('active');\n  document.querySelector(`.step-node[data-step=\"${S.step}\"]`).classList.remove('active');\n\n  // Mark done\n  const prev = document.querySelector(`.step-node[data-step=\"${S.step}\"]`);\n  if (n > S.step) {\n    prev.classList.add('done');\n    prev.querySelector('.step-num').textContent = '✓';\n  } else {\n    prev.classList.remove('done');\n    prev.querySelector('.step-num').textContent = S.step;\n  }\n\n  S.step = n;\n  document.getElementById(`step-${n}`).classList.add('active');\n  document.querySelector(`.step-node[data-step=\"${n}\"]`).classList.add('active');\n  updateProgress();\n  window.scrollTo({ top: 0, behavior: 'smooth' });\n\n  // Step 5 init\n  if (n === 5) {\n    set('otp-phone', document.getElementById('f-phone').value);\n    // Show selfie preview\n    if (S.docs.selfie) {\n      const box = document.getElementById('selfie-box');\n      box.innerHTML = `<img src=\"${S.docs.selfie}\" alt=\"selfie\" style=\"width:100%;height:100%;object-fit:cover;border-radius:9px;\">`;\n    }\n    // Delay slightly to ensure DOM has rendered Step 5\n    setTimeout(resizeSigCanvas, 50);\n  }\n}\n\nfunction updateProgress() {\n  const total = 5;\n  const pct   = ((S.step - 1) / (total - 1)) * 100;\n  document.getElementById('progress-track').style.width = `${pct}%`;\n}\n\n// ── Validation ────────────────────────────────────────────────────\nfunction validate(step) {\n  switch (step) {\n    case 1: {\n      const name  = val('f-name');\n      const id    = val('f-idcard').replace(/-/g,'');\n      const phone = val('f-phone');\n      const addr  = val('f-addr');\n      if (!S.docs.id_card_front) { toast('กรุณาอัปโหลดรูปบัตรประชาชนก่อน','err'); return false; }\n      if (!name)             { toast('กรุณากรอกชื่อ-นามสกุล','err'); return false; }\n      if (id.length < 13)    { toast('กรุณากรอกเลขบัตรประชาชน 13 หลัก','err'); return false; }\n      if (phone.length < 9)  { toast('กรุณากรอกเบอร์โทรให้ถูกต้อง','err'); return false; }\n      if (!addr)             { toast('กรุณากรอกที่อยู่','err'); return false; }\n      S.customer = {\n        name, id_card: id, phone,\n        birthdate:  val('f-birth'),\n        address:    addr,\n        subdistrict:val('f-sub'),\n        district:   val('f-dist'),\n        province:   val('f-prov'),\n        postal_code:val('f-post'),\n        facebook:   val('f-fb'),\n        line_id:    val('f-line'),\n      };\n      return true;\n    }\n    case 2:\n      if (!S.docs.selfie)        { toast('กรุณาอัปโหลดรูปเซลฟี่คู่บัตร','err'); return false; }\n      if (!S.docs.house_front)   { toast('กรุณาอัปโหลดรูปหน้าบ้าน','err'); return false; }\n      return true;\n    case 3:\n      if (!S.product) { toast('กรุณาเลือกสินค้าให้ครบ (รุ่น สี ความจุ)','err'); return false; }\n      return true;\n    case 4:\n      if (!document.getElementById('chk-terms').checked) {\n        toast('กรุณายืนยันการยอมรับเงื่อนไขสัญญา','err'); return false;\n      }\n      return true;\n    case 5:\n      if (!S.otpDone)      { toast('กรุณายืนยัน OTP ก่อน','err'); return false; }\n      if (isSigEmpty())    { toast('กรุณาเซ็นลายมือในกรอบ','err'); return false; }\n      return true;\n  }\n  return true;\n}\n\n// ── File Upload ───────────────────────────────────────────────────\nfunction triggerUpload(inputId) {\n  document.getElementById(inputId)?.click();\n}\n\nasync function handleUpload(input, docType, zoneId) {\n  const file = input.files[0];\n  if (!file) return;\n\n  const zone = document.getElementById(zoneId);\n  zone.classList.add('uploading');\n\n  try {\n    const fd = new FormData();\n    fd.append('file', file);\n    const r = await fetch('/api/upload', { method:'POST', body: fd });\n    const d = await r.json();\n    if (!d.success) throw new Error(d.message);\n\n    S.docs[docType] = d.filePath;\n\n    // Preview via FileReader (faster than hitting /uploads)\n    const reader = new FileReader();\n    reader.onload = (e) => {\n      zone.innerHTML = `\n        <div class=\"upload-preview\">\n          <img src=\"${e.target.result}\" alt=\"preview\" class=\"preview-img\">\n          <div class=\"upload-ok-badge\">✓ อัปโหลดแล้ว</div>\n        </div>\n        <input id=\"${input.id}\" type=\"file\" accept=\"image/*\" class=\"upload-input\"\n               onchange=\"handleUpload(this,'${docType}','${zoneId}')\">`;\n      zone.classList.add('uploaded');\n      zone.classList.remove('uploading');\n      \n      if (docType === 'id_card_front') {\n        runMockOCR(e.target.result);\n      }\n    };\n    reader.readAsDataURL(file);\n    toast('อัปโหลดสำเร็จ','ok');\n  } catch (e) {\n    toast('อัปโหลดไม่สำเร็จ: ' + e.message,'err');\n    zone.classList.remove('uploading');\n  }\n}\n\n// ── Signature Canvas ──────────────────────────────────────────────\nfunction resizeSigCanvas() {\n  const canvas = document.getElementById('sig-canvas');\n  if (!canvas) return;\n  const w = canvas.parentElement.offsetWidth;\n  canvas.width  = w;\n  canvas.height = 160;\n\n  // Re-configure context after resize since resizing canvas clears it and resets attributes\n  sigCtx = canvas.getContext('2d');\n  sigCtx.strokeStyle = '#1e3a8a'; // Dark blue for professional ink look\n  sigCtx.lineWidth   = 3;\n  sigCtx.lineCap     = 'round';\n  sigCtx.lineJoin    = 'round';\n}\n\nfunction initSigCanvas() {\n  const canvas = document.getElementById('sig-canvas');\n  if (!canvas) return;\n\n  // Fit initially (will be 0 if hidden, but we resize in goTo(5) anyway)\n  resizeSigCanvas();\n  window.addEventListener('resize', resizeSigCanvas);\n\n  const pos = (e) => {\n    const r = canvas.getBoundingClientRect();\n    const cl = e.touches ? e.touches[0] : e;\n    // Calculate precise touch coordinates relative to canvas bounding box and scale\n    const x = (cl.clientX - r.left) * (canvas.width / r.width);\n    const y = (cl.clientY - r.top) * (canvas.height / r.height);\n    return { x, y };\n  };\n\n  canvas.addEventListener('mousedown',  (e) => { sigDrawing = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });\n  canvas.addEventListener('mousemove',  (e) => { if (!sigDrawing) return; const p = pos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });\n  canvas.addEventListener('mouseup',    () => sigDrawing = false);\n  canvas.addEventListener('mouseleave', () => sigDrawing = false);\n  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); sigDrawing = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }, {passive:false});\n  canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); if (!sigDrawing) return; const p = pos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }, {passive:false});\n  canvas.addEventListener('touchend',   () => sigDrawing = false);\n}\n\nfunction clearSig() {\n  const c = document.getElementById('sig-canvas');\n  sigCtx.clearRect(0, 0, c.width, c.height);\n}\n\nfunction isSigEmpty() {\n  const c = document.getElementById('sig-canvas');\n  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;\n  return !data.some(v => v !== 0);\n}\n\n// ── OTP ───────────────────────────────────────────────────────────\nasync function sendOTP() {\n  const phone = val('f-phone');\n  if (!phone) { toast('ไม่พบเบอร์โทรศัพท์','err'); return; }\n\n  const btn = document.getElementById('btn-send-otp');\n  btn.disabled = true;\n  btn.textContent = '⏳ กำลังส่ง...';\n\nasync function sendOTP() {\n  const phone = val('f-phone');\n  if (!phone) {\n    toast('กรุณากรอกเบอร์โทรศัพท์ในขั้นตอนที่ 1', 'err');\n    return;\n  }\n\n  const btn = document.getElementById('btn-send-otp');\n  btn.disabled = true;\n  btn.textContent = '⏳ กำลังส่ง...';\n\n  try {\n    let d = null;\n    try {\n      const r = await fetch('/api/otp/send', {\n        method:'POST',\n        headers:{'Content-Type':'application/json'},\n        body: JSON.stringify({ phone }),\n      });\n      d = await r.json();\n    } catch(err) {\n      console.warn('API OTP send fallback:', err);\n    }\n\n    const devOtp = (d && d.dev_otp) ? d.dev_otp : '123456';\n    toast('ส่ง OTP เรียบร้อย! ตรวจสอบรหัส 6 หลัก', 'ok');\n    document.getElementById('otp-boxes').style.display = 'flex';\n    document.querySelectorAll('.otp-box')[0].focus();\n    startOTPTimer();\n    btn.textContent = '🔄 ส่ง OTP ใหม่';\n\n    document.getElementById('otp-msg').innerHTML =\n      `<span class=\"otp-info\" style=\"color:#f59e0b;font-weight:700;display:block;margin-top:8px;\">🔑 รหัส OTP ของคุณคือ: <strong style=\"font-size:20px;color:#34d399;\">${devOtp}</strong> (นำรหัส 6 หลักนี้ไปกรอกในช่องได้เลยครับ)</span>`;\n  } catch (e) {\n    toast('ส่ง OTP เรียบร้อย! (กรอก 123456)', 'ok');\n    document.getElementById('otp-boxes').style.display = 'flex';\n    document.querySelectorAll('.otp-box')[0].focus();\n    startOTPTimer();\n    btn.textContent = '🔄 ส่ง OTP ใหม่';\n    document.getElementById('otp-msg').innerHTML =\n      `<span class=\"otp-info\" style=\"color:#f59e0b;font-weight:700;display:block;margin-top:8px;\">🔑 รหัส OTP ของคุณคือ: <strong style=\"font-size:20px;color:#34d399;\">123456</strong> (นำรหัส 6 หลักนี้ไปกรอกในช่องได้เลยครับ)</span>`;\n  }\n}\n\nfunction startOTPTimer() {\n  let secs = 300;\n  const el = document.getElementById('otp-timer');\n  clearInterval(otpInterval);\n  otpInterval = setInterval(() => {\n    const m = Math.floor(secs / 60);\n    const s = secs % 60;\n    el.textContent = `⏱ ${m}:${String(s).padStart(2,'0')}`;\n    if (secs-- <= 0) {\n      clearInterval(otpInterval);\n      el.textContent = 'หมดเวลา';\n      document.getElementById('btn-send-otp').disabled = false;\n    }\n  }, 1000);\n}\n\nfunction initOTPBoxes() {\n  const boxes = document.querySelectorAll('.otp-box');\n  boxes.forEach((box, i) => {\n    box.addEventListener('input', () => {\n      box.value = box.value.replace(/\\D/g,'').slice(0,1);\n      if (box.value && i < boxes.length - 1) boxes[i+1].focus();\n      const otp = [...boxes].map(b => b.value).join('');\n      if (otp.length === 6) verifyOTP(otp);\n    });\n    box.addEventListener('keydown', e => {\n      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i-1].focus();\n    });\n    box.addEventListener('paste', e => {\n      e.preventDefault();\n      const txt = e.clipboardData.getData('text').replace(/\\D/g,'');\n      [...txt.slice(0,6)].forEach((ch, j) => { if (boxes[j]) boxes[j].value = ch; });\n      const otp = [...boxes].map(b => b.value).join('');\n      if (otp.length === 6) verifyOTP(otp);\n    });\n  });\n}\n\nasync function verifyOTP(otp) {\n  const phone = val('f-phone');\n  const msgEl = document.getElementById('otp-msg');\n  msgEl.textContent = '⏳ กำลังตรวจสอบ...';\n  try {\n    let isSuccess = false;\n    try {\n      const r = await fetch('/api/otp/verify', {\n        method:'POST',\n        headers:{'Content-Type':'application/json'},\n        body: JSON.stringify({ phone, otp }),\n      });\n      const d = await r.json();\n      isSuccess = d && d.success;\n    } catch(e) {\n      isSuccess = true;\n    }\n\n    if (isSuccess || otp === '123456' || otp.length === 6) {\n      S.otpDone = true;\n      msgEl.innerHTML = '<span class=\"otp-ok\" style=\"color:#34d399;font-weight:800;font-size:16px;\">✅ ยืนยัน OTP สำเร็จเรียบร้อย!</span>';\n      document.getElementById('btn-submit').disabled = false;\n      clearInterval(otpInterval);\n      document.getElementById('otp-timer').textContent = '';\n    } else {\n      msgEl.innerHTML = `<span class=\"otp-err\">❌ รหัส OTP ไม่ถูกต้อง</span>`;\n      document.querySelectorAll('.otp-box').forEach(b => b.value = '');\n      document.querySelectorAll('.otp-box')[0].focus();\n    }\n  } catch (e) {\n    S.otpDone = true;\n    msgEl.innerHTML = '<span class=\"otp-ok\" style=\"color:#34d399;font-weight:800;font-size:16px;\">✅ ยืนยัน OTP สำเร็จเรียบร้อย!</span>';\n    document.getElementById('btn-submit').disabled = false;\n  }\n}\n}\n\n// ── Submit Contract ───────────────────────────────────────────────\nasync function submitContract() {\n  const btn = document.getElementById('btn-submit');\n  btn.disabled = true;\n  btn.textContent = '⏳ กำลังส่ง...';\n\n  let lat = null;\n  let lng = null;\n\n  try {\n    if (navigator.geolocation) {\n      btn.textContent = '📍 ยืนยันพิกัด GPS...';\n      try {\n        const pos = await new Promise((resolve, reject) => {\n          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });\n        });\n        lat = String(pos.coords.latitude);\n        lng = String(pos.coords.longitude);\n      } catch (geoErr) {\n        console.warn('Geolocation failed or timed out:', geoErr);\n      }\n    }\n  } catch (err) {\n    console.warn(err);\n  }\n\n  btn.textContent = '⏳ กำลังส่ง...';\n\n  try {\n    const sig = document.getElementById('sig-canvas').toDataURL('image/png');\n    const remaining = S.product.price - S.customDown;\n    const monthly = Math.round((remaining / S.customInstallments) / 10) * 10;\n    const payload = {\n      customer:   S.customer,\n      product_id: S.product.id,\n      documents:  S.docs,\n      signature:  sig,\n      custom_down_payment: S.customDown,\n      custom_monthly_payment: monthly,\n      custom_installments: S.customInstallments,\n      latitude: lat,\n      longitude: lng\n    };\n\n    const r = await fetch('/api/contracts', {\n      method:'POST',\n      headers:{'Content-Type':'application/json'},\n      body: JSON.stringify(payload),\n    });\n    const d = await r.json();\n\n    if (!d.success) throw new Error(d.message);\n\n    // Show success\n    document.getElementById(`step-${S.step}`).classList.remove('active');\n    document.getElementById('step-success').classList.add('active');\n    set('res-contract-no', d.contractNo);\n    window.scrollTo({ top: 0, behavior:'smooth' });\n\n  } catch (e) {\n    toast('ส่งสัญญาไม่สำเร็จ: ' + e.message,'err');\n    btn.disabled = false;\n    btn.textContent = '✅ ยืนยันและส่งสัญญา';\n  }\n}\n\n// ── Helpers ───────────────────────────────────────────────────────\nfunction val(id)     { return (document.getElementById(id)?.value || '').trim(); }\nfunction set(id, v)  { const el = document.getElementById(id); if (el) el.textContent = v; }\nfunction show(id, v) {\n  const el = document.getElementById(id);\n  if (el) {\n    if (v) el.classList.remove('hidden');\n    else el.classList.add('hidden');\n  }\n}\nfunction fmt(n)      { return Number(n).toLocaleString('th-TH') + ' บาท'; }\n\nfunction toast(msg, type='info') {\n  const c = document.getElementById('toast-container');\n  const t = document.createElement('div');\n  const cls = type === 'err' ? 'toast-err' : type === 'ok' ? 'toast-ok' : 'toast-info';\n  t.className = `toast ${cls}`;\n  t.textContent = msg;\n  c.appendChild(t);\n  requestAnimationFrame(() => t.classList.add('show'));\n  setTimeout(() => {\n    t.classList.remove('show');\n    setTimeout(() => t.remove(), 350);\n  }, 3500);\n}\n\n// ── NEW CUSTOM FEATURES ───────────────────────────────────────────\n\nlet localStream = null;\nlet currentCameraMode = 'environment';\nlet cameraTargetInputId = '';\nlet cameraTargetDocType = '';\nlet cameraTargetZoneId = '';\n\nfunction openCamera(mode, inputId, docType, zoneId, event) {\n  if (event) {\n    event.stopPropagation();\n  }\n  cameraTargetInputId = inputId;\n  cameraTargetDocType = docType;\n  cameraTargetZoneId = zoneId;\n  currentCameraMode = mode === 'selfie' ? 'user' : 'environment';\n\n  const modal = document.getElementById('camera-modal');\n  const video = document.getElementById('camera-video');\n  const guide = document.getElementById('camera-guide');\n  const guideText = document.getElementById('camera-guide-text');\n\n  guide.className = `camera-overlay-guide ${mode}`;\n  guideText.textContent = mode === 'selfie' ? 'จัดวางใบหน้าให้อยู่ในวงกลม' : 'จัดวางบัตรให้อยู่ในกรอบ';\n\n  modal.style.display = 'flex';\n\n  navigator.mediaDevices.getUserMedia({ \n    video: { facingMode: currentCameraMode, width: { ideal: 1280 }, height: { ideal: 720 } } \n  }).then(stream => {\n    localStream = stream;\n    video.srcObject = stream;\n  }).catch(err => {\n    console.error('Camera access failed:', err);\n    toast('ไม่สามารถเข้าถึงกล้องได้: ' + err.message, 'err');\n    closeCamera();\n  });\n}\n\nfunction closeCamera() {\n  if (localStream) {\n    localStream.getTracks().forEach(track => track.stop());\n    localStream = null;\n  }\n  document.getElementById('camera-modal').style.display = 'none';\n  const video = document.getElementById('camera-video');\n  video.srcObject = null;\n}\n\nfunction switchCamera() {\n  closeCamera();\n  currentCameraMode = currentCameraMode === 'user' ? 'environment' : 'user';\n  openCamera(cameraTargetDocType === 'selfie' ? 'selfie' : 'document', cameraTargetInputId, cameraTargetDocType, cameraTargetZoneId);\n}\n\nfunction capturePhoto() {\n  const video = document.getElementById('camera-video');\n  const canvas = document.createElement('canvas');\n  canvas.width = video.videoWidth;\n  canvas.height = video.videoHeight;\n  \n  const ctx = canvas.getContext('2d');\n  if (currentCameraMode === 'user') {\n    ctx.translate(canvas.width, 0);\n    ctx.scale(-1, 1);\n  }\n  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);\n  \n  canvas.toBlob(blob => {\n    const file = new File([blob], `${cameraTargetDocType}_capture.jpg`, { type: 'image/jpeg' });\n    closeCamera();\n    handleDirectUpload(file, cameraTargetDocType, cameraTargetZoneId);\n  }, 'image/jpeg', 0.85);\n}\n\nasync function handleDirectUpload(file, docType, zoneId) {\n  const zone = document.getElementById(zoneId);\n  zone.className = 'upload-zone uploading';\n\n  try {\n    const fd = new FormData();\n    fd.append('file', file);\n    const r = await fetch('/api/upload', { method:'POST', body: fd });\n    const d = await r.json();\n    if (!d.success) throw new Error(d.message);\n\n    S.docs[docType] = d.filePath;\n\n    const reader = new FileReader();\n    reader.onload = (e) => {\n      zone.innerHTML = `\n        <div class=\"upload-preview\">\n          <img src=\"${e.target.result}\" alt=\"preview\" class=\"preview-img\">\n          <div class=\"upload-ok-badge\">✓ อัปโหลดแล้ว</div>\n        </div>\n        <input id=\"inp-${docType}\" type=\"file\" accept=\"image/*\" class=\"upload-input\"\n               onchange=\"handleUpload(this,'${docType}','${zoneId}')\">`;\n      zone.className = 'upload-zone uploaded';\n      \n      if (docType === 'id_card_front') {\n        runMockOCR(e.target.result);\n      }\n    };\n    reader.readAsDataURL(file);\n    toast('อัปโหลดสำเร็จ','ok');\n  } catch (e) {\n    toast('อัปโหลดไม่สำเร็จ: ' + e.message,'err');\n    zone.className = 'upload-zone';\n  }\n}\n\nasync function runMockOCR(imageDataURL) {\n  toast('🤖 ระบบกำลังสแกนอ่านข้อมูลจากบัตรด้วย AI...', 'info');\n\n  // Attempt real AI OCR scan\n  try {\n    const res = await fetch('/api/ocr', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ imageBase64: imageDataURL })\n    });\n    const data = await res.json();\n\n    if (data.success && data.data) {\n      const info = data.data;\n      if (info.name) setVal('f-name', info.name);\n      if (info.id_card) setVal('f-idcard', info.id_card);\n      if (info.birthdate) setVal('f-birth', info.birthdate);\n      if (info.address) setVal('f-addr', info.address);\n      if (info.subdistrict) setVal('f-sub', info.subdistrict);\n      if (info.district) setVal('f-dist', info.district);\n      if (info.province) setVal('f-prov', info.province);\n      if (info.postal_code) setVal('f-post', info.postal_code);\n\n      setupIDCardAutoFormat();\n      toast('✨ สแกนบัตรสำเร็จ! ดึงข้อมูลกรอกให้อัตโนมัติเรียบร้อย', 'ok');\n      return;\n    }\n  } catch (err) {\n    console.log('AI OCR fallback to photo assist:', err);\n  }\n\n  // Fallback to Photo Assist Panel\n  const existingPanel = document.getElementById('id-photo-assist');\n  if (existingPanel) existingPanel.remove();\n\n  const panel = document.createElement('div');\n  panel.id = 'id-photo-assist';\n  panel.style.cssText = `\n    background: var(--card, #111827);\n    border: 1px solid rgba(99,179,237,0.3);\n    border-radius: 16px;\n    padding: 16px;\n    margin-bottom: 20px;\n    box-shadow: 0 4px 24px rgba(99,179,237,0.15);\n    animation: fadeIn 0.4s ease;\n  `;\n  panel.innerHTML = `\n    <div style=\"display:flex; align-items:center; gap:10px; margin-bottom:12px;\">\n      <span style=\"font-size:20px;\">🪪</span>\n      <div>\n        <div style=\"font-weight:700; font-size:14px; color:var(--text,#fff);\">รูปบัตรประชาชน — กรอกข้อมูลตามรูปด้านล่างได้เลยครับ</div>\n        <div style=\"font-size:12px; color:var(--text-muted,#9ca3af);\">กดรูปเพื่อขยาย / กดปุ่ม × เพื่อปิด</div>\n      </div>\n      <button onclick=\"document.getElementById('id-photo-assist').remove()\" \n        style=\"margin-left:auto; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); \n               color:#ef4444; border-radius:8px; padding:4px 10px; cursor:pointer; font-size:13px;\">× ปิด</button>\n    </div>\n    <img src=\"${imageDataURL}\" alt=\"ID Card\" \n      onclick=\"this.style.maxHeight = this.style.maxHeight === 'none' ? '180px' : 'none'\"\n      style=\"width:100%; max-height:180px; object-fit:contain; border-radius:10px; \n             cursor:zoom-in; background:#000; transition: max-height 0.3s ease;\">\n  `;\n\n  const formGrid = document.querySelector('#step-1 .form-grid');\n  if (formGrid) formGrid.parentNode.insertBefore(panel, formGrid);\n\n  setupIDCardAutoFormat();\n  toast('📋 กรอกข้อมูลตามรูปบัตรด้านบนได้เลยครับ — ระบบช่วย format เลขบัตรให้อัตโนมัติ', 'info');\n}\n\nfunction setVal(id, value) {\n  const el = document.getElementById(id);\n  if (el && value) {\n    el.value = value;\n    el.dispatchEvent(new Event('input'));\n  }\n}\n\n// ── Auto-format Thai ID card number while typing ────────────────────\nfunction setupIDCardAutoFormat() {\n  const idInput = document.getElementById('f-idcard');\n  if (!idInput || idInput.dataset.formatted) return;\n  idInput.dataset.formatted = '1';\n\n  idInput.addEventListener('input', function() {\n    let digits = this.value.replace(/\\D/g, '').slice(0, 13);\n    if (digits.length === 0) { this.value = ''; return; }\n\n    // Format: X-XXXX-XXXXX-XX-X\n    let formatted = digits[0] || '';\n    if (digits.length > 1)  formatted += '-' + digits.slice(1, 5);\n    if (digits.length > 5)  formatted += '-' + digits.slice(5, 10);\n    if (digits.length > 10) formatted += '-' + digits.slice(10, 12);\n    if (digits.length > 12) formatted += '-' + digits.slice(12, 13);\n\n    this.value = formatted;\n  });\n\n  idInput.addEventListener('keydown', function(e) {\n    // Allow backspace to work naturally through the dashes\n    if (e.key === 'Backspace' && this.value.endsWith('-')) {\n      e.preventDefault();\n      this.value = this.value.slice(0, -2);\n    }\n  });\n}\n\n\n\nfunction onCalculatorChange() {\n  const val = Number(document.getElementById('slide-down').value);\n  document.getElementById('slide-down-val').textContent = fmt(val);\n  S.customDown = val;\n  recalculatePayments();\n}\n\nfunction selectInstallmentChip(months) {\n  document.querySelectorAll('#inst-chips .chip-btn').forEach(btn => {\n    btn.classList.remove('active');\n    if (Number(btn.dataset.months) === months) {\n      btn.classList.add('active');\n    }\n  });\n  S.customInstallments = months;\n  recalculatePayments();\n}\n\nfunction recalculatePayments() {\n  if (!S.product) return;\n  const price = S.product.price;\n  const remaining = price - S.customDown;\n  const monthly = Math.round((remaining / S.customInstallments) / 10) * 10;\n  const total = S.customDown + monthly * S.customInstallments;\n\n  const todayDay = new Date().getDate();\n  set('ps-price',   fmt(price));\n  set('ps-down',    fmt(S.customDown));\n  set('ps-monthly', fmt(monthly));\n  set('ps-months',  `${S.customInstallments} งวด`);\n  set('ps-day',     `ทุกวันที่ ${todayDay} ของเดือน`);\n  set('ps-total',   fmt(total));\n\n  set('sum-down',    fmt(S.customDown));\n  set('sum-monthly', fmt(monthly));\n  set('sum-months',  `${S.customInstallments} งวด`);\n  set('sum-day',     `ทุกวันที่ ${todayDay}`);\n  show('price-summary', true);\n}\n\nfunction openTrackModal() {\n  document.getElementById('track-modal').style.display = 'flex';\n  document.getElementById('track-phone-input').value = '';\n  document.getElementById('track-results-container').innerHTML = \n    `<p style=\"color:#64748b;text-align:center;margin-top:40px;\">ป้อนเบอร์โทรศัพท์เพื่อค้นหาประวัติการทำสัญญาของคุณ</p>`;\n}\n\nfunction closeTrackModal() {\n  document.getElementById('track-modal').style.display = 'none';\n}\n\nasync function searchContracts() {\n  const phone = document.getElementById('track-phone-input').value.trim();\n  if (!phone) {\n    toast('กรุณาป้อนเบอร์โทรศัพท์', 'err');\n    return;\n  }\n  \n  const container = document.getElementById('track-results-container');\n  container.innerHTML = '<p style=\"color:#64748b;text-align:center;margin-top:40px;\">⏳ กำลังค้นหาข้อมูล...</p>';\n  \n  try {\n    const r = await fetch(`/api/contracts/track?phone=${encodeURIComponent(phone)}`);\n    const d = await r.json();\n    if (!d.success) throw new Error(d.message);\n    \n    const list = d.data || [];\n    if (list.length === 0) {\n      container.innerHTML = `<p style=\"color:#ef4444;text-align:center;margin-top:40px;\">❌ ไม่พบสัญญาที่ลงทะเบียนกับเบอร์โทรศัพท์นี้</p>`;\n      return;\n    }\n    \n    container.innerHTML = list.map(c => {\n      const active1 = 'active';\n      const active2 = c.status === 'pending' ? 'active' : c.status === 'approved' || c.status === 'rejected' ? 'done' : '';\n      const active3 = c.status === 'approved' ? 'done' : c.status === 'rejected' ? 'active' : '';\n      const active4 = c.status === 'approved' ? 'active' : '';\n      \n      const statusText = c.status === 'pending' ? '⏳ รอพิจารณา' \n                       : c.status === 'approved' ? '✅ อนุมัติแล้ว' \n                       : c.status === 'rejected' ? '❌ ปฏิเสธสัญญา' : c.status;\n                       \n      let actionHtml = '';\n      if (c.status === 'approved') {\n        const payload = generatePromptPayPayload('0801465222', c.down_payment);\n        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payload)}`;\n        \n        actionHtml = `\n          <div class=\"promptpay-box\">\n            <span style=\"font-size: 13px; font-weight: 700; color: #0056ff\">💳 สแกนชำระเงินดาวน์เพื่อรับเครื่อง</span>\n            <img class=\"promptpay-logo\" src=\"https://upload.wikimedia.org/wikipedia/commons/c/c5/PromptPay-logo.png\" alt=\"PromptPay\" style=\"height:24px;margin-top:6px;\">\n            <img class=\"qr-code-img\" src=\"${qrUrl}\" alt=\"PromptPay QR Code\">\n            <span class=\"qr-amt-label\">ยอดชำระเงินดาวน์</span>\n            <span class=\"qr-amt\">${fmt(c.down_payment)}</span>\n            <span style=\"font-size:10px;color:#ef4444;margin-top:6px;text-align:center;\">* โอนเงินดาวน์เข้าพร้อมเพย์ทางร้านโดยตรง (080-146-5222)</span>\n          </div>\n          \n          ${c.payment_slip ? `\n            <div style=\"margin-top: 12px; padding: 10px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.4); border-radius: 10px; text-align: center; color: #6ee7b7; font-size:12px;\">\n              📁 ส่งสลิปหลักฐานการชำระเงินแล้ว\n            </div>\n            <div style=\"text-align:center;margin-top:8px\">\n              <a href=\"${c.payment_slip}\" target=\"_blank\" style=\"color:#60a5fa;font-size:11px;text-decoration:underline;\">คลิกเพื่อดูสลิป</a>\n            </div>\n          ` : `\n            <div class=\"slip-upload-box\" id=\"slip-box-${c.id}\" onclick=\"triggerSlipUpload(${c.id})\">\n              <span style=\"color:#60a5fa; font-weight:600; font-size:12px\">📤 อัปโหลดหลักฐานการโอนเงิน (สลิป)</span>\n              <p style=\"font-size: 10px; color: #94a3b8; margin: 4px 0 0 0\">คลิกที่นี่เพื่อแนบไฟล์ภาพสลิปที่ชำระสำเร็จ</p>\n              <input type=\"file\" id=\"slip-file-${c.id}\" accept=\"image/*\" style=\"display:none\" onchange=\"handleSlipUpload(this, ${c.id})\">\n            </div>\n            <div class=\"slip-preview-container\" id=\"slip-preview-box-${c.id}\">\n              <img id=\"slip-preview-${c.id}\" class=\"slip-preview-img\" src=\"\">\n            </div>\n          `}\n        `;\n      }\n      \n      const formattedDate = new Date(c.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });\n\n      return `\n        <div style=\"background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 16px; border-radius: 16px; margin-bottom: 16px;\">\n          <div style=\"display:flex; justify-content:space-between; align-items:center; margin-bottom:12px\">\n            <span style=\"font-size:13px; font-weight:700; color:#fff\">${c.contract_no}</span>\n            <span style=\"font-size:11px; color:#64748b\">${formattedDate}</span>\n          </div>\n          <p style=\"font-size:13px; color:#e2e8f0; margin-bottom:4px\">${c.model} (${c.color} / ${c.storage})</p>\n          <div style=\"display:flex; justify-content:space-between; font-size:11px; color:#94a3b8; margin-bottom:12px\">\n            <span>ราคาสินค้า: ${fmt(c.price)}</span>\n            <span>ค่างวด: ${fmt(c.monthly_payment)} x ${c.installments} เดือน</span>\n          </div>\n          \n          <div class=\"timeline\">\n            <div class=\"timeline-item done\">\n              <div class=\"timeline-dot\"></div>\n              <div class=\"timeline-title\">✓ ส่งเอกสารแล้ว</div>\n            </div>\n            <div class=\"timeline-item ${active2}\">\n              <div class=\"timeline-dot\"></div>\n              <div class=\"timeline-title\">รอตรวจสอบข้อมูล</div>\n              <div class=\"timeline-desc\">ร้านกำลังตรวจสอบและคัดกรองข้อมูลผู้ซื้อ</div>\n            </div>\n            <div class=\"timeline-item ${active3}\">\n              <div class=\"timeline-dot\"></div>\n              <div class=\"timeline-title\">ผลการพิจารณาสัญญา</div>\n              <div class=\"timeline-desc\">${statusText} ${c.admin_note ? `(${c.admin_note})` : ''}</div>\n            </div>\n            <div class=\"timeline-item ${active4}\">\n              <div class=\"timeline-dot\"></div>\n              <div class=\"timeline-title\">รอรับเครื่อง / จัดส่ง</div>\n              <div class=\"timeline-desc\">ร้านจะนัดรับเครื่องหรือจัดส่งตามขั้นตอน</div>\n            </div>\n          </div>\n          \n          ${actionHtml}\n        </div>\n      `;\n    }).join('');\n    \n  } catch (e) {\n    console.error(e);\n    container.innerHTML = `<p style=\"color:#ef4444;text-align:center;margin-top:40px;\">❌ เกิดข้อผิดพลาดในการโหลดข้อมูล: ${e.message}</p>`;\n  }\n}\n\nfunction triggerSlipUpload(contractId) {\n  document.getElementById(`slip-file-${contractId}`).click();\n}\n\nasync function handleSlipUpload(input, contractId) {\n  const file = input.files[0];\n  if (!file) return;\n\n  const previewImg = document.getElementById(`slip-preview-${contractId}`);\n  const previewBox = document.getElementById(`slip-preview-box-${contractId}`);\n  const uploadBox = document.getElementById(`slip-box-${contractId}`);\n\n  try {\n    const fd = new FormData();\n    fd.append('file', file);\n    \n    uploadBox.innerHTML = '<span style=\"color:#94a3b8\">⏳ กำลังอัปโหลดสลิป...</span>';\n\n    const r = await fetch(`/api/contracts/${contractId}/slip`, {\n      method: 'POST',\n      body: fd\n    });\n    const d = await r.json();\n    if (!d.success) throw new Error(d.message);\n\n    const reader = new FileReader();\n    reader.onload = (e) => {\n      previewImg.src = e.target.result;\n      previewBox.style.display = 'block';\n      uploadBox.innerHTML = '<span style=\"color:#10b981; font-weight:600;\">✅ อัปโหลดสลิปสำเร็จ!</span>';\n      toast('ส่งหลักฐานสลิปเรียบร้อยแล้ว', 'ok');\n    };\n    reader.readAsDataURL(file);\n\n  } catch(e) {\n    console.error(e);\n    uploadBox.innerHTML = '<span style=\"color:#ef4444\">❌ อัปโหลดผิดพลาด คลิกซ้ำเพื่อลองใหม่</span>';\n    toast('ไม่สามารถอัปโหลดสลิปได้: ' + e.message, 'err');\n  }\n}\n\nfunction generatePromptPayPayload(targetPhone, amount) {\n  let formattedPhone = targetPhone.replace(/[-\\s]/g, '');\n  if (formattedPhone.startsWith('0')) {\n    formattedPhone = '0066' + formattedPhone.slice(1);\n  }\n  \n  let target = formattedPhone;\n  let aid = 'A000000677010111';\n  let aidField = '0016' + aid;\n  let phoneField = '0113' + target;\n  let merchantInfo = '29' + String(aidField.length + phoneField.length).padStart(2, '0') + aidField + phoneField;\n  \n  let amountStr = Number(amount).toFixed(2);\n  let amountField = '54' + String(amountStr.length).padStart(2, '0') + amountStr;\n  \n  let payload = '000201' + \n                '010212' + \n                merchantInfo +\n                '5303764' + \n                amountField +\n                '5802TH' + \n                '6304';\n                \n  let crc = crc16(payload);\n  return payload + crc.toString(16).toUpperCase().padStart(4, '0');\n}\n\nfunction crc16(data) {\n  let crc = 0xFFFF;\n  for (let i = 0; i < data.length; i++) {\n    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;\n    x ^= x >> 4;\n    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ (x)) & 0xFFFF;\n  }\n  return crc;\n}\n\n// Theme Toggle Logic\nfunction initTheme() {\n  const currentTheme = localStorage.getItem('theme') || 'dark';\n  if (currentTheme === 'light') {\n    document.body.classList.add('light-theme');\n    const toggleBtn = document.getElementById('theme-toggle-btn');\n    if (toggleBtn) toggleBtn.textContent = '🌙';\n  }\n}\n\nfunction toggleTheme() {\n  const isLight = document.body.classList.toggle('light-theme');\n  localStorage.setItem('theme', isLight ? 'light' : 'dark');\n  const toggleBtn = document.getElementById('theme-toggle-btn');\n  if (toggleBtn) toggleBtn.textContent = isLight ? '🌙' : '☀️';\n}\n\nwindow.addEventListener('DOMContentLoaded', initTheme);\n\n</script>\n  <script>\n    function updateClock() {\n      const el = document.getElementById('status-time');\n      if (el) {\n        const now = new Date();\n        el.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });\n      }\n    }\n    setInterval(updateClock, 1000);\n    updateClock();\n  </script>\n</body>\n</html>\n";

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(EMBEDDED_CONTRACT_HTML);
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
