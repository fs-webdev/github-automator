GitHub Automator
================

- Simple script to automatically create new releases when the `package.json` or `bower.json` file version changes.  
The release title will be the version number and the release body will be the commit message.  
(side note, if BOTH a package.json and bower.json file exist, and their version numbers do not correspond, the tagging and 
updating of the component-catalog will be skipped.)
- This automator will also ping the Component Catalog and if the repo is registered in the catalog.json there, it 
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
