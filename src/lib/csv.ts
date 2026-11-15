import Papa from 'papaparse';

export type Row = Record<string, string>;
export interface Sheet {
  rows: Row[];
  fields: string[];
}

function withCacheBuster(url: string): string {
  const u = new URL(url, window.location.href);
  u.searchParams.set('_v', String(Date.now()));
  return u.toString();
}

/**
 * CSV를 매번 새로 받아옵니다(no-store + cache buster).
 * 그래서 CSV만 고쳐서 다시 배포하면, 코드 수정 없이 다음 참여자부터 반영됩니다.
 */
export async function loadCsv(url: string): Promise<Sheet> {
  const res = await fetch(withCacheBuster(url), { cache: 'no-store' });
  if (!res.ok) throw new Error(`CSV를 불러오지 못했습니다 (${res.status}): ${url}`);
  const text = (await res.text()).replace(/^﻿/, '');
  const parsed = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    const e = parsed.errors[0];
    throw new Error(`CSV 형식 오류 (${url}, ${e.row ?? '?'}행): ${e.message}`);
  }
  const rows = parsed.data.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? '').trim()])),
  );
  return { rows, fields: parsed.meta.fields ?? [] };
}
