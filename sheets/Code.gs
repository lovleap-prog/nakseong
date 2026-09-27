/**
 * 학교 교육활동 관리 — 구글 시트 연동 스크립트 (Google Apps Script)
 *
 * 학교에서 쓰던 시트를 그대로 둔 채 앱으로 넘긴다. 세 가지 모양을 읽는다.
 *
 *  1) 월간 시트 — 왼쪽에 '일' 숫자, 오른쪽에 그 날 할 일을 쉼표로 이어 적은 것
 *       1 | 목 | 보건수업(2년, 2교시, 2-1반)
 *       6 | 화 | 학교스포츠클럽(10:30, 부서별 장소), 학부모동아리(19:00, 백이관)
 *     달은 시트 이름('10월')이나 A1 칸('9월')에서 찾는다.
 *
 *  2) 주간 시트 — 날짜 · 요일 · 계 · 담당자 · 주요 업무 내용 · 시간 · 장소
 *     날짜 칸이 병합돼 있어도 된다(빈 칸은 위 날짜를 이어받는다).
 *
 *  3) 자유입력 시트 — 형식 없이 적은 글
 *
 * 쓰는 법
 *  - 구글 시트 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *  - 시트로 돌아와 새로고침 → 위 메뉴에 [교육활동] 이 생긴다
 *  - [교육활동 → 정리하기] → '정리됨' 시트에 표준 열로 정돈된다
 *  - 배포 → 새 배포 → 유형 '웹 앱' → 실행 계정 '나', 액세스 '링크가 있는 모든 사용자'
 *  - 나온 /exec 주소를 앱 [불러오기] 탭의 '구글시트에서 가져오기' 에 넣는다
 */

/**
 * 열쇠말 — 비워 두면 주소만 알면 누구나 읽는다.
 *
 * 웹앱을 '모든 사용자' 로 배포해야 앱이 읽을 수 있는데(로그인 정보가 실리지 않는다),
 * 그러면 주소가 새는 순간 담당 선생님 이름까지 딸려 나간다. 여기에 아무 말이나
 * 적어 두고, 앱에는 주소 뒤에 ?key=그말 을 붙여 넣으면 그 말을 아는 쪽만 읽는다.
 *   예) var READ_KEY = 'nakseong2026';
 *       https://script.google.com/macros/s/.../exec?key=nakseong2026
 */
var READ_KEY = '';

var SHEET_OUT = '정리됨';
var HEADERS = ['날짜', '종료일', '시간', '활동명', '대상', '장소', '담당', '부서', '비고'];

// 이 이름이 들어간 시트는 건너뛴다(결과 시트와 안내 시트)
var SKIP = [SHEET_OUT, '안내', '설명'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('교육활동')
    .addItem('정리하기 (모든 시트)', 'normalizeAll')
    .addItem('이 시트만 정리하기', 'normalizeActive')
    .addToUi();
}

function normalizeAll() { runNormalize(null); }
function normalizeActive() { runNormalize(SpreadsheetApp.getActiveSheet().getName()); }

function runNormalize(only) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = [];
  var note = [];

  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (skipSheet(name)) return;
    if (only && name !== only) return;
    var got = readSheet(sh);
    note.push(name + ' ' + got.length + '건');
    rows = rows.concat(got);
  });

  var out = ss.getSheetByName(SHEET_OUT) || ss.insertSheet(SHEET_OUT);
  out.clear();
  out.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  if (rows.length) out.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  out.setFrozenRows(1);
  out.autoResizeColumns(1, HEADERS.length);

  SpreadsheetApp.getUi().alert(
    '모두 ' + rows.length + '건을 정리했습니다.\n\n' + note.join('\n')
    + '\n\n"' + SHEET_OUT + '" 시트를 확인한 뒤, 앱 [불러오기] 탭에서 받아오세요.');
}

function skipSheet(name) {
  for (var i = 0; i < SKIP.length; i++) if (name.indexOf(SKIP[i]) >= 0) return true;
  return false;
}

/** 시트 하나를 읽어 표준 줄로 만든다. 모양은 머리글을 보고 가린다. */
function readSheet(sh) {
  var values = sh.getDataRange().getDisplayValues();
  var year = yearOf(sh.getParent(), sh.getName());
  if (looksWeekly(values)) return normalizeWeekGrid(values, year);
  var month = monthOf(sh.getName(), values);
  if (month) return normalizeMonthGrid(values, year, month);
  return normalizeFreeGrid(values, year);
}

/** 머리글에 '담당자' 나 '계' 가 있고 '날짜' 가 있으면 주간 시트로 본다. */
function looksWeekly(values) {
  for (var r = 0; r < Math.min(5, values.length); r++) {
    var line = values[r].join('|').replace(/\s/g, '');
    if (/날짜/.test(line) && /(담당자|주요업무내용)/.test(line)) return true;
  }
  return false;
}

function monthOf(sheetName, values) {
  var m = String(sheetName).match(/(\d{1,2})\s*월/);
  if (m) return Number(m[1]);
  for (var r = 0; r < Math.min(3, values.length); r++) {
    for (var c = 0; c < Math.min(3, values[r].length); c++) {
      var t = String(values[r][c] || '');
      var mm = t.match(/(\d{1,2})\s*월/) || t.match(/^(\d{1,2})\s*[ㅇ아]?$/);
      if (mm && Number(mm[1]) >= 1 && Number(mm[1]) <= 12) return Number(mm[1]);
    }
  }
  return 0;
}

function yearOf(ss, sheetName) {
  var m = String(sheetName).match(/(20\d{2})/) || String(ss.getName()).match(/(20\d{2})/);
  return m ? Number(m[1]) : new Date().getFullYear();
}

// ── 월간 시트 ───────────────────────────────────────────────
/**
 * 왼쪽 '일' 숫자 + 그 날 내용. 내용은 쉼표로 여러 건이 이어져 있는데,
 * 괄호 안의 쉼표는 한 건 안의 것이라 나누면 안 된다.
 *   '학교스포츠클럽(10:30, 부서별 장소), 학부모동아리(19:00, 백이관)' → 2건
 */
function normalizeMonthGrid(values, year, month) {
  var out = [];
  // '주요 업무 내용' 칸만 읽는다. 비고 칸('이전' 같은 메모)까지 읽으면 일정이 아닌 것이 섞인다.
  var body = 2;
  for (var r = 0; r < Math.min(4, values.length); r++) {
    for (var c = 0; c < values[r].length; c++) {
      if (/내용|업무|행사/.test(String(values[r][c] || ''))) { body = c; r = 99; break; }
    }
  }
  values.forEach(function (row) {
    var day = Number(String(row[0] || '').trim());
    if (!day || day < 1 || day > 31) return;
    var date = year + '-' + pad2(month) + '-' + pad2(day);
    var text = trim(row[body] || '');
    if (!text || /^[월화수목금토일]$/.test(text)) return;
    splitItems(text).forEach(function (piece) {
      var item = parseItem(piece, date, year);
      if (item) out.push(item);
    });
  });
  return out;
}

/** 괄호 밖의 쉼표에서만 자른다. */
function splitItems(text) {
  var out = [];
  var depth = 0;
  var buf = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '/') && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out.map(trim).filter(function (x) { return x.length > 1; });
}

/**
 * '학교스포츠클럽(10:30, 부서별 장소)' 한 건을 풀어낸다.
 * 괄호 안은 쉼표로 나눠 시간·대상·장소를 가려내고, 나머지는 비고로 둔다.
 */
function parseItem(piece, date, year) {
  var raw = piece;
  var title = piece;
  var inside = '';
  var m = piece.match(/[（(]([^)）]*)[)）]\s*$/);
  if (m) { inside = m[1]; title = trim(piece.slice(0, m.index)); }

  // 휴일·기간 표시 줄은 교육활동이 아니다.
  if (!title || isHoliday(title)) return null;

  // 괄호 안 기간 표시: '(~17)' → 그 달 17일까지
  var endDate = '';
  var pm = inside.match(/^\s*~\s*(\d{1,2})\s*$/);
  if (pm) { endDate = date.slice(0, 8) + pad2(pm[1]); inside = ''; }

  var time = '', place = '', target = '', rest = [];
  mergeNums(inside.split(/[,，]/)).forEach(function (p) {
    var t = trim(p);
    if (!t) return;
    if (!time && isTime(t)) { time = t.replace(/\s+/g, ''); return; }
    if (!target && isTarget(t)) { target = t; return; }
    if (!place && isPlace(t)) { place = t; return; }
    rest.push(t);
  });

  var em = title.match(/[（(]\s*~\s*(\d{1,2})\s*[)）]/);
  if (em) {
    endDate = date.slice(0, 8) + pad2(em[1]);
    title = trim(title.replace(em[0], ''));
  }

  return [date, endDate, time, title, target, place, '', '', rest.join(', ')];
}

// ── 주간 시트 ───────────────────────────────────────────────
/**
 * 날짜 · 요일 · 계 · 담당자 · 주요 업무 내용 · 시간 · 장소.
 * 병합된 날짜 칸은 첫 줄에만 값이 있으므로 아래로 이어받는다.
 */
function normalizeWeekGrid(values, year) {
  var head = -1, col = {};
  for (var r = 0; r < Math.min(5, values.length); r++) {
    var line = values[r].join('|').replace(/\s/g, '');
    if (/날짜/.test(line) && /(담당자|주요업무내용)/.test(line)) { head = r; break; }
  }
  if (head < 0) return [];
  values[head].forEach(function (cell, i) {
    var t = String(cell || '').replace(/\s/g, '');
    if (/날짜|일자/.test(t)) col.date = i;
    else if (/요일/.test(t)) col.dow = i;
    else if (/^계$|부서|분장/.test(t)) col.dept = i;
    else if (/담당/.test(t)) col.owner = i;
    else if (/내용|업무|활동/.test(t)) col.title = i;
    else if (/시간|시각/.test(t)) col.time = i;
    else if (/장소/.test(t)) col.place = i;
    else if (/비고/.test(t)) col.note = i;
  });

  var out = [], curDate = '', curMonth = 0;
  for (var i = head + 1; i < values.length; i++) {
    var row = values[i];
    var dcell = trim(row[col.date] || '');
    if (dcell) {
      var d = toDate(dcell, year, curMonth);
      if (d) { curDate = d; curMonth = Number(d.slice(5, 7)); }
    }
    var title = trim(row[col.title] || '');
    if (!curDate || !title || isHoliday(title)) continue;
    out.push([
      curDate, '',
      trim(row[col.time] || ''), title, '',
      trim(row[col.place] || ''),
      trim(row[col.owner] || ''),
      trim(row[col.dept] || ''),
      trim(row[col.note] || ''),
    ]);
  }
  return out;
}

// ── 자유입력 시트 ───────────────────────────────────────────
function normalizeFreeGrid(values, year) {
  var out = [];
  values.forEach(function (row) {
    var text = row.join(' ');
    if (!trim(text)) return;
    parseFreeText(text, year).forEach(function (it) {
      out.push([it.date, it.endDate, it.time, it.title, it.target, it.place, it.owner, '', '']);
    });
  });
  return out;
}

// ── 웹앱 ────────────────────────────────────────────────────
/** 앱의 '구글시트에서 가져오기' 가 이 주소를 부른다. */
function doGet(e) {
  var given = (e && e.parameter && e.parameter.key) || '';
  if (READ_KEY && given !== READ_KEY) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, rows: [], error: '열쇠말이 맞지 않습니다. 주소 끝에 ?key=… 를 붙여주세요.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = (e && e.parameter && e.parameter.sheet) || SHEET_OUT;
  var sh = ss.getSheetByName(name);
  var payload = { ok: false, rows: [], error: '' };

  if (!sh) {
    payload.error = '시트를 찾을 수 없습니다: ' + name
      + ' — 시트에서 [교육활동 → 정리하기] 를 먼저 눌러주세요.';
  } else {
    payload.ok = true;
    payload.sheet = name;
    payload.rows = sh.getDataRange().getDisplayValues();
  }
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 잔손질 ──────────────────────────────────────────────────
var PLACES = ['체육관', '강당', '운동장', '시청각실', '다목적실', '도서관', '도서실', '과학실',
  '컴퓨터실', '음악실', '미술실', '실과실', '영어실', '급식실', '보건실', '상담실', '방송실',
  '교실', '회의실', '교무실', '돌봄교실'];

var HOLIDAY = /^(재량휴업일|개교기념일|대체\s*휴일|삼일절|어린이날|현충일|광복절|개천절|한글날|성탄절|신정|설날|추석|부처님\s*오신\s*날|연휴|방학|휴업)/;

function isHoliday(t) { return HOLIDAY.test(String(t).replace(/\s/g, '')) || HOLIDAY.test(String(t)); }
function trim(s) { return String(s == null ? '' : s).replace(/ /g, ' ').trim(); }
function pad2(n) { return ('0' + Number(n)).slice(-2); }

/**
 * '1,3년' · '2,3교시' 는 한 덩어리인데 쉼표로 잘려 '1' 과 '3년' 이 된다.
 * 숫자만 남은 조각은 뒤 조각에 도로 붙인다.
 */
function mergeNums(parts) {
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var t = trim(parts[i]);
    if (!t) continue;
    while (/^\d{1,2}$/.test(t) && i + 1 < parts.length && /^\d/.test(trim(parts[i + 1]))) {
      t += ',' + trim(parts[i + 1]);
      i += 1;
    }
    out.push(t);
  }
  return out;
}

function isTime(t) {
  return /^\d{1,2}\s*:\s*\d{2}/.test(t) || /교시/.test(t) || /^\d{1,2}\s*시(\s*\d{1,2}\s*분)?$/.test(t)
    || /^(아침활동|아침|조회|중식|점심|방과\s*후|종례|창체)/.test(t);
}
function isTarget(t) {
  return /^(전교생|전학년|교직원)/.test(t.replace(/\s/g, ''))
    || /^\d\s*[~,-]?\s*\d?\s*학?년/.test(t) || /^\d\s*-\s*\d반?$/.test(t);
}
function isPlace(t) {
  if (/장소/.test(t)) return true;
  for (var i = 0; i < PLACES.length; i++) if (t.indexOf(PLACES[i]) >= 0) return true;
  return /관$|실$|장$|원$|터$|초$|교$/.test(t);
}

function toDate(cell, year, curMonth) {
  var t = trim(cell);
  var m = t.match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
  m = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (m) return year + '-' + pad2(m[1]) + '-' + pad2(m[2]);
  m = t.match(/(\d{1,2})\s*[/.]\s*(\d{1,2})/);
  if (m) return year + '-' + pad2(m[1]) + '-' + pad2(m[2]);
  m = t.match(/^(\d{1,2})\s*일?$/);
  if (m && curMonth) return year + '-' + pad2(curMonth) + '-' + pad2(m[1]);
  return '';
}

// 자유 형식 해석 (앱의 textparse.js 와 같은 규칙의 축약판)
function parseFreeText(text, year) {
  var out = [];
  var curDate = '';
  var curMonth = new Date().getMonth() + 1;

  String(text).split(/\r?\n/).forEach(function (rawLine) {
    var raw = trim(rawLine);
    if (!raw) return;
    var line = raw.replace(/^\s*(?:[-*•·○●□■]|\(?\d{1,2}[.)](?!\d)|[①-⑳])\s*/, '').trim();
    if (!line) return;

    var date = '', endDate = '';
    var m = line.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/);
    if (m) {
      date = m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
      curMonth = Number(m[2]);
      line = cut(line, m);
    } else {
      m = line.match(/(?:^|[\s([{])(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?(?!\s*(?:학년|반|교시|명|층|회|번))\s*(?:[~-]\s*(?:(\d{1,2})\s*[/.월]\s*)?(\d{1,2})\s*일?)?/);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) {
        date = year + '-' + pad2(m[1]) + '-' + pad2(m[2]);
        if (m[4]) endDate = year + '-' + pad2(m[3] || m[1]) + '-' + pad2(m[4]);
        curMonth = Number(m[1]);
        line = cut(line, m);
      } else {
        m = line.match(/(?:^|[\s([{])(\d{1,2})\s*(?:일(?!\s*(?:반|정|과))|\(\s*[월화수목금토일]\s*\))/);
        if (m) { date = year + '-' + pad2(curMonth) + '-' + pad2(m[1]); line = cut(line, m); }
      }
    }
    if (date) curDate = date; else date = curDate;
    if (!line || /^[([{]?\s*[월화수목금토일]\s*[)\]}]?$/.test(line)) return;

    var time = '';
    m = line.match(/(\d{1,2})\s*:\s*(\d{2})\s*(?:[~-]\s*(\d{1,2})\s*:\s*(\d{2}))?/);
    if (m) { time = m[3] ? pad2(m[1]) + ':' + m[2] + '~' + pad2(m[3]) + ':' + m[4] : pad2(m[1]) + ':' + m[2]; line = cut(line, m); }
    else {
      m = line.match(/(\d)\s*[~-]\s*(\d)\s*교시/) || line.match(/(\d)\s*교시/) || line.match(/(아침활동|아침|조회|중식|점심|방과\s*후|종례|창체)/);
      if (m) { time = m[0].replace(/\s+/g, ''); line = cut(line, m); }
    }

    var place = '';
    for (var i = 0; i < PLACES.length; i++) {
      var hit = line.match(new RegExp('(?:(?:각|전|제\\s*\\d+|\\d+)\\s*)?' + PLACES[i]));
      if (hit) { place = hit[0].trim(); line = cut(line, hit); break; }
    }

    var target = '';
    m = line.match(/전\s*교\s*생|전\s*학\s*년/) || line.match(/(\d)\s*학년\s*(\d)\s*반/) ||
        line.match(/(\d)\s*[~-]\s*(\d)\s*학년/) || line.match(/(\d)\s*학년/);
    if (m) { target = m[0].replace(/\s+/g, ' ').trim(); line = cut(line, m); }

    var owner = '';
    m = line.match(/담당\s*[:：]?\s*([가-힣]{2,4})/) || line.match(/([가-힣]{2,4})\s*(?:선생님|교사)(?![가-힣])/);
    if (m) { owner = m[1]; line = cut(line, m); }

    var title = line.replace(/[([{]\s*[,·\s]*[)\]}]/g, ' ')
      .replace(/^[\s,.:;·\-~|/()[\]]+/, '').replace(/[\s,.:;·\-~|/]+$/, '')
      .replace(/\s{2,}/g, ' ').trim();
    if (!title || isHoliday(title)) return;

    out.push({ date: date, endDate: endDate, time: time, title: title, target: target, place: place, owner: owner, raw: raw });
  });
  return out;
}

function cut(line, m) {
  return (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length))
    .replace(/\(\s*[월화수목금토일]\s*\)/, ' ')
    .replace(/^[\s,.:·\-~)\]]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
