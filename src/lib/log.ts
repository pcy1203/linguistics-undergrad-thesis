import { APP_VERSION, CONFIG, EXPS, FORCED_GROUP, GROUPS, IS_TEST } from '../config';
import type { ExpId, Trial } from './design';
import { randomInt } from './random';

export interface AnswerLog {
  key: string;
  text: string;
  /** 제시된 순서 (1부터) */
  position: number;
  rating: number | null;
  /** 이 답변이 처음 화면에 나타난 시점 (문항 제시 기준 ms) */
  shownAtMs: number | null;
  /** 이 답변이 처음 나타난 시점부터 점수를 처음 누른 시점까지 */
  rtFirstMs: number | null;
  /** 이 답변이 처음 나타난 시점부터 점수를 마지막으로 누른 시점까지 (최종 응답 시간) */
  rtFinalMs: number | null;
  /** 문항 제시 시점부터 이 답변의 점수를 마지막으로 누른 시점까지 */
  rtFinalTrialMs: number | null;
  nClicks: number;
  /** 이 답변이 화면에 나타난 횟수 (2 이상이면 ‹ 로 돌아와 다시 본 것) */
  nViews: number;
  /** ‹ 로 돌아와서 점수를 바꿨는지 */
  changedOnRevisit: boolean;
  /** 이 답변에서 누른 기록 전체: 문항 제시 후 경과 ms 와 고른 점수 */
  clicks: { t: number; v: number }[];
}

export interface TrialLog {
  trial: Trial;
  /** 해당 실험 안에서 제시된 순서 (1부터) */
  order: number;
  onsetAt: string;
  durationMs: number;
  answers: AnswerLog[];
  /** 이 문항을 푸는 도중에 세션이 끊겼다가 복구된 경우 true (응답 시간 해석 주의) */
  resumed: boolean;
  /** 이 문항에서 ‹ (이전 답변) 버튼을 누른 횟수 */
  nBack: number;
}

export interface Survey {
  gender: string;
  age: string;
  region: string;
  regionForeign: string;
  phone: string;
  comment: string;
}

export interface Session {
  /** 참가자 번호 (P001, 테스트는 T001, 서버 연결 실패 시 X로 시작하는 임시 번호) */
  participantId: string;
  group: string;
  groupSource: 'server' | 'random' | 'url';
  isTest: boolean;
  startedAt: string;
  consentAt: string;
  itemOrder: Record<ExpId, string[]>;
  blockTimes: Partial<Record<ExpId, { startedAt: string; finishedAt?: string }>>;
  trials: TrialLog[];
  /** 세션이 끊겼다가 이어서 진행한 횟수 */
  resumeCount: number;
  survey?: Survey;
  submittedAt?: string;
}

const PENDING_KEY = 'kwh-pending-submission';
const OUTBOX_KEY = 'kwh-outbox';
const ms = (n: number | null) => (n == null ? '' : Math.round(n));
const pad2 = (n: number) => String(n).padStart(2, '0');

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- 집단·참가자 번호 배정

function tempCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'X' + Array.from({ length: 5 }, () => chars[randomInt(chars.length)]).join('');
}

/**
 * 서버(Apps Script)가 참가자 번호(P001…)를 순서대로 매기고,
 * 완료·진행 중 인원이 가장 적은 집단을 골라 줍니다.
 * 서버에 연결되지 않으면 임시 번호(X…)와 무작위 집단으로 진행합니다.
 */
export async function assignParticipant(): Promise<{ code: string; group: string; source: Session['groupSource'] }> {
  if (CONFIG.logEndpoint) {
    try {
      const u = new URL(CONFIG.logEndpoint);
      u.searchParams.set('action', 'assign');
      u.searchParams.set('test', IS_TEST ? '1' : '0');
      if (FORCED_GROUP) u.searchParams.set('group', FORCED_GROUP);
      const res = await fetchWithTimeout(u.toString(), { method: 'GET' }, 8000);
      const data = await res.json();
      if (data?.ok && data.code && (GROUPS as readonly string[]).includes(data.group)) {
        return { code: String(data.code), group: data.group, source: FORCED_GROUP ? 'url' : 'server' };
      }
    } catch (e) {
      console.warn('[assign] 서버 배정 실패, 임시 번호와 무작위 집단으로 진행', e);
    }
  }
  return {
    code: tempCode(),
    group: FORCED_GROUP ?? GROUPS[randomInt(GROUPS.length)],
    source: FORCED_GROUP ? 'url' : 'random',
  };
}

// ---------------------------------------------------------------- 시트용 행 만들기

/** 구글 시트 탭 이름. Apps Script(Code.gs)와 같아야 합니다. */
export const SHEET = {
  participants: '참여자',
  orders: '제시 순서',
  results: '응답 결과',
  details: '응답 세부',
  raffle: '추첨',
} as const;

const condLabel = (t: Trial) => (t.trialType === 'filler' ? 'filler' : t.condition);
const baseOf = (s: Session) => ({ participant_id: s.participantId, group: s.group, is_test: s.isTest });

/** 답변 1개당 1행 (응답 세부·중간 기록 공통) */
function detailRows(s: Session, t: TrialLog) {
  return t.answers.map((a) => ({
    ...baseOf(s),
    experiment: t.trial.exp,
    trial_order: t.order,
    item: t.trial.item,
    trial_type: t.trial.trialType,
    condition: t.trial.condition,
    wh_type: t.trial.whType,
    stimulus: t.trial.stimulus,
    answer_position: a.position,
    response_type: a.key,
    response_text: a.text,
    rating: a.rating ?? '',
    rt_final_ms: ms(a.rtFinalMs),
    rt_first_ms: ms(a.rtFirstMs),
    shown_at_ms: ms(a.shownAtMs),
    rt_final_from_trial_ms: ms(a.rtFinalTrialMs),
    n_clicks: a.nClicks,
    n_views: a.nViews,
    changed_on_revisit: a.changedOnRevisit,
    click_log: a.clicks.map((c) => `${c.t}ms→${c.v}`).join(', '),
    answer_order: t.answers.map((x) => x.key).join(' > '),
    n_back: t.nBack,
    resumed: t.resumed,
    trial_onset_at: t.onsetAt,
    trial_duration_ms: ms(t.durationMs),
  }));
}

/** 최종 제출용: 시트 5개 */
export function toSheets(s: Session) {
  const started = Date.parse(s.startedAt);
  const submitted = s.submittedAt ? Date.parse(s.submittedAt) : NaN;
  const base = baseOf(s);
  const byExp = (exp: ExpId) => s.trials.filter((t) => t.trial.exp === exp).sort((a, b) => a.order - b.order);

  // 1) 참여자: 1명당 1행 — 완료 시각, 소요 시간, 설문
  const participants = [
    {
      ...base,
      group_source: s.groupSource,
      completed_at: s.submittedAt ?? '',
      total_duration_s: Number.isFinite(submitted) ? Math.round((submitted - started) / 1000) : '',
      resume_count: s.resumeCount,
      started_at: s.startedAt,
      consent_at: s.consentAt,
      exp1_started_at: s.blockTimes[1]?.startedAt ?? '',
      exp1_finished_at: s.blockTimes[1]?.finishedAt ?? '',
      exp2_started_at: s.blockTimes[2]?.startedAt ?? '',
      exp2_finished_at: s.blockTimes[2]?.finishedAt ?? '',
      gender: s.survey?.gender ?? '',
      age: s.survey?.age ?? '',
      region: s.survey?.region ?? '',
      region_foreign: s.survey?.regionForeign ?? '',
      comment: s.survey?.comment ?? '',
      user_agent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      app_version: APP_VERSION,
    },
  ];

  // 2) 제시 순서: 1명 × 실험 1행 — t01..t24 칸에 "아이템번호 (조건)"
  const orders = EXPS.map((exp) => {
    const row: Record<string, string | number | boolean> = { ...base, experiment: exp };
    byExp(exp).forEach((t) => {
      row[`t${pad2(t.order)}`] = `${t.trial.item} (${condLabel(t.trial)})`;
    });
    return row;
  });

  // 3) 응답 결과: 1문항당 1행 — 답변 종류별 점수가 한눈에 보이게
  const keys: string[] = [];
  for (const t of s.trials) for (const k of t.trial.answerKeys) if (!keys.includes(k)) keys.push(k);
  // 열 순서는 CSV 답변 열 순서 그대로 (matrix → embedded → indefinite)
  const results = EXPS.flatMap((exp) =>
    byExp(exp).map((t) => {
      const row: Record<string, string | number | boolean> = {
        ...base,
        experiment: exp,
        trial_order: t.order,
        item: t.trial.item,
        trial_type: t.trial.trialType,
        condition: t.trial.condition,
        wh_type: t.trial.whType,
        stimulus: t.trial.stimulus,
      };
      for (const k of keys) row[k] = t.answers.find((a) => a.key === k)?.rating ?? '';
      for (const k of keys) row[`${k}_rt_ms`] = ms(t.answers.find((a) => a.key === k)?.rtFinalMs ?? null);
      row.trial_duration_ms = ms(t.durationMs);
      row.n_back = t.nBack;
      row.resumed = t.resumed;
      return row;
    }),
  );

  // 4) 응답 세부: 답변 1개당 1행 — 제시 위치, 응답 시간, 클릭 기록 전체
  const details = EXPS.flatMap((exp) => byExp(exp).flatMap((t) => detailRows(s, t)));

  // 5) 추첨: 전화번호는 응답 데이터와 연결되지 않도록 참여자 ID 없이 따로
  const d = new Date();
  const localDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const raffle = s.survey?.phone ? [{ submitted_date: localDate, phone: s.survey.phone, is_test: s.isTest }] : [];

  return {
    [SHEET.participants]: participants,
    [SHEET.orders]: orders,
    [SHEET.results]: results,
    [SHEET.details]: details,
    [SHEET.raffle]: raffle,
  };
}

/** 문항 하나가 끝날 때 보내는 중간 기록 */
export function interimPayload(s: Session, t: TrialLog) {
  const recordKey = `${s.participantId}|${t.trial.exp}|${t.order}`;
  const now = new Date().toISOString();
  return {
    type: 'interim',
    participantId: s.participantId,
    recordKey,
    rows: detailRows(s, t).map((r) => ({ record_key: recordKey, logged_at: now, ...r })),
    status: {
      participant_id: s.participantId,
      group: s.group,
      is_test: s.isTest,
      status: '진행 중',
      stage: EXPS.length > 1 ? `실험 ${t.trial.exp}` : '실험',
      last_trial: EXPS.length > 1 ? `실험${t.trial.exp}-${pad2(t.order)}` : pad2(t.order),
      trials_done: s.trials.length,
      resume_count: s.resumeCount,
      last_updated: now,
    },
  };
}

// ---------------------------------------------------------------- 전송

async function post(payload: unknown, keepalive = false) {
  // text/plain 으로 보내야 Apps Script에서 CORS 사전 요청(preflight)이 생기지 않습니다.
  const body = JSON.stringify(payload);
  const res = await fetchWithTimeout(
    CONFIG.logEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      // 페이지를 닫는 순간에도 전송이 끝나도록 (작은 요청만 허용)
      keepalive: keepalive && body.length < 60000,
    },
    20000,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
}

// 중간 기록은 보낼 함(outbox)에 쌓아 두고 순서대로 보냅니다. 실패하면 남겨 두었다가 다음에 다시 보냅니다.
function readOutbox(): unknown[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function writeOutbox(box: unknown[]) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(box));
  } catch {
    /* 저장 공간 부족 시 무시 */
  }
}

let flushing = false;
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  if (!CONFIG.logEndpoint) {
    writeOutbox([]);
    return;
  }
  flushing = true;
  try {
    for (;;) {
      const box = readOutbox();
      if (!box.length) break;
      try {
        await post(box[0], true);
      } catch (e) {
        console.warn('[log] 중간 기록 전송 실패, 나중에 다시 보냄', e);
        break;
      }
      writeOutbox(readOutbox().slice(1));
    }
  } finally {
    flushing = false;
  }
}

export function sendInterim(payload: ReturnType<typeof interimPayload>) {
  if (!CONFIG.logEndpoint) {
    console.info('[log] 중간 기록', payload);
    return;
  }
  writeOutbox([...readOutbox(), payload]);
  void flushOutbox();
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void flushOutbox());

export async function submitSession(s: Session): Promise<void> {
  const payload = { type: 'final', participantId: s.participantId, sheets: toSheets(s) };
  // 전송 전에 브라우저에 백업 → 실패해도 다음 접속 때 다시 보냄
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* 저장 공간이 없어도 진행 */
  }

  if (!CONFIG.logEndpoint) {
    console.info('[log] 로그 주소가 비어 있어 콘솔에만 출력합니다.', payload);
    localStorage.removeItem(PENDING_KEY);
    return;
  }

  void flushOutbox();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await post(payload);
      localStorage.removeItem(PENDING_KEY);
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** 이전에 전송에 실패한 최종 기록이 있으면 조용히 다시 보냅니다. (서버에서 중복은 무시) */
export async function resendPending(): Promise<void> {
  if (!CONFIG.logEndpoint) return;
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return;
  try {
    await post(JSON.parse(raw));
    localStorage.removeItem(PENDING_KEY);
  } catch (e) {
    console.warn('[log] 미전송 기록 재전송 실패', e);
  }
}
