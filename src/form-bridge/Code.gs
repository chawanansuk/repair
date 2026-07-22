/**
 * สะพานฟอร์มแจ้งงาน → แท็บ "งาน" ของชีตหอพัก
 * =================================================================
 * สคริปต์นี้ผูกกับ "Google Form แจ้งงานซ่อมบำรุง" (เปิดจากตัวแก้ไขฟอร์ม)
 * ไม่ใช่สคริปต์ของชีตหอพัก — ไม่ยุ่งกับ Apps Script เดิมที่ dashboard ใช้
 *
 * พฤติกรรม: เมื่อมีคนส่งฟอร์ม → ต่อท้ายแถวใหม่ในแท็บ "งาน" เท่านั้น
 * (append อย่างเดียว ไม่แก้ไข/ลบแถวเดิมเด็ดขาด)
 *
 * ติดตั้ง: ดู FORM-SETUP.md (สรุป: ใส่ ID ชีตหอพัก → รัน setup หนึ่งครั้ง)
 */

var CONFIG = {
  // ===== แก้ค่านี้: ID ของชีตหอพัก (จาก URL ระหว่าง /d/ กับ /edit) =====
  SOURCE_SPREADSHEET_ID: 'ใส่_ID_ชีตหอพักตรงนี้',

  SOURCE_SHEET_NAME: 'งาน',
  TZ: 'Asia/Bangkok',

  // สถานะเริ่มต้นของงานที่เพิ่งแจ้ง — ต้องตรงกับคำที่ dashboard เดิมใช้อยู่
  NEW_JOB_STATUS: 'รอดำเนินการ',
  COMMON_AREA: 'ส่วนกลาง',
  CREATOR_FALLBACK: 'ฟอร์มแจ้งงาน', // ใช้เมื่อฟอร์มไม่ได้เก็บอีเมลผู้ส่ง

  // ชื่อคำถามในฟอร์ม — ต้องพิมพ์หัวข้อคำถามในฟอร์มให้ตรงกับค่าเหล่านี้เป๊ะ
  Q: {
    type: 'ประเภทงาน',
    area: 'พื้นที่',                    // ตัวเลือก: "ห้องพัก" / "ส่วนกลาง"
    building: 'ตึก',
    room: 'เลขห้อง (ถ้าเป็นห้องพัก)',
    customer: 'ชื่อลูกค้า/ผู้แจ้ง',
    phone: 'เบอร์ติดต่อ',
    note: 'รายละเอียดงาน'
  },

  // หัวคอลัมน์ในแท็บ "งาน" — หาตำแหน่งจากชื่อหัวจริง ไม่ใช่เลขคอลัมน์ตายตัว
  HEADERS: {
    date: 'วันที่',
    type: 'ประเภท',
    building: 'ตึก',
    room: 'ห้อง',
    customer: 'ลูกค้า',
    phone: 'เบอร์',
    note: 'หมายเหตุ',
    status: 'สถานะ',
    creator: 'ผู้สร้าง',
    created: 'วันที่สร้าง',
    cost: 'ค่าใช้จ่าย',
    id: 'id'
  }
};

/** รันครั้งแรกหนึ่งครั้งจากตัวแก้ไขสคริปต์ — สร้าง trigger รับฟอร์ม (idempotent) */
function setup() {
  if (!CONFIG.SOURCE_SPREADSHEET_ID || CONFIG.SOURCE_SPREADSHEET_ID.indexOf('ใส่_ID') === 0) {
    throw new Error('ยังไม่ได้ตั้งค่า SOURCE_SPREADSHEET_ID ใน Code.gs');
  }
  // ทดสอบว่าเปิดชีตปลายทางได้จริงและหัวคอลัมน์ครบ ตั้งแต่ตอนติดตั้ง
  buildHeaderIndex_(getTargetSheet_());

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitted') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmitted')
    .forForm(FormApp.getActiveForm())
    .onFormSubmit()
    .create();
}

/** ทำงานทุกครั้งที่มีคนกดส่งฟอร์ม */
function onFormSubmitted(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000); // กันสองคนส่งพร้อมกันแล้วแถวชนกัน
  try {
    var answers = collectAnswers_(e.response);
    var sheet = getTargetSheet_();
    var headerIndex = buildHeaderIndex_(sheet);

    var now = new Date();
    var row = [];
    for (var i = 0; i < headerIndex.width; i++) row.push('');

    var put = function (key, value) {
      var col = headerIndex.byKey[key];
      if (col !== undefined) row[col] = value;
    };

    var isCommon = (answers[CONFIG.Q.area] || '').trim() === CONFIG.COMMON_AREA;

    put('date', now); // เซลล์ Date จริง — dashboard เดิมและระบบรายงานอ่านได้ทั้งคู่
    put('type', (answers[CONFIG.Q.type] || '').trim() || 'อื่นๆ');
    put('building', (answers[CONFIG.Q.building] || '').trim());
    put('room', isCommon ? CONFIG.COMMON_AREA : (answers[CONFIG.Q.room] || '').trim());
    put('customer', (answers[CONFIG.Q.customer] || '').trim());
    put('phone', keepAsText_((answers[CONFIG.Q.phone] || '').trim()));
    put('note', (answers[CONFIG.Q.note] || '').trim());
    put('status', CONFIG.NEW_JOB_STATUS);
    put('creator', respondentEmail_(e.response) || CONFIG.CREATOR_FALLBACK);
    put('created', now);
    put('cost', '');            // ค่าใช้จ่ายใส่ตอนปิดงานในชีต
    put('id', generateId_(now));

    sheet.appendRow(row); // ต่อท้ายอย่างเดียว — ไม่แตะแถวเดิม
  } finally {
    lock.releaseLock();
  }
}

// =================================================================
// helpers
// =================================================================

function getTargetSheet_() {
  var sheet = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID)
    .getSheetByName(CONFIG.SOURCE_SHEET_NAME);
  if (!sheet) {
    throw new Error('ไม่พบแท็บ "' + CONFIG.SOURCE_SHEET_NAME + '" ในชีตหอพัก');
  }
  return sheet;
}

/** map หัวคอลัมน์จริงในแท็บงาน → ตำแหน่ง พร้อมตรวจว่าหัวที่ต้องใช้ครบ */
function buildHeaderIndex_(sheet) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var byName = {};
  header.forEach(function (h, i) {
    var name = String(h || '').trim();
    if (name && byName[name] === undefined) byName[name] = i;
  });
  var byKey = {};
  var missing = [];
  Object.keys(CONFIG.HEADERS).forEach(function (key) {
    var name = CONFIG.HEADERS[key];
    if (byName[name] === undefined) missing.push(name);
    else byKey[key] = byName[name];
  });
  if (missing.length) {
    throw new Error('แท็บ "งาน" ไม่มีหัวคอลัมน์: ' + missing.join(', '));
  }
  return { byKey: byKey, width: header.length };
}

/** คำตอบทั้งหมดของฟอร์ม เป็น { ชื่อคำถาม: คำตอบ } */
function collectAnswers_(formResponse) {
  var out = {};
  formResponse.getItemResponses().forEach(function (ir) {
    var v = ir.getResponse();
    out[ir.getItem().getTitle()] = Array.isArray(v) ? v.join(', ') : String(v);
  });
  return out;
}

function respondentEmail_(formResponse) {
  try {
    return formResponse.getRespondentEmail(); // มีค่าเมื่อฟอร์มตั้งค่าเก็บอีเมล
  } catch (err) {
    return '';
  }
}

/** กันเบอร์โทรที่ขึ้นต้นด้วย 0 ถูกชีตแปลงเป็นตัวเลขจนศูนย์หาย */
function keepAsText_(s) {
  return /^0\d+$/.test(s) ? "'" + s : s;
}

/**
 * id ของงานจากฟอร์ม เช่น F-20260722-081530-3f2a
 * ถ้า dashboard เดิมคาดหวังรูปแบบ id เฉพาะ (เช่น เลขรันต่อเนื่อง) แก้ฟังก์ชันนี้ให้ตรง
 */
function generateId_(now) {
  return 'F-' + Utilities.formatDate(now, CONFIG.TZ, 'yyyyMMdd-HHmmss') +
    '-' + Utilities.getUuid().slice(0, 4);
}
