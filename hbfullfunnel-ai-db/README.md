# ฐานข้อมูล AI — เพจ Facebook "หัวหน้าแบงค์ FullFunnel"

ฐานข้อมูลโพสต์และตัวตนของเพจ [facebook.com/hbfullfunnel](https://www.facebook.com/hbfullfunnel)
(หัวหน้าแบงค์ FullFunnel — อ.วงศกร ธนูถนัด) สำหรับนำไปใช้กับ AI (RAG, chatbot, context ให้ Claude/ChatGPT)

## ไฟล์

| ไฟล์ | เนื้อหา |
|---|---|
| [`knowledge-base.md`](knowledge-base.md) | **เริ่มอ่านที่นี่** — ฐานความรู้ฉบับสมบูรณ์ ใช้เป็น context ให้ AI ได้ทันที |
| [`data/page-profile.json`](data/page-profile.json) | ตัวตนเพจ เจ้าของ บริษัท สินค้า ช่องทาง ไทม์ไลน์ |
| [`data/posts.json`](data/posts.json) | โพสต์ทั้งหมดที่กู้คืนได้ ~95 รายการ (Facebook 29, Lemon8 48, TikTok 15, YouTube 3, IG 1) พร้อม URL ที่มา |
| [`data/topics.json`](data/topics.json) | หัวข้อที่สอน สูตรการเขียนโพสต์ use case ธุรกิจ |
| [`data/sources.json`](data/sources.json) | แหล่งที่มา + ระดับความเชื่อมั่น + สิ่งที่หาไม่พบ |
| [`schema.md`](schema.md) | โครงสร้างข้อมูล |

## วิธีเก็บข้อมูล และข้อจำกัด

งานนี้รันใน Claude Code บนคลาวด์ ซึ่ง **network policy ของ environment บล็อกการเข้าเว็บภายนอกเกือบทั้งหมด**
(ทดสอบแล้วทั้ง facebook.com ทุก subdomain, mbasic/m/web.facebook, เว็บเป้าหมาย hbfullfunnel.com,
Wayback Machine, Google cache, proxy reader — โดนบล็อกที่ระดับ proxy ทั้งหมด)

ช่องทางเดียวที่ใช้ได้คือ **WebSearch** จึงใช้การค้น ~200 queries จาก 8 มุมมอง แล้วกู้เนื้อหาโพสต์จาก
ข้อความที่ search engine เคย index ไว้ (ส่วนใหญ่เป็นท่อนเปิดโพสต์จาก URL slug/title — verbatim แต่ถูกตัด)

**สิ่งที่ฐานข้อมูลนี้จึงไม่มี:**
- ❌ เนื้อหาโพสต์ฉบับเต็ม + วันที่โพสต์แน่นอนของ Facebook
- ❌ **คอมเมนต์ของเจ้าของเพจใต้โพสต์** (Facebook ไม่เปิด comment ให้ search engine — กู้ไม่ได้เลย)
- ❌ ยอด engagement รายโพสต์

## วิธีได้ข้อมูลครบ 100% (โพสต์เต็ม + วันที่ + คอมเมนต์ ย้อนหลัง 3 เดือน)

เลือกทางใดทางหนึ่ง:

1. **แก้ network policy ของ environment นี้** — ไปที่ [claude.ai/code](https://claude.ai/code) → Environment settings →
   Network access → เปลี่ยนเป็นอนุญาตทุกโดเมน (หรือเพิ่ม `*.facebook.com`) แล้วสั่งรันงานนี้อีกรอบ
   ผมจะเปิดเพจด้วย browser (Playwright มีอยู่แล้วใน environment) แล้วเก็บโพสต์+คอมเมนต์ย้อนหลัง 3 เดือนให้ครบ
   (หมายเหตุ: Facebook อาจขึ้น login wall — ถ้ามี ให้ใช้วิธีข้อ 2 หรือ 3)
2. **ถ้าคุณเป็นแอดมินเพจนี้ (ทางที่ดีที่สุด):**
   - Meta Business Suite → Insights/Content export หรือ
   - Facebook → Settings → "Download Your Information" เลือก Posts + Comments ช่วง 3 เดือน (ได้ JSON ครบทุกโพสต์ทุกคอมเมนต์ ถูกต้องตามนโยบาย) หรือ
   - Graph API: `GET /{page-id}/published_posts?fields=message,created_time,comments{from,message,created_time}` ด้วย Page Access Token
   แล้วส่งไฟล์ให้ผมแปลงเข้าโครงสร้างฐานข้อมูลนี้ได้ทันที
3. **รัน Claude Code บนเครื่องตัวเอง** (ไม่มี network block) แล้วให้เปิดเพจเก็บข้อมูลโดยตรง

## สถิติการเก็บข้อมูลรอบนี้ (22 ส.ค. 2026)

- 12 research agents / ~200 search queries / 8 มุมมองการค้น
- โพสต์ Facebook ที่กู้ข้อความได้: 26 โพสต์ (+2 โพสต์รูปที่ได้แต่ URL) — ในจำนวนนี้ 11 โพสต์เป็นคลัสเตอร์ Claude/Cowork ยุค 2026 ที่น่าจะใกล้/อยู่ในช่วง 3 เดือนล่าสุด
- คอนเทนต์ข้ามแพลตฟอร์ม: Lemon8 48, TikTok 15, YouTube 3, Instagram 1
- ยืนยันวันที่อยู่ในช่วง 22 พ.ค.–22 ส.ค. 2026 ได้: 2 รายการ (TikTok ~14 ก.ค., Lemon8 ~มิ.ย.)
