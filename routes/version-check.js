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

const base64BasicCreds = Buffer.from(`${process.env.GITHUB_LOGIN}:${process.env.GITHUB_PASSWORD}`).toString('base64');
const headers = {Authorization: `Basic ${base64BasicCreds}`};
const GITHUB_BASE_URL = process.env.GITHUB_URL;

module.exports = app => {
  app.post('/version-check', async function(req, res) {
    res.send(202);

    const payload = _.attempt(JSON.parse, req.body.payload);
    const owner = _.get(payload, 'repository.owner.name');
    const repoName = _.get(payload, 'repository.name');

    if (isInvalidPayload(payload, owner, repoName)) {
      return;
    }
    const commit_url = `${GITHUB_BASE_URL}/repos/${owner}/${repoName}/git/commits/`;
    let oldVersion;
    let newVersion;

    try {
      oldVersion = await getVersion(commit_url + payload.before);
      newVersion = await getVersion(commit_url + payload.after);
      if (oldVersion !== newVersion) {
        notifyComponentCatalog(repoName);
        createRelease();
      }
    } catch (err) {
      console.error('error:', err);
    }

    function createRelease() {
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
  });
};

function notifyComponentCatalog(repoName) {
  const prodUrl = 'https://www.familysearch.org/frontier/elements/updateComponent';
  const betaUrl = 'https://beta.familysearch.org/frontier/elements/updateComponent';
  const options = {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({repoName})
  };

  fetch(prodUrl, options).catch(err => {
    console.log('err: ', err);
  });
  fetch(betaUrl, options).catch(err => {
    console.log('err: ', err);
  });
}

function isInvalidPayload(payload, owner, repo) {
  if (_.isError(payload) || _.isUndefined(payload)) {
    return true;
  }
  if (_.get(payload, 'ref', '').toLowerCase() !== 'refs/heads/master') {
    return true;
  }
  if (!_.includes(_.get(payload, 'head_commit.modified', ''), 'package.json')) {
    return true;
  }
  if (!owner || !repo) {
    return true;
  }
  return false;
}

function getVersion(url) {
  return get_commit(url)
    .then(get_tree)
    .then(get_package_json_blob)
    .then(blobData => {
      return JSON.parse(Buffer.from(blobData.content, 'base64')).version;
    });
}

function get_commit(url) {
  return fetch(url, {headers}).then(response => response.json());
}

function get_tree(commit) {
  return fetch(commit.tree.url, {headers}).then(response => response.json());
}

function get_package_json_blob(tree) {
  var packageJsonUrl = _.get(_.find(tree.tree, {path: 'package.json'}), 'url');
  if (!packageJsonUrl) {
    return Promise.reject('File not found');
  }
  return fetch(packageJsonUrl, {headers}).then(response => response.json());
}
