// 빌드 전에 public/data 의 CSV를 점검합니다.
// 문제가 있으면 빌드가 실패하므로, 잘못된 CSV가 배포되지 않고 이전 버전이 그대로 유지됩니다.
import { readFileSync, existsSync } from 'node:fs';
import Papa from 'papaparse';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'];
const FILES = { 1: 'public/data/experiment.csv' };
let failed = false;

for (const [exp, path] of Object.entries(FILES)) {
  if (!existsSync(path)) {
    console.error(`✗ ${path} 파일이 없습니다.`);
    failed = true;
    continue;
  }
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const { data, errors, meta } = Papa.parse(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
  if (errors.length) {
    console.error(`✗ ${path}: CSV 형식 오류 (${errors[0].row}행) ${errors[0].message}`);
    failed = true;
    continue;
  }
  const answerCols = meta.fields.filter((f) => /response/i.test(f));
  const problems = [];
  if (!meta.fields.includes('group')) problems.push("'group' 열이 없습니다.");
  if (!meta.fields.includes('stimuli') && !meta.fields.includes('stimulus')) problems.push("'stimuli' 열이 없습니다.");
  if (answerCols.length < 2) problems.push("이름에 'response'가 들어간 답변 열이 2개 이상 있어야 합니다.");

  const counts = {};
  for (const g of GROUPS) {
    const rows = data.filter((r) => (r.group ?? '').trim().toUpperCase() === g);
    counts[g] = rows.length;
    if (!rows.length) problems.push(`${g}군 문항이 없습니다.`);
    for (const r of rows) {
      if (!(r.stimuli ?? r.stimulus ?? '').trim()) problems.push(`${g}군 ${r.item}번: 의문문이 비어 있습니다.`);
      const n = answerCols.filter((c) => (r[c] ?? '').trim()).length;
      if (n < 2) problems.push(`${g}군 ${r.item}번: 답변이 ${n}개뿐입니다.`);
    }
    const items = rows.map((r) => r.item);
    const dup = items.filter((x, i) => items.indexOf(x) !== i);
    if (dup.length) problems.push(`${g}군에 같은 item 번호가 중복됩니다: ${[...new Set(dup)].join(', ')}`);
  }
  const sizes = new Set(Object.values(counts));
  if (sizes.size > 1) problems.push(`집단별 문항 수가 다릅니다: ${JSON.stringify(counts)}`);

  if (problems.length) {
    failed = true;
    console.error(`✗ ${path} (${path})`);
    problems.slice(0, 30).forEach((p) => console.error('   - ' + p));
    if (problems.length > 30) console.error(`   … 외 ${problems.length - 30}건`);
  } else {
    console.log(`✓ ${path}: 집단별 ${[...sizes][0]}문항, 답변 열 ${answerCols.length}개 (${answerCols.join(', ')})`);
  }
}

process.exit(failed ? 1 : 0);
