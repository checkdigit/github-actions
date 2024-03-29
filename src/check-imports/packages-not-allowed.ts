// check-imports/packages-not-allowed.ts

export type Name = string;
export type Range = string;
export type Reason = string;
export type NotAllowed = [Name, Range, Reason];

// const UNSTABLE =
//   'Higher versions are unstable and break tests in Check Digit services. This can be removed from the Not Allowed list when stability improves.';

/*
  This is the list of packages that are not allowed to be imported.
 */
const notAllowed: NotAllowed[] = [
  // ['@aws-sdk/client-*', '>3.387.0', UNSTABLE], // example of an unstable package
];

export default notAllowed;
