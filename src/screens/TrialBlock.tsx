import { useEffect, useRef, useState } from 'react';
import { Actions, AnswerCarousel, Button, Page, QuestionBox, type NavVia } from '../components/ui';
import { EXPS } from '../config';
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

interface AnswerStat {
  /** 이 답변이 처음 화면에 나타난 시점 (문항 제시 기준 ms) */
  shownAt: number | null;
  views: number;
  /** 아래 세 값은 이 답변이 처음 나타난 시점 기준 ms */
  first: number | null;
  final: number | null;
  /** 마지막으로 누른 시점 (문항 제시 기준 ms) */
  finalTrial: number | null;
  n: number;
  /** 누른 기록: 문항 제시 기준 ms 와 고른 점수 */
  clicks: { t: number; v: number }[];
  /** ‹ 로 돌아와서 점수를 바꿨는지 */
  changedOnRevisit: boolean;
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
  const [current, setCurrent] = useState(0);
  const [sent, setSent] = useState(false);
  const ratingsRef = useRef(ratings);
  ratingsRef.current = ratings;
  const onset = useRef<number | null>(null);
  const onsetAt = useRef('');
  const nBack = useRef(0);
  const stats = useRef<AnswerStat[]>(
    trial.answers.map(() => ({
      shownAt: null,
      views: 0,
      first: null,
      final: null,
      finalTrial: null,
      n: 0,
      clicks: [],
      changedOnRevisit: false,
    })),
  );

  const now = () => {
    const t = performance.now();
    if (onset.current == null) {
      onset.current = t;
      onsetAt.current = new Date().toISOString();
    }
    return t - onset.current;
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // 답변이 실제로 화면에 그려진 시점을 기록 (첫 답변이 그려진 순간 = 문항 제시 기준 0 ms)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const t = now();
      const s = stats.current[current];
      if (s.shownAt == null) s.shownAt = t;
      s.views += 1;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const rate = (i: number, v: number) => {
    const t = now();
    const s = stats.current[i];
    const rel = t - (s.shownAt ?? t);
    const prev = ratingsRef.current[i];
    if (s.views > 1 && prev != null && prev !== v) s.changedOnRevisit = true;
    if (s.first == null) s.first = rel;
    s.final = rel;
    s.finalTrial = t;
    s.n += 1;
    s.clicks.push({ t: Math.round(t), v });
    setRatings((r) => r.map((x, j) => (j === i ? v : x)));
  };

  const move = (i: number, via: NavVia) => {
    if (via === 'back') nBack.current += 1;
    setCurrent(i);
  };

  const complete = ratings.every((r) => r != null);

  const next = () => {
    if (!complete || sent) return;
    setSent(true);
    const answers: AnswerLog[] = trial.answers.map((a, i) => {
      const s = stats.current[i];
      return {
        key: a.key,
        text: a.text,
        position: i + 1,
        rating: ratings[i],
        shownAtMs: s.shownAt,
        rtFirstMs: s.first,
        rtFinalMs: s.final,
        rtFinalTrialMs: s.finalTrial,
        nClicks: s.n,
        nViews: s.views,
        changedOnRevisit: s.changedOnRevisit,
        clicks: s.clicks,
      };
    });
    onDone({ trial, order, onsetAt: onsetAt.current, durationMs: now(), answers, resumed, nBack: nBack.current });
  };

  return (
    <Page meta={EXPS.length > 1 ? `실험 ${exp}` : undefined} progress={{ current: order, total }}>
      <QuestionBox text={trial.stimulus} />
      <AnswerCarousel
        answers={trial.answers.map((a) => a.text)}
        values={ratings}
        index={current}
        onIndex={move}
        onRate={rate}
      />
      <Actions center>
        <Button disabled={!complete || sent} onClick={next}>
          다음 문항
        </Button>
      </Actions>
    </Page>
  );
}
