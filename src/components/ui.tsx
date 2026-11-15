import type { ReactNode } from 'react';
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
