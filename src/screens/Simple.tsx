import { Actions, Button, Lines, Page } from '../components/ui';

export function Transition({ onNext }: { onNext: () => void }) {
  return (
    <Page center>
      <div className="center-block">
        <h1 className="title">실험 1이 끝났습니다.</h1>
        <Lines lines={['다음 버튼을 누르면 실험 2가 이어서 진행됩니다.']} className="body" />
      </div>
      <Actions center>
        <Button onClick={onNext}>다음</Button>
      </Actions>
    </Page>
  );
}

export function Done({ code }: { code: string }) {
  return (
    <Page center>
      <div className="center-block">
        <div className="done-icon" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M7 14.5l4.5 4.5L21 9.5" stroke="#003458" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="title">제출이 완료되었습니다.</h1>
        <Lines
          lines={['실험 참여 기록이 정상적으로 제출되었습니다.', '긴 시간 성실히 참여해 주셔서 감사합니다.']}
          className="body"
        />
        <div className="code-chip">참여 번호 {code}</div>
      </div>
    </Page>
  );
}

export function Resume({ meta, onContinue }: { meta: string; onContinue: () => void }) {
  return (
    <Page center>
      <div className="center-block">
        <h1 className="title">진행하던 실험이 있습니다.</h1>
        <Lines lines={['멈춘 곳부터 이어서 진행합니다.']} className="body" />
        {meta && <div className="code-chip">{meta}</div>}
      </div>
      <Actions center>
        <Button onClick={onContinue}>이어서 하기</Button>
      </Actions>
    </Page>
  );
}

export function Status({ title, lines }: { title: string; lines?: string[] }) {
  return (
    <Page center>
      <div className="center-block">
        <h1 className="title">{title}</h1>
        {lines && <Lines lines={lines} className="body" />}
      </div>
    </Page>
  );
}
