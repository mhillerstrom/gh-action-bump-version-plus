const dotenv = require('dotenv');
const EventEmitter = require('events');
const { join } = require('path');
const { env } = require('process');
const buildTest = require("./buildTest");

// This is to avoid annoying warning in output
EventEmitter.setMaxListeners(60);

// Load environment variables from file '.env'
dotenv.config();

// Make sure necessary variables are set when running locally
const vars = ['TEST_REPO', 'TEST_USER', 'TEST_TOKEN', 'TEST_LERNA_REPO', 'RUNNER_TEMP'];

const checkVars = (vars) => vars.forEach(element => {
  if (!env[element]) {
    throw new Error(`You must specify values for all environment variables: ${vars.join(',')}\nVariables values:\n\t` + vars.map(v => `${v} = ${env[v]}`).join('\n\t'));
  }
});

if (!env.CI) checkVars(vars);

// Project root
const projectRoot = join(__dirname, '..', '..');

// Set temporary directory
const tmp = (env.RUNNER_TEMP).indexOf('..') > -1 ? join(projectRoot, env.RUNNER_TEMP) : env.RUNNER_TEMP;

const tests = [
  { type: 'Ordinary', repo: env.TEST_REPO },
  { type: 'Lerna', repo: env.TEST_LERNA_REPO }
];

describe('Bump Version Plus tests', () => {
  tests.forEach(test => {
    describe(`${test.type} repository`, () => {
      buildTest(test.type, test.repo, env.TEST_USER, env.TEST_TOKEN, tmp, projectRoot);
    });
  });
});