/**
 * This file has one endpoint which sits on /version-check via the POST method.
 * It recieves a github commit hook, and then runs through some logic, given the
 * right conditions it will create a release.
 *
 * 1. Make call against the repository in question for last commit before this push
 * 2. From that commit fetch the file_tree at the time that commit was made
 * 3. Grab the package.json blob from the tree, and convert it into json and grab the version
 * 4. Repeat steps 1-3 but with the new commit
 * 5. Compare the version from step 3 and from step 4 if they are different submit a new release
 *
 */

const _ = require('lodash');
const fetch = require('node-fetch');
const {GITHUB_LOGIN, GITHUB_PASSWORD, GITHUB_URL: GITHUB_BASE_URL, TARGET_ENV} = process.env;

const base64BasicCreds = Buffer.from(`${GITHUB_LOGIN}:${GITHUB_PASSWORD}`).toString('base64');
const headers = {Authorization: `Basic ${base64BasicCreds}`};

module.exports = app => {
  app.post('/version-check', async function(req, res) {
    res.sendStatus(202);

    const payload = _.attempt(JSON.parse, req.body.payload);
    console.log('JSON.stringify(payload, null, 2): ', JSON.stringify(payload, null, 2));
    const owner = _.get(payload, 'repository.owner.name');
    const repoName = _.get(payload, 'repository.name');

    if (isInvalidPayload(payload, owner, repoName)) {
      return;
    }
    const commit_url = `${GITHUB_BASE_URL}/repos/${owner}/${repoName}/git/commits/`;

    try {
      const oldVersion = await getVersion(commit_url + payload.before);
      const newVersion = await getVersion(commit_url + payload.after);
      console.log('oldVersion: ', oldVersion);
      console.log('newVersion: ', newVersion);
      if (oldVersion !== newVersion) {
        if (TARGET_ENV === 'prod') {
          notifyComponentCatalog({repoName, owner});
          createRelease(owner, repoName, oldVersion, newVersion, payload);
        }
      }
    } catch (err) {
      console.error('error:', err);
    }
  });
};

function createRelease(owner, repoName, oldVersion, newVersion, payload) {
  const releaseUrl = `${GITHUB_BASE_URL}/repos/${owner}/${repoName}/releases`;
  const postData = {
    tag_name: newVersion,
    target_commitish: payload.after,
    name: newVersion,
    body: payload.head_commit.message
  };

  console.log(`creating release to ${releaseUrl} with payload:`);
  console.log(JSON.stringify(postData, null, 2));

  fetch(releaseUrl, {method: 'POST', headers, body: JSON.stringify(postData)})
    .then(() => {
      console.log('release successful');
      console.log({oldVersion, newVersion});
    })
    .catch(err => {
      console.error('release error: ', err);
    });
}

function notifyComponentCatalog(bodyData) {
  const prodUrl = 'https://www.familysearch.org/frontier/elements/updateComponent';
  const betaUrl = 'https://beta.familysearch.org/frontier/elements/updateComponent';
  const options = {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(bodyData)
  };

  fetch(prodUrl, options)
    .then(() => {
      console.log(`Notified prod component-catalog of the potential update for ${bodyData.repoName}`);
    })
    .catch(err => {
      console.log('Error notifying production component-catalog: ', err);
    });
  fetch(betaUrl, options)
    .then(() => {
      console.log(`Notified beta component-catalog of the potential update for ${bodyData.repoName}`);
    })
    .catch(err => {
      console.log('Error notifying beta component-catalog: ', err);
    });
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

async function getVersion(commitUrl) {
  const commitData = await fetchJson(commitUrl);
  const treeData = await fetchJson(commitData.tree.url);
  const {packageJson, bowerJson} = await getPackageAndBower(treeData);
  if (packageJson && bowerJson) {
    if (_.get(packageJson, 'version', 'noPackageVersion') !== _.get(bowerJson, 'version', 'noBowerVersion')) {
      throw new Error('Package version and bower version do not match. Not making a release tag');
    }

    const version = _.get(packageJson, 'version', _.get(bowerJson, 'version'));
    if (!version) {
      throw new Error('A version was not specified in either the package.json or the bower.json');
    }
    return version;
  }

  return packageJson.version || bowerJson.version;
}

async function getPackageAndBower(treeData) {
  const packageJsonUrl = _.get(_.find(treeData.tree, {path: 'package.json'}), 'url');
  const bowerJsonUrl = _.get(_.find(treeData.tree, {path: 'bower.json'}), 'url');
  return {
    packageJson: packageJsonUrl ? await fetchJson(packageJsonUrl).then(parseBlob) : undefined,
    bowerJson: bowerJsonUrl ? await fetchJson(bowerJsonUrl).then(parseBlob) : undefined
  };
}

function parseBlob(blobData) {
  return JSON.parse(Buffer.from(blobData.content, 'base64'));
}

async function fetchJson(url) {
  const response = await fetch(url, {headers});
  return await response.json();
}
