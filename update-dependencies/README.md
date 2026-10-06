# Update Dependencies

Manually prepare an npm dependency update PR using the automatic, short-lived
repository `GITHUB_TOKEN`. No personal access token, GitHub App key, or commit
signing key is required.

## Install

1. Publish this action in `checkdigit/github-actions`.
2. Copy `examples/dependency-updates.yml` to `.github/workflows/dependency-updates.yml`
   in each target repo or its template. Pin the shared action to the reviewed
   commit SHA instead of `main` for production use.
3. Configure the real reviewer usernames or `team:slug` entries and npm validation
   scripts. Keep these settings in the workflow, not dispatch inputs.
4. Ensure the existing `PATCH` label is present. Organization/repo Actions policy
   must allow the shared action and allow Actions to create pull requests.
5. Select Actions → Dependency updates → Run workflow on the default branch.

Alternatively, using your existing authenticated GitHub CLI account:

```sh
gh workflow run dependency-updates.yml --repo checkdigit/example \
  -f scope=minor -f packages=''
```

No scheduled trigger is included. No release, merge, approval, or npm publish is
automated. The normal human review, squash merge, and release process remains.

## Behavior

- Update direct dependencies, devDependencies, and optionalDependencies. Preserve
  exact/caret/tilde syntax. Peer dependencies are unchanged.
- `patch` stays within each dependency's current major/minor; `minor` stays within
  its current major; `latest` selects the highest stable registry version,
  including major changes. Prereleases are excluded.
- An empty package filter selects all supported direct dependencies. An explicit
  unknown package or unsupported version specification fails the run. Unsupported
  specifications in an unfiltered run are logged and skipped.
- No eligible direct updates means no issue, version bump, branch, or PR.
- Bump the project's stable semantic version by one patch, delete and regenerate
  the lockfile, then install and run all configured validation scripts.
- Installation disables lifecycle scripts, following this repo's CI convention.
  Projects requiring generated install artifacts must include an explicit trusted
  preparation script in `validation-scripts`.
- Create an issue, branch, API commit, and linked PR after successful validation.
  The PR has exactly the configured label (default `PATCH`) for compatibility with
  Check Digit's existing single-label check.
- Use GitHub's `createCommitOnBranch` mutation for signed commits. Verify the
  returned commit with the REST API before opening a PR. No unsigned fallback.
- Request configured user/team reviewers. Team entries use slugs, not display names.
- Only package.json and package-lock.json are committed. This version does not
  synchronize template files or support npm workspaces.

Deleting the lockfile re-resolves transitive versions, so the package filter only
limits direct manifest changes. Review the full lockfile diff.

## Concurrency and recovery

Use the example's concurrency group. An existing open update PR is returned
without creating another issue or updating its contents. A leftover update branch
without an open PR stops the run; inspect and delete it before retrying. Enable
automatic branch deletion after merge, or delete the branch manually.

External API operations are not transactional. If an API call fails after issue
creation, inspect the issue and `automation/dependency-updates` branch. A PR can
also exist with missing labels/reviewer requests if a later API call fails; repair
those settings manually. Validation failures happen before issue/branch creation.
The default branch SHA is checked after validation to avoid publishing against a
base that changed during the run.

## Existing CI and signed-commit policy

Pilot in one target repo before distribution. Confirm GitHub recognizes the API
commit as verified and that the organization rules permit the bot's branch/PR.
There is no branch protection bypass.

GitHub's current `GITHUB_TOKEN` behavior can require approval for PR workflow runs;
label-triggered workflows are not started by token-applied labels. Validation in
this action does not satisfy required PR checks automatically. Approve/run the
existing checks through your supported GitHub flow and verify they attach to the
PR commit before merging. No broader credential is introduced to avoid that rule.

Private registry read authentication is separate from GitHub write authentication.
Reuse your existing approved npm registry configuration if private packages need
credentials; this action does not manufacture registry access.

References:

- https://docs.github.com/en/actions/concepts/security/github_token
- https://docs.github.com/en/graphql/reference/commits#createcommitonbranch
