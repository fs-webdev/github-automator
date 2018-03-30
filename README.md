GitHub Automator
================
# Using Github Push Webhooks
- Simple script to automatically create new releases when the `package.json` or `bower.json` file version changes.  
The release title will be the version number and the release body will be the commit message.  
(side note, if BOTH a package.json and bower.json file exist, and their version numbers do not correspond, the tagging and 
updating of the component-catalog will be skipped.)
- After a successful new release, this automator will also ping the Component Catalog and if the repo is registered in the catalog.json there, it 
will trigger a re-build of the component so it will be up to date in the Component Catalog.

## Setup

1. Add the `fs-write` group to your repo's collaborators.

2. Setup a webhook on github with the following settings:
  
  | Key | Value |
  |:----|:------|
  | Payload URL | http://fs-github-automator.herokuapp.com/version-check |
  | Content type | application/x-www-form-urlencoded |
  | Secret | |
  | Which events would you like to trigger this webhook? | Just the push event |

---  

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
  description: 'This release is awesome and tested the prerelease feature of github-automator. :)'
};
const url = 'http://fs-github-automator.herokuapp.com/release';

const options = {method: 'POST', headers, body: JSON.stringify(postData)};
fetch(url, options);
```
