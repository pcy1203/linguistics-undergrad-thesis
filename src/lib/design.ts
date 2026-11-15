import type { Row, Sheet } from './csv';
import { shuffle } from './random';

export type ExpId = 1 | 2;

export interface Answer {
  /** CSV 열 이름 (예: wh-response-matrix) */
  key: string;
  text: string;
}

export interface Trial {
  exp: ExpId;
  item: string;
  trialType: string;
  condition: string;
  whType: string;
  stimulus: string;
  /** 이미 무작위 순서로 섞인 답변 */
  answers: Answer[];
  /** CSV 열 순서대로의 답변 열 이름 (로그 정렬용) */
  answerKeys: string[];
}

/** 열 이름에 'response'가 들어간 열을 모두 답변으로 씁니다. 열을 추가/삭제해도 코드는 그대로입니다. */
export function answerColumns(fields: string[]): string[] {
  return fields.filter((f) => /response/i.test(f));
}

const get = (r: Row, ...keys: string[]) => {
  for (const k of keys) if (r[k] != null && r[k] !== '') return r[k];
  return '';
};

/** 해당 집단의 행만 골라 문항 순서와 답변 순서를 모두 무작위로 섞습니다. */
export function buildTrials(sheet: Sheet, group: string, exp: ExpId): Trial[] {
  const cols = answerColumns(sheet.fields);
  const mine = sheet.rows.filter((r) => (r.group ?? '').toUpperCase() === group);
  const trials: Trial[] = mine.map((r) => ({
    exp,
    item: get(r, 'item'),
    trialType: get(r, 'trialType', 'trialtype'),
    condition: get(r, 'condition'),
    whType: get(r, 'wh-type', 'wh_type', 'whType'),
    stimulus: get(r, 'stimuli', 'stimulus'),
    answers: shuffle(cols.filter((c) => r[c]).map((c) => ({ key: c, text: r[c] }))),
    answerKeys: cols.filter((c) => r[c]),
  }));
  return shuffle(trials);
}

/** 연구자용 점검: 문제가 있으면 메시지 목록을 돌려줍니다. */
export function validateSheet(sheet: Sheet, exp: ExpId, groups: readonly string[]): string[] {
  const problems: string[] = [];
  const cols = answerColumns(sheet.fields);
  if (!cols.length) problems.push(`실험 ${exp}: 'response'가 들어간 답변 열이 없습니다.`);
  for (const g of groups) {
    const mine = sheet.rows.filter((r) => (r.group ?? '').toUpperCase() === g);
    if (!mine.length) problems.push(`실험 ${exp}: ${g}군 문항이 없습니다.`);
    mine.forEach((r) => {
      if (!get(r, 'stimuli', 'stimulus')) problems.push(`실험 ${exp}: ${g}군 ${r.item}번 문항의 의문문이 비어 있습니다.`);
      if (cols.filter((c) => r[c]).length < 2) problems.push(`실험 ${exp}: ${g}군 ${r.item}번 문항의 답변이 2개 미만입니다.`);
    });
  }
  return problems;
}

/** 문장 안의 '|' 는 줄바꿈으로 표시합니다 (CSV에서 의미 단위 줄바꿈을 직접 지정할 때). */
export function splitLines(text: string): string[] {
  return text.split('|').map((s) => s.trim()).filter(Boolean);
}
