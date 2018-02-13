const express = require('express');
const app = (module.exports = express());
const morgan = require('morgan');
const bodyParser = require('body-parser');
const errorHandler = require('errorhandler');

// all environments
app.set('port', process.env.PORT || 3000);
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(bodyParser.raw());

if (app.get('env') === 'development') {
  app.use(errorHandler());
}

require('./routes/version-check.js')(app);
