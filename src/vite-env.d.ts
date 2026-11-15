/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOG_ENDPOINT?: string;
  readonly VITE_EXP1_CSV_URL?: string;
  readonly VITE_EXP2_CSV_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
