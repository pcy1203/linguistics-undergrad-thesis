const base = import.meta.env.BASE_URL;

export const STUDY_TITLE = '한국어 의문문 해석 실험';
export const APP_VERSION = '1.0.0';
export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** Apps Script 웹 앱 주소 (VITE_LOG_ENDPOINT 환경변수가 있으면 그쪽이 우선) */
const DEFAULT_LOG_ENDPOINT =
  'https://script.google.com/macros/s/AKfycby2kU43OsMFFOZOKFJ7QPGr10wvRQAUcR0xM8D2m7Gibe0Q7HHAyB1ZTms6Z0BusOKX/exec';

export const CONFIG = {
  /** Apps Script 웹 앱 URL. 비어 있으면 로그를 콘솔에만 출력합니다. */
  logEndpoint: (import.meta.env.VITE_LOG_ENDPOINT ?? '').trim() || DEFAULT_LOG_ENDPOINT,
  /** 기본은 public/data 안의 CSV. 구글 시트 '웹에 게시(CSV)' 주소로 바꿀 수도 있습니다. */
  csvUrl: {
    1: (import.meta.env.VITE_EXP1_CSV_URL ?? '').trim() || `${base}data/experiment1.csv`,
    2: (import.meta.env.VITE_EXP2_CSV_URL ?? '').trim() || `${base}data/experiment2.csv`,
  } as Record<1 | 2, string>,
};

const params = new URLSearchParams(window.location.search);
/** ?test=1 : 로그에 is_test=TRUE 로 표시되고 집단 균형 계산에서 빠집니다. */
export const IS_TEST = params.get('test') === '1';
/** ?reset=1 : 이 브라우저에 저장된 진행 기록을 지우고 처음부터 시작 (연구자·테스트용) */
export const RESET = params.get('reset') === '1';
/** ?group=C : 집단을 강제로 지정 (테스트용) */
export const FORCED_GROUP = (() => {
  const g = (params.get('group') ?? '').toUpperCase();
  return (GROUPS as readonly string[]).includes(g) ? g : null;
})();
