# 📊 วิธีทำหน้าทำสัญญาผ่อนออนไลน์บน Google Apps Script (วิธีที่ 2 - ไม่มีหน้ากรอกเลข IP)

เมื่อทำตามขั้นตอนนี้ คุณจะได้ลิงก์ **`https://script.google.com/macros/s/.../exec`** ที่กดเปิดปุ๊บ จะเด้งเข้าหน้าทำสัญญาผ่อนของร้านสบายโฟนโดยตรงทันที **ไม่มีหน้ากรอกเลข IP** และเปิดใช้งานออนไลน์ได้ตลอด 24 ชั่วโมง ฟรี 100%!

---

## 📌 ขั้นตอนการตั้งค่า (ทำเพียง 1 นาที)

### 1. เปิด Google Sheet และเมนู Apps Script
1. เปิดตาราง **Google Sheet** ของคุณ
2. ที่เมนูด้านบน เลือก **ส่วนขยาย (Extensions)** ➔ **Apps Script**

---

### 2. วางโค้ดในไฟล์ `Code.gs`
ลบโค้ดเดิมในไฟล์ `Code.gs` ทิ้งทั้งหมด แล้วคัดลอกโค้ดด้านล่างนี้ไปวางแทนที่:

```javascript
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ร้านสบายโฟน บ้านไผ่ | ทำสัญญาผ่อนออนไลน์')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

    // หากยังไม่มีหัวข้อตาราง ให้สร้างหัวข้อให้อัตโนมัติในแถวแรก
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "เลขที่สัญญา", "วันที่ทำสัญญา", "ชื่อ-นามสกุล", "เบอร์โทรศัพท์", "เลขบัตรประชาชน",
        "รุ่นสินค้า", "สี", "ความจุ", "ราคาสินค้า", "เงินดาวน์", "ค่างวดต่อเดือน",
        "จำนวนงวด", "กำหนดชำระ (ทุกวันที่)", "สถานะ"
      ]);
      sheet.getRange(1, 1, 1, 14).setFontWeight("bold").setBackground("#8b5cf6").setFontColor("#ffffff");
    }

    // บันทึกสัญญาใหม่ลงในแถว
    sheet.appendRow([
      data.contract_no || ("SP" + Utilities.formatDate(new Date(), "GMT+7", "yyMMddHHmm")),
      data.created_at || Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm"),
      data.customer_name || (data.customer ? data.customer.name : ""),
      "'" + (data.phone || (data.customer ? data.customer.phone : "")),
      "'" + (data.id_card || (data.customer ? data.customer.id_card : "")),
      data.model || "",
      data.color || "",
      data.storage || "",
      data.price || 0,
      data.down_payment || 0,
      data.monthly_payment || 0,
      data.installments || 6,
      data.pay_day || 15,
      data.status || "pending"
    ]);

    return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "บันทึกสัญญาสำเร็จ" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

### 3. เพิ่มไฟล์ `index.html`
1. ที่แถบไฟล์ด้านซ้ายใน Apps Script กดปุ่ม **`+` (เพิ่มไฟล์)** ➔ เลือก **HTML**
2. ตั้งชื่อไฟล์ว่า `index` (จะได้ไฟล์ชื่อ `index.html`)
3. ลบโค้ดเดิมในไฟล์ `index.html` ทิ้ง แล้วคัดลอกโค้ดจากไฟล์ `public/index.html` ของโปรเจกต์คุณไปวางใส่ในไฟล์ `index.html`

---

### 4. กดเปิดใช้งานลิงก์ (Deploy as Web App)
1. กดปุ่ม **ทำให้ใช้งานได้อย่างเป็นทางการ (Deploy)** มุมขวาบน ➔ เลือก **การทำให้ใช้งานได้อย่างเป็นทางการรายการใหม่ (New deployment)**
2. ตรงไอคอนเฟือง ⚙️ เลือก **เว็บแอป (Web App)**
3. ตั้งค่า 2 ช่องนี้:
   - **Execute as (ทำงานในนาม)**: เลือก `Me (บัญชีของคุณ)`
   - **Who has access (ผู้มีสิทธิ์เข้าถึง)**: เลือก `Anyone (ทุกคน)` *(สำคัญมาก! เพื่อให้ทุกคนเปิดลิงก์ได้ตรงๆ)*
4. กดปุ่ม **Deploy** ➔ กดยืนยันให้สิทธิ์ (Allow access)
5. คัดลอก **URL เว็บแอป (Web App URL)** ที่ได้มา (เช่น `https://script.google.com/macros/s/AKfycb.../exec`)

🎉 **เสร็จเรียบร้อย! นำลิงก์นี้ไปส่งให้ลูกค้าทำสัญญาได้ทันที กดเปิดปุ๊บเข้าหน้าหลักปั๊บ ไม่มีหน้ากรอกเลข IP อีกต่อไปครับ!**
