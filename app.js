const express = require('express');
const app = (module.exports = express());
const morgan = require('morgan');
const bodyParser = require('body-parser');
const errorHandler = require('errorhandler');

// all environments
app.set('port', process.env.PORT || 3000);
app.use(morgan('dev'));
app.use(bodyParser.json({limit: '10mb'}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: true}));

if (app.get('env') === 'development') {
  app.use(errorHandler());
}

require('./routes/releaseRoutes')(app);
