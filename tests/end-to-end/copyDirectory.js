const { ncp } = require('ncp');

module.exports = async (source, destination) =>
  new Promise((resolve, reject) =>
  ncp(source, destination, (error) => {
    if (error) {
        console.error(error);
        reject(error);
      } else {
        resolve();
      }
    }),
  );
