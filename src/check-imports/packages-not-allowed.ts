// check-imports/packages-not-allowed.ts

export type Name = string;
export type Range = string;
export type NameAndRange = [Name, Range];

/*
  This is the list of packages that are not allowed to be imported.
 */
const notAllowed: NameAndRange[] = [
  ['@aws-sdk/client-*', '>3.193.0'],
  ['@aws-sdk/credential-provider-ini', '>3.193.0'],
  ['@aws-sdk/credential-provider-node', '>3.193.0'],
  ['@aws-sdk/smithy-client', '>3.193.0'],
  ['@aws-sdk/types', '>3.193.0'],
  ['got', '>=12.0.0'],
  ['get-port', '>5.1.1'],
  ['antlr4', '>4.9.3'],
];

export default notAllowed;
