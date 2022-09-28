// coverage-reporter/options.ts

export interface Options {
  title?: string;
  base?: string;
  head?: string;
  shouldFilterChangedFiles?: boolean;
  commit: string;
  baseCommit?: string;
  repository: string;
  prefix: string;
  changedFiles?: string[];
  workingDir?: string;
}
