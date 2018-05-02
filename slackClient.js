const _ = require('lodash');
const semverDiff = require('semver-diff');
const {WebClient} = require('@slack/client');
let {SLACK_TOKEN} = process.env;
if (!SLACK_TOKEN) {
  console.log(`WARNING: SLACK_TOKEN not set in env. Slack notifications will not work`);
}
const slackWeb = new WebClient(SLACK_TOKEN);
const {getPackageAndBower} = require('./routes/helpers');

module.exports = {
  notifySlack
};

async function notifySlack(repoData) {
  const {description, owner, repoName, newVersion, author = 'Github-Automator'} = repoData;
  const messageOptions = {
    text: description,
    attachments: [
      {
        fallback: `${repoName} version ${newVersion} is now available`,
        author_name: author,
        title: `${repoName} version ${newVersion} is now available`,
        title_link: `https://github.com/${owner}/${repoName}/releases/tag/${newVersion}`,
        thumb_url: 'https://assets-cdn.github.com/images/modules/logos_page/Octocat.png',
        color: '#87B940',
        footer: 'Github-Automator'
      }
    ],
    as_user: true
  };

  try {
    const slackOptions = await getRepoSlackOptions(repoData);
    const channels = (await slackWeb.channels.list()).channels;
    let additionalChannels = slackOptions.additionalChannels || [];
    additionalChannels.push(_.assign(slackOptions, {name: 'webdev-updates'}));
    additionalChannels = _.uniqBy(additionalChannels, 'name');

    _.map(additionalChannels, async additionalChannelOptions => {
      const slackChannel = _.find(channels, {name: additionalChannelOptions.name});
      if (shouldNotifyChannel(repoData, additionalChannelOptions)) {
        messageOptions.channel = slackChannel.id;
        await slackWeb.chat.postMessage(messageOptions);
      } else {
        console.log('Not notifying slack of the release.');
      }
    });
  } catch (err) {
    console.log('Error notifying slack channel: ', err);
  }
}

function shouldNotifyChannel({latestRelease, newVersion}, channelOptions) {
  const releaseType = semverDiff(latestRelease.name, newVersion);
  return (
    !channelOptions.disableSlackNotifications &&
    (releaseType === 'major' ||
      (channelOptions.notifyMinorRelease && releaseType === 'minor') ||
      (channelOptions.notifyPatchRelease && releaseType === 'patch'))
  );
}

async function getRepoSlackOptions(repoData) {
  const {packageJson, bowerJson} = await getPackageAndBower(repoData);
  return _.assign(bowerJson.githubAutomatorOptions, packageJson.githubAutomatorOptions);
}
