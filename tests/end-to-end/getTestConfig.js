const yaml = require('js-yaml');
const { readFileSync } = require('fs');
const { resolve } = require('path');

module.exports = getTestConfig;

function getTestConfig(versionIncrement = 0) {
  const path = resolve(__dirname, './config.yaml');
  const buffer = readFileSync(path);
  const contents = buffer.toString();
  const config = yaml.load(contents);
  for (const setup of config.setups) {
    for (const test of setup.tests) {
      let nextVersionIncrement = 0;
      test.startingVersion = `${1 + versionIncrement}.0.0`;
      const version = test.expected.version;
      const parts = version.split('.');
      parts[0] = parseInt(parts[0]) + versionIncrement;
      if (parts[0] > nextVersionIncrement) {
        nextVersionIncrement = parts[0];
      }
      const newVersion = parts.join('.');
      test.expected.version = newVersion;
      if (test.expected.tag) {
        test.expected.tag = test.expected.tag.replace(version, newVersion);
      }
      versionIncrement = nextVersionIncrement;
    }
  }
  return config;
}