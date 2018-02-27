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
const semver = require('semver');

const {
  buildCommitUrl,
  isInvalidPayload,
  GITHUB_BASE_URL,
  githubFetchHeaders,
  TARGET_ENV,
  parseBlob,
  fetchJson
} = require('./helpers');

module.exports = app => {
  app.post('/version-check', fullVersionCheck);
  app.post('/release', release);
};

async function release(req, res) {
  try {
    const {owner, repoName, commit, version} = req.body;
    console.log('req.body: ', req.body);
    const versionInCode = await getVersion(buildCommitUrl(owner, repoName, commit));
    if (versionInCode !== version) {
      throw new Error(
        `${repoName}: version provided (${version}) does not equal version from package or bower json file. (${versionInCode})`
      );
    }
    await createRelease(req.body);
    await notifyComponentCatalog(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.log('err: ', err);
    res.status(400).send(err.message);
  }
}

async function fullVersionCheck(req, res) {
  res.sendStatus(202);

  //having to parse req.body.payload is an artifact of github webhooks using Content-type application/x-www-form-urlencoded
  //when this was forked, that behavior was kept, and there are now many repos with a webhook of x-www-form-urlencoded
  const payload = _.attempt(JSON.parse, req.body.payload);
  const owner = _.get(payload, 'repository.owner.name');
  const repoName = _.get(payload, 'repository.name');
  const description = _.get(payload, 'head_commit.message', 'github-automator release');

  if (isInvalidPayload(payload, owner, repoName)) {
    return;
  }

  try {
    const oldVersion = await getVersion(buildCommitUrl(owner, repoName, payload.before));
    const newVersion = await getVersion(buildCommitUrl(owner, repoName, payload.after));
    if (oldVersion !== newVersion) {
      if (TARGET_ENV === 'prod') {
        await createRelease({owner, repoName, version: newVersion, commit: payload.after, description});
        await notifyComponentCatalog({repoName, owner});
      }
    }
  } catch (err) {
    console.error('error:', err);
  }
}

async function createRelease({owner, repoName, version, commit, description}) {
  const releaseUrl = `${GITHUB_BASE_URL}/repos/${owner}/${repoName}/releases`;
  const postData = {
    tag_name: version,
    target_commitish: commit,
    name: version,
    body: description,
    prerelease: !_.isEmpty(semver.prerelease(version))
  };

  console.log(`creating release to ${releaseUrl} with payload:`);
  console.log(JSON.stringify(postData, null, 2));

  const response = await fetch(releaseUrl, {method: 'POST', headers: githubFetchHeaders, body: JSON.stringify(postData)});
  const body = await response.json();
  if (!_.isEmpty(body.errors)) {
    throw new Error(`There was an issue creating release on github. ${body.message}. ${JSON.stringify(body.errors)}`);
  } else {
    console.log(`${repoName} ${version} release successful on github`);
  }
}

function notifyComponentCatalog(bodyData) {
  const catalogUrl = 'https://beta.familysearch.org/frontier/elements/updateComponent';
  const options = {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(bodyData)
  };

  fetch(catalogUrl, options)
    .then(() => {
      console.log(`Notified component-catalog of the potential update for ${bodyData.repoName}`);
    })
    .catch(err => {
      console.log(`Error notifying component-catalog to update for ${bodyData.repoName}: `, err);
    });
}

async function getVersion(commitUrl) {
  console.log('commitUrl: ', commitUrl);
  const commitData = await fetchJson(commitUrl);
  const treeData = await fetchJson(commitData.tree.url);
  const {packageJson, bowerJson} = await getPackageAndBower(treeData);
  if (packageJson && bowerJson) {
    if (_.get(packageJson, 'version', 'noPackageVersion') !== _.get(bowerJson, 'version', 'noBowerVersion')) {
      throw new Error(`Package version and bower version do not match at ${commitUrl}. Not making a release tag`);
    }
  }

  const version = _.get(packageJson, 'version') || _.get(bowerJson, 'version');
  if (!version) {
    throw new Error('A version was not specified in either the package.json or the bower.json.');
  }
  return version;
}

async function getPackageAndBower(treeData) {
  const packageJsonUrl = _.get(_.find(treeData.tree, {path: 'package.json'}), 'url');
  const bowerJsonUrl = _.get(_.find(treeData.tree, {path: 'bower.json'}), 'url');
  return {
    packageJson: packageJsonUrl ? await fetchJson(packageJsonUrl).then(parseBlob) : undefined,
    bowerJson: bowerJsonUrl ? await fetchJson(bowerJsonUrl).then(parseBlob) : undefined
  };
}
