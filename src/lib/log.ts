import { APP_VERSION, CONFIG, FORCED_GROUP, GROUPS, IS_TEST } from '../config';
import type { ExpId, Trial } from './design';
import { randomInt } from './random';

export interface AnswerLog {
  key: string;
  text: string;
  /** 화면에 보인 위치 (1부터) */
  position: number;
  rating: number | null;
  /** 문항이 화면에 나온 시점부터 이 답변의 점수를 처음 누른 시점까지 */
  rtFirstMs: number | null;
  /** 문항이 화면에 나온 시점부터 이 답변의 점수를 마지막으로 누른 시점까지 (최종 응답 시간) */
  rtFinalMs: number | null;
  nClicks: number;
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
  participantId: string;
  group: string;
  groupSource: 'server' | 'random' | 'url';
  isTest: boolean;
  startedAt: string;
  consentAt: string;
  itemOrder: Record<ExpId, string[]>;
  blockTimes: Partial<Record<ExpId, { startedAt: string; finishedAt: string }>>;
  trials: TrialLog[];
  survey?: Survey;
  submittedAt?: string;
}

const PENDING_KEY = 'kwh-pending-submission';
const ms = (n: number | null) => (n == null ? '' : Math.round(n));

// ---------------------------------------------------------------- 집단 배정

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * 서버(Apps Script)가 완료 인원이 가장 적은 집단을 골라 줍니다.
 * 서버가 없거나 응답이 없으면 무작위로 배정합니다.
 */
export async function assignGroup(participantId: string): Promise<{ group: string; source: Session['groupSource'] }> {
  if (FORCED_GROUP) return { group: FORCED_GROUP, source: 'url' };
  if (CONFIG.logEndpoint) {
    try {
      const u = new URL(CONFIG.logEndpoint);
      u.searchParams.set('action', 'assign');
      u.searchParams.set('pid', participantId);
      u.searchParams.set('test', IS_TEST ? '1' : '0');
      const res = await fetchWithTimeout(u.toString(), { method: 'GET' }, 6000);
      const data = await res.json();
      if (data?.ok && (GROUPS as readonly string[]).includes(data.group)) return { group: data.group, source: 'server' };
    } catch (e) {
      console.warn('[assign] 서버 배정 실패, 무작위 배정으로 대체', e);
    }
  }
  return { group: GROUPS[randomInt(GROUPS.length)], source: 'random' };
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
const pad2 = (n: number) => String(n).padStart(2, '0');

export function toSheets(s: Session) {
  const started = Date.parse(s.startedAt);
  const submitted = s.submittedAt ? Date.parse(s.submittedAt) : NaN;
  const base = { participant_id: s.participantId, group: s.group, is_test: s.isTest };
  const byExp = (exp: ExpId) => s.trials.filter((t) => t.trial.exp === exp).sort((a, b) => a.order - b.order);

  // 1) 참여자: 1명당 1행 — 완료 시각, 소요 시간, 설문
  const participants = [
    {
      ...base,
      group_source: s.groupSource,
      completed_at: s.submittedAt ?? '',
      total_duration_s: Number.isFinite(submitted) ? Math.round((submitted - started) / 1000) : '',
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
  const orders = ([1, 2] as ExpId[]).map((exp) => {
    const row: Record<string, string | number | boolean> = { ...base, experiment: exp };
    byExp(exp).forEach((t) => {
      row[`t${pad2(t.order)}`] = `${t.trial.item} (${condLabel(t.trial)})`;
    });
    return row;
  });

  // 3) 응답 결과: 1문항당 1행 — 답변 종류별 점수가 한눈에 보이게
  const keys: string[] = [];
  for (const t of s.trials) for (const k of t.trial.answerKeys) if (!keys.includes(k)) keys.push(k);
  keys.sort(); // wh-… → yn-… 순서로 열 고정
  const results = ([1, 2] as ExpId[]).flatMap((exp) =>
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
      return row;
    }),
  );

  // 4) 응답 세부: 답변 1개당 1행 — 제시 위치, 응답 시간, 클릭 기록 전체
  const details = ([1, 2] as ExpId[]).flatMap((exp) =>
    byExp(exp).flatMap((t) =>
      t.answers.map((a) => ({
        ...base,
        experiment: exp,
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
        n_clicks: a.nClicks,
        click_log: a.clicks.map((c) => `${c.t}ms→${c.v}`).join(', '),
        answer_order: t.answers.map((x) => x.key).join(' > '),
        trial_onset_at: t.onsetAt,
        trial_duration_ms: ms(t.durationMs),
      })),
    ),
  );

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

// ---------------------------------------------------------------- 전송

async function post(payload: unknown) {
  // text/plain 으로 보내야 Apps Script에서 CORS 사전 요청(preflight)이 생기지 않습니다.
  const res = await fetchWithTimeout(
    CONFIG.logEndpoint,
    { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) },
    20000,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
}

export async function submitSession(s: Session): Promise<void> {
  const payload = { participantId: s.participantId, sheets: toSheets(s) };
  // 전송 전에 브라우저에 백업 → 실패해도 다음 접속 때 다시 보냄
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* 저장 공간이 없어도 진행 */
  }

  if (!CONFIG.logEndpoint) {
    console.info('[log] VITE_LOG_ENDPOINT 가 비어 있어 콘솔에만 출력합니다.', payload);
    localStorage.removeItem(PENDING_KEY);
    return;
  }

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

/** 이전에 전송에 실패한 기록이 있으면 조용히 다시 보냅니다. (서버에서 중복은 무시) */
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
