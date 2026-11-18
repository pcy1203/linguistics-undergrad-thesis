/**
 * 한국어 의문문 해석 실험 — 로그 수집용 Apps Script
 *
 * 사용법 (README 참고)
 *  1. 구글 시트를 새로 만들고  확장 프로그램 → Apps Script  에 이 파일 내용을 붙여 넣습니다.
 *  2. 배포 → 새 배포 → 유형: 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자  → 배포
 *  3. 나온 웹 앱 URL(…/exec)을 사이트의 VITE_LOG_ENDPOINT(또는 src/config.ts)에 넣습니다.
 *
 * 시트 구성 (처음 요청이 들어올 때 자동 생성)
 *  [최종 제출 기록 — 설문까지 마친 사람만]
 *  - 참여자     : 1명당 1행 — 완료 시각, 소요 시간, 설문
 *  - 제시 순서  : 1명 × 실험당 1행 — t01~t24 칸에 받은 아이템 번호와 조건
 *  - 응답 결과  : 1문항당 1행 — 답변 종류별 점수와 응답 시간
 *  - 응답 세부  : 답변 1개당 1행 — 제시 위치, 처음/최종 응답 시간, 클릭 기록
 *  - 추첨       : 사례 추첨용 전화번호 (참여자 ID 없이 저장)
 *  [중간 기록 — 완료 여부와 상관없이 모두]
 *  - 진행 현황  : 1명당 1행 — 참가자 번호, 집단, 상태(진행 중/완료), 마지막으로 푼 문항
 *  - 중간 기록  : 문항이 끝날 때마다 답변 1개당 1행씩 바로 기록
 *
 * 참가자 번호는 P001부터, 테스트(?test=1)는 T001부터 매깁니다.
 * 번호를 처음부터 다시 매기려면  프로젝트 설정 → 스크립트 속성 에서 seq_P(또는 seq_T)를 지우세요.
 */

var GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'];
/** '진행 중'인 사람을 이 시간(분) 동안 마지막 기록이 있으면 해당 집단 인원으로 셈 */
var PENDING_WINDOW_MIN = 40;

var P = '참여자';
var STATUS = '진행 현황';
var INTERIM = '중간 기록';
var SHEET_ORDER = ['참여자', '제시 순서', '응답 결과', '응답 세부', '추첨', '진행 현황', '중간 기록'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'assign') {
    return json_(withLock_(function () {
      return assign_(p.test === '1', (p.group || '').toUpperCase());
    }));
  }
  return json_({ ok: true, message: 'logger is running' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    return json_(withLock_(function () {
      return body.type === 'interim' ? interim_(body) : final_(body);
    }));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ------------------------------------------------------------------ 참가자 번호·집단 배정

function nextCode_(isTest) {
  var props = PropertiesService.getScriptProperties();
  var key = isTest ? 'seq_T' : 'seq_P';
  var n = Number(props.getProperty(key) || '0') + 1;
  props.setProperty(key, String(n));
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return (isTest ? 'T' : 'P') + s;
}

function assign_(isTest, forcedGroup) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var counts = {};
  GROUPS.forEach(function (g) { counts[g] = 0; });

  // 1) 제출 완료한 참여자 (테스트 제외)
  readObjects_(sheet_(ss, P)).forEach(function (r) {
    if (isTrue_(r.is_test)) return;
    if (counts[r.group] != null) counts[r.group]++;
  });

  // 2) 최근까지 기록이 들어온 진행 중 참여자
  var since = Date.now() - PENDING_WINDOW_MIN * 60 * 1000;
  readObjects_(sheet_(ss, STATUS)).forEach(function (r) {
    if (isTrue_(r.is_test) || r.status !== '진행 중') return;
    var t = new Date(r.last_updated).getTime();
    if (t >= since && counts[r.group] != null) counts[r.group]++;
  });

  var group;
  if (GROUPS.indexOf(forcedGroup) !== -1) {
    group = forcedGroup;
  } else {
    var min = Math.min.apply(null, GROUPS.map(function (g) { return counts[g]; }));
    var cands = GROUPS.filter(function (g) { return counts[g] === min; });
    group = cands[Math.floor(Math.random() * cands.length)];
  }

  var code = nextCode_(isTest);
  var now = new Date().toISOString();
  upsert_(sheet_(ss, STATUS), 'participant_id', code, {
    participant_id: code,
    group: group,
    is_test: isTest,
    status: '진행 중',
    stage: '동의',
    last_trial: '',
    trials_done: 0,
    resume_count: 0,
    started_at: now,
    last_updated: now,
    completed_at: '',
  });
  return { ok: true, code: code, group: group };
}

// ------------------------------------------------------------------ 중간 기록 (문항마다)

function interim_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = sheet_(ss, INTERIM);
  // 같은 문항이 다시 전송되면(재시도) 무시
  if (body.recordKey && exists_(sh, body.recordKey)) return { ok: true, duplicate: true };
  if (body.rows && body.rows.length) appendObjects_(sh, body.rows);
  if (body.status && body.participantId) upsert_(sheet_(ss, STATUS), 'participant_id', body.participantId, body.status);
  return { ok: true };
}

// ------------------------------------------------------------------ 최종 제출

function final_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pid = body.participantId;
  if (!pid || !body.sheets) return { ok: false, error: 'invalid payload' };

  // 같은 참여자가 다시 전송한 경우(재시도)는 무시
  if (exists_(sheet_(ss, P), pid)) return { ok: true, duplicate: true };

  // '참여자'를 마지막에 써야, 중간에 실패했을 때 재전송이 가능합니다.
  var names = Object.keys(body.sheets).filter(function (n) { return n !== P; }).concat([P]);
  names.forEach(function (name) {
    var rows = body.sheets[name] || [];
    if (rows.length) appendObjects_(sheet_(ss, name), rows);
  });

  var now = new Date().toISOString();
  upsert_(sheet_(ss, STATUS), 'participant_id', pid, {
    participant_id: pid,
    status: '완료',
    stage: '제출',
    last_updated: now,
    completed_at: now,
  });
  return { ok: true };
}

// ------------------------------------------------------------------ 유틸

function sheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    // 탭 순서를 SHEET_ORDER 대로 맞춤
    var idx = SHEET_ORDER.indexOf(name);
    var pos = ss.getSheets().length;
    if (idx !== -1) {
      pos = 0;
      ss.getSheets().forEach(function (other) {
        var j = SHEET_ORDER.indexOf(other.getName());
        if (j !== -1 && j < idx) pos++;
      });
    }
    sh = ss.insertSheet(name, pos);
    // 전화번호의 맨 앞 0이 사라지지 않도록 추첨 시트는 전부 텍스트 형식
    if (name === '추첨') sh.getRange('A:Z').setNumberFormat('@');
  }
  return sh;
}

function headers_(sh) {
  if (!sh.getLastColumn()) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].filter(function (h) { return h !== ''; });
}

/** 객체들의 키 중 헤더에 없는 것을 열로 추가하고, 최종 헤더를 돌려줍니다. */
function ensureHeaders_(sh, rows) {
  var headers = headers_(sh);
  var changed = false;
  rows.forEach(function (r) {
    Object.keys(r).forEach(function (k) {
      if (headers.indexOf(k) === -1) { headers.push(k); changed = true; }
    });
  });
  if (changed || sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return headers;
}

function cell_(h, v) {
  if (v === undefined || v === null) return '';
  // 수식으로 해석되지 않도록 방어
  if (typeof v === 'string' && /^[=+\-@]/.test(v) && h !== 'phone') return "'" + v;
  return v;
}

/** 객체 배열을 헤더에 맞춰 이어 붙입니다. 새 키가 있으면 열을 자동으로 추가합니다. */
function appendObjects_(sh, rows) {
  var headers = ensureHeaders_(sh, rows);
  var values = rows.map(function (r) {
    return headers.map(function (h) { return cell_(h, r[h]); });
  });
  sh.getRange(sh.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

/** keyField 값이 같은 행이 있으면 해당 칸만 고치고, 없으면 새 행으로 추가합니다. */
function upsert_(sh, keyField, keyValue, obj) {
  var headers = ensureHeaders_(sh, [obj]);
  var col = headers.indexOf(keyField) + 1;
  var row = -1;
  if (sh.getLastRow() >= 2 && col > 0) {
    var found = sh.getRange(2, col, sh.getLastRow() - 1, 1)
      .createTextFinder(String(keyValue)).matchEntireCell(true).findNext();
    if (found) row = found.getRow();
  }
  if (row === -1) {
    appendObjects_(sh, [obj]);
    return;
  }
  Object.keys(obj).forEach(function (k) {
    sh.getRange(row, headers.indexOf(k) + 1).setValue(cell_(k, obj[k]));
  });
}

function exists_(sh, text) {
  if (sh.getLastRow() < 2) return false;
  return !!sh.createTextFinder(String(text)).matchEntireCell(true).findNext();
}

function readObjects_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var headers = values[0];
  return values.slice(1).map(function (row) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

function isTrue_(v) {
  return v === true || v === 'TRUE' || v === 'true';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
