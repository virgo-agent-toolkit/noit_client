var stratcon_stream = require('./stratcon_stream');
var jlog_stream = require('./jlog_stream');
var redis_stream = require('./redis_stream');
var fs = require('fs');
var http = require('http');
var log = require('logmagic').local('ele.lib.noit.ingestor_client');


/**
* @param {String} noitHost noit host.
* @param {Number} noitPort journal api port. 
* @param {String} redisHost host for redis sink.
* @param {Number} redisPort redis port number.
* @constructor
**/
var IngestorClient = function(noitHost, noitPort, redisHost, redisPort) {
  this.options = {
    hostname: noitHost || 'localhost',
    port: noitPort || 80,
    path: '/handoff/journals',
    method: 'GET'
  };
  this.type = 'stratcon';
  this.redisPort = redisPort;
  this.redisHost = redisHost;
};


/**
* The ingest method which will start the ingestion.
**/ 
IngestorClient.prototype.ingest = function() {
  var self = this;
  var req = http.request(self.options, function(res) {
    if (res.statusCode != 200) {
      log.error('Response code should be 200. Aborting.', res.statusCode);
      process.exit(1);
    } else {
      console.log('STATUS: ' + res.statusCode);
      res.setEncoding('utf8');
      res.pipe(stratcon_stream()).pipe(jlog_stream()).pipe(redis_stream(self.redisPort, self.redisHost));
    }  
  });

  req.on('error', function(e) {
    log.error('Problem with request. Exiting ingestion process.', e.message);
    process.exit(1);
  });

  req.end();
};


/**
* IngestorClient object.
*/
module.exports = function(noitHost, noitPort, redisHost, redisPort) {
  return new IngestorClient(noitHost, noitPort, redisHost, redisPort);
};
