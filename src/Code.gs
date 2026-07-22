/**
 * ระบบรายงานงานซ่อมบำรุงรายเดือน
 * =================================================================
 * สคริปต์นี้ผูกกับ "ไฟล์รายงาน" (Google Sheet ไฟล์ใหม่) เท่านั้น
 *
 * กติกาความปลอดภัยของชีตต้นทาง:
 *   - ชีตต้นทางถูกเรียกที่จุดเดียวคือ readSourceRows_() และใช้เฉพาะ
 *     openById(...).getSheetByName(...).getDataRange().getValues()
 *   - ห้ามเพิ่ม method ที่เขียน/แก้ไขใดๆ ต่อ object ของชีตต้นทางเด็ดขาด
 *
 * การติดตั้ง: ดู README.md (สรุป: ใส่ SOURCE_SPREADSHEET_ID แล้วรัน setup หนึ่งครั้ง)
 */

var CONFIG = {
  // ===== แก้ค่านี้ค่าเดียว: ID ของชีตหอพัก (จาก URL ระหว่าง /d/ กับ /edit) =====
  SOURCE_SPREADSHEET_ID: 'ใส่_ID_ชีตหอพักตรงนี้',

  SOURCE_SHEET_NAME: 'งาน',
  TZ: 'Asia/Bangkok',

  MONTHLY_SHEET: 'รายงานรายเดือน',
  YEARLY_SHEET: 'สรุปทั้งปี',
  CACHE_SHEET: '_data',

  // หาตำแหน่งคอลัมน์จากชื่อหัวตาราง ไม่ใช่เลขคอลัมน์ตายตัว
  HEADERS: {
    date: 'วันที่',
    type: 'ประเภท',
    building: 'ตึก',
    room: 'ห้อง',
    note: 'หมายเหตุ',
    status: 'สถานะ',
    cost: 'ค่าใช้จ่าย'
  },

  DONE_STATUSES: ['เสร็จ', 'done', 'ปิดแล้ว'],   // เทียบแบบ trim + lowercase
  KNOWN_TYPES: ['ซ่อม', 'ทำสะอาด', 'ชมห้อง', 'ย้ายเข้า', 'ย้ายออก'],
  OTHER_TYPE: 'อื่นๆ',
  COMMON_AREA: 'ส่วนกลาง',

  // ตำแหน่งเซลล์ควบคุมบนแท็บรายงานรายเดือน (แถว 2)
  MONTH_CELL: 'B2',   // dropdown เดือน
  YEAR_CELL: 'D2',    // dropdown ปี
  STAMP_CELL: 'E2',   // เวลารีเฟรชล่าสุด (merge E2:F2)

  // ตำแหน่งเซลล์ควบคุมบนแท็บสรุปทั้งปี
  YEARLY_YEAR_CELL: 'B2',
  YEARLY_STAMP_CELL: 'G2' // merge G2:I2
};

var THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

var COLOR = {
  TITLE: '#263238',
  SECTION_BG: '#37474f',
  SECTION_FG: '#ffffff',
  HEADER_BG: '#eceff1',
  TOTAL_BG: '#f5f5f5',
  MUTED: '#9e9e9e'
};

// =================================================================
// เมนู + จุดเริ่มต้น
// =================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('รายงานซ่อมบำรุง')
    .addItem('🔄 รีเฟรชรายงาน', 'menuRefresh')
    .addSeparator()
    .addItem('⚙️ ตั้งค่าครั้งแรก (สร้างแท็บ + trigger)', 'setup')
    .addToUi();
}

/** รันครั้งแรกหนึ่งครั้ง: สร้างแท็บ, dropdown, trigger รายวัน แล้วดึงข้อมูลรอบแรก */
function setup() {
  var ss = SpreadsheetApp.getActive();
  ensureMonthlySheet_(ss);
  ensureYearlySheet_(ss);
  ensureCacheSheet_(ss);
  installDailyTrigger_();
  refreshReport();
}

/** เรียกจากเมนู — มี alert แจ้ง error ให้ผู้ใช้เห็น */
function menuRefresh() {
  try {
    refreshReport();
    SpreadsheetApp.getActive().toast('ดึงข้อมูลล่าสุดเรียบร้อย', 'รีเฟรชรายงาน', 5);
  } catch (err) {
    SpreadsheetApp.getUi().alert('รีเฟรชไม่สำเร็จ: ' + err.message);
  }
}

/**
 * ดึงข้อมูลล่าสุดจากชีตต้นทาง → เก็บลงแคช → สร้างรายงานใหม่ทั้งสองแท็บ
 * (ฟังก์ชันนี้คือเป้าหมายของ trigger รายวันตี 5 ด้วย)
 */
function refreshReport() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return; // มีรอบอื่นกำลังรีเฟรชอยู่
  try {
    var ss = SpreadsheetApp.getActive();
    ensureMonthlySheet_(ss);
    ensureYearlySheet_(ss);

    var rows = readSourceRows_();          // << จุดเดียวที่แตะชีตต้นทาง (อ่านอย่างเดียว)
    writeCache_(ss, rows);
    updateYearDropdowns_(ss, rows);
    renderMonthly_(ss);
    renderYearly_(ss);
    stampRefreshTime_(ss);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Simple trigger: ผู้ใช้เปลี่ยน dropdown เดือน/ปี → rebuild จากแคชในไฟล์ตัวเอง
 * (ไม่แตะชีตต้นทาง จึงทำงานได้แม้ simple trigger มีสิทธิ์จำกัด)
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var name = e.range.getSheet().getName();
  if (name === CONFIG.MONTHLY_SHEET) {
    if (rangeCovers_(e.range, 2, 2) || rangeCovers_(e.range, 2, 4)) {
      renderMonthly_(e.source);
    }
  } else if (name === CONFIG.YEARLY_SHEET) {
    if (rangeCovers_(e.range, 2, 2)) {
      renderYearly_(e.source);
    }
  }
}

function rangeCovers_(range, row, col) {
  return range.getRow() <= row && range.getLastRow() >= row &&
         range.getColumn() <= col && range.getLastColumn() >= col;
}

// =================================================================
// ชั้นข้อมูล: อ่านชีตต้นทาง (READ-ONLY) + แคชในไฟล์ตัวเอง
// =================================================================

/**
 * อ่านแท็บ "งาน" ของชีตต้นทาง แล้วคืนเฉพาะงานสถานะ "เสร็จ" ที่ parse วันที่ได้
 * ห้ามเรียก method เขียนใดๆ กับ src/sheet ในฟังก์ชันนี้เด็ดขาด
 */
function readSourceRows_() {
  if (!CONFIG.SOURCE_SPREADSHEET_ID || CONFIG.SOURCE_SPREADSHEET_ID.indexOf('ใส่_ID') === 0) {
    throw new Error('ยังไม่ได้ตั้งค่า SOURCE_SPREADSHEET_ID ใน Code.gs');
  }
  var src = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
  var sheet = src.getSheetByName(CONFIG.SOURCE_SHEET_NAME);
  if (!sheet) {
    throw new Error('ไม่พบแท็บ "' + CONFIG.SOURCE_SHEET_NAME + '" ในชีตต้นทาง');
  }
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var col = buildHeaderMap_(values[0]);
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var status = String(row[col.status] || '').trim().toLowerCase();
    if (CONFIG.DONE_STATUSES.indexOf(status) === -1) continue; // เอาเฉพาะงานเสร็จ (ยกเลิก/อื่นๆ ตกไปเอง)

    var d = parseJobDate_(row[col.date]);
    if (!d) continue; // วันที่อ่านไม่ได้ → ข้าม (กันข้อมูลผีเข้ารายงานผิดเดือน)

    out.push({
      date: d,
      type: sanitizeText_(String(row[col.type] || '').trim()) || CONFIG.OTHER_TYPE,
      building: sanitizeText_(String(row[col.building] || '').trim()),
      room: sanitizeText_(String(row[col.room] || '').trim()),
      note: sanitizeText_(String(row[col.note] || '').trim()),
      cost: parseCost_(row[col.cost])
    });
  }
  return out;
}

/** map ชื่อหัวตาราง → index คอลัมน์ พร้อมตรวจว่าหัวที่ต้องใช้ครบ */
function buildHeaderMap_(headerRow) {
  var index = {};
  headerRow.forEach(function (h, i) {
    var key = String(h || '').trim();
    if (key && index[key] === undefined) index[key] = i;
  });
  var col = {};
  var missing = [];
  Object.keys(CONFIG.HEADERS).forEach(function (k) {
    var name = CONFIG.HEADERS[k];
    if (index[name] === undefined) missing.push(name);
    else col[k] = index[name];
  });
  if (missing.length) {
    throw new Error('ชีตต้นทางไม่มีหัวคอลัมน์: ' + missing.join(', '));
  }
  return col;
}

/**
 * รับได้ทั้งเซลล์ Date จริง และข้อความ dd/MM/yyyy
 * ปี พ.ศ. (เช่น 2569) → ถ้าปี > 2400 ให้ลบ 543
 * คืน null ถ้าอ่านไม่ได้หรือวันที่ไม่มีจริง (เช่น 31/02)
 */
function parseJobDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    var d = new Date(v.getTime());
    if (d.getFullYear() > 2400) d.setFullYear(d.getFullYear() - 543);
    return d;
  }
  if (typeof v === 'string') {
    var m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{3,4})$/);
    if (!m) return null;
    var day = parseInt(m[1], 10);
    var mon = parseInt(m[2], 10);
    var year = parseInt(m[3], 10);
    if (year > 2400) year -= 543;
    var d2 = new Date(year, mon - 1, day);
    if (d2.getFullYear() !== year || d2.getMonth() !== mon - 1 || d2.getDate() !== day) {
      return null;
    }
    return d2;
  }
  return null;
}

/** ค่าใช้จ่าย: ว่าง/อ่านไม่ได้ = 0, รองรับข้อความมี , ฿ หรือช่องว่างปน */
function parseCost_(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = String(v || '').replace(/[,฿\s]|บาท/g, '');
  if (!s) return 0;
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** กันข้อความที่ขึ้นต้นด้วย = กลายเป็นสูตรตอนเขียนลงชีตรายงาน */
function sanitizeText_(s) {
  return s.charAt(0) === '=' ? "'" + s : s;
}

/** เก็บงานเสร็จ (normalize แล้ว) ลงแท็บซ่อน _data ของไฟล์รายงานเอง */
function writeCache_(ss, rows) {
  var sh = ss.getSheetByName(CONFIG.CACHE_SHEET) || ss.insertSheet(CONFIG.CACHE_SHEET);
  sh.clearContents();
  var data = [['date', 'type', 'building', 'room', 'note', 'cost']];
  rows.forEach(function (r) {
    data.push([r.date, r.type, r.building, r.room, r.note, r.cost]);
  });
  sh.getRange(1, 1, data.length, 6).setValues(data);
  sh.hideSheet();
}

/** อ่านแคชกลับมาเป็น array ของ object (โครงเดียวกับ readSourceRows_) */
function readCache_(ss) {
  var sh = ss.getSheetByName(CONFIG.CACHE_SHEET);
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  if (values.length < 1) return null;
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!(r[0] instanceof Date)) continue;
    out.push({
      date: r[0], type: String(r[1]), building: String(r[2]),
      room: String(r[3]), note: String(r[4]), cost: Number(r[5]) || 0
    });
  }
  return out;
}

function ensureCacheSheet_(ss) {
  var sh = ss.getSheetByName(CONFIG.CACHE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.CACHE_SHEET);
    sh.hideSheet();
  }
}

// =================================================================
// แท็บ "รายงานรายเดือน"
// =================================================================

function ensureMonthlySheet_(ss) {
  if (ss.getSheetByName(CONFIG.MONTHLY_SHEET)) return;
  var sh = ss.insertSheet(CONFIG.MONTHLY_SHEET, 0);
  sh.setHiddenGridlines(true);

  // ความกว้างคอลัมน์รวม ~660px พอดีพิมพ์ A4 แนวตั้ง
  var widths = [85, 70, 70, 95, 250, 95];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  sh.getRange('A1:F1').merge()
    .setValue('รายงานงานซ่อมบำรุงรายเดือน')
    .setFontSize(14).setFontWeight('bold').setFontColor(COLOR.TITLE)
    .setHorizontalAlignment('center');

  sh.getRange('A2').setValue('เดือน:').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('C2').setValue('ปี:').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('E2:F2').merge()
    .setFontSize(9).setFontColor(COLOR.MUTED).setHorizontalAlignment('right');

  sh.getRange(CONFIG.MONTH_CELL).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(THAI_MONTHS, true)
      .setAllowInvalid(false).build());

  var now = currentDateParts_();
  sh.getRange(CONFIG.MONTH_CELL).setValue(THAI_MONTHS[now.month]);
  sh.getRange(CONFIG.YEAR_CELL).setValue(String(now.year));
  sh.setFrozenRows(3);
}

function renderMonthly_(ss) {
  var sh = ss.getSheetByName(CONFIG.MONTHLY_SHEET);
  if (!sh) return;

  // ล้างเนื้อหารายงานเดิม (แถว 4 ลงไป) — ส่วนหัว/dropdown แถว 1–2 คงอยู่
  var clearRange = sh.getRange(4, 1, Math.max(sh.getMaxRows() - 3, 1), Math.max(sh.getMaxColumns(), 6));
  clearRange.breakApart();
  clearRange.clear();

  var monthName = String(sh.getRange(CONFIG.MONTH_CELL).getValue()).trim();
  var year = parseInt(sh.getRange(CONFIG.YEAR_CELL).getValue(), 10);
  var monthIndex = THAI_MONTHS.indexOf(monthName);
  if (monthIndex === -1 || isNaN(year)) {
    writeNotice_(sh, 4, 6, 'โปรดเลือกเดือนและปีจาก dropdown ด้านบน');
    return;
  }

  var all = readCache_(ss);
  if (all === null) {
    writeNotice_(sh, 4, 6, 'ยังไม่มีข้อมูล — กดเมนู "รายงานซ่อมบำรุง → 🔄 รีเฟรชรายงาน"');
    return;
  }

  var monthRows = all.filter(function (r) {
    return r.date.getFullYear() === year && r.date.getMonth() === monthIndex;
  });
  var commonRows = monthRows.filter(function (r) { return r.room === CONFIG.COMMON_AREA; });
  var roomRows = monthRows.filter(function (r) { return r.room !== CONFIG.COMMON_AREA; });

  roomRows.sort(function (a, b) {
    return compareNatural_(a.building, b.building) ||
           compareNatural_(a.room, b.room) ||
           (a.date - b.date);
  });
  commonRows.sort(function (a, b) { return a.date - b.date; });

  var r = 4;

  // ---------- ส่วน A: สรุปภาพรวม ----------
  r = writeSectionTitle_(sh, r, 'ส่วน A: สรุปภาพรวม — ' + monthName + ' ' + year, 6);
  var order = CONFIG.KNOWN_TYPES.concat([CONFIG.OTHER_TYPE]);
  var counts = {}, costs = {}, totalCount = 0, totalCost = 0;
  monthRows.forEach(function (row) {
    var t = bucketType_(row.type);
    counts[t] = (counts[t] || 0) + 1;
    costs[t] = (costs[t] || 0) + row.cost;
    totalCount += 1;
    totalCost += row.cost;
  });
  var summaryBody = [];
  order.forEach(function (t) {
    if (counts[t]) summaryBody.push([t, counts[t], costs[t]]);
  });
  summaryBody.push(['รวมทั้งเดือน', totalCount, totalCost]);

  sh.getRange(r, 1, 1, 3).setValues([['ประเภทงาน', 'จำนวนงานเสร็จ', 'ค่าใช้จ่ายรวม (บาท)']])
    .setFontWeight('bold').setBackground(COLOR.HEADER_BG);
  sh.getRange(r + 1, 1, summaryBody.length, 3).setValues(summaryBody);
  sh.getRange(r + 1, 2, summaryBody.length, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  sh.getRange(r + 1, 3, summaryBody.length, 1).setNumberFormat('#,##0.00');
  sh.getRange(r + summaryBody.length, 1, 1, 3)
    .setFontWeight('bold').setBackground(COLOR.TOTAL_BG);
  sh.getRange(r, 1, summaryBody.length + 1, 3)
    .setBorder(true, true, true, true, true, true);
  r += summaryBody.length + 2;

  // ---------- ส่วน B: งานรายห้อง ----------
  r = writeSectionTitle_(sh, r, 'ส่วน B: งานรายห้อง (เรียงตาม ตึก → ห้อง)', 6);
  r = writeJobTable_(sh, r, roomRows, 'รวมค่าใช้จ่ายงานรายห้อง', 'ไม่มีงานรายห้องในเดือนนี้');
  r += 1;

  // ---------- ส่วน C: พื้นที่ส่วนกลาง ----------
  r = writeSectionTitle_(sh, r, 'ส่วน C: งานพื้นที่ส่วนกลาง', 6);
  writeJobTable_(sh, r, commonRows, 'รวมค่าใช้จ่ายพื้นที่ส่วนกลาง', 'ไม่มีงานพื้นที่ส่วนกลางในเดือนนี้');
}

/** ตารางงาน 6 คอลัมน์ (ใช้ทั้งส่วน B และ C) คืนแถวถัดไปหลังจบตาราง */
function writeJobTable_(sh, r, rows, totalLabel, emptyText) {
  sh.getRange(r, 1, 1, 6)
    .setValues([['วันที่', 'ตึก', 'ห้อง', 'ประเภท', 'รายละเอียด (หมายเหตุ)', 'ค่าใช้จ่าย (บาท)']])
    .setFontWeight('bold').setBackground(COLOR.HEADER_BG);
  r += 1;

  if (rows.length === 0) {
    sh.getRange(r - 1, 1, 2, 6).setBorder(true, true, true, true, true, true);
    writeNotice_(sh, r, 6, emptyText);
    return r + 1;
  }

  var body = rows.map(function (row) {
    return [row.date, row.building, row.room, row.type, row.note, row.cost];
  });
  sh.getRange(r, 1, body.length, 6).setValues(body);
  sh.getRange(r, 1, body.length, 1).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  sh.getRange(r, 2, body.length, 2).setHorizontalAlignment('center');
  sh.getRange(r, 5, body.length, 1).setWrap(true);
  sh.getRange(r, 6, body.length, 1).setNumberFormat('#,##0.00');

  var sum = rows.reduce(function (acc, row) { return acc + row.cost; }, 0);
  var totalRow = r + body.length;
  sh.getRange(totalRow, 1, 1, 5).merge()
    .setValue(totalLabel).setFontWeight('bold').setHorizontalAlignment('right')
    .setBackground(COLOR.TOTAL_BG);
  sh.getRange(totalRow, 6).setValue(sum).setNumberFormat('#,##0.00')
    .setFontWeight('bold').setBackground(COLOR.TOTAL_BG);

  sh.getRange(r - 1, 1, body.length + 2, 6).setBorder(true, true, true, true, true, true);
  return totalRow + 1;
}

// =================================================================
// แท็บ "สรุปทั้งปี"
// =================================================================

function ensureYearlySheet_(ss) {
  if (ss.getSheetByName(CONFIG.YEARLY_SHEET)) return;
  var sh = ss.insertSheet(CONFIG.YEARLY_SHEET, 1);
  sh.setHiddenGridlines(true);

  var widths = [95, 70, 80, 70, 75, 75, 70, 75, 120];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  sh.getRange('A1:I1').merge()
    .setValue('สรุปงานซ่อมบำรุงทั้งปี (เฉพาะงานเสร็จ)')
    .setFontSize(14).setFontWeight('bold').setFontColor(COLOR.TITLE)
    .setHorizontalAlignment('center');
  sh.getRange('A2').setValue('ปี:').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('G2:I2').merge()
    .setFontSize(9).setFontColor(COLOR.MUTED).setHorizontalAlignment('right');

  sh.getRange(CONFIG.YEARLY_YEAR_CELL).setValue(String(currentDateParts_().year));
  sh.setFrozenRows(3);
}

function renderYearly_(ss) {
  var sh = ss.getSheetByName(CONFIG.YEARLY_SHEET);
  if (!sh) return;

  var clearRange = sh.getRange(4, 1, Math.max(sh.getMaxRows() - 3, 1), Math.max(sh.getMaxColumns(), 9));
  clearRange.breakApart();
  clearRange.clear();

  var year = parseInt(sh.getRange(CONFIG.YEARLY_YEAR_CELL).getValue(), 10);
  if (isNaN(year)) {
    writeNotice_(sh, 4, 9, 'โปรดเลือกปีจาก dropdown ด้านบน');
    return;
  }
  var all = readCache_(ss);
  if (all === null) {
    writeNotice_(sh, 4, 9, 'ยังไม่มีข้อมูล — กดเมนู "รายงานซ่อมบำรุง → 🔄 รีเฟรชรายงาน"');
    return;
  }

  var order = CONFIG.KNOWN_TYPES.concat([CONFIG.OTHER_TYPE]);
  // เตรียมถัง 12 เดือน: จำนวนต่อประเภท + ค่าใช้จ่ายรวม
  var months = [];
  for (var m = 0; m < 12; m++) {
    months.push({ counts: {}, total: 0, cost: 0 });
  }
  all.forEach(function (row) {
    if (row.date.getFullYear() !== year) return;
    var b = months[row.date.getMonth()];
    var t = bucketType_(row.type);
    b.counts[t] = (b.counts[t] || 0) + 1;
    b.total += 1;
    b.cost += row.cost;
  });

  var header = ['เดือน'].concat(order).concat(['รวมงาน', 'ค่าใช้จ่ายรวม (บาท)']);
  var body = months.map(function (b, i) {
    var row = [THAI_MONTHS[i]];
    order.forEach(function (t) { row.push(b.counts[t] || 0); });
    row.push(b.total, b.cost);
    return row;
  });
  var grand = ['รวมทั้งปี'];
  order.forEach(function (t) {
    grand.push(body.reduce(function (acc, row) { return acc + row[order.indexOf(t) + 1]; }, 0));
  });
  grand.push(
    months.reduce(function (acc, b) { return acc + b.total; }, 0),
    months.reduce(function (acc, b) { return acc + b.cost; }, 0)
  );
  body.push(grand);

  var r = 4;
  r = writeSectionTitle_(sh, r, 'จำนวนงานเสร็จรายเดือน แยกตามประเภท — ปี ' + year, 9);
  sh.getRange(r, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground(COLOR.HEADER_BG).setHorizontalAlignment('center');
  sh.getRange(r + 1, 1, body.length, header.length).setValues(body);
  sh.getRange(r + 1, 2, body.length, order.length + 1)
    .setNumberFormat('#,##0').setHorizontalAlignment('center');
  sh.getRange(r + 1, header.length, body.length, 1).setNumberFormat('#,##0.00');
  sh.getRange(r + body.length, 1, 1, header.length)
    .setFontWeight('bold').setBackground(COLOR.TOTAL_BG);
  sh.getRange(r, 1, body.length + 1, header.length)
    .setBorder(true, true, true, true, true, true);
}

// =================================================================
// ส่วนประกอบร่วม
// =================================================================

function writeSectionTitle_(sh, r, title, numCols) {
  sh.getRange(r, 1, 1, numCols).merge()
    .setValue(title)
    .setFontWeight('bold').setFontColor(COLOR.SECTION_FG)
    .setBackground(COLOR.SECTION_BG);
  return r + 1;
}

function writeNotice_(sh, r, numCols, text) {
  sh.getRange(r, 1, 1, numCols).merge()
    .setValue(text).setFontStyle('italic').setFontColor(COLOR.MUTED)
    .setHorizontalAlignment('center');
}

function bucketType_(t) {
  return CONFIG.KNOWN_TYPES.indexOf(t) >= 0 ? t : CONFIG.OTHER_TYPE;
}

/** อัปเดตรายการปีใน dropdown จากปีที่มีอยู่จริงในข้อมูล + ปีปัจจุบัน */
function updateYearDropdowns_(ss, rows) {
  var years = {};
  rows.forEach(function (r) { years[r.date.getFullYear()] = true; });
  years[currentDateParts_().year] = true;
  var list = Object.keys(years).sort().reverse();

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(list, true).setAllowInvalid(true).build();
  var monthly = ss.getSheetByName(CONFIG.MONTHLY_SHEET);
  var yearly = ss.getSheetByName(CONFIG.YEARLY_SHEET);
  if (monthly) {
    var c = monthly.getRange(CONFIG.YEAR_CELL);
    c.setDataValidation(rule);
    if (!String(c.getValue()).trim()) c.setValue(list[0]);
  }
  if (yearly) {
    var c2 = yearly.getRange(CONFIG.YEARLY_YEAR_CELL);
    c2.setDataValidation(rule);
    if (!String(c2.getValue()).trim()) c2.setValue(list[0]);
  }
}

function stampRefreshTime_(ss) {
  var text = 'รีเฟรชล่าสุด: ' +
    Utilities.formatDate(new Date(), CONFIG.TZ, 'dd/MM/yyyy HH:mm') + ' น.';
  var monthly = ss.getSheetByName(CONFIG.MONTHLY_SHEET);
  var yearly = ss.getSheetByName(CONFIG.YEARLY_SHEET);
  if (monthly) monthly.getRange(CONFIG.STAMP_CELL).setValue(text);
  if (yearly) yearly.getRange(CONFIG.YEARLY_STAMP_CELL).setValue(text);
}

/** trigger รายวันตี 5 (โซนเวลาตาม appsscript.json = Asia/Bangkok) — idempotent */
function installDailyTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshReport')
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .create();
}

function currentDateParts_() {
  var now = new Date();
  return {
    year: parseInt(Utilities.formatDate(now, CONFIG.TZ, 'yyyy'), 10),
    month: parseInt(Utilities.formatDate(now, CONFIG.TZ, 'M'), 10) - 1
  };
}

/** เรียงแบบ natural: ตึก A2 < A10, ห้อง 101 < 102 < 201 */
function compareNatural_(a, b) {
  a = String(a); b = String(b);
  var ax = a.match(/(\d+|\D+)/g) || [];
  var bx = b.match(/(\d+|\D+)/g) || [];
  var len = Math.max(ax.length, bx.length);
  for (var i = 0; i < len; i++) {
    var as = ax[i], bs = bx[i];
    if (as === undefined) return -1;
    if (bs === undefined) return 1;
    var an = parseInt(as, 10), bn = parseInt(bs, 10);
    if (!isNaN(an) && !isNaN(bn)) {
      if (an !== bn) return an - bn;
    } else {
      var c = as.localeCompare(bs, 'th');
      if (c !== 0) return c;
    }
  }
  return 0;
}
