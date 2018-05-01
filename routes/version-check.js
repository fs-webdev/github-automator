const _ = require('lodash');
const fetch = require('node-fetch');
const semver = require('semver');
const debug = require('debug')('version-check');

const {isInvalidPayload, GITHUB_BASE_URL, githubFetchHeaders} = require('./helpers');

module.exports = app => {
  app.post('/version-check', githubWebhookCheckRelease);
  app.post('/release', release);
};

async function release(req, res) {
  const {owner, repoName, commit, version} = req.body;
  try {
    console.log('req.body: ', req.body);
    const versionInCode = await getVersion(owner, repoName, commit);
    if (versionInCode !== version) {
      throw new Error(
        `Version provided (${version}) does not equal version from package or bower json file. (${versionInCode})`
      );
    }
    await createRelease(req.body);
    await notifyComponentCatalog(req.body);
    res.sendStatus(204);
  } catch (err) {
    console.log(`Attempt to release ${repoName} to ${version} failed with the following error: ${err.message}`);
    res.append('Warning', err.message);
    res.status(400).send(err.message);
  }
}

async function githubWebhookCheckRelease(req, res) {
  debug('req.body:', req.body);

  let payload;
  if (req.is('json')) {
    payload = req.body;
  } else {
    //having to parse req.body.payload is an artifact of github webhooks using Content-type application/x-www-form-urlencoded
    //when this was forked, that behavior was kept, and there are now many repos with a webhook of x-www-form-urlencoded
    payload = _.attempt(JSON.parse, req.body.payload);
  }
  const owner = _.get(payload, 'repository.owner.name');
  const repoName = _.get(payload, 'repository.name');
  const commit = _.get(payload, 'head_commit.id');
  console.log(
    `Received GitHub event: type=${req.get(
      'X-GitHub-Event'
    )} repo=${repoName} owner=${owner} commit=${commit} id=${req.get('X-GitHub-Delivery')} content-type=${req.is()}`
  );

  if (isInvalidPayload(payload, owner, repoName)) {
    return;
  }

  try {
    const newVersion = await getVersion(owner, repoName, payload.after);
    await createRelease({owner, repoName, version: newVersion, commit: payload.after});
    await notifyComponentCatalog({repoName, owner});
    res.sendStatus(200);
  } catch (err) {
    console.error('error:', err);
    res.status(400).send(`Error creating release: ${err}`);
  }
}

async function createRelease({owner, repoName, version, commit, description}) {
  const releaseUrl = `${GITHUB_BASE_URL}/repos/${owner}/${repoName}/releases`;
  const postData = {
    tag_name: version,
    target_commitish: commit,
    name: version,
    body: description || (await buildReleaseDescription(owner, repoName)),
    prerelease: !_.isEmpty(semver.prerelease(version))
  };

  console.log(`creating release to ${releaseUrl} with payload:`);
  console.log(JSON.stringify(postData, null, 2));

  const response = await fetch(releaseUrl, {
    method: 'POST',
    headers: githubFetchHeaders,
    body: JSON.stringify(postData)
  });
  const body = await response.json();
  if (!_.isEmpty(body.errors)) {
    throw new Error(`There was an issue creating release on github. ${body.message}. ${JSON.stringify(body.errors)}`);
  } else if (body.message === 'Not Found') {
    throw new Error(
      `Github returned "Not Found". This most likely means that fs-write is not a collaborator for ${repoName}`
    );
  } else {
    console.log(`${repoName} ${version} release successful on github`);
  }
}

function notifyComponentCatalog(bodyData) {
  const catalogUrl = 'https://beta.familysearch.org/frontier/catalog/updateComponent';
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

async function getVersion(owner, repoName, commit) {
  const packageUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/package.json?ref=${commit}`;
  const bowerUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/bower.json?ref=${commit}`;
  const headers = _.assign(githubFetchHeaders, {Accept: 'application/vnd.github.3.raw'});

  const packageReponse = await fetch(packageUrl, {headers});
  const bowerReponse = await fetch(bowerUrl, {headers});
  const packageJson = await packageReponse.json();
  const bowerJson = await bowerReponse.json();

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

async function buildReleaseDescription(owner, repoName) {
  const commits = await getCommitSinceLastTag(owner, repoName);
  return _.join(_.map(commits, commit => `- ${commit.commit.message}`), '\n');
}

async function getCommitSinceLastTag(owner, repoName) {
  const latestReleaseUrl = `https://api.github.com/repos/${owner}/${repoName}/releases/latest`;
  const latestRelease = await (await fetch(latestReleaseUrl, {headers: githubFetchHeaders})).json();
  const latestReleaseDate = latestRelease.created_at || latestRelease.published_at;

  const commitsUrl = `https://api.github.com/repos/${owner}/${repoName}/commits?per_page=100&since=${latestReleaseDate}`;
  return await (await fetch(commitsUrl, {headers: githubFetchHeaders})).json();
}
