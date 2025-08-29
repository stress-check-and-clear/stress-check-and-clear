# stress-check-and-clear
# Stress Check (SPST-20) — Web App + Google Apps Script

เครื่องมือประเมินความเครียด **SPST-20** พร้อมแนวทางคลายเครียดและแบบประเมินความพึงพอใจ (Google Form)  
บันทึกข้อมูลลง **Google Sheets** ผ่าน **Google Apps Script (Web App)** — ไม่ต้องมีเซิร์ฟเวอร์ส่วนตัว

> ⚠️ ผลลัพธ์เป็นการคัดกรองเบื้องต้น **ไม่ใช่การวินิจฉัยทางการแพทย์**  
> หากอยู่ในภาวะวิกฤต โปรดติดต่อสายด่วนสุขภาพจิต 1323 หรือ 1669 (การแพทย์ฉุกเฉิน)

---

## คุณสมบัติเด่น

- แบบประเมิน **SPST-20** (20 ข้อ) + แปลผล (น้อย/ปานกลาง/สูง/รุนแรง)
- ส่วนคลายเครียด: เลือกกิจกรรม (เพลง / ฝึกหายใจ / วิดีโอ / เกมสั้น ๆ)
- แบบประเมินความพึงพอใจ (Google Form) แบบฝังในหน้า
- เก็บข้อมูลแบบ **event-based** ลงชีท (มี `user_id` / `uid` สำหรับอ้างอิง)
- ป้องกันการทำซ้ำด้วยสถานะ **`completed`**
- เข้าถึงได้ (มี ARIA / aria-live / โฟกัสที่ชัดเจน)

---

## โครงสร้างโปรเจกต์

```
/
├─ index.html             # หน้าเว็บหลัก (UI และโฟลว์ทั้งหมด)
├─ styles.css             # สไตล์ของเว็บ
├─ app.js                 # ลอจิกฝั่งหน้าเว็บ + เรียก Apps Script
├─ stress-logo.png        # โลโก้ (ตัวอย่าง)
├─ apps-script/Code.gs    # โค้ด Google Apps Script (Web App)
└─ docs/StressCheck_Data_Dictionary.html  # เอกสาร Data Dictionary (ให้ลูกค้าดู)
```

> แนะนำวาง **Code.gs** ไว้ในโฟลเดอร์ `apps-script/` เพื่อความเป็นระเบียบ และวาง **Data Dictionary** ในโฟลเดอร์ `docs/` เพื่อเปิดผ่าน GitHub Pages ได้

---

## สถาปัตยกรรม (Architecture)

```
[Browser: index.html + styles.css + app.js]
      │
      ├─ POST { action: "init" | "saveConsent" | "saveAssessment" | "saveChoice" | "saveGame" | "saveFormDone" }
      │    Content-Type: text/plain  (payload เป็น JSON)
      ▼
[Google Apps Script (Web App)]
  doGet / doPost
      │
      ▼
[Google Sheets]
  ├─ Users
  ├─ Part1_Assessments
  ├─ Part2_Activities
  └─ Part3_Feedback
```

---

## เริ่มใช้งานแบบเร็ว (Quick Start)

### 1) ตั้งค่า Google Apps Script

1. สร้าง **Google Spreadsheet** เปล่า 1 ไฟล์  
2. เปิด `Extensions → Apps Script` แล้ววาง **`apps-script/Code.gs`** (จากโปรเจกต์นี้)
3. รันฟังก์ชัน `resetSchema()` **หนึ่งครั้ง** เพื่อสร้าง 4 แท็บ:
   - `Users`, `Part1_Assessments`, `Part2_Activities`, `Part3_Feedback`
4. Deploy → **New deployment** → เลือก **Web app**
   - **Execute as:** *Me*
   - **Who has access:** *Anyone*
   - คัดลอก URL `/exec` (เช่น `https://script.google.com/macros/s/xxxxx/exec`)

### 2) ตั้งค่าเว็บ (Frontend)

เปิดไฟล์ `app.js` แล้วแก้ค่า:

```js
// ใส่ URL จากการ Deploy ของคุณ
const WEB_APP_URL = "https://script.google.com/macros/s/xxxxx/exec";

// (เลือกได้) เปลี่ยนเป็นลิงก์ Google Form ของคุณเอง
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/....../viewform?embedded=true";

// (แนะนำ) วอร์มอัพ Apps Script แก้อาการหน้าแรกช้า (cold start)
fetch(WEB_APP_URL).catch(()=>{});
```

### 3) รันหน้าเว็บ

- เปิด `index.html` ตรง ๆ ในเบราว์เซอร์ได้ทันที  
  หรือโฮสต์ด้วย GitHub Pages / Netlify / Cloudflare Pages ก็ได้

---

## แบบจำลองข้อมูล (Data Model)

> รายละเอียดแบบสวยงามสำหรับส่งลูกค้า ดูที่: `docs/StressCheck_Data_Dictionary.html`

สรุปสั้น ๆ:

### Users (`user_id`, `uid`, `created_at`, `completed`)
หนึ่งแถว = ผู้ใช้หนึ่งคน (ยึดตามอุปกรณ์/เบราว์เซอร์)  
`completed` = `"yes"` เมื่อผู้ใช้ยืนยันส่งแบบประเมินความพึงพอใจ

### Part1_Assessments (เหตุการณ์ของส่วนที่ 1)

- แถว **consent**: บันทึก `consent=yes/no`  
- แถว **คะแนน**: `score` (20–100), `level`, `answers_json`

### Part2_Activities (กิจกรรมส่วนที่ 2)

`action=choice/game`, `detail=music/breath/game/video` หรือ `focus/memory`, `value` = คะแนนเกม (หรือว่าง)

### Part3_Feedback (สถานะยืนยัน Google Form)

`form_done=yes/no` (เมื่อ `yes` → `Users.completed=yes`)

---

## API (Apps Script Web App)

> ทุกคำสั่งส่ง **JSON ใน body** แต่ประกาศ `Content-Type: text/plain`

### `GET /exec`
เช็คการทำงานเบื้องต้น (warm-up)  
**Response**: `{"ok":true,"method":"GET","hint":"POST {action:...}"}`

### `POST /exec` — init

```json
{ "action": "init", "uid": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }
```
**Response**
```json
{ "ok": true, "uid": "<uuid>", "user_id": 1, "created": true, "completed": false }
```

### `POST /exec` — saveConsent

```json
{ "action": "saveConsent", "uid": "<uuid>", "consent": true }
```

### `POST /exec` — saveAssessment

```json
{
  "action": "saveAssessment",
  "uid": "<uuid>",
  "score": 57,
  "level": "ระดับสูง",
  "answers": { "1":3, "2":2, "...":"...", "20":4 }
}
```
**Response**
```json
{ "ok": true, "severe": false }
```

### `POST /exec` — saveChoice

```json
{ "action": "saveChoice", "uid": "<uuid>", "choice": "breath" }
```

### `POST /exec` — saveGame

```json
{ "action": "saveGame", "uid": "<uuid>", "game": "focus", "score": 12 }
```

### `POST /exec` — saveFormDone

```json
{ "action": "saveFormDone", "uid": "<uuid>", "done": true }
```
**Response**
```json
{ "ok": true, "completed": true }
```

> ถ้า `Users.completed = "yes"` แล้ว: API จะตอบ `{ ok:false, error:"user_completed" }` เพื่อกันการส่งซ้ำ

---

## การทดสอบด้วย cURL

**macOS / Linux (bash/zsh)**
```bash
# doGet
curl "https://script.google.com/macros/s/xxxxx/exec"

# init
curl -X POST "https://script.google.com/macros/s/xxxxx/exec" \
  -H "Content-Type: text/plain" \
  -d '{"action":"init","uid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}'
```

**Windows CMD**
```bat
:: doGet
curl "https://script.google.com/macros/s/xxxxx/exec"

:: init
curl -X POST "https://script.google.com/macros/s/xxxxx/exec" ^
  -H "Content-Type: text/plain" ^
  -d "{\"action\":\"init\",\"uid\":\"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\"}"
```

**Windows PowerShell**
```powershell
# doGet
Invoke-WebRequest -Uri "https://script.google.com/macros/s/xxxxx/exec"

# init
$body = '{"action":"init","uid":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}'
Invoke-WebRequest -Method POST -Uri "https://script.google.com/macros/s/xxxxx/exec" -Body $body -ContentType "text/plain"
```

> เห็นหน้า “Moved Temporarily” ได้ — เป็นปกติของ Apps Script (redirect ไป domain `script.googleusercontent.com`) ใช้ URL `/exec` เดิมได้

---

## การเข้าถึงได้ (Accessibility)

- ใช้ `aria-live`, `aria-label`, และลำดับโฟกัสชัดเจน  
- `:focus-visible` ring สำหรับปุ่มและคอนโทรล  
- มี toast/modal แจ้งสถานะและข้อผิดพลาดแบบไม่รบกวน

---

## ความเป็นส่วนตัว/ความปลอดภัย

- ไม่เก็บข้อมูลระบุตัวตนส่วนบุคคล — ใช้ **UUID (`uid`)** ต่ออุปกรณ์/เบราว์เซอร์ (เก็บใน `localStorage`)
- ข้อมูลอยู่ใน Google Sheets ของเจ้าของระบบ (ผ่านบัญชี Google)
- ใช้ `Content-Type: text/plain` ลด CORS complexity, แถม retry/timeout ใน `app.js`

---

## Troubleshooting

- **หน้าแรกช้า**: เพิ่ม
  ```js
  fetch(WEB_APP_URL).catch(()=>{});
  ```
  เพื่อวอร์มอัพ Apps Script ตอนโหลดหน้า (แก้ cold start)
- **Users ซ้ำหลายแถว**: คนละเบราว์เซอร์/อุปกรณ์ = `uid` ต่างกันเป็นเรื่องปกติ  
  ถ้าเครื่องเดียวซ้ำ ให้เช็กว่า `localStorage` ถูกบล็อกหรือถูกลบอัตโนมัติหรือไม่
- **403/404/Permission**: ตอน Deploy ให้ตั้ง `Who has access = Anyone`
- **ส่งข้อมูลไม่เข้า**: เปิด DevTools → แท็บ Network → ดู `POST /exec` และ response  
- **ต้องเริ่มใหม่ทั้งระบบ**: รัน `resetSchema()` (ข้อมูลจะถูกล้างและสร้างหัวใหม่)

---

## การปรับแต่ง

- เปลี่ยนโลโก้: แทนที่ `stress-logo.png`
- เปลี่ยนธีมสี: ปรับ CSS ตัวแปร `--brand`, `--bg`, `--ink`, …
- เปลี่ยนลิงก์ Google Form: ตั้งค่า `GOOGLE_FORM_URL` ใน `app.js`
- ต้องการแดชบอร์ด: ใช้ Google Sheets Pivot / Looker Studio เชื่อมโดยตรง

---

## ใบอนุญาต / เครดิต

- เกณฑ์ SPST-20 อ้างอิงจากกรมสุขภาพจิต (เพื่อคัดกรองเบื้องต้น)  
- คุณสามารถกำหนด **ใบอนุญาตซอฟต์แวร์** ของโปรเจกต์นี้ได้เอง (เช่น MIT)

---

## ผู้ดูแล

- ทีมพัฒนา: _ใส่ชื่อทีม/องค์กรของคุณ_  
- ติดต่อ: _อีเมล/เว็บไซต์/เบอร์โทร (ถ้ามี)_

---

### ภาคผนวก

- เอกสาร Data Dictionary (ฉบับพิมพ์สวย): `docs/StressCheck_Data_Dictionary.html`  
  แนะนำเปิดไฟล์นี้แล้ว **Print → Save as PDF** เพื่อส่งลูกค้า
