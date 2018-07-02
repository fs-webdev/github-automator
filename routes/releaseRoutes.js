const _ = require('lodash');
const fetch = require('node-fetch');
const semver = require('semver');
const debug = require('debug')('releaseRoutes');

const {notifySlack} = require('../slackClient');
const {
  getVersion,
  getLatestRelease,
  buildReleaseDescription,
  getPayloadIssue,
  GITHUB_BASE_URL,
  githubFetchHeaders,
  notifyComponentCatalog
} = require('./helpers');

module.exports = app => {
  app.post('/version-check', githubWebhookCheckRelease);
  app.post('/release', release);
};

async function release(req, res) {
  const {repoName, version} = req.body;
  try {
    req.body.newVersion = req.body.version;
    req.body.description = req.body.description || (await buildReleaseDescription(req.body));
    req.body.latestRelease = await getLatestRelease(req.body);
    debug('req.body: ', req.body);
    const versionInCode = await getVersion(req.body);
    if (versionInCode !== version) {
      throw new Error(
        `Version provided (${version}) does not equal version from package or bower json file. (${versionInCode})`
      );
    }
    await createRelease(req.body);
    await notifyComponentCatalog(req.body);
    await notifySlack(req.body);
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

  let repoData = {
    payload,
    owner: _.get(payload, 'repository.owner.name'),
    repoName: _.get(payload, 'repository.name')
  };

  try {
    repoData = _.assign(repoData, {
      commit: _.get(payload, 'after'),
      author: _.get(payload, 'head_commit.author.name'),
      latestRelease: await getLatestRelease(repoData),
      description: await buildReleaseDescription(repoData)
    });

    debug('built repoData in githubWebhookCheckRelease: ', repoData);
    const event = req.get('X-GitHub-Event');
    const githubId = req.get('X-GitHub-Delivery');
    debug(
      `Received GitHub event: type=${event} repo=${repoData.repoName} owner=${
        repoData.owner
      } id=${githubId} content-type=${req.is()}`
    );

    const payloadIssue = getPayloadIssue(repoData);
    if (payloadIssue) {
      console.log(payloadIssue);
      res.append('IgnoredPayload', payloadIssue);
      res.sendStatus(202);
      return;
    }

    repoData.newVersion = await getVersion(repoData);
    await createRelease(repoData);
    await notifyComponentCatalog(repoData);
    await notifySlack(repoData);
    res.sendStatus(200);
  } catch (err) {
    console.error('error:', err);
    res.status(400).send(`Error creating release: ${err}`);
  }
}

async function createRelease({owner, repoName, newVersion, commit, description}) {
  const releaseUrl = `${GITHUB_BASE_URL}/repos/${owner}/${repoName}/releases`;
  const postData = {
    tag_name: newVersion,
    target_commitish: commit,
    name: newVersion,
    body: description,
    prerelease: !_.isEmpty(semver.prerelease(newVersion))
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
    const {code, field} = _.get(body, 'errors.0', {});
    if (code === 'already_exists' && field === 'tag_name') {
      throw new Error('Release/TagName already exists on Github, so not making a new release.');
    } else {
      throw new Error(`There was an issue creating release on Github. ${body.message}. ${JSON.stringify(body.errors)}`);
    }
  } else if (body.message === 'Not Found') {
    throw new Error(
      `Github returned "Not Found". This most likely means that fs-write is not a collaborator for ${repoName}`
    );
  } else {
    console.log(`${repoName} ${newVersion} release successful on github`);
  }
}
