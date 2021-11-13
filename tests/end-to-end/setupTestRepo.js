const { existsSync } = require('fs');
const { rm, mkdir, copyFile, readFile, writeFile, stat } = require('fs/promises');
const { chdir, cwd } = require('process');
const { join, dirname } = require('path');
const exec = require('./exec');
const git = require('./git');
const glob = require('tiny-glob');
const { clearWorkflowRuns } = require('./actionsApi');

module.exports = async function setupTestRepo(actionFileGlobPaths, testRepoPath, type, repo, user, token, projectRoot) {
  console.log(`setupTestRepo: testRepoPath = ${testRepoPath}`);
  // Remove old directory (the remains of any previous test)
  if (existsSync(testRepoPath)) {
      await rm(testRepoPath, { recursive: true, force: true });
  }
  // Build and visit the test directory
  await mkdir(testRepoPath, { recursive: true });
  const curDir = cwd();
  const fullRepoPath = testRepoPath;
  chdir(fullRepoPath);

  // Now populate the repo
  await Promise.all([clearWorkflowRuns(repo, user, token), createNpmPackage(fullRepoPath), copyActionFiles(projectRoot, fullRepoPath, actionFileGlobPaths)]);

  // Initiate the "new" Git repo
  await git({ cwd: fullRepoPath }, 'init', '--initial-branch', 'main');
  await addRemote(fullRepoPath, repo, user, token);
  await git({ cwd: fullRepoPath }, 'config', 'user.name', `Automated Version Bump Plus ${type} Test`);
  await git({ cwd: fullRepoPath }, 'config', 'user.email', `gh-action-bump-version-plus-${ type.toLowerCase() }-test@users.noreply.github.com`);
  await git({ cwd: fullRepoPath }, 'config', 'pull.rebase', 'false');
  await git({ cwd: fullRepoPath }, 'add', '.');

  if (type.toLowerCase() === 'lerna') await generateLerna(fullRepoPath);

  await git({ cwd: fullRepoPath }, 'commit',  '--message', 'initial commit (version 1.0.0)');
  await git({ cwd: fullRepoPath }, 'push', '--force', '--set-upstream', 'origin', 'main');

  // Clean-up remote repo
  await deleteTagsAndBranches(fullRepoPath);

  chdir(curDir);
};

function createNpmPackage(path) {
  return exec('npm', { cwd: path }, 'init', '-y');
}

async function addRemote(directory, testRepoUrl, username, token) {
  const authUrl = testRepoUrl.replace(/^https:\/\//, `https://${username}:${token}@`);
  await git({ cwd: directory }, 'remote', 'add', 'origin', authUrl);
}

async function copyActionFiles(projectRoot, directory, globPaths) {
  const actionFolder = join(directory, 'action');
  await mkdir(actionFolder, {recursive: true});
  const globResults = await Promise.all(globPaths.map((path) => glob(path, { cwd: projectRoot })));
  const relativeFilePaths = await Promise.all([...new Set(globResults.flat())]);
  const folders = [...new Set(relativeFilePaths.map(dirname))].filter((path) => path !== '.');
  if (folders.length > 0) {
    await Promise.all(folders.map((folder) => mkdir(join(actionFolder, folder), { recursive: true })));
  }
  await Promise.all(
    relativeFilePaths.map(async (path) => {
      const sourcePath = join(projectRoot, path);
      const fileStat = await stat(sourcePath);
      if (fileStat.isFile()) {
        return copyFile(sourcePath, join(actionFolder, path));
      }
    }),
  );
}

async function generateLerna(directory) {
  const lernaPath = 'lerna.json';
  const lernaContents = {
    "ci": false,
    "packages": [
      "packages/*"
    ],
    "version": "1.0.0",
    "useWorkspaces": false,
    "command": {
      "bootstrap": {
        "hoist": true
      },
      "publish": {
      }
    },
    "ignoreChanges": [
      "**/package-lock.json",
      "**/yarn.lock",
      "lerna.json"
    ]
  };

  await writeFile(join(directory, lernaPath), JSON.stringify(lernaContents));
  await git({ cwd: directory }, 'add', lernaPath);

  let pkg = await getPackageJson(directory);
  const mkPackageJson = async (project) => {
    pkg.name = `@test-repo/${project}`;
    await mkdir(join(directory, 'packages', project), { recursive: true });
    await writeFile(join(directory, 'packages', project, 'package.json'), JSON.stringify(pkg, null, 2));
  }
  await mkPackageJson('projectA');
  await mkPackageJson('projectB');

  await git({ cwd: directory }, 'add', 'packages');
}

async function getPackageJson(directory) {
  const path = join(directory, 'package.json');
  const contents = await readFile(path);
  const json = JSON.parse(contents);
  return json;
}


async function deleteTagsAndBranches(directory) {
  // console.log(`deleteTagsAndBranches(${directory})`);
  const listResult = await git({ suppressOutput: true, cwd: directory }, 'ls-remote', '--tags', '--heads', 'origin');
  if (listResult.stdout) {
    const lines = listResult.stdout.split('\n');
    const refs = lines.map((line) => line.split('\t')[1]).filter((ref) => ref !== 'refs/heads/main');
    if (refs.length > 0) {
      await git({ cwd: directory }, 'push', 'origin', '--delete', ...refs);
    }
  }
}