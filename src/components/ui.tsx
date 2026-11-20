import { useEffect, useRef, type ReactNode } from 'react';
import { STUDY_TITLE } from '../config';
import { splitLines } from '../lib/design';

export function Header({ meta }: { meta?: string }) {
  return (
    <header className="header">
      <div className="header__bar">
        <span className="header__title">{STUDY_TITLE}</span>
        {meta && <span className="header__meta">{meta}</span>}
      </div>
    </header>
  );
}

export function Progress({ current, total }: { current: number; total: number }) {
  return (
    <div className="progress-block">
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current}>
        <div className="progress__fill" style={{ width: `${Math.min(100, (current / total) * 100)}%` }} />
      </div>
      <span className="progress-count">
        {current} / {total}
      </span>
    </div>
  );
}

export function Page({
  children,
  meta,
  progress,
  center,
}: {
  children: ReactNode;
  meta?: string;
  progress?: { current: number; total: number };
  center?: boolean;
}) {
  const cls = `container${center ? ' container--center' : ''}${progress ? ' container--trial' : ''}`;
  return (
    <div className="app">
      <Header meta={meta} />
      <main className={cls}>
        {progress && <Progress current={progress.current} total={progress.total} />}
        {children}
      </main>
    </div>
  );
}

/** 문장(또는 '|'로 나눈 단위)마다 줄을 바꿔 표시 */
export function Lines({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <p className={`lines ${className ?? ''}`}>
      {lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </p>
  );
}

export function Actions({ children, center }: { children: ReactNode; center?: boolean }) {
  return <div className={`actions${center ? ' actions--center' : ''}`}>{children}</div>;
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`btn ${props.className ?? ''}`} />;
}

export function QuestionBox({ text }: { text: string }) {
  return (
    <div className="question">
      <Lines lines={splitLines(text)} />
    </div>
  );
}

export function RatingScale({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div>
      <div className="scale" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}점`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="anchors" aria-hidden>
        <span>매우 자연스럽지 않다</span>
        <span>매우 자연스럽다</span>
      </div>
    </div>
  );
}

export function AnswerCard({
  text,
  value,
  onChange,
}: {
  text: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`answer${value != null ? ' is-answered' : ''}`}>
      <Lines lines={splitLines(text)} className="answer__text" />
      <RatingScale value={value} onChange={onChange} label={text} />
    </div>
  );
}

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export type NavVia = 'auto' | 'back' | 'forward';

/**
 * 답변을 하나씩 보여 주는 카드.
 * 점수를 고르면 잠시 뒤 다음 답변으로 넘어가고, 잘못 누른 경우에만 ‹ 버튼으로 돌아가 고칩니다.
 */
export function AnswerCarousel({
  answers,
  values,
  index,
  onIndex,
  onRate,
}: {
  answers: string[];
  values: (number | null)[];
  index: number;
  onIndex: (i: number, via: NavVia) => void;
  onRate: (i: number, v: number) => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const last = answers.length - 1;

  const rate = (v: number) => {
    const i = index;
    onRate(i, v);
    window.clearTimeout(timer.current);
    if (i < last) timer.current = window.setTimeout(() => onIndex(i + 1, 'auto'), 380);
  };
  const go = (i: number, via: NavVia) => {
    window.clearTimeout(timer.current);
    onIndex(i, via);
  };

  return (
    <div className="answer carousel">
      <div className="carousel__nav">
        <button
          type="button"
          className="arrow"
          aria-label="이전 답변"
          disabled={index === 0}
          onClick={() => go(index - 1, 'back')}
        >
          <Chevron dir="left" />
        </button>
        <div className="carousel__pos">
          <span>
            답변 {index + 1} / {answers.length}
          </span>
          <span className="dots" aria-hidden>
            {answers.map((_, k) => (
              <i key={k} className={`${values[k] != null ? 'is-done' : ''}${k === index ? ' is-current' : ''}`} />
            ))}
          </span>
        </div>
        <button
          type="button"
          className="arrow"
          aria-label="다음 답변"
          disabled={index === last || values[index] == null}
          onClick={() => go(index + 1, 'forward')}
        >
          <Chevron dir="right" />
        </button>
      </div>
      <div key={index} className="carousel__body">
        <Lines lines={splitLines(answers[index])} className="answer__text" />
        <RatingScale value={values[index]} onChange={rate} label={answers[index]} />
      </div>
    </div>
  );
}
