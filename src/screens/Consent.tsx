import { useState } from 'react';
import { Actions, Button, Page } from '../components/ui';

const SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: '연구 목적',
    lines: [
      '본 실험은 한국어 의문문의 의미 해석에 관한 연구입니다.',
      '실험에 참여하면 의문문 문장을 읽고, 함께 제시된 답변 3개가 각각 얼마나 자연스러운지 판단하게 됩니다.',
      '예상 소요 시간은 10분 내외입니다.',
    ],
  },
  {
    title: '이득과 위험 요소',
    lines: [
      '실험 참여에 따른 직접적인 이득은 없으나, 응답해 주신 내용은 한국어 의문문의 의미 해석을 이해하는 데 기여할 수 있습니다.',
      '실험 참여에 따른 부작용이나 위험 요소는 없습니다.',
    ],
  },
  {
    title: '개인정보 보호',
    lines: [
      '수집하는 개인정보는 성별, 연령, 출신 지역이며, 사례 추첨을 희망하는 경우에 한해 전화번호를 함께 수집합니다.',
      '개인정보는 연구 책임자만 접근할 수 있고 제3자와 공유되지 않으며, 익명성이 보장됩니다.',
      '수집된 정보는 서울대학교 언어학과 졸업논문 작성에만 활용되며, 이후 모든 데이터는 즉시 폐기됩니다.',
    ],
  },
  {
    title: '사례',
    lines: ['추첨을 통해 참여자 6명에게 스타벅스 기프티콘(5,000원)을 드립니다.'],
  },
  {
    title: '자발적 참여',
    lines: [
      '본 실험은 자발적으로 참여 의사를 밝힌 경우에만 진행됩니다.',
      '참여 도중 언제든지 중단할 수 있으며, 중단에 따른 불이익은 없습니다.',
      '중단한 경우 그때까지의 기록은 분석에 사용하지 않고 폐기하며, 참여를 마친 뒤에도 자료 폐기를 요청할 수 있습니다.',
    ],
  },
];

export function Consent({ onAgree, busy }: { onAgree: () => void; busy: boolean }) {
  const [checked, setChecked] = useState(false);
  return (
    <Page>
      <h1 className="title">실험 참여 동의서</h1>
      <div className="terms">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            <p className="body">{s.lines.join(' ')}</p>
          </section>
        ))}
      </div>
      <label className="agree">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span className="agree__box" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5l3 3 6-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>위의 내용을 확인하였으며, 실험 참여에 동의합니다.</span>
      </label>
      <Actions>
        <Button disabled={!checked || busy} onClick={onAgree}>
          {busy ? '준비 중…' : '시작하기'}
        </Button>
      </Actions>
    </Page>
  );
}
