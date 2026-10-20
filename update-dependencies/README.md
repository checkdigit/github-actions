# Update dependencies

On a new `/update-dependencies` comment on an open issue, the action checks the
original commenter's current repository permission. Only humans with write,
maintain, or admin permission can invoke it. PR comments and edited comments are
ignored. Any open issue can be used; the scheduled checker is optional.

The caller checks out the repository's default branch and sets up Node 26. The
updater then:

1. Increments the package's own version by one patch, without a Git tag or commit.
2. Runs `npx --yes npm-check-updates -u` (equivalent to `ncu -u`). Dependency
   updates may include major versions and respect the repository's ncu config.
3. Deletes `package-lock.json` and runs `npm install --ignore-scripts` to
   regenerate it and install dependencies.
4. Runs `npm run prepare --if-present` to perform project setup explicitly.
5. Runs `npm run lint:fix`, `npm run prettier:fix`, and `npm run test`, in order.
6. If dependency installation succeeds and the default branch is unchanged, creates
   `automation/dependency-updates` and a signed API commit containing all tracked
   modifications, deletions, and new non-ignored files, including fixer changes.
7. Opens a PR that closes the issue on merge, assigns it to the issue's current
   assignees, and applies the existing `PATCH` label.

Setup, lint, formatting, and test failures do not stop publication. Remaining
validation commands still run, and the PR and issue comment list failed commands
with a link to the workflow logs. The issue assignees take over on the PR branch
to fix failures and rerun checks before requesting review or merging. A compile
failure within `npm run test` is handled the same way.

Dependency update, installation, lockfile consistency, and publishing failures
still stop the action, leave the issue open, and post a link to the failed run. An existing update PR is returned instead of duplicated. A leftover
update branch without a PR must be inspected and deleted before retrying.
The package version is bumped even if ncu finds no newer dependencies.

## Caller workflow

Copy `examples/dependency-updates.yml` to `.github/workflows/` on the caller
repository's default branch. It sets Node 26, `CI: true`, and job-level concurrency.
No `scope`, `packages`, `label`, or `validation-scripts` input is needed.

The caller must have a clean checkout, a stable package version, a committed
`package-lock.json`, and the `lint:fix`, `prettier:fix`, and `test` npm scripts.
Workspaces are not supported. Private npm packages use `NPM_TOKEN` through the
repository's checked-in `.npmrc`.

Pass the built-in `GITHUB_TOKEN` with contents, issues, and pull requests write
permissions. The action publishes through GitHub's API, so checkout can use
`persist-credentials: false`. No manually created write token or signing key is
needed. Enable Actions PR creation in repository settings and ensure `PATCH`
already exists. Pin the shared action to a reviewed SHA for rollout.

The action's own JavaScript runtime is Node 24; npm and project scripts use the
Node version configured by the caller. In-action tests run on Node 26 and do not
replace the repository's PR checks or its Node 24/26 matrix. Verify that those
checks run on the resulting PR before merging. Token-applied labels do not
trigger label workflows automatically. Review, merge, release, and npm publishing
remain manual.

## Logging

Normal logs show one progress line per update or validation command. Failed
commands retain stdout and stderr in expandable log groups, and validation
failures are listed on the PR and issue comment.

Set `DEBUG: 'github-actions:update-dependencies'` in the caller step's environment
to include successful command stdout and stderr for this action. Use
`DEBUG: 'github-actions:*'` for all shared action debug logs, or `DEBUG: '*'`
for all debug namespaces, including libraries and project scripts. No
`ACTIONS_STEP_DEBUG` setting is required.
