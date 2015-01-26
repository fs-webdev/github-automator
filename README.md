GitHub Automator
================

Setup
=====

```npm install```

================

**Setup a webhook on github with the following settings:**

*Payload URL:*
Use the deployed URL such as:
http://github-automator.herokuapp.com/version-check

*Content type:*
application/x-www-form-urlencoded

*Which events would you like to trigger this webhook?*
"Just the push event"

Set these settings, add the webhook, and you should be good to go.

================

**Configure the .env variables**

GITHUB_URL=https://api.github.com
GITHUB_LOGIN=
GITHUB_PASSWORD=
