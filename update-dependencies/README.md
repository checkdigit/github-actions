# Update dependencies

On a new `/update-dependencies` comment on an open issue, the action checks the
original commenter's current repository permission. Only humans with write,
maintain, or admin permission can invoke it. PR comments and edited comments are
ignored. Any open issue can be used; the scheduled checker is optional.

The caller checks out the repository's default branch and sets up Node 26. The
updater then:

1. Increments the package's own version by one patch, without a Git tag or commit.
   Removes `rimraf` and `@types/koa__router` from dependency sections and replaces
   `rimraf` commands in npm scripts with Node's native `fs.rmSync`.
   Removes `--disable-warning ExperimentalWarning` and `--experimental-strip-types`
   from scripts and adds `--throw-deprecation --pending-deprecation` to Node
   commands in `ci:test`.
   Sets `prettier` to `prettier . --check` and `prettier:fix` to
   `prettier . --write`, adding the scripts if missing.
2. Runs the action's locked `npm-check-updates` CLI with `-u` (equivalent to `ncu -u`). Dependency
   updates may include major versions and respect the repository's ncu config.
3. Deletes `package-lock.json` and runs `npm install --ignore-scripts` to
   regenerate it and install dependencies.
4. Runs `npm run prepare --if-present` to perform project setup explicitly.
5. Runs `npm run prettier:fix`, `npm run lint:fix`, and `npm run test`, in order.
6. If dependency installation succeeds and the default branch is unchanged, creates
   `automation/dependency-updates` and a signed API commit containing all tracked
   modifications, deletions, and new non-ignored files, including fixer changes.
7. Opens a PR that closes the issue on merge, assigns it to the issue's current
   assignees, and applies the existing `PATCH` label.

Setup, lint, formatting, and test failures do not stop publication. Remaining
validation commands still run, and the PR and issue comment list failed commands
with a link to the workflow logs. The issue assignees take over on the PR branch
to fix failures, update engine version, update workflows and rerun checks before requesting review or merging.
A compile failure within `npm run test` is handled the same way.

Dependency update, installation, lockfile consistency, and publishing failures
still stop the action, leave the issue open, and post a link to the failed run. An existing update PR is returned instead of duplicated. A leftover
update branch without a PR must be inspected and deleted before retrying.
The package version is bumped even if ncu finds no newer dependencies.

## Caller workflow

Add `.github/workflows/dependency-updates.yml` on the caller repository's default
branch using this example. Caller workflows reference `checkdigit/github-actions`
on `main` to receive shared action updates.

```yaml
name: Update dependencies

on:
  issue_comment:
    types: [created]

env:
  CI: true

jobs:
  update-dependencies:
    if: >-
      github.event.issue.pull_request == null &&
      github.event.comment.body == '/update-dependencies'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    concurrency:
      group: dependency-updates-${{ github.repository }}
      cancel-in-progress: false
    timeout-minutes: 30
    steps:
      - name: Check out the default branch
        uses: actions/checkout@v7
        with:
          ref: ${{ github.event.repository.default_branch }}
          persist-credentials: false
      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: '26.x'
          cache: npm
      - name: Update dependencies
        uses: checkdigit/github-actions/update-dependencies@main
        env:
          CI: 'true'
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          DEBUG: 'github-actions:update-dependencies'
```

No `scope`, `packages`, `label`, or `validation-scripts` input is needed. The action
checks the commenter's permission before modifying the caller repository.

The caller must have a clean checkout, a stable package version, a committed
`package-lock.json`, and the `lint:fix`, `prettier:fix`, and `test` npm scripts.
Workspaces are not supported. Private npm packages use `NPM_TOKEN` through the
repository's checked-in `.npmrc`.

Pass the built-in `GITHUB_TOKEN` with contents, issues, and pull requests write
permissions. The action publishes through GitHub's API, so checkout can use
`persist-credentials: false`. No manually created write token or signing key is
needed. Enable Actions PR creation in repository settings and ensure `PATCH`
already exists.

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
