# 📊 ขั้นตอนการตั้งค่าส่งข้อมูลสัญญาเข้า Google Sheets ทันที (เปิดดูบนมือถือได้เลย)

ระบบนี้รองรับการส่งข้อมูลสัญญาฉบับใหม่ทุกฉบับเข้า **Google Sheets (Google ชีต)** ของคุณโดยอัตโนมัติ ช่วยให้เจ้าของร้านและแอดมินเปิดดูรายการสัญญา สรุปยอด และเช็คข้อมูลผ่านแอป Google Sheets บนโทรศัพท์มือถือได้ง่ายและสะดวกที่สุด!

---

## 📌 วิธีตั้งค่า Google Sheets (ใช้เวลาเพียง 1 นาที)

### ขั้นตอนที่ 1: สร้าง Google Sheets และใส่โค้ดเชื่อมต่อ
1. เปิดเว็บ **[Google Sheets](https://sheets.google.com)** แล้วสร้างสเปรดชีตใหม่ 1 แผ่น (ตั้งชื่อตามต้องการ เช่น *สัญญาผ่อนสบายโฟน*)
2. ที่เมนูด้านบน เลือก **ส่วนขยาย (Extensions)** -> **Apps Script**
3. ลบโค้ดเก่าทิ้งทั้งหมด แล้วก๊อปปี้โค้ดด้านล่างนี้ไปวางแทนที่:

```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

    // หากแถบแรกยังไม่มีหัวข้อ ให้สร้างหัวข้อให้อัตโนมัติ
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "เลขที่สัญญา", "วันที่ทำสัญญา", "ชื่อ-นามสกุล", "เบอร์โทรศัพท์", "เลขบัตรประชาชน",
        "รุ่นสินค้า", "สี", "ความจุ", "ราคาสินค้า", "เงินดาวน์", "ค่างวดต่อเดือน",
        "จำนวนงวด", "กำหนดชำระ (ทุกวันที่)", "สถานะ"
      ]);
      sheet.getRange(1, 1, 1, 14).setFontWeight("bold").setBackground("#3b82f6").setFontColor("#ffffff");
    }

    // เพิ่มแถวข้อมูลใหม่
    sheet.appendRow([
      data.contract_no,
      data.created_at,
      data.customer_name,
      "'" + data.phone,
      "'" + data.id_card,
      data.model,
      data.color,
      data.storage,
      data.price,
      data.down_payment,
      data.monthly_payment,
      data.installments,
      data.pay_day,
      data.status
    ]);

    return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

### ขั้นตอนที่ 2: กดสร้างลิงก์ Webhook
1. กดปุ่ม **ทำให้ใช้งานได้อย่างเป็นทางการ (Deploy)** มุมขวาบน -> เลือก **การทำให้ใช้งานได้อย่างเป็นทางการรายการใหม่ (New deployment)**
2. ตรงช่องเฟือง ⚙️ (Select type) เลือก **เว็บแอป (Web app)**
3. ตั้งค่าการเข้าถึงดังนี้:
   - **Execute as (สิทธิ์ทำงานในนาม)**: เลือก `Me (บัญชีของคุณ)`
   - **Who has access (ผู้มีสิทธิ์เข้าถึง)**: เลือก `Anyone (ทุกคน)` *(สำคัญมาก! เพื่อให้เซิร์ฟเวอร์ส่งข้อมูลเข้าได้)*
4. กดปุ่ม **Deploy** -> กดยืนยันให้สิทธิ์ (Allow access)
5. ก๊อปปี้ **URL เว็บแอป (Web app URL)** ที่ได้มา (เช่น `https://script.google.com/macros/s/AKfycbx.../exec`)

---

### ขั้นตอนที่ 3: นำลิงก์ไปใส่ในไฟล์ `.env`
เปิดไฟล์ `.env` ในโฟลเดอร์โปรเจกต์ แล้วนำลิงก์ Web app URL ที่ก๊อปปี้ได้ไปวางต่อท้าย:

```env
GOOGLE_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbx.../exec
```

**เสร็จเรียบร้อย!** หลังจากนี้เมื่อมีลูกค้าทำสัญญาใหม่ ข้อมูลสัญญาจะเด้งเข้าไปใน Google Sheets บนมือถือของคุณโดยอัตโนมัติทันทีครับ 🎉
