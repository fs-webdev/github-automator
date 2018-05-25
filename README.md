GitHub Automator
================
# Using Github Push Webhooks
- Simple script to automatically create new releases when the `package.json` or `bower.json` file version changes.  
The release title will be the version number and the release body will be the commit message.
It will first check the `package.json`. If no `package.json` is present, then it will fall back onto the `bower.json`.
- After a successful new release, this automator will also ping the Component Catalog and if the repo is registered in the catalog.json there, it 
will trigger a re-build of the component so it will be up to date in the Component Catalog.

## Setup

1. Add either the `fs-write` user or the `fs-webdev` team* to your repo's collaborators with 'Write' access.

    *If available and if you want others in fs-webdev to be able to make PR's without having to fork.

2. Setup a webhook on github with the following settings:
  
  | Key | Value |
  |:----|:------|
  | Payload URL | https://fs-github-automator.herokuapp.com/version-check |
  | Content type | application/json OR application/x-www-form-urlencoded |
  | Secret | |
  | Which events would you like to trigger this webhook? | Just the push event |

---  

# Slack Notifications
By default, this github-automator will notify the #webdev-updates channel of all Major version updates.  
There are options that you can provide in your package.json or bower.json file to tweak the slack notification settings.

Example of an entry in package.json
```
...
"githubAutomatorOptions": {
  "notifyMinorRelease": true
},
...
```

All Options for githubAutomatorOptions.
- `notifyMinorRelease`: Boolean (Defaults to false)
- `notifyPatchRelease`: Boolean (Defaults to false)
- `disableSlackNotifications`: Boolean (Defaults to false)
- `additionalChannels`: Array of objects. (Defaults to undefined)
  - Each object in additionalChannels will look like this
  - `{name: String, notifyMinorRelease: Boolean, notifyPatchRelease: Boolean}`

If you are going to use the additionalChannels option to have slack notify more channels, you will need to make sure that
the slack bot/user named "Frontier Tagger" is added or invited to your channel. To do so, all you need to do is type a message with 
`@Frontier Tagger` in the message. Slack will then give you a link to click to make the bot join the channel.

# Using a POST endpoint for more fine grained control
- There are situations where you may want to not tie your release to a merge/push to master. (Tree team wants a release only
after a successful build has occurred after a merge/push to master has already occurred.)
- After a successful new release, this endpoint will also ping the Component Catalog and if the repo is registered in the catalog.json there, it 
will trigger a re-build of the component so it will be up to date in the Component Catalog.

## API Requirements
- Url = http://fs-github-automator.herokuapp.com/release
- method = POST
- Content-Type = application/json
- body = valid JSON
  - repoName = name of the repo *required
  - owner = name of the owner/organization (most of the time fs-webdev) *required
  - version = the semver version from your package or bower json file of the commit in question *required
  - commit = the commit hash for the release to be tied to. *required
  - description = any string description you want to have for the release
  - author = name of commit Author to put into the slack channel (defaults to 'Github-Automator')

### Notes
- The version supplied in the POST body needs to match the version in your package/bower json for the commit
- If everything went fine, you will get a 204 response
- If there is an issue, a 400 will be returned with an error message describing the issue

## Example 
Here is an example of how to use the endpoint using node-fetch
```javascript
const fetch = require('node-fetch');

const headers = {'Content-Type': 'application/json'};
const postData = {
  repoName: 'versionReleaseTester',
  owner: 'fs-webdev',
  version: '2.0.0-rc1',
  commit: 'cc081d9e0ad0aa2e607253b8514296d84d89f5af',
  description: 'This release is awesome and tested the prerelease feature of github-automator. :)',
  author: 'Bobby Tables'
};
const url = 'http://fs-github-automator.herokuapp.com/release';

const options = {method: 'POST', headers, body: JSON.stringify(postData)};
fetch(url, options);
```
