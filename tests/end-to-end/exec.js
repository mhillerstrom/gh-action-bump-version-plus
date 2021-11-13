const process = require('process');
const execa = require('execa');

module.exports = async function exec(command, options, ...params) {
  let suppressOutput;
  let cwd;
  
  if (typeof options === 'object') {
    suppressOutput = options.suppressOutput;
    cwd = options.cwd ?? process.cwd();
  } else {
    params.unshift(options);
    suppressOutput = false;
  }
  const subprocess = execa(command, params, { cwd });
  if (!suppressOutput) {
    subprocess.stdout.pipe(process.stdout);
  }
  subprocess.stderr.pipe(process.stderr);
  return await subprocess;
};