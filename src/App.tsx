import { useEffect, useRef, useState } from 'react';
import { CONFIG, GROUPS, IS_TEST } from './config';
import { loadCsv, type Sheet } from './lib/csv';
import { buildTrials, validateSheet, type ExpId, type Trial } from './lib/design';
import { assignGroup, resendPending, submitSession, type Session, type Survey } from './lib/log';
import { uuid } from './lib/random';
import { Consent } from './screens/Consent';
import { Guide } from './screens/Guide';
import { Done, Status, Transition } from './screens/Simple';
import { SurveyScreen } from './screens/SurveyScreen';
import { TrialBlock } from './screens/TrialBlock';

type Stage = 'loading' | 'error' | 'consent' | 'guide' | 'exp1' | 'transition' | 'exp2' | 'survey' | 'done';

export default function App() {
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const sheets = useRef<Record<ExpId, Sheet> | null>(null);
  const trials = useRef<Record<ExpId, Trial[]>>({ 1: [], 2: [] });
  const session = useRef<Session>({
    participantId: uuid(),
    group: '',
    groupSource: 'random',
    isTest: IS_TEST,
    startedAt: new Date().toISOString(),
    consentAt: '',
    itemOrder: { 1: [], 2: [] },
    blockTimes: {},
    trials: [],
  });

  // CSV 불러오기 + 점검
  useEffect(() => {
    resendPending();
    Promise.all([loadCsv(CONFIG.csvUrl[1]), loadCsv(CONFIG.csvUrl[2])])
      .then(([s1, s2]) => {
        const problems = [...validateSheet(s1, 1, GROUPS), ...validateSheet(s2, 2, GROUPS)];
        if (problems.length) console.warn('[csv] 점검 결과\n' + problems.join('\n'));
        sheets.current = { 1: s1, 2: s2 };
        setStage('consent');
      })
      .catch((e) => {
        console.error(e);
        setError(String(e?.message ?? e));
        setStage('error');
      });
  }, []);

  // 화면이 바뀌면 맨 위로
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage]);

  // 실험 도중 창을 닫거나 새로고침하려 하면 경고
  useEffect(() => {
    const active = !['loading', 'error', 'done', 'consent'].includes(stage);
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [stage]);

  const agree = async () => {
    if (!sheets.current) return;
    setAssigning(true);
    const s = session.current;
    s.consentAt = new Date().toISOString();
    const { group, source } = await assignGroup(s.participantId);
    s.group = group;
    s.groupSource = source;
    for (const exp of [1, 2] as ExpId[]) {
      trials.current[exp] = buildTrials(sheets.current[exp], group, exp);
      s.itemOrder[exp] = trials.current[exp].map((t) => t.item);
    }
    if (!trials.current[1].length || !trials.current[2].length) {
      setError(`${group}군에 해당하는 문항을 찾지 못했습니다. CSV의 group 열을 확인해 주세요.`);
      setStage('error');
      return;
    }
    setAssigning(false);
    setStage('guide');
  };

  const submit = async (survey: Survey) => {
    const s = session.current;
    s.survey = survey;
    s.submittedAt = new Date().toISOString();
    await submitSession(s);
    setStage('done');
  };

  switch (stage) {
    case 'loading':
      return <Status title="불러오는 중입니다" />;
    case 'error':
      return <Status title="실험을 불러오지 못했습니다" lines={['잠시 후 다시 접속해 주세요.', error]} />;
    case 'consent':
      return <Consent onAgree={agree} busy={assigning} />;
    case 'guide':
      return <Guide onStart={() => setStage('exp1')} />;
    case 'exp1':
    case 'exp2': {
      const exp: ExpId = stage === 'exp1' ? 1 : 2;
      return (
        <TrialBlock
          key={stage}
          exp={exp}
          trials={trials.current[exp]}
          onComplete={(logs, times) => {
            session.current.trials.push(...logs);
            session.current.blockTimes[exp] = times;
            setStage(exp === 1 ? 'transition' : 'survey');
          }}
        />
      );
    }
    case 'transition':
      return <Transition onNext={() => setStage('exp2')} />;
    case 'survey':
      return <SurveyScreen onSubmit={submit} />;
    case 'done':
      return <Done />;
  }
}
