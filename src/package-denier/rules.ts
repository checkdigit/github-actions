// package-denier/rules.ts

export type PackageName = string;
export type Comparator = '>' | '>=' | '=' | '<' | '<=';
export type PackageVersion = string;
export type Rule = [PackageName, Comparator, PackageVersion];

/*
  This is the list of packages that are not allowed to be imported.
 */
const rules: Rule[] = [['@aws-sdk/client-*', '>', '3.1.0']];

export default rules;
