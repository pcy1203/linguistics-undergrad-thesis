import { useEffect, useRef, useState } from 'react';
import { CONFIG, EXPS, GROUPS, IS_TEST, RESET } from './config';
import { loadCsv, type Sheet } from './lib/csv';
import { buildTrials, validateSheet, type ExpId } from './lib/design';
import {
  assignParticipant,
  flushOutbox,
  interimPayload,
  resendPending,
  sendInterim,
  submitSession,
  type Survey,
  type TrialLog,
} from './lib/log';
import { clearSaved, loadSaved, persist, type Saved, type Stage } from './lib/session';
import { Consent } from './screens/Consent';
import { Guide } from './screens/Guide';
import { Done, Resume, Status, Transition } from './screens/Simple';
import { SurveyScreen } from './screens/SurveyScreen';
import { TrialBlock } from './screens/TrialBlock';

type View = 'loading' | 'error' | 'consent' | 'resume' | Stage;

const expOf = (stage: Stage): ExpId | null => (stage === 'exp1' ? 1 : stage === 'exp2' ? 2 : null);

export default function App() {
  const [view, setView] = useState<View>('loading');
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const sheets = useRef<Record<ExpId, Sheet> | null>(null);
  /** 이 브라우저에 저장되는 진행 상황 (문항이 끝날 때마다 저장) */
  const saved = useRef<Saved | null>(null);
  /** 세션이 끊겼을 때 풀고 있던 문항 */
  const resumedAt = useRef<{ exp: ExpId; index: number } | null>(null);

  const go = (stage: Stage) => {
    const s = saved.current!;
    s.stage = stage;
    const exp = expOf(stage);
    if (exp && !s.session.blockTimes[exp]) s.session.blockTimes[exp] = { startedAt: new Date().toISOString() };
    persist(s);
    setView(stage);
  };

  // 시작: 저장된 진행 상황이 있으면 복구, 없으면 CSV를 불러와 동의서부터
  useEffect(() => {
    if (RESET) clearSaved();
    void resendPending();
    void flushOutbox();

    const prev = loadSaved();
    if (prev) {
      saved.current = prev;
      setView(prev.stage === 'done' ? 'done' : 'resume');
      return;
    }

    Promise.all(EXPS.map((exp) => loadCsv(CONFIG.csvUrl[exp])))
      .then((loaded) => {
        const empty: Sheet = { rows: [], fields: [] };
        const byExp: Record<ExpId, Sheet> = { 1: empty, 2: empty };
        EXPS.forEach((exp, k) => (byExp[exp] = loaded[k]));
        const problems = EXPS.flatMap((exp) => validateSheet(byExp[exp], exp, GROUPS));
        if (problems.length) console.warn('[csv] 점검 결과\n' + problems.join('\n'));
        sheets.current = byExp;
        setView('consent');
      })
      .catch((e) => {
        console.error(e);
        setError(String(e?.message ?? e));
        setView('error');
      });
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // 실험 도중 창을 닫거나 새로고침하려 하면 경고 (닫더라도 다시 열면 이어서 진행 가능)
  useEffect(() => {
    if (!['guide', 'exp1', 'transition', 'exp2', 'survey'].includes(view)) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [view]);

  const agree = async () => {
    if (!sheets.current) return;
    setAssigning(true);
    const now = new Date().toISOString();
    const { code, group, source } = await assignParticipant();
    const plan = {
      1: EXPS.includes(1) ? buildTrials(sheets.current[1], group, 1) : [],
      2: EXPS.includes(2) ? buildTrials(sheets.current[2], group, 2) : [],
    };
    if (EXPS.some((exp) => !plan[exp].length)) {
      setError(`${group}군에 해당하는 문항을 찾지 못했습니다. CSV의 group 열을 확인해 주세요.`);
      setView('error');
      return;
    }
    saved.current = {
      v: 2,
      savedAt: now,
      stage: 'guide',
      plan,
      index: { 1: 0, 2: 0 },
      session: {
        participantId: code,
        group,
        groupSource: source,
        isTest: IS_TEST,
        startedAt: now,
        consentAt: now,
        itemOrder: { 1: plan[1].map((t) => t.item), 2: plan[2].map((t) => t.item) },
        blockTimes: {},
        trials: [],
        resumeCount: 0,
      },
    };
    setAssigning(false);
    go('guide');
  };

  const resume = () => {
    const s = saved.current!;
    s.session.resumeCount += 1;
    const exp = expOf(s.stage);
    resumedAt.current = exp ? { exp, index: s.index[exp] } : null;
    persist(s);
    setView(s.stage);
  };

  const trialDone = (exp: ExpId, log: TrialLog) => {
    const s = saved.current!;
    s.session.trials.push(log);
    s.index[exp] = log.order;
    persist(s);
    sendInterim(interimPayload(s.session, log));
  };

  const blockDone = (exp: ExpId) => {
    const s = saved.current!;
    const bt = s.session.blockTimes[exp];
    if (bt && !bt.finishedAt) bt.finishedAt = new Date().toISOString();
    go(exp === 1 && EXPS.includes(2) ? 'transition' : 'survey');
  };

  const submit = async (survey: Survey) => {
    const s = saved.current!;
    s.session.survey = survey;
    s.session.submittedAt = new Date().toISOString();
    await submitSession(s.session);
    // 제출 후에는 참가자 번호만 남기고 응답 내용은 브라우저에서 지움
    saved.current = {
      ...s,
      plan: { 1: [], 2: [] },
      session: { ...s.session, trials: [], survey: undefined },
    };
    go('done');
  };

  const s = saved.current;
  switch (view) {
    case 'loading':
      return <Status title="불러오는 중입니다" />;
    case 'error':
      return <Status title="실험을 불러오지 못했습니다" lines={['잠시 후 다시 접속해 주세요.', error]} />;
    case 'consent':
      return <Consent onAgree={agree} busy={assigning} />;
    case 'resume': {
      const exp = s ? expOf(s.stage) : null;
      const pos = s && exp ? `${Math.min(s.index[exp] + 1, s.plan[exp].length)} / ${s.plan[exp].length}` : '';
      const meta = s && exp ? (EXPS.length > 1 ? `실험 ${exp} · ${pos}` : `${pos} 문항`) : '';
      return <Resume meta={meta} onContinue={resume} />;
    }
    case 'guide':
      return <Guide onStart={() => go('exp1')} />;
    case 'exp1':
    case 'exp2': {
      const exp: ExpId = view === 'exp1' ? 1 : 2;
      const r = resumedAt.current;
      return (
        <TrialBlock
          key={view}
          exp={exp}
          trials={s!.plan[exp]}
          startIndex={s!.index[exp]}
          resumedIndex={r && r.exp === exp ? r.index : null}
          onTrialDone={(log) => trialDone(exp, log)}
          onComplete={() => blockDone(exp)}
        />
      );
    }
    case 'transition':
      return <Transition onNext={() => go('exp2')} />;
    case 'survey':
      return <SurveyScreen onSubmit={submit} />;
    case 'done':
      return <Done code={s?.session.participantId ?? ''} />;
  }
}
