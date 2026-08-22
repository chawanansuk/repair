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
  "id": "fb-001 | l8-001 | tt-001 | yt-001 | ig-001 | fbp-001",
  "platform": "facebook | facebook_personal_profile | lemon8 | tiktok | youtube | instagram",
  "post_id": "ID ของโพสต์บนแพลตฟอร์มต้นทาง",
  "url": "ลิงก์โพสต์",
  "date": "วันที่ยืนยันได้ หรือ null",
  "date_estimate": "คำอธิบายการประมาณช่วงเวลา",
  "date_confidence": "confirmed | estimated | unknown",
  "content": "ข้อความโพสต์ (verbatim เท่าที่ดัชนี search เก็บไว้)",
  "content_completeness": "full | title_full | partial_snippet | url_only",
  "topics": ["AI", "funnel"],
  "owner_comments": ["คอมเมนต์ของเจ้าของเพจใต้โพสต์ — รอบเก็บนี้ว่างทุกรายการ (ดู README)"],
  "source_urls": ["https://..."],
  "notes": "หมายเหตุเพิ่มเติม (ถ้ามี)"
}
```

ใน `posts.json` แบ่ง records เป็น 5 กลุ่ม: `facebook_page_posts`, `lemon8_posts`, `tiktok_videos`, `youtube_videos`, `instagram_posts`

## ข้อจำกัดของข้อมูล (สำคัญ — อ่านก่อนใช้)

- ข้อมูลรวบรวมจาก **ดัชนีของ search engine** ไม่ใช่การเปิดอ่านหน้า Facebook ตรงๆ
  เพราะ environment ที่รันงานนี้ถูกตั้ง network policy บล็อกการเข้าเว็บภายนอกทั้งหมด (รวม facebook.com)
- ทุก record ระบุ `source_urls` และระดับความสมบูรณ์ของเนื้อหา ตรวจสอบย้อนกลับได้
- record ที่เป็น `partial_snippet` คือข้อความบางส่วนของโพสต์จริง ไม่ใช่โพสต์เต็ม
- ไม่มีการแต่งเติมเนื้อหา — สิ่งที่ไม่พบจะระบุว่าไม่พบ
