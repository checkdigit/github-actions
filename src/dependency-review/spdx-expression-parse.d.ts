// dependency-review/spdx-expression-parse.d.ts

declare module 'spdx-expression-parse' {
  export interface SpdxLicenseNode {
    license: string;
    plus?: boolean;
    exception?: string;
  }

  export interface SpdxConjunctionNode {
    left: SpdxNode;
    conjunction: 'and' | 'or';
    right: SpdxNode;
  }

  export type SpdxNode = SpdxLicenseNode | SpdxConjunctionNode;

  export default function parse(expression: string): SpdxNode;
}
