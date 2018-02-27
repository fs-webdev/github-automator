const _ = require('lodash');
const fetch = require('node-fetch');

const {GITHUB_LOGIN, GITHUB_PASSWORD, GITHUB_URL: GITHUB_BASE_URL, TARGET_ENV} = process.env;
const base64BasicCreds = Buffer.from(`${GITHUB_LOGIN}:${GITHUB_PASSWORD}`).toString('base64');
const githubFetchHeaders = {Authorization: `Basic ${base64BasicCreds}`};

module.exports = {
  buildCommitUrl,
  githubFetchHeaders,
  parseBlob,
  fetchJson,
  isInvalidPayload,
  GITHUB_BASE_URL,
  TARGET_ENV
};

function buildCommitUrl(owner, repoName, commit) {
  return `${GITHUB_BASE_URL}/repos/${owner}/${repoName}/git/commits/${commit}`;
}

function parseBlob(blobData) {
  const jsonFile = _.attempt(JSON.parse, Buffer.from(blobData.content, 'base64'));
  if (_.isError(jsonFile)) {
    throw new Error(
      'There was an error parsing the package or bower json file at this commit. Please verify it is valid json.'
    );
  }
  return jsonFile;
}

async function fetchJson(url) {
  const response = await fetch(url, {headers: githubFetchHeaders});
  return await response.json();
}

function isInvalidPayload(payload, owner, repo) {
  if (_.isError(payload) || _.isUndefined(payload)) {
    console.log('Invalid Payload: There was an issue with JSON.parse of the payload.');
    return true;
  }
  if (_.get(payload, 'ref', '').toLowerCase() !== 'refs/heads/master') {
    console.log('Invalid Payload: The payload ref was not pointing to refs/heads/master.');
    return true;
  }
  if (
    !_.includes(_.get(payload, 'head_commit.modified', ''), 'package.json') &&
    !_.includes(_.get(payload, 'head_commit.modified', ''), 'bower.json')
  ) {
    console.log('Invalid Payload: Neither of the package.json or bower.json files were edited this commit.');
    return true;
  }
  if (!owner || !repo) {
    console.log('Invalid Payload: The owner or repo is not present in the payload.');
    return true;
  }
  return false;
}
