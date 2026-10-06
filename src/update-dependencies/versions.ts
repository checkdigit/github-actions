// update-dependencies/versions.ts

import semver from 'semver';

export type Scope = 'patch' | 'minor' | 'latest';

export function selectVersion(
  spec: string,
  versions: string[],
  scope: Scope,
): string | undefined {
  // Capture the supported range prefix and stable semantic version.
  const match = /^(?<prefix>[~^])?(?<version>\d+\.\d+\.\d+)$/u.exec(spec);
  if (match === null) {
    return undefined;
  }
  const current = match.groups?.['version'];
  if (current === undefined || semver.valid(current) === null) {
    return undefined;
  }
  const parsed = new semver.SemVer(current);
  const ceiling =
    scope === 'patch'
      ? `<${parsed.major}.${parsed.minor + 1}.0`
      : scope === 'minor'
        ? `<${parsed.major + 1}.0.0`
        : '';
  const next = semver.maxSatisfying(versions, `>${current} ${ceiling}`);
  return next === null ? undefined : `${match.groups?.['prefix'] ?? ''}${next}`;
}
