const _ = require('lodash');
const fetch = require('node-fetch');
const semver = require('semver');
const debug = require('debug')('version-check');

const {notifySlack} = require('./slackClient');
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
  const {owner, repoName, commit, version, author} = req.body;
  const latestRelease = await getLatestRelease({owner, repoName});
  try {
    console.log('req.body: ', req.body);
    const versionInCode = await getVersion({owner, repoName, commit});
    if (versionInCode !== version) {
      throw new Error(
        `Version provided (${version}) does not equal version from package or bower json file. (${versionInCode})`
      );
    }
    await createRelease(req.body);
    await notifyComponentCatalog(req.body);
    await notifySlack(_.assign(req.body, {latestRelease, author}));
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
  const author = _.get(payload, 'head_commit.author.name', 'Github-Automator');
  const latestRelease = await getLatestRelease({owner, repoName});
  const event = req.get('X-GitHub-Event');
  const githubId = req.get('X-GitHub-Delivery');
  console.log(
    `Received GitHub event: type=${event} repo=${repoName} owner=${owner} commit=${commit} id=${githubId} content-type=${req.is()}`
  );

  const payloadIssue = getPayloadIssue({payload, owner, repoName});
  if (payloadIssue) {
    console.log(payloadIssue);
    res.append('IgnoredPayload', payloadIssue);
    res.sendStatus(202);
    return;
  }

  try {
    const newVersion = await getVersion({owner, repoName, commit: payload.after});
    await createRelease({owner, repoName, newVersion, commit: payload.after});
    await notifyComponentCatalog({repoName, owner});
    await notifySlack({repoName, owner, newVersion, author, latestRelease});
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
    body: description || (await buildReleaseDescription({owner, repoName})),
    prerelease: !_.isEmpty(semver.prerelease(newVersion))
  };

  console.log(`creating release to ${releaseUrl} with payload:`);
  console.log(JSON.stringify(postData, null, 2));

  const response = await fetch(releaseUrl, { method: 'POST', headers: githubFetchHeaders, body: JSON.stringify(postData) });
  const body = await response.json();
  if (!_.isEmpty(body.errors)) {
    throw new Error(`There was an issue creating release on github. ${body.message}. ${JSON.stringify(body.errors)}`);
  } else if (body.message === 'Not Found') {
    throw new Error(
      `Github returned "Not Found". This most likely means that fs-write is not a collaborator for ${repoName}`
    );
  } else {
    console.log(`${repoName} ${newVersion} release successful on github`);
  }
}

