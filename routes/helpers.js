const _ = require('lodash');
const fetch = require('node-fetch');

const {GITHUB_LOGIN, GITHUB_PASSWORD, GITHUB_URL: GITHUB_BASE_URL, TARGET_ENV} = process.env;
const base64BasicCreds = Buffer.from(`${GITHUB_LOGIN}:${GITHUB_PASSWORD}`).toString('base64');
const githubFetchHeaders = {Authorization: `Basic ${base64BasicCreds}`};

module.exports = {
  githubFetchHeaders,
  getPayloadIssue,
  getPackageAndBower,
  notifyComponentCatalog,
  buildReleaseDescription,
  getLatestRelease,
  getVersion,
  GITHUB_BASE_URL,
  TARGET_ENV
};


function getPayloadIssue({payload, owner, repoName}) {
  if (_.isError(payload) || _.isUndefined(payload)) {
    return 'Invalid Payload: There was an issue with JSON.parse of the payload.';
  }
  if (_.get(payload, 'ref', '').toLowerCase() !== 'refs/heads/master') {
    return 'Ignored Payload: The payload ref was not pointing to refs/heads/master.';
  }
  if (
    !_.includes(_.get(payload, 'head_commit.modified', ''), 'package.json') &&
    !_.includes(_.get(payload, 'head_commit.modified', ''), 'bower.json')
  ) {
    return 'Ignored Payload: Neither of the package.json or bower.json files were edited this commit.';
  }
  if (!owner || !repoName) {
    return 'Invalid Payload: The owner or repo is not present in the payload.';
  }
  return '';
}

async function notifyComponentCatalog(bodyData) {
  const catalogUrl = 'https://beta.familysearch.org/frontier/catalog/updateComponent';
  const options = {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(bodyData)
  };

  try {
    await fetch(catalogUrl, options);
    console.log(`Notified component-catalog of the potential update for ${bodyData.repoName}`);
  } catch (err) {
    console.log(`Error notifying component-catalog to update for ${bodyData.repoName}: `, err);
  }
}

async function buildReleaseDescription({owner, repoName}) {
  const commits = await getCommitSinceLastTag(owner, repoName);
  //dropRight cause this list of commits includes the commit of the last release, but we dont need that
  //message included again in the newest release
  return _.join(_.map(_.dropRight(commits), commit => `- ${commit.commit.message}`), '\n');
}

async function getCommitSinceLastTag({owner, repoName}) {
  const latestRelease = await getLatestRelease({owner, repoName});
  const latestReleaseDate = latestRelease.created_at || latestRelease.published_at;

  const commitsUrl = `https://api.github.com/repos/${owner}/${repoName}/commits?per_page=100&since=${latestReleaseDate}`;
  return await (await fetch(commitsUrl, {headers: githubFetchHeaders})).json();
}

async function getLatestRelease({owner, repoName}) {
  const latestReleaseUrl = `https://api.github.com/repos/${owner}/${repoName}/releases/latest`;
  return await (await fetch(latestReleaseUrl, {headers: githubFetchHeaders})).json();
}

async function getPackageAndBower({owner, repoName, commit}) {
  const packageUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/package.json?ref=${commit}`;
  const bowerUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/bower.json?ref=${commit}`;
  const headers = _.assign(githubFetchHeaders, {Accept: 'application/vnd.github.3.raw'});

  return {
    packageJson: await (await fetch(packageUrl, {headers})).json(),
    bowerJson: await (await fetch(bowerUrl, {headers})).json()
  }
}

async function getVersion({owner, repoName, commit}) {
  const {packageJson, bowerJson} = await getPackageAndBower({owner, repoName, commit});

  if (packageJson.version && bowerJson.version) {
    if (packageJson.version !== bowerJson.version) {
      throw new Error(`Package version and bower version do not match at ${commit}. Not making a release tag`);
    }
  }

  const version = packageJson.version || bowerJson.version;
  if (!version) {
    throw new Error('A version was not specified in either of the package.json or the bower.json.');
  }
  return version;
}
