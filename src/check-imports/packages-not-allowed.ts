// check-imports/packages-not-allowed.ts

export type Name = string;
export type Range = string;
export type Reason = string;
export type NotAllowed = [Name, Range, Reason];

const UNSTABLE =
  'Higher versions are unstable and break tests in Check Digit services. This can be removed from the Not Allowed list when stability improves.';

const ESM_UNSUPPORTED =
  'This version and higher use ESM which Check Digit does not support. This can be removed when Check Digit supports ESM.';
const ESM_UNSUPPORTED_HIGHER =
  'Higher versions use ESM which Check Digit does not support. This can be removed when Check Digit supports ESM.';

/*
  This is the list of packages that are not allowed to be imported.
 */
const notAllowed: NotAllowed[] = [
  ['@aws-sdk/client-*', '>3.387.0', UNSTABLE],
  ['@aws-sdk/credential-provider-ini', '>3.387.0', UNSTABLE],
  ['@aws-sdk/credential-provider-node', '>3.387.0', UNSTABLE],
  ['@aws-sdk/smithy-client', '>3.387.0', UNSTABLE],
  ['got', '>=12.0.0', ESM_UNSUPPORTED],
  ['get-port', '>=6.0.0', ESM_UNSUPPORTED],
  ['antlr4', '>4.9.3', ESM_UNSUPPORTED_HIGHER],
];

export default notAllowed;
