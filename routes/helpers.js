const _ = require('lodash');

const {GITHUB_LOGIN, GITHUB_PASSWORD, GITHUB_URL: GITHUB_BASE_URL, TARGET_ENV} = process.env;
const base64BasicCreds = Buffer.from(`${GITHUB_LOGIN}:${GITHUB_PASSWORD}`).toString('base64');
const githubFetchHeaders = {Authorization: `Basic ${base64BasicCreds}`};

module.exports = {
  githubFetchHeaders,
  getPayloadIssue,
  GITHUB_BASE_URL,
  TARGET_ENV
};

function getPayloadIssue(payload, owner, repoName) {
  if (_.isError(payload) || _.isUndefined(payload)) {
    return 'Invalid Payload: There was an issue with JSON.parse of the payload.'
  }
  if (_.get(payload, 'ref', '').toLowerCase() !== 'refs/heads/master') {
    return 'Ignored Payload: The payload ref was not pointing to refs/heads/master.'
  }
  if (
    !_.includes(_.get(payload, 'head_commit.modified', ''), 'package.json') &&
    !_.includes(_.get(payload, 'head_commit.modified', ''), 'bower.json')
  ) {
    return 'Ignored Payload: Neither of the package.json or bower.json files were edited this commit.'
  }
  if (!owner || !repoName) {
    return 'Invalid Payload: The owner or repo is not present in the payload.'
  }
  return '';
}
