import { useState } from 'react';
import { Actions, AnswerCard, Button, Page, QuestionBox } from '../components/ui';

const STEPS = [
  '실험은 두 단계로 진행되며, 단계마다 24개의 문항이 제시됩니다.',
  '각 문항에는 의문문 문장 하나와 답변 4개가 제시됩니다.',
  '각 답변이 질문에 대한 답으로 얼마나 자연스러운지 1점(매우 자연스럽지 않다)부터 7점(매우 자연스럽다) 중에서 골라 주세요.',
  '정답이 없는 과제이니, 직관적으로 점수를 선택해 주세요.',
];

// 예시는 실제 실험 문항(의문사 의문문)과 겹치지 않게 의문사가 없는 문장으로 구성
const EXAMPLE = {
  question: '민지는 내일 비가 온다고 말했니?',
  answers: ['응, 온다고 말했어.', '우산.'],
};

export function Guide({ onStart }: { onStart: () => void }) {
  const [ratings, setRatings] = useState<(number | null)[]>([7, 1]);
  return (
    <Page>
      <h1 className="title">실험 안내</h1>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={i}>
            <span className="steps__num">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="example">
        <span className="example__label">예시</span>
        <QuestionBox text={EXAMPLE.question} />
        <div className="answers">
          {EXAMPLE.answers.map((a, i) => (
            <AnswerCard
              key={a}
              text={a}
              value={ratings[i]}
              onChange={(v) => setRatings((r) => r.map((x, j) => (j === i ? v : x)))}
            />
          ))}
        </div>
      </div>
      <Actions>
        <Button onClick={onStart}>실험 1 시작</Button>
      </Actions>
    </Page>
  );
}
