declare const __DRAKE_DEV__: boolean;

interface PenguRuntime {
  version?: string;
}

interface PenguDataStore {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

declare const Pengu: PenguRuntime | undefined;
declare const DataStore: PenguDataStore | undefined;

declare var __DRAKE_ASSET_PROXY__: string | undefined;
declare var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;

declare module '*.css' {
  const text: string;
  export default text;
}

declare module '*.png' {
  const url: string;
  export default url;
}

declare module '*.svg' {
  const text: string;
  export default text;
}

declare module '*.svg?raw' {
  const text: string;
  export default text;
}
