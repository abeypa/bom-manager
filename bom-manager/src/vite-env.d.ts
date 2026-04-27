/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __GIT_HASH__: string;
declare const __BUILD_TIME__: string;
declare const __CACHE_BUST__: string;