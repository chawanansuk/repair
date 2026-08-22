# โครงสร้างฐานข้อมูล AI — เพจ "หัวหน้าแบงค์ FullFunnel"

ฐานข้อมูลนี้ออกแบบให้ AI (เช่น Claude API, RAG pipeline, chatbot) นำไปใช้ต่อได้ทันที

## ไฟล์ในฐานข้อมูล

| ไฟล์ | รูปแบบ | ใช้ทำอะไร |
|---|---|---|
| `data/page-profile.json` | JSON | ข้อมูลตัวตนเพจ เจ้าของ แบรนด์ ธุรกิจ |
| `data/posts.json` | JSON array | โพสต์/เนื้อหาที่รวบรวมได้ พร้อมที่มาและวันที่ (เท่าที่ยืนยันได้) |
| `data/topics.json` | JSON | หัวข้อ/แนวคิดที่เพจสอนซ้ำๆ สกัดเป็น knowledge units |
| `knowledge-base.md` | Markdown | ฐานความรู้ฉบับอ่านง่าย สำหรับป้อนเป็น context ให้ AI โดยตรง |
| `data/sources.json` | JSON | รายการแหล่งที่มาทั้งหมด (URL) พร้อมระดับความเชื่อมั่น |

## Schema ของ `posts.json`

```json
{
  "id": "post-001",
  "date": "2026-07-15 หรือ null ถ้าไม่ทราบแน่ชัด",
  "date_confidence": "confirmed | estimated | unknown",
  "platform": "facebook",
  "content": "ข้อความโพสต์ (verbatim เท่าที่ดัชนี search เก็บไว้)",
  "content_completeness": "full | partial_snippet",
  "topics": ["AI", "funnel"],
  "owner_comments": ["คอมเมนต์ของเจ้าของเพจใต้โพสต์ ถ้ามีข้อมูล"],
  "source_urls": ["https://..."]
}
```

## ข้อจำกัดของข้อมูล (สำคัญ — อ่านก่อนใช้)

- ข้อมูลรวบรวมจาก **ดัชนีของ search engine** ไม่ใช่การเปิดอ่านหน้า Facebook ตรงๆ
  เพราะ environment ที่รันงานนี้ถูกตั้ง network policy บล็อกการเข้าเว็บภายนอกทั้งหมด (รวม facebook.com)
- ทุก record ระบุ `source_urls` และระดับความสมบูรณ์ของเนื้อหา ตรวจสอบย้อนกลับได้
- record ที่เป็น `partial_snippet` คือข้อความบางส่วนของโพสต์จริง ไม่ใช่โพสต์เต็ม
- ไม่มีการแต่งเติมเนื้อหา — สิ่งที่ไม่พบจะระบุว่าไม่พบ
