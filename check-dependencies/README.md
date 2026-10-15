# Check Dependencies

Creates an **Update dependencies** issue when the latest matching issue closed as
completed is at least `max-age-days` old. If no completed issue exists, maintenance
is due immediately. An open matching issue suppresses creation. Pull requests and
issues closed as not planned do not reset the interval.

New issues receive the `DEPENDENCY UPDATE` label. Matching recognizes that label
(case insensitive), the hidden `<!-- check-dependencies -->` marker, or historical
maintenance titles. Historical titles include `update dependencies` with optional
suffixes (such as `and workflows` or `and setup OIDC publishing`),
`Update to latest dependencies`, and `dependency / CI updates yyyy-mm-dd`.
Title matching ignores case and surrounding whitespace. Labeled issues can have
any title. Historical issues do not need to be relabeled to count toward the
maintenance interval or suppress a duplicate.

Recent human commit authors on the default branch are ranked by commit count,
then latest authorship date, then username. Bots and commits without a linked
GitHub user are excluded. The action tries each author's assignment eligibility
in order, then `fallback-assignee`. If nobody is eligible, it creates an
unassigned issue and logs a warning. API errors other than an ineligible
assignee's 404 fail the action.

```yaml
name: Dependency maintenance
on:
  schedule:
    - cron: '0 10 * * 1-5'
  workflow_dispatch:

permissions:
  contents: read
  issues: write

# Serialize checks to prevent overlapping runs from opening duplicate issues.
concurrency:
  group: dependency-maintenance
  cancel-in-progress: false

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: checkdigit/github-actions/check-dependencies@main
        id: dependencies
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          max-age-days: '90'
          contributor-lookback-days: '90'
          fallback-assignee: ''
```

Both day inputs must be positive integers. `GITHUB_REPOSITORY` is supplied by
GitHub Actions. The `issue-url` output contains the created issue URL, or an empty
string when creation is skipped. Close maintenance issues as **completed** once
the dependency updates are merged.
