# ☁️ ขั้นตอนการเชื่อมต่อฐานข้อมูลกับ Google Firebase (ใช้งานฟรี 24 ชม.)

ระบบนี้รองรับการเชื่อมต่อและซิงค์ฐานข้อมูลกับ **Google Firebase Cloud Firestore** โดยอัตโนมัติ เพื่อให้ข้อมูลสัญญาและสินค้าของคุณถูกสำรองไว้บนคลาวด์ของ Google อย่างปลอดภัยตลอด 24 ชั่วโมง

---

## 📌 วิธีขอไฟล์คีย์เชื่อมต่อจาก Google Firebase (ทำตามได้ใน 3 นาที)

1. เข้าไปที่เว็บ **[Google Firebase Console](https://console.firebase.google.com/)** แล้วเข้าสู่ระบบด้วยบัญชี Google (Gmail) ของคุณ
2. กดปุ่ม **"Add project"** (เพิ่มโครงการ) -> ตั้งชื่อโครงการ เช่น `sabuyphone-db` -> กด **Continue** จนเสร็จสิ้น
3. ที่เมนูด้านซ้าย เลือก **Build (สร้าง)** -> **Firestore Database** -> กด **Create database** -> เลือกตั้งค่าเป็น **Start in test mode** -> กด **Enable**
4. กดที่รูปฟันเฟือง ⚙️ (Project Settings) มุมบนซ้าย -> เลือกแท็บ **Service accounts** (บัญชีบริการ)
5. กดปุ่ม **"Generate new private key"** (สร้างคีย์ส่วนตัวใหม่) -> เบราว์เซอร์จะดาวน์โหลดไฟล์ `.json` มาให้
6. นำไฟล์ `.json` ที่ดาวน์โหลดมา เปลี่ยนชื่อไฟล์เป็น:
   ```
   firebase-service-account.json
   ```
7. นำไฟล์ `firebase-service-account.json` ไปวางไว้ในโฟลเดอร์โปรเจกต์นี้ (`c:\Users\neung\OneDrive\Desktop\ทำสัญญาออนไลน์\`)
8. รันรีสตาร์ทเซิร์ฟเวอร์ ระบบจะตรวจพบและขึ้นข้อความ:
   ```
   ✅ Google Firebase Cloud Firestore connected via service account file!
   ```

---

## 🔄 สิ่งที่ระบบซิงค์ให้อัตโนมัติ:
- 📝 **สัญญาทุกฉบับที่ลูกค้ากรอกเข้ามาใหม่**: จะถูกบันทึกส่งตรงขึ้นคลาวด์ Google Firestore ทันที
- 📦 **สินค้าและการแก้ไขราคา/ค่างวด**: ซิงค์อัปเดตแบบ Real-time
- 🗑️ **การลบรายการสัญญา**: ซิงค์ลบออกจากคลาวด์ Google โดยอัตโนมัติ
