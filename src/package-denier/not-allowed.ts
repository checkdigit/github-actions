// package-denier/not-allowed.ts

type PackageName = string;
type Comparator = '>' | '>=' | '=' | '<' | '<=';
type PackageVersion = string;

/*
  This is the list of packages that are not allowed to be imported.
 */
const notAllowed: [PackageName, Comparator, PackageVersion][] = [['@aws-sdk/client-*', '>', '3.1.0']];

export default notAllowed;
