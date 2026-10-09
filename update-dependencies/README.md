# Dependency updates

The updater and scheduled checker are independent actions. Install the updater
by itself to work from manually created issues; the checker is optional.
GitHub operations live under `src/github-api/`, use `@octokit/rest`, and authenticate
with the `GITHUB_TOKEN` environment variable, matching the existing actions.
No manually created GitHub write token or signing key is needed. Private npm
packages use the existing `NPM_TOKEN` and checked-in `.npmrc`.

## Install or replace the earlier implementation

1. Copy both action folders, both action source folders, and the new
   `src/github-api/dependency-*.ts` helpers into `checkdigit/github-actions`.
   Keep existing GitHub API helpers and `src/setup.ts` unchanged.
2. Delete the old `src/dependency-maintenance/` folder and replace
   `src/update-dependencies/` entirely, rather than overlaying it. The obsolete
   `src/update-dependencies/publish.spec.ts` has moved into `src/github-api/`.
   The checker now uses `src/check-dependency-maintenance/`. Keep all existing
   unrelated files under `src/github-api/`.
3. Copy the two workflows under `examples/` to each caller's `.github/workflows/`.
   Both now explicitly pass `GITHUB_TOKEN: ${{ github.token }}` in `env`.
4. Configure `max-age-days`, `contributor-lookback-days`, `fallback-assignee`,
   update scope, and validation scripts. The checker alone accepts `issue-title` to recognize maintenance history.
   The updater has no title or marker requirement.
5. Ensure the existing `PATCH` label and Actions PR-creation permission are present.
   Pin shared actions to a reviewed SHA before broad rollout. Schedule and
   issue_comment workflows must reach the default branch through normal PR review.

## Scheduled check: issue history only

The checker paginates repository issues and recognizes non-PR issues whose title
matches `issue-title` (default `Update dependencies`, case-insensitive), or whose
body contains the action's dependency-update marker. Manually created issues are
supported; there is no requirement that the bot created them.

- An open matching issue is reused. Its current assignees are preserved.
- Otherwise, use the most recent `closed_at` among matching issues closed as
  `completed`. If it is within the configured interval, do nothing.
- If completion is overdue or no completed matching issue exists, create an
  update issue immediately.
- Issues closed as `not planned`, unrelated issues, PRs, and invalid timestamps do
  not count as completed maintenance. Do not close an abandoned update as completed.

There is no baseline issue, machine-stored completion date, or separate scan of
merged PR history. The checker trusts the team's use of completed update issues;
it does not independently prove a closed issue resulted in a merged PR or inspect
npm versions. Closing the linked issue on merge naturally advances maintenance.
An old baseline issue from the previous implementation is ignored by default.

Ownership remains the top eligible human GitHub commit author over the configured
lookback on the default branch. Bots/unmapped authors are excluded; ties use
username ordering. Candidates are checked for issue assignability. If no recent
contributor is eligible, the configured fallback is tried; otherwise leave the
issue unassigned. Squashed history counts merged commit authors.

## Update action

A human with write, maintain, or admin repository permission comments exactly
`/update-dependencies` on any open issue. PR comments, edited comments,
read-only commenters, and commands with extra arguments are ignored. The caller
checks out the default branch. Comment text is not executed as shell code.

The updater does not import checker code, require its metadata, or require a
bot-created issue. Anyone can create the issue; only a writer can invoke updates.
Its current assignees become the PR assignees.

The updater changes supported direct dependencies, increments the package patch
version, regenerates the lockfile, installs with lifecycle scripts disabled, and
runs trusted workflow-configured validation scripts in order. Include `prepare`
when needed, as in the existing CI. Failed command output is logged, and the issue
receives a failure-log link and stays open for another attempt.

After validation, GitHub creates a signed API commit; the action checks that its
signature is verified before opening the PR. The PR closes the existing issue,
has only `PATCH`, and receives the issue's current assignees. No reviewers are
requested by the action. Assignees choose reviewers after checks pass and the PR
is ready. Approval, squash merge, release, and npm publishing remain manual.

If no eligible direct updates exist, comment on the issue and close it as completed.
Its actual closing date becomes the maintenance date. This covers the configured
scope, not updates outside it. An existing update PR is returned, not duplicated.

## Limits and recovery

Supported direct sections: dependencies, devDependencies, optionalDependencies.
Only exact stable/caret/tilde specifications are updated. Peer dependencies stay
unchanged. Workspaces and template synchronization are not included. Lockfile
regeneration can re-resolve transitive dependencies outside a direct package filter.

The default branch SHA is checked after validation to avoid publishing against a
changed base. An orphaned `automation/dependency-updates` branch stops the action;
inspect and delete it before retrying. Enable branch deletion after merging.
API writes are not transactional: failures can leave a PR with incomplete labels,
assignment, or issue comments. Inspect the run and repair partial results.

`GITHUB_TOKEN`-created PR workflows can require approval; token-applied labels do
not trigger label workflows automatically. In-action validation does not itself
satisfy required PR check contexts. Verify checks attach to the PR commit before
merging. CODEOWNERS/repository rules may independently request reviewers.

Scheduled times are UTC and can be delayed by GitHub. Stagger distribution across
repositories. Verify signed-commit and permission policies in one repo first.
