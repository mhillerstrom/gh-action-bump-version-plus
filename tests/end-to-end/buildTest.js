const setupTestRepo = require('./setupTestRepo');
const yaml = require('js-yaml');
const { writeFile, readFile, mkdir, rm } = require('fs/promises');
const { join } = require('path');
const git = require('./git');
const copyDirectory = require('./copyDirectory');
const getTestConfig = require('./getTestConfig');
const pollForGenerator = require('./pollForGenerator');
const getWorkflowResults = require('./getWorkflowResults');


module.exports = function buildTest(type, repo, user, token, tmp, projectRoot) {

  const tmpDir = join(tmp, type.toLowerCase());
  const testConfig = getTestConfig();
  const testRepoPath = join(tmpDir, 'main');

  const workflowResults = (async () => {
    await setupTestRepo(testConfig.actionFiles, testRepoPath, type, repo, user, token, projectRoot);
    await Promise.all(
      testConfig.setups.map(async (setup) => {
        const setupYaml = yaml.dump(setup.yaml);
        const setupDirectory = join(tmpDir, setup.name);
        await rm(setupDirectory, { recursive: true, force: true });
        await mkdir(setupDirectory, { recursive: true });
        await Promise.all(
          setup.tests.map(async (test, index) => {
            const testDirectory = join(setupDirectory, `${index}`);
            await copyDirectory(testRepoPath, testDirectory);

            const pushYamlPath = join('.github', 'workflows', 'push.yml');
            await mkdir(join(testDirectory, '.github', 'workflows'), { recursive: true });
            await writeFile(join(testDirectory, pushYamlPath), setupYaml);
            await git({ cwd: testDirectory }, 'add', pushYamlPath);

            await setPackageJsonVersion(type, test.startingVersion, testDirectory);

            await git({ cwd: testDirectory }, 'checkout', '-b', `tests/${setup.name}/${index}`);

            await generateReadMe(test, setupYaml, testDirectory);

            await git({ cwd: testDirectory }, 'commit', '--message', test.message);
            await git({ cwd: testDirectory }, 'push', '-u', 'origin', 'HEAD');
          }),
        );
      }),
    );
    const pollFor = pollForGenerator(repo, user, token);
    return await getWorkflowResults(pollFor, type, testConfig);
  })();

  beforeAll(() => workflowResults);

  testConfig.setups.forEach((setup) => {
    const setupName = `${setup.name}`;
    describe(setupName, () => {
      setup.tests.forEach((commit, index) => {
        const testDirectory = join(tmpDir, setup.name, `${index}`);
        test(commit.message, async () => {
          const results = await workflowResults;
          const conclusion = results[type][setup.name][index];
          expect(conclusion).toBe('success');

          await assertExpectation(commit.expected, testDirectory);

          expect(1).toBe(1);
        });
      });
    });
  });

};


async function generateReadMe(test, setupYaml, directory) {
  const readmePath = 'README.md';
  const readMeContents = [
    '# Test Details',
    '## .github/workflows/push.yml',
    '```YAML',
    setupYaml,
    '```',
    '## Message',
    test.message,
    '## Starting Version',
    test.startingVersion,
    '## Expectation',
    generateExpectationText(test.expected),
  ].join('\n');
  await writeFile(join(directory, readmePath), readMeContents);
  await git({ cwd: directory }, 'add', readmePath);
}


function generateExpectationText({ version: expectedVersion, tag: expectedTag, branch: expectedBranch }) {
  const results = [`- **Version:** ${expectedVersion}`];
  if (expectedTag) {
    results.push(`- **Tag:** ${expectedTag}`);
  }
  if (expectedBranch) {
    results.push(`- **Branch:** ${expectedBranch}`);
  }
  return results.join('\n');
}

async function assertExpectation({ version: expectedVersion, tag: expectedTag, branch: expectedBranch, skipTagCheck }, directory) {
  if (expectedTag === undefined) {
    expectedTag = expectedVersion;
  }
  if (expectedBranch) {
    await git({ cwd: directory }, 'fetch', 'origin', expectedBranch);
    await git({ cwd: directory }, 'checkout', expectedBranch);
  }
  await git({ cwd: directory }, 'pull');
  const [packageVersion, latestTag] = await Promise.all([getPackageJsonVersion(directory), getLatestTag(directory)]);
  expect(packageVersion).toBe(expectedVersion);
  if (!skipTagCheck) {
    expect(latestTag).toBe(expectedTag);
  }
}

async function getPackageJsonVersion(directory) {
  const path = join(directory, 'package.json');
  const contents = await readFile(path);
  const json = JSON.parse(contents);
  return json.version;
}

async function setPackageJsonVersion(type, version, directory) {

  const updateFile = async function (path, file, version) {
    const contents = await readFile(join(path, file));
    const json = JSON.parse(contents);
    json.version = version;
    const newContents = JSON.stringify(json);
    await writeFile(join(path, file), newContents);
    await git({ cwd: path }, 'add', file);
  }

  await updateFile(directory, 'package.json', version);

  if (type.toLowerCase() === 'lerna') {
    await updateFile(directory, 'lerna.json', version);
    await updateFile(join(directory, 'packages', 'projectA'), 'package.json', version);
    await updateFile(join(directory, 'packages', 'projectB'), 'package.json', version);
  }
}

async function getLatestTag(directory) {
  const result = await git({ suppressOutput: true, cwd: directory }, 'describe', '--tags', '--abbrev=0', '--always');
  return result.stdout;
}