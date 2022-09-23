# github-actions

Tools for use with gitub-actions

## Commands:

### `npx action is-api`

Identifies if a project contains a `src/api` folder structure and returns GitHub action compatible output.

- If TRUE returns `::set-output name=IS_API::true`
- If FALSE returns `::set-output name=IS_API::false`

### `npx action generate-beta-version`

Generates a beta version string for the project and updates the package.json to this.

Reads the current version from the projects.json and appends `-beta.` to it
Then generates a 5 character random string. For example `1.2.3-beta.aBc4d`

Result is then written to the projects package.json file that is located on the GitHub action container.

New version is output in the GitHub action compatible output including the Package name `::set-output name=NEW_VERSION::@checkdigit/examplePackage@1.2.3-beta.aBc4d`

### `npx action publish-comment`

Writes a comment into the Pull Request that contains the new version and the npm command to install it.

Expects an environment variable `NEW_PACKAGE_VERSION` set that contains the `NEW_VERSION` output from `npx action generateBetaVersion`

If any previous comments exist those will be removed so only the most recent beta version is shown on the Pull Request
