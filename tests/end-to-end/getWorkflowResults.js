const { getWorkflowRuns } = require('./actionsApi');

async function getWorkflowResults(pollFor, type, testConfig) {
  const results = {};
  results[type] = {};

  for (const setup of testConfig.setups) {
    results[type][setup.name] = setup.tests.map(() => null);
  }
await pollFor(getWorkflowRuns, (runs) =>
    testConfig.setups.every((setup) =>
      setup.tests.every((_, index) =>
        runs.some((run) => {
          results[type][setup.name][index] = run.conclusion;
          return run.head_branch == `tests/${setup.name}/${index}` && run.status === 'completed';
        }),
      ),
    ),
  );
  return results;
}
module.exports = getWorkflowResults;