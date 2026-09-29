// dependency-review/diff.ts

import type { Dependency, DependencyChange } from './types.ts';

function locationKey(dependency: Dependency): string {
  return `${dependency.manifest}\0${dependency.path}`;
}

export function diffDependencies(
  base: Dependency[],
  head: Dependency[],
): DependencyChange[] {
  const baseByLocation = new Map(base.map((item) => [locationKey(item), item]));
  const headByLocation = new Map(head.map((item) => [locationKey(item), item]));
  const changes: DependencyChange[] = [];

  for (const dependency of head) {
    const previous = baseByLocation.get(locationKey(dependency));
    if (previous === undefined) {
      changes.push({ ...dependency, changeType: 'added' });
    } else if (
      previous.name !== dependency.name ||
      previous.version !== dependency.version ||
      previous.scope !== dependency.scope ||
      previous.source !== dependency.source ||
      previous.resolved !== dependency.resolved
    ) {
      changes.push({
        ...dependency,
        changeType: 'changed',
        previousVersion: previous.version,
      });
    }
  }

  for (const dependency of base) {
    if (!headByLocation.has(locationKey(dependency))) {
      changes.push({ ...dependency, changeType: 'removed' });
    }
  }

  return changes.sort((left, right) =>
    `${left.manifest}\0${left.name}\0${left.path}`.localeCompare(
      `${right.manifest}\0${right.name}\0${right.path}`,
    ),
  );
}
