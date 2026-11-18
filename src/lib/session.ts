import type { ExpId, Trial } from './design';
import type { Session } from './log';

/** 저장·복구되는 단계 */
export type Stage = 'guide' | 'exp1' | 'transition' | 'exp2' | 'survey' | 'done';

export interface Saved {
  v: 2;
  savedAt: string;
  stage: Stage;
  session: Session;
  /** 이 참여자에게 정해진 문항 순서와 답변 순서 (복구해도 그대로) */
  plan: Record<ExpId, Trial[]>;
  /** 실험마다 다음에 보여 줄 문항 번호(0부터) */
  index: Record<ExpId, number>;
}

const KEY = 'kwh-session';
/** 진행 중인 기록을 이어서 할 수 있는 시간 */
const RESUME_HOURS = 24;

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (s?.v !== 2 || !s.session?.participantId) return null;
    if (s.stage !== 'done') {
      const age = Date.now() - Date.parse(s.savedAt);
      if (!(age < RESUME_HOURS * 3600 * 1000)) return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function persist(s: Saved): void {
  s.savedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('[session] 진행 상황을 저장하지 못했습니다', e);
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}
