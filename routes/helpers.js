const _ = require('lodash');

const {GITHUB_LOGIN, GITHUB_PASSWORD, GITHUB_URL: GITHUB_BASE_URL, TARGET_ENV} = process.env;
const base64BasicCreds = Buffer.from(`${GITHUB_LOGIN}:${GITHUB_PASSWORD}`).toString('base64');
const githubFetchHeaders = {Authorization: `Basic ${base64BasicCreds}`};

module.exports = {
  githubFetchHeaders,
  isInvalidPayload,
  GITHUB_BASE_URL,
  TARGET_ENV
};

function isInvalidPayload(payload, owner, repoName) {
  if (_.isError(payload) || _.isUndefined(payload)) {
    console.log('Invalid Payload: There was an issue with JSON.parse of the payload.');
    return true;
  }
  if (_.get(payload, 'ref', '').toLowerCase() !== 'refs/heads/master') {
    console.log('Invalid Payload: The payload ref was not pointing to refs/heads/master.');
    return true;
  }
  //this is useful to short circuit the github webhook. If neither of these files were edited "this"
  //commit, then no need to waste time trying to make a new release. 
  //It would just fail with a "tag_name already exists" error
  const modifiedFiles = _.get(payload, 'head_commit.modified', []);
  if (_.intersection(modifiedFiles, ['package.json','bower.json']).length === 0) {
    console.log('Invalid Payload: Neither of the package.json or bower.json files were edited this commit.');
    return true;
  }
  if (!owner || !repoName) {
    console.log('Invalid Payload: The owner or repo is not present in the payload.');
    return true;
  }
  return false;
}
