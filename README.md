# github-actions

GitHub Actions supporting Check Digit CI workflows.

## Node Dependency Review

`dependency-review` is a self-contained Node/npm replacement for the practical
pull-request checks in GitHub Dependency Review. It does **not** call GitHub's
paid dependency-graph comparison API, run `npm install`, check out pull-request
content, or execute target repository code.

It reads every committed `package-lock.json` at the base and head revisions
through GitHub's ordinary read-only Git tree/blob API, parses npm lockfile
versions 2 and 3, compares exact installed occurrences (including workspaces,
nested duplicates, and multiple lockfiles), and reports additions, removals, and
version changes. It queries the free OSV API for npm vulnerability intelligence
and uses anonymous public npm registry metadata as the authority for license
policy decisions.

### Basic usage

```yaml
name: Dependency review

on:
  pull_request:
  merge_group:

permissions:
  contents: read

jobs:
  dependency-review:
    runs-on: ubuntu-latest
    steps:
      - uses: checkdigit/github-actions/dependency-review@v4
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-on-severity: high
          fail-on-scopes: runtime,development
          allow-licenses: MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC
```

No checkout step is required. `pull_request`, `pull_request_target`, and
`merge_group` payloads provide the comparison commits. For other events, set
both `base-ref` and `head-ref` to commit SHAs or refs that the repository's Git
API can resolve.

The token needs only `contents: read` for normal operation. To enable the
optional single, marker-based PR comment, add `pull-requests: write` and set
`comment-summary-in-pr` to `always` or `on-failure`. Comment failure on forks or
read-only tokens is reported as a warning and does not hide the review result.

### Policy example

```yaml
- uses: checkdigit/github-actions/dependency-review@v4
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on-severity: moderate
    fail-on-scopes: |
      runtime
      development
    allow-advisories: |
      GHSA-xxxx-xxxx-xxxx
      CVE-2025-12345
    allow-licenses: |
      MIT
      Apache-2.0
      BSD-3-Clause
    allow-dependencies-licenses: |
      @company/private-package
      pkg:npm/specially-reviewed-package@1.2.3
    deny-packages: |
      abandoned-package
      pkg:npm/%40untrusted/package
    deny-groups: |
      @untrusted
```

`allow-licenses` and `deny-licenses` are mutually exclusive and accept SPDX
license identifiers or complete expressions, including `AND`, `OR`, `+`, and
`WITH` exceptions. Equivalent compound expressions are matched regardless of
term order or grouping. An exact compound allowlist entry permits that complete
expression. Otherwise, every part of an `AND` expression must be allowed, while
one allowed alternative is enough for `OR`; a denied `OR` expression is
blocking only when every alternative is denied. Invalid expressions are
blocking. Unknown licenses are reported as warnings when no allow/deny policy
is configured and are blocking when a license policy is configured. Reviewed
private or unavailable packages can be exempted with
`allow-dependencies-licenses` using an npm name or PURL.

License requests go only to `registry.npmjs.org` and are anonymous: the action
neither accepts nor forwards private npm credentials. Registry metadata is
authoritative when a license policy is active; PR-controlled package-lock
license values are not trusted for enforcement. When no license policy is
configured, lockfile license metadata may be used as a clearly non-authoritative
reporting fallback if the registry is unavailable. Registry dependency names
and versions are sent to OSV and the public npm registry; unsupported source
URLs remain visible only in GitHub logs/reports. GitHub receives only normal
REST calls for repository Git objects and an optional PR comment.

### Inputs and outputs

The action manifest documents every input. The main controls are:

- `vulnerability-check` and `license-check` (both default to `true`)
- `fail-on-severity`: `low`, `moderate`, `high`, or `critical`
- `fail-on-scopes`: `runtime`, `development`, or both
- `allow-advisories` (`allow-ghsas` is supported for migration compatibility)
- `allow-licenses` or `deny-licenses`
- `allow-dependencies-licenses`, `deny-packages`, and `deny-groups`
- `warn-only`, `show-patched-versions`, and `comment-summary-in-pr`

The action writes annotations and a job summary grouped by manifest and exposes
valid JSON arrays as `dependency-changes`, `vulnerable-changes`,
`invalid-license-changes`, and `denied-changes`. `comment-content` contains the
rendered Markdown report. The action log and job summary include statistics for
lockfiles and dependency occurrences scanned, changes by type and scope, OSV
queries and findings, license candidates and issues, package-policy findings,
and the total blocking result. Very large summaries and outputs are shortened
at safe boundaries and emit a warning rather than exceeding GitHub command
limits.

### Scope and limitations

- Node/npm only; Yarn, pnpm, and non-JavaScript ecosystems are not supported.
- Supports committed npm `package-lock.json` lockfile versions 2 and 3.
- Workspace link pseudo-packages and local `file:`/`link:` entries are excluded.
  Optional and `devOptional` dependencies are runtime in this two-scope model;
  only entries with npm's `dev: true` metadata are development dependencies.
- Newly added or changed git dependencies and non-registry remote tarballs fail
  closed as unsupported sources because an npm name/version cannot reliably
  establish their content for OSV or registry-license correlation. Unchanged
  unsupported dependencies do not fail a pull request.
- Git trees are traversed non-recursively one directory at a time. A truncated
  response, malformed lockfile, incomplete OSV response, or unavailable OSV/npm
  service needed for a policy decision fails closed.
- Severity is taken from OSV ecosystem/database metadata or CVSS v3. Missing or
  unsupported severity data is conservatively treated as high.
- The PR gate compares vulnerability occurrences at base and head. It cannot
  catch a vulnerability first disclosed after an unchanged dependency was
  merged. Keep a separate scheduled full-inventory OSV scan (and Dependabot
  alerts, if enabled) for that case.
- This action does not reproduce GitHub's custom Files Changed UI,
  organization-wide security dashboard, historical dependency service,
  OpenSSF Scorecard enrichment, external YAML configuration files, dependency
  snapshot submission/retry behavior, or non-npm ecosystem support.

### Migrating from GitHub Dependency Review

Replace `actions/dependency-review-action` with this subdirectory action and
keep `contents: read`. Existing `fail-on-severity`, `fail-on-scopes`,
`allow-ghsas`, `vulnerability-check`, `license-check`, `allow-licenses`,
`deny-licenses`, `allow-dependencies-licenses`, `deny-packages`, `deny-groups`,
`warn-only`, `show-patched-versions`, and PR comment policies have direct or
close equivalents. Review license exceptions because this implementation will
not send private registry credentials and deliberately surfaces unavailable
private-package metadata.
