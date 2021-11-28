<!-- markdownlint-disable MD041 -->
## gh-action-bump-version-plus

GitHub Action for automated npm version bump.

> This is a extension of
> [`gh-action-bump-version`](https://github.com/phips28/gh-action-bump-version)
> by `phips28` and a further development of the testing principles of
> `melody-universe`.

> As the `plus` indicates this action will do all what `gh-action-bump-version`
> does plus some handling of Lerna mono repos. For Lerna mono repos we
> ___always___ bump all packages in the mono repo.
>
> Additionally, we introduce a parameter `skip-if-commit-contains` (see below).

This Action bumps the version in `package.json` and pushes it back to the repo. It
is meant to be used on every successful merge to master but you'll need to
configured that workflow yourself. You can look to the
[`.github/workflows/push.yml`](./.github/workflows/push.yml) file in this
project as an example.

<!-- markdownlint-disable MD036 -->
**Attention**

Make sure you use the `actions/checkout@v2` action!

**Migration: Version v9 and up**

Remove the 'actions/setup-node@v1' step from your action.yml file

```yaml
      - name: 'Setup Node.js'
        uses: 'actions/setup-node@v1'
        with:
          node-version: 14
```

### Workflow

* Based on the commit messages, increment the version from the latest release.
  * If the string "BREAKING CHANGE", "major" or the Attention pattern
    `refactor!: drop support for Node 6` is found anywhere in any of the commit
    messages or descriptions the major version will be incremented.
  * If a commit message begins with the string "feat" or includes "minor" then
    the minor version will be increased. This works for most common commit
    metadata for feature additions: `"feat: new API"` and `"feature: new API"`.
  * If a commit message contains the word "pre-alpha" or "pre-beta" or "pre-rc"
    then the pre-release version will be increased (for example specifying
    pre-alpha: 1.6.0-alpha.1 -> 1.6.0-alpha.2 or, specifying pre-beta:
    1.6.0-alpha.1 -> 1.6.0-beta.0)
  * All other changes will increment the patch version.
* Push the bumped npm version in package.json back into the repo.
* Push a tag for the new version back into the repo.

<!-- markdownlint-disable MD026 -->
### Usage:

**tag-prefix:** Prefix that is used for the git tag  (optional). Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tag-prefix:  'v'
```

**skip-tag:** The tag is not added to the git repository  (optional). Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    skip-tag:  'true'
```

**default:** Set a default version bump to use  (optional - defaults to patch).
Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    default: prerelease
```

**preid:** Set a preid value will building prerelease version  (optional -
defaults to 'rc'). Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    default: prerelease
    preid: 'prc'
```

**wording:** Customize the messages that trigger the version bump. It must be a
string, case sensitive, coma separated  (optional). Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    minor-wording:  'add,Adds,new'
    major-wording:  'MAJOR,cut-major'
    patch-wording:  'patch,fixes'     # Providing patch-wording will override commits
                                      # defaulting to a patch bump.
    rc-wording:     'RELEASE,alpha'
```

**PACKAGEJSON_DIR:** Param to parse the location of the desired package.json
(optional). Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    PACKAGEJSON_DIR:  'frontend'
```

**TARGET-BRANCH:** Set a custom target branch to use when bumping the version.
Useful in cases such as updating the version on master after a tag has been set
(optional). Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    target-branch: 'master'
```

**commit-message:** Set a custom commit message for version bump commit. Useful
for skipping additional workflows run on push. Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    commit-message: 'CI: bumps version to {{version}} [skip ci]'
```

**push:** Set false you want to avoid pushing the new version tag/package.json.
Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    push: false
```


**skip-if-commit-contains:** Skip Version Bump Plus if the commit message contains the specified (case-insensitive) string
Example:

```yaml
- name:  'Automated Version Bump Plus'
  uses:  'mhillerstrom/gh-action-bump-version-plus@master'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    skip-if-commit-contains: dependabot
```

### Testing

To be able to run the tests locally, you will have to create two repos for this sole
purpose with a personal access token (PAT) and create a local `.env` file with
contents like:

``` sh
TEST_REPO=https://github.com/xxx/gh-action-bump-version-plus-test.git
TEST_LERNA_REPO=https://github.com/xxx/gh-action-bump-version-plus-lerna-test.git
TEST_USER=xxx
TEST_TOKEN=ghp_XXXBe6bFaUp5rhOCFSiEah0PyC710xXy57yyy
RUNNER_TEMP=../tmp
```

In order to make all tests pass you will have to make a secret `TEST_TOKEN` in
both repositories (can be same PAT as above). `RUNNER_TEMP` must be a directory
separate from the working directory of this GitHub Action.

After this all you need to do is:

``` sh
npm run test
```

lay back and watch the tests run. Any `console.log()` statements in `index.js`
will be available in the actions output (see actions tab on GitHub).

Happy debugging! 😄

> To be able to merge changes in your own copy of this repo you must add
> `TEST_REPO`, `TEST_LERNA_REPO`, `TEST_USER`, and `TEST_TOKEN` as repository
> secrets.
