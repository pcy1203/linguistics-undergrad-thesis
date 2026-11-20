import { useState } from 'react';
import { Actions, AnswerCarousel, Button, Page, QuestionBox } from '../components/ui';

const STEPS = [
  '실험은 36개의 문항으로 구성됩니다.',
  '각 문항에는 의문문 문장 하나와 답변 3개가 하나씩 차례로 제시됩니다.',
  '각 답변이 질문에 대한 답으로 얼마나 자연스러운지 1점(매우 자연스럽지 않다)부터 7점(매우 자연스럽다) 중에서 골라 주세요. 점수를 고르면 다음 답변으로 넘어갑니다.',
  '정답이 없는 과제이니, 직관적으로 점수를 선택해 주세요.',
  '답변끼리 비교하여 점수를 매길 필요는 없습니다. 잘못 누른 경우에만 ‹ 버튼을 눌러 고쳐 주세요.',
];

// 예시는 실제 실험 문항(의문사 의문문)과 겹치지 않게 의문사가 없는 문장으로 구성. 답변 형식은 본 실험과 같게 3가지.
const EXAMPLE = {
  question: '민지는 내일 비가 온다고 말했니?',
  answers: ['응, 내일 비가 온다고 말했어.', '우산. (우산을 챙기라고 말했어.)', '응, 날씨 이야기를 했어.'],
};

export function Guide({ onStart }: { onStart: () => void }) {
  const [ratings, setRatings] = useState<(number | null)[]>(EXAMPLE.answers.map(() => null));
  const [current, setCurrent] = useState(0);
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
        <AnswerCarousel
          answers={EXAMPLE.answers}
          values={ratings}
          index={current}
          onIndex={(i) => setCurrent(i)}
          onRate={(i, v) => setRatings((r) => r.map((x, j) => (j === i ? v : x)))}
        />
      </div>
      <Actions>
        <Button onClick={onStart}>실험 시작</Button>
      </Actions>
    </Page>
  );
}
