// test
const { execSync, spawn } = require('child_process');
const { existsSync, writeFileSync, readdirSync } = require('fs');
const { EOL } = require('os');
const path = require('path');

// Change working directory if user defined PACKAGEJSON_DIR
if (process.env.PACKAGEJSON_DIR) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env.PACKAGEJSON_DIR}`;
  process.chdir(process.env.GITHUB_WORKSPACE);
}

const workspace = process.env.GITHUB_WORKSPACE;

(async () => {
  let pkg = getLernaRepo();
  const isLernaRepo = pkg !== null;
  let globs = ['.'];
  if (isLernaRepo)
    globs = globs.concat(pkg.packages).flatMap(x => x);
  const packageDirs = (await Promise.all(globs.map(g => dirGlob(g)))).flatMap(x => x === '.' ? '' : x);
  console.log(`packageDirs = ${JSON.stringify(packageDirs)}`);
  pkg = pkg || getPackageJson();
  console.log(`read version = ${pkg.version} from ${isLernaRepo ? 'lerna.json' : 'package.json'}`);

  const event = process.env.GITHUB_EVENT_PATH ? require(process.env.GITHUB_EVENT_PATH) : {};

  if (!event.commits) {
    console.log("Couldn't find any commits in this event, incrementing patch version...");
  }

  const tagPrefix = process.env['INPUT_TAG-PREFIX'] || '';
  const messages = event.commits ? event.commits.map((commit) => `${commit.message}\n${commit.body}`) : [];
  
  // Should we bail-out because of a text in commit message?
  const checkMessage = process.env['INPUT_SKIP-IF-COMMIT-CONTAINS'].toLowerCase();
  if (checkMessage != '') {
    const messagesString = messages.join(',').toLowerCase();
    if (messagesString.indexOf(checkMessage) > -1) {
      exitSuccess(`No action necessary because we found '${checkMessage}' in commit message!`);
      return;
    }
  }

  const commitMessage = process.env['INPUT_COMMIT-MESSAGE'] || 'ci: version bump to {{version}}';
  console.log('commit messages:', messages);
  const commitMessageRegex = new RegExp(commitMessage.replace(/{{version}}/g, `${tagPrefix}\\d+\\.\\d+\\.\\d+`), 'ig');
  const isVersionBump = messages.find((message) => commitMessageRegex.test(message)) !== undefined;

  if (isVersionBump) {
    exitSuccess('No action necessary because we found a previous bump!');
    return;
  }

  // input wordings for MAJOR, MINOR, PATCH, PRE-RELEASE
  const majorWords = process.env['INPUT_MAJOR-WORDING'].split(',');
  const minorWords = process.env['INPUT_MINOR-WORDING'].split(',');
  // patch is by default empty, and '' would always be true in the includes(''), thats why we handle it separately
  const patchWords = process.env['INPUT_PATCH-WORDING'] ? process.env['INPUT_PATCH-WORDING'].split(',') : null;
  const preReleaseWords = process.env['INPUT_RC-WORDING'].split(',');

  console.log('config words:', { majorWords, minorWords, patchWords, preReleaseWords });

  // get default version bump
  let version = process.env.INPUT_DEFAULT;
  let foundWord = null;
  // get the pre-release prefix specified in action
  let preid = process.env.INPUT_PREID;

  // case: if wording for MAJOR found
  if (
    messages.some(
      (message) => /^([a-zA-Z]+)(\(.+\))?(\!)\:/.test(message) || majorWords.some((word) => message.includes(word)),
    )
  ) {
    version = 'major';
  }
  // case: if wording for MINOR found
  else if (messages.some((message) => minorWords.some((word) => message.includes(word)))) {
    version = 'minor';
  }
  // case: if wording for PATCH found
  else if (patchWords && messages.some((message) => patchWords.some((word) => message.includes(word)))) {
    version = 'patch';
  }
  // case: if wording for PRE-RELEASE found
  else if (
    messages.some((message) =>
      preReleaseWords.some((word) => {
        if (message.includes(word)) {
          foundWord = word;
          return true;
        } else {
          return false;
        }
      }),
    )
  ) {
    preid = foundWord.split('-')[1];
    version = 'prerelease';
  }

  console.log('version action after first waterfall:', version);

  // case: if default=prerelease,
  // rc-wording is also set
  // and does not include any of rc-wording
  // then unset it and do not run
  if (
    version === 'prerelease' &&
    preReleaseWords !== '' &&
    !messages.some((message) => preReleaseWords.some((word) => message.includes(word)))
  ) {
    version = null;
  }

  // case: if default=prerelease, but rc-wording is NOT set
  if (version === 'prerelease' && preid) {
    version = 'prerelease';
    version = `${version} --preid=${preid}`;
  }

  console.log('version action after final decision:', version);

  // case: if nothing of the above matches
  if (version === null) {
    exitSuccess('No version keywords found, skipping bump.');
    return;
  }

  // case: if user sets push to false, to skip pushing new tag/package.json
  const push = process.env.INPUT_PUSH;
  if (push === 'false' || push === false) {
    exitSuccess('User requested to skip pushing new tag and package.json. Finished.');
    return;
  }

  // GIT logic
  try {
    const current = pkg.version.toString();
    // set git user
    await runInWorkspace('git', ['config', 'user.name', `"${process.env.GITHUB_USER || 'Automated Version Bump Plus'}"`]);
    await runInWorkspace('git', [
      'config',
      'user.email',
      `"${process.env.GITHUB_EMAIL || 'gh-action-bump-version-plus@users.noreply.github.com'}"`,
    ]);

    let currentBranch = /refs\/[a-zA-Z]+\/(.*)/.exec(process.env.GITHUB_REF)[1];
    console.log('currentBranch(1):', currentBranch);
    let isPullRequest = false;
    if (process.env.GITHUB_HEAD_REF) {
      // Comes from a pull request
      currentBranch = process.env.GITHUB_HEAD_REF;
      isPullRequest = true;
    }
    console.log('currentBranch(2):', currentBranch);
    if (process.env['INPUT_TARGET-BRANCH']) {
      // We want to override the branch that we are pulling / pushing to
      currentBranch = process.env['INPUT_TARGET-BRANCH'];
    }
    console.log('currentBranch(3):', currentBranch);
    // do it in the current checked out github branch (DETACHED HEAD)
    // important for further usage of the package.json version
    await Promise.all(packageDirs.map(pDir => runInSubWorkspace('npm', pDir, ['version', '--allow-same-version=true', '--git-tag-version=false', current])) );
    //TODO: remove original: await runInWorkspace('npm', ['version', '--allow-same-version=true', '--git-tag-version=false', current]);
    console.log('current(1):', current, '/', 'version:', version);
    let newVersion = '';
    packageDirs.forEach(pDir => { newVersion = execSync(`npm version --git-tag-version=false ${version}`, {cwd: path.join(workspace, pDir)}).toString().trim().replace(/^v/, '') });
    //TODO: remove original: newVersion = execSync(`npm version --git-tag-version=false ${version}`).toString().trim().replace(/^v/, '');
    console.log(`newVersion(1) = ${newVersion}`);
    newVersion = `${tagPrefix}${newVersion}`;
    try {
      await runInWorkspace('git', ['commit', '-a', '-m', commitMessage.replace(/{{version}}/g, newVersion)]);
    } catch (err) {
      console.warn(`*\n**\n*** GIT COMMIT ERROR: ${err.name} ${err.message}\n**\n*`);
    }

    // now go to the actual branch to perform the same versioning
    if (isPullRequest) {
      // First fetch to get updated local version of branch
      await runInWorkspace('git', ['fetch']);
    }

    //TODO: REMOVE try-catch + -B
    try {
      await runInWorkspace('git', ['checkout', currentBranch]);
    } catch (err) {
      await runInWorkspace('git', ['checkout', '-B', currentBranch]);
    }

    await Promise.all(packageDirs.map(pDir => runInSubWorkspace('npm', pDir, ['version', '--allow-same-version=true', '--git-tag-version=false', current])) );
    //TODO: remove original: await runInWorkspace('npm', ['version', '--allow-same-version=true', '--git-tag-version=false', current]);
    console.log('current(2):', current, '/', 'version:', version);
    packageDirs.forEach(pDir => { newVersion = execSync(`npm version --git-tag-version=false ${version}`, {cwd: path.join(workspace, pDir)}).toString().trim().replace(/^v/, '') });
    //TODO: remove original: newVersion = execSync(`npm version --git-tag-version=false ${version}`).toString().trim().replace(/^v/, '');
    console.log(`newVersion(2) = ${newVersion}`);
    if (isLernaRepo) {
      pkg.version = newVersion;
      writeLernaRepo(pkg);
      pkg = getLernaRepo();
      console.log(`Wrote version = ${pkg.version} to 'lerna.json'. Verified version = ${pkg.version}`);
    }
    newVersion = `${tagPrefix}${newVersion}`;
    console.log(`::set-output name=newTag::${newVersion}`);
    try {
      // to support "actions/checkout@v1"
      await runInWorkspace('git', ['commit', '-a', '-m', commitMessage.replace(/{{version}}/g, newVersion)]);
    } catch (e) {
      console.warn(
        'git commit failed because you are using "actions/checkout@v2"; ' +
          'but that does not matter because you do not need that git commit, thats only for "actions/checkout@v1"',
      );
    }

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    if (process.env['INPUT_SKIP-TAG'] !== 'true') {
      await runInWorkspace('git', ['tag', newVersion]);
      await runInWorkspace('git', ['push', remoteRepo, '--follow-tags']);
      await runInWorkspace('git', ['push', remoteRepo, '--tags']);
    } else {
      await runInWorkspace('git', ['push', remoteRepo]);
    }
  } catch (e) {
    logError(e);
    exitFailure('Failed to bump version');
    return;
  }
  exitSuccess('Version bumped!');
})();

function getLernaRepo(fileName = 'lerna.json') {
  const pathToPackage = path.join(workspace, fileName);
  if (!existsSync(pathToPackage))
    return null;
  return require(pathToPackage);
}
function writeLernaRepo(pkg, fileName = 'lerna.json') {
  const pathToPackage = path.join(workspace, fileName);
  try {
    writeFileSync(pathToPackage, JSON.stringify(pkg));
  } catch (err) {
    throw new Error(`${fileName} could not be updated in your project's root.`);
  }
}
function getPackageJson(subPath = '', fileName = 'package.json') {
  const pathToPackage = path.join(workspace, subPath, fileName);
  if (!existsSync(pathToPackage)) throw new Error(`${fileName} could not be found in your project's root` + subPath!==''?`(package '${subPath}').`:'.');
  return require(pathToPackage);
}

function exitSuccess(message) {
  console.info(`✔  success   ${message}`);
  process.exit(0);
}

function exitFailure(message) {
  logError(message);
  process.exit(1);
}

function logError(error) {
  console.error(`✖  fatal     ${error.stack || error}`);
}

function runInWorkspace(command, args) {
  return runInSubWorkspace(command, '', args)
}

function runInSubWorkspace(command, subDir, args) {
  return new Promise((resolve, reject) => {
    console.log(`runInSubWorkspace(${command}, ${JSON.stringify(args)}, {cwd: ${JSON.stringify(path.join(workspace, subDir))}})`);
    const child = spawn(command, args, { cwd: path.join(workspace, subDir) });
    let isDone = false;
    const errorMessages = [];
    child.on('error', (error) => {
      if (!isDone) {
        isDone = true;
        reject(error);
      }
    });
    child.stderr.on('data', (chunk) => errorMessages.push(chunk));
    child.on('exit', (code) => {
      if (!isDone) {
        if (code === 0) {
          resolve();
        } else {
          reject(`${errorMessages.join('')}${EOL}${command} exited with code ${code}`);
        }
      }
    });
  });
  //return execa(command, args, { cwd: workspace });
}

// A very rudimentary glob. Only meant to work for 'a/b/*' style specifiers
function dirGlob(glob) {
  console.log(`ENTER: dirGlob(${glob})...`);
  glob = glob ? glob : null;
  if (glob === null || glob === '.') return glob;
  const index = glob.indexOf('/*');
  if (index === -1) return glob;
  const prefix = glob.substr(0, index);
  const workDir = path.join(workspace, prefix);
  const dirEntries = readdirSync(workDir, { withFileTypes: true });
  const result = dirEntries.filter(dirEnt => dirEnt.isDirectory()).map(dirEnt => path.join(prefix, dirEnt.name));
  console.log(`EXIT: dirGlob(${glob}) = ${JSON.stringify(result)}`);
  return result;
};
