import { useEffect, useRef, useState } from 'react';
import { Actions, AnswerCard, Button, Page, QuestionBox } from '../components/ui';
import type { ExpId, Trial } from '../lib/design';
import type { AnswerLog, TrialLog } from '../lib/log';

interface Props {
  exp: ExpId;
  trials: Trial[];
  /** 복구 시 이어서 시작할 문항 번호(0부터) */
  startIndex: number;
  /** 세션이 끊겼을 때 풀고 있던 문항 번호 — 이 문항의 기록에 resumed 표시 */
  resumedIndex: number | null;
  onTrialDone: (log: TrialLog) => void;
  onComplete: () => void;
}

export function TrialBlock({ exp, trials, startIndex, resumedIndex, onTrialDone, onComplete }: Props) {
  const [index, setIndex] = useState(startIndex);

  // 모든 문항을 마친 직후 끊겼다가 복구된 경우
  useEffect(() => {
    if (index >= trials.length) onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (index >= trials.length) return null;

  const handleDone = (log: TrialLog) => {
    onTrialDone(log);
    if (index + 1 < trials.length) setIndex(index + 1);
    else onComplete();
  };

  return (
    <TrialScreen
      key={`${exp}-${index}`}
      exp={exp}
      trial={trials[index]}
      order={index + 1}
      total={trials.length}
      resumed={index === resumedIndex}
      onDone={handleDone}
    />
  );
}

function TrialScreen({
  exp,
  trial,
  order,
  total,
  resumed,
  onDone,
}: {
  exp: ExpId;
  trial: Trial;
  order: number;
  total: number;
  resumed: boolean;
  onDone: (log: TrialLog) => void;
}) {
  const [ratings, setRatings] = useState<(number | null)[]>(() => trial.answers.map(() => null));
  const [sent, setSent] = useState(false);
  const onset = useRef<number | null>(null);
  const onsetAt = useRef('');
  const stats = useRef(
    trial.answers.map(() => ({ first: null as number | null, final: null as number | null, n: 0, clicks: [] as { t: number; v: number }[] })),
  );

  // 문항이 실제로 화면에 그려진 시점을 기준(0 ms)으로 삼습니다.
  useEffect(() => {
    window.scrollTo(0, 0);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        onset.current = performance.now();
        onsetAt.current = new Date().toISOString();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const elapsed = () => {
    if (onset.current == null) {
      onset.current = performance.now();
      onsetAt.current = new Date().toISOString();
    }
    return performance.now() - onset.current;
  };

  const rate = (i: number, v: number) => {
    const t = elapsed();
    const s = stats.current[i];
    if (s.first == null) s.first = t;
    s.final = t;
    s.n += 1;
    s.clicks.push({ t: Math.round(t), v });
    setRatings((r) => r.map((x, j) => (j === i ? v : x)));
  };

  const complete = ratings.every((r) => r != null);

  const next = () => {
    if (!complete || sent) return;
    setSent(true);
    const answers: AnswerLog[] = trial.answers.map((a, i) => ({
      key: a.key,
      text: a.text,
      position: i + 1,
      rating: ratings[i],
      rtFirstMs: stats.current[i].first,
      rtFinalMs: stats.current[i].final,
      nClicks: stats.current[i].n,
      clicks: stats.current[i].clicks,
    }));
    onDone({ trial, order, onsetAt: onsetAt.current, durationMs: elapsed(), answers, resumed });
  };

  return (
    <Page meta={`실험 ${exp}`} progress={{ current: order, total }}>
      <QuestionBox text={trial.stimulus} />
      <div className="answers">
        {trial.answers.map((a, i) => (
          <AnswerCard key={a.key} text={a.text} value={ratings[i]} onChange={(v) => rate(i, v)} />
        ))}
      </div>
      <Actions center>
        <Button disabled={!complete || sent} onClick={next}>
          다음
        </Button>
      </Actions>
    </Page>
  );
}
