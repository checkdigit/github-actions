# Release

After a PR is squash merged into the caller repository's default branch, this
action reads `package.json` at that exact commit, creates a `v<version>` tag, and
publishes a GitHub Release with automatically generated release notes. For example,
version `1.2.3` produces tag `v1.2.3`. The action does not bump versions or publish
to npm; update the package version in the PR before merging.

The action verifies the PR's merged state and default branch through GitHub's API.
It rejects merge commits with multiple parents and requires a stable semantic
version. Configure the caller repository to allow squash merging only: a
single-parent commit cannot distinguish squash merging from rebasing.

Rerunning the workflow reuses a matching tag and published release. If a previous
attempt created the tag but failed to publish the release, the rerun completes
publication. A tag pointing at another commit, or an existing draft or prerelease,
fails the action for manual inspection. Existing tags and releases are never moved
or overwritten.

## Caller workflow

Add `.github/workflows/release.yml` on the caller's default branch. Change `main`
in the branch filter if the caller uses another default branch.

```yaml
name: Release

on:
  pull_request_target:
    types: [closed]
    branches: [main]

jobs:
  release:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: read
    concurrency:
      group: release-${{ github.repository }}-${{ github.event.pull_request.number }}
      cancel-in-progress: false
    timeout-minutes: 15
    steps:
      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: '26.x'
      - name: Tag and release
        uses: checkdigit/github-actions/release@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The workflow uses `pull_request_target: closed` so merged fork PRs can also be
released with a write-capable token. It runs only after merging and does not check
out or execute the PR's head branch. The action reads the manifest through the API,
so caller checkout, dependency installation, and registry credentials are not needed.

Concurrency is scoped to the PR so separate squash merges each produce a release.

The built-in `GITHUB_TOKEN` needs `contents: write` and `pull-requests: read`.
Events created using `GITHUB_TOKEN` do not trigger other ordinary tag/release
workflows. Put any subsequent publishing step in this workflow if it must run
after the release.

## Outputs

| Output        | Description                      |
| ------------- | -------------------------------- |
| `version`     | Version read from `package.json` |
| `tag`         | Version tag, such as `v1.2.3`    |
| `release-url` | Published GitHub Release URL     |
