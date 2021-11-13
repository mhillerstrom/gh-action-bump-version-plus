const pollForGenerator = (repo, user, token) =>
(getResult, validateResult) => {
  return new Promise((resolve, reject) => {
    pollAndRetry(repo, user, token);

    async function pollAndRetry(repo, user, token) {
      try {
        const result = await getResult(repo, user, token);
        if (validateResult(result)) {
          resolve(result);
        } else {
          setTimeout(pollAndRetry, 1000, repo, user, token);
        }
      } catch (error) {
        reject(error);
      }
    }
  });
}
module.exports = pollForGenerator;