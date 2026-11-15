/**
 * 한국어 의문문 해석 실험 — 로그 수집용 Apps Script
 *
 * 사용법 (README 참고)
 *  1. 구글 시트를 새로 만들고  확장 프로그램 → Apps Script  에 이 파일 내용을 붙여 넣습니다.
 *  2. 배포 → 새 배포 → 유형: 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자  → 배포
 *  3. 나온 웹 앱 URL(…/exec)을 사이트의 VITE_LOG_ENDPOINT 환경변수에 넣습니다.
 *
 * 시트 구성 (처음 요청이 들어올 때 자동 생성)
 *  - 참여자     : 1명당 1행 — 완료 시각, 소요 시간, 설문
 *  - 제시 순서  : 1명 × 실험당 1행 — t01~t24 칸에 받은 아이템 번호와 조건
 *  - 응답 결과  : 1문항당 1행 — 답변 종류별 점수와 응답 시간
 *  - 응답 세부  : 답변 1개당 1행 — 제시 위치, 처음/최종 응답 시간, 클릭 기록
 *  - 추첨       : 사례 추첨용 전화번호 (참여자 ID 없이 저장)
 *  - _배정      : 집단 배정 기록 (집단 균형 맞추기용, 분석에는 불필요)
 */

var GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'];
var SHEET_ORDER = ['참여자', '제시 순서', '응답 결과', '응답 세부', '추첨', '_배정'];
var P = '참여자';
var ASSIGN = '_배정';
/** 배정만 받고 아직 제출하지 않은 사람을 이 시간(분) 동안은 해당 집단 인원으로 셈 */
var PENDING_WINDOW_MIN = 40;

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'assign') {
    return json_(withLock_(function () {
      return assign_(p.pid || '', p.test === '1');
    }));
  }
  return json_({ ok: true, message: 'logger is running' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    return json_(withLock_(function () {
      return save_(body);
    }));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ------------------------------------------------------------------ 집단 배정

function assign_(pid, isTest) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var counts = {};
  GROUPS.forEach(function (g) { counts[g] = 0; });

  // 1) 제출 완료한 참여자 (테스트 제외)
  var done = {};
  readObjects_(sheet_(ss, P)).forEach(function (r) {
    if (isTrue_(r.is_test)) return;
    done[r.participant_id] = true;
    if (counts[r.group] != null) counts[r.group]++;
  });

  // 2) 최근에 배정만 받고 진행 중인 참여자
  var since = Date.now() - PENDING_WINDOW_MIN * 60 * 1000;
  readObjects_(sheet_(ss, ASSIGN)).forEach(function (r) {
    if (isTrue_(r.is_test) || done[r.participant_id]) return;
    var t = new Date(r.assigned_at).getTime();
    if (t >= since && counts[r.group] != null) counts[r.group]++;
  });

  // 가장 적은 집단 중 무작위
  var min = Math.min.apply(null, GROUPS.map(function (g) { return counts[g]; }));
  var cands = GROUPS.filter(function (g) { return counts[g] === min; });
  var group = cands[Math.floor(Math.random() * cands.length)];

  appendObjects_(sheet_(ss, ASSIGN), [{
    assigned_at: new Date().toISOString(),
    participant_id: pid,
    group: group,
    is_test: isTest,
  }]);
  return { ok: true, group: group, counts: counts };
}

// ------------------------------------------------------------------ 저장

function save_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pid = body.participantId;
  if (!pid || !body.sheets) return { ok: false, error: 'invalid payload' };

  // 같은 참여자가 다시 전송한 경우(재시도)는 무시
  var exists = readObjects_(sheet_(ss, P)).some(function (r) {
    return r.participant_id === pid;
  });
  if (exists) return { ok: true, duplicate: true };

  // '참여자'를 마지막에 써야, 중간에 실패했을 때 재전송이 가능합니다.
  var names = Object.keys(body.sheets).filter(function (n) { return n !== P; }).concat([P]);
  names.forEach(function (name) {
    var rows = body.sheets[name] || [];
    if (rows.length) appendObjects_(sheet_(ss, name), rows);
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

/** 객체 배열을 헤더에 맞춰 이어 붙입니다. 새 키가 있으면 열을 자동으로 추가합니다. */
function appendObjects_(sh, rows) {
  var headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  headers = headers.filter(function (h) { return h !== ''; });
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
  var values = rows.map(function (r) {
    return headers.map(function (h) {
      var v = r[h];
      if (v === undefined || v === null) return '';
      // 수식으로 해석되지 않도록 방어
      if (typeof v === 'string' && /^[=+\-@]/.test(v) && h !== 'phone') return "'" + v;
      return v;
    });
  });
  sh.getRange(sh.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
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
