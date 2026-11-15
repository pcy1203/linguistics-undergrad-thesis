import { useState } from 'react';
import { Actions, Button, Lines, Page } from '../components/ui';
import type { Survey } from '../lib/log';

const GENDERS = ['남성', '여성', '기타'];
const AGES = ['10대', '20대', '30대', '40대', '50대', '60대 이상'];
const REGIONS = ['서울/경기', '강원도', '충남/충북', '전남/전북', '경남/경북', '제주도', '외국'];

function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className="chip" onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ label, optional, help, children }: { label: string; optional?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field__label">
        {label}
        {optional && <span className="field__opt">선택</span>}
      </div>
      {help && <div className="field__help">{help}</div>}
      {children}
    </div>
  );
}

const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

export function SurveyScreen({ onSubmit }: { onSubmit: (s: Survey) => Promise<void> }) {
  const [s, setS] = useState<Survey>({ gender: '', age: '', region: '', regionForeign: '', phone: '', comment: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof Survey) => (v: string) => setS((p) => ({ ...p, [k]: v }));

  const phoneOk = !s.phone.trim() || PHONE_RE.test(s.phone.trim());
  const valid =
    !!s.gender && !!s.age && !!s.region && (s.region !== '외국' || !!s.regionForeign.trim()) && phoneOk;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        ...s,
        regionForeign: s.region === '외국' ? s.regionForeign.trim() : '',
        phone: s.phone.trim(),
        comment: s.comment.trim(),
      });
    } catch {
      setError('제출하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 눌러 주세요.');
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="intro">
        <h1 className="title">실험 2가 끝났습니다.</h1>
        <Lines lines={['아래 설문에 응답한 뒤 제출하면 참여가 마무리됩니다.']} className="body" />
      </div>
      <div className="form">
        <Field label="성별">
          <Chips label="성별" options={GENDERS} value={s.gender} onChange={set('gender')} />
        </Field>
        <Field label="나이">
          <Chips label="나이" options={AGES} value={s.age} onChange={set('age')} />
        </Field>
        <Field label="5~20세에 가장 오래 거주한 지역">
          <Chips label="거주 지역" options={REGIONS} value={s.region} onChange={set('region')} />
          {s.region === '외국' && (
            <input
              className="input"
              placeholder="국가명"
              value={s.regionForeign}
              onChange={(e) => set('regionForeign')(e.target.value)}
            />
          )}
        </Field>
        <Field label="전화번호" optional help="기프티콘 추첨을 원하는 경우에만 입력해 주세요.">
          <input
            className={`input${phoneOk ? '' : ' is-invalid'}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="010-0000-0000"
            value={s.phone}
            onChange={(e) => set('phone')(e.target.value)}
          />
          {!phoneOk && <div className="field__error">전화번호 형식을 확인해 주세요.</div>}
        </Field>
        <Field label="남기고 싶은 말" optional>
          <textarea className="input textarea" value={s.comment} onChange={(e) => set('comment')(e.target.value)} />
        </Field>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <Actions>
        <Button disabled={!valid || busy} onClick={submit}>
          {busy ? '제출 중…' : '제출'}
        </Button>
      </Actions>
    </Page>
  );
}
