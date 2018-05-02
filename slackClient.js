const semverDiff = require('semver-diff');
const {WebClient} = require('@slack/client');
let {SLACK_TOKEN} = process.env;
if (!SLACK_TOKEN) {
  console.log(`WARNING: SLACK_TOKEN not set in env. Slack notifications will not work`);
}
const slackWeb = new WebClient(SLACK_TOKEN);

module.exports = {
  notifySlack
};

async function notifySlack({owner, repoName, newVersion, author = 'Github-Automator', latestRelease}) {
  const sharedSlackSettings = {
    fallback: `${repoName} version ${newVersion} is now available`,
    author_name: author,
    title: `${repoName} version ${newVersion} is now available`,
    title_link: `https://github.com/${owner}/${repoName}/releases/tag/${newVersion}`,
    thumb_url: 'https://assets-cdn.github.com/images/modules/logos_page/Octocat.png',
    color: '#87B940',
    footer: 'Frontier Tagger'
  };

  try {
    const channels = (await slackWeb.channels.list()).channels;
    const webdevUpdatesChannel = channels.find(channel => channel.name === 'webdev-updates');

    // only post to shared channel if it's a major or minor release
    const releaseType = semverDiff(latestRelease.name, newVersion)
    if (releaseType === 'major') {
      await slackWeb.chat.postMessage({
        channel: webdevUpdatesChannel.id,
        text: sharedSlackSettings.fallback,
        attachments: [sharedSlackSettings],
        as_user: true
      });
    }
  } catch (err) {
    console.log('Error notifying slack channel: ', err);
  }
}
