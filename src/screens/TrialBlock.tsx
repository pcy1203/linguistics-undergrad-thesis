import { useEffect, useRef, useState } from 'react';
import { Actions, AnswerCard, Button, Page, QuestionBox } from '../components/ui';
import type { ExpId, Trial } from '../lib/design';
import type { AnswerLog, TrialLog } from '../lib/log';

interface Props {
  exp: ExpId;
  trials: Trial[];
  onComplete: (logs: TrialLog[], times: { startedAt: string; finishedAt: string }) => void;
}

export function TrialBlock({ exp, trials, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const logs = useRef<TrialLog[]>([]);
  const startedAt = useRef(new Date().toISOString());

  const handleDone = (log: TrialLog) => {
    logs.current.push(log);
    if (index + 1 < trials.length) setIndex(index + 1);
    else onComplete(logs.current, { startedAt: startedAt.current, finishedAt: new Date().toISOString() });
  };

  const trial = trials[index];
  return (
    <TrialScreen
      key={`${exp}-${index}`}
      exp={exp}
      trial={trial}
      order={index + 1}
      total={trials.length}
      onDone={handleDone}
    />
  );
}

function TrialScreen({
  exp,
  trial,
  order,
  total,
  onDone,
}: {
  exp: ExpId;
  trial: Trial;
  order: number;
  total: number;
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
    onDone({ trial, order, onsetAt: onsetAt.current, durationMs: elapsed(), answers });
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
