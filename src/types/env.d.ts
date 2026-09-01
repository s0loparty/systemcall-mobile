declare namespace NodeJS {
  interface ProcessEnv {
    SYSTEMCALL_API_BASE_URL?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
