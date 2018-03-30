const _ = require('lodash');
const semver = require('semver');
const fetch = require('node-fetch');

const {GITHUB_LOGIN, GITHUB_PASSWORD, GITHUB_URL: GITHUB_BASE_URL, TARGET_ENV} = process.env;
const base64BasicCreds = Buffer.from(`${GITHUB_LOGIN}:${GITHUB_PASSWORD}`).toString('base64');
const githubFetchHeaders = {Authorization: `Basic ${base64BasicCreds}`};

module.exports = {
  githubFetchHeaders,
  isInvalidPayload,
  getNewestReleasedVersion,
  GITHUB_BASE_URL,
  TARGET_ENV
};

function isInvalidPayload(payload, owner, repoName) {
  if (_.isError(payload) || _.isUndefined(payload)) {
    console.log('Invalid Payload: There was an issue with JSON.parse of the payload.');
    return true;
  }
  if (_.get(payload, 'ref', '').toLowerCase() !== 'refs/heads/master') {
    console.log('Ignored Payload: The payload ref was not pointing to refs/heads/master.');
    return true;
  }
  if (
    !_.includes(_.get(payload, 'head_commit.modified', ''), 'package.json') &&
    !_.includes(_.get(payload, 'head_commit.modified', ''), 'bower.json')
  ) {
    console.log('Ignored Payload: Neither of the package.json or bower.json files were edited this commit.');
    return true;
  }
  if (!owner || !repoName) {
    console.log('Invalid Payload: The owner or repo is not present in the payload.');
    return true;
  }
  return false;
}

/**
 * Retrieves tags for any repo and returns the newest tag
 * @param {string} repoName
 * @returns {Promise}
 */
async function getNewestReleasedVersion(owner, repoName) {
  // const bowerReponse = await fetch(bowerUrl, {headers});
  // const packageJson = await packageReponse.json();
  // const bowerJson = await bowerReponse.json();

  const tagUrl = `https://api.github.com/repos/${owner}/${repoName}/tags`;
  const tagResponse = await fetch(tagUrl, {headers: githubFetchHeaders})
  const tags = await tagResponse.json();
  console.log('tags: ', tags);
    // .then(response => {
    //   const tags = _.filter(response.data, tag => semver.valid(tag.name));

    //   tags.sort((a, b) => {
    //     return semver.lt(a.name, b.name) ? 1 : semver.gt(a.name, b.name) ? -1 : 0;
    //   });
    //   if (!tags[0]) {
    //     throw new Error(`\nIt appears that ${repoName} does not have any releases on github with a valid semver tag`);
    //   }
    //   return tags[0].name;
    // })
    // .catch(err => {
    //   console.log(`Unable to get tags from repo ${repoName}. Skipping updating build`, err);
    //   throw err;
    // });
}
