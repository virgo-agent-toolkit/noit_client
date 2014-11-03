var fs = require('fs');
var redis = require('redis');
var Transform = require('stream').Transform;
var Writable = require('stream').Writable;
var util = require('util');
var path = require('path');
var log = require('logmagic').local('ele.lib.noit.stratcon_stream');


/**
* @param {String} journalDir directry where noit writes jlog journals.
* @constructor
**/
var StratconMetricsStream = function(journalDir) {
  Transform.call(this);
  this.journalDir = journalDir || '/var/log/stratcon.persist/127.0.0.1/noit-test/0/';
};
util.inherits(StratconMetricsStream, Transform);


/**
* A tranform which gets the journal filename and pushes the file contents. 
* @param {Object} chunk The data being pumped into the stream.
* @param {String} encoding encoding.
* @param {Function} callback function to be called upon completion.
**/
StratconMetricsStream.prototype._transform = function(chunk, encoding, callback) {
  var self = this;
  chunk = chunk.toString(); // think about chunk being incomplete
  if (chunk.indexOf('.h') > -1) {
    var file = chunk.split(":")[1].split("/")[7].replace('\r\n','');
    var stream = fs.createReadStream(path.join(this.journalDir, file));
    stream.on('data', function(data) {
      self.push(data);
    });
    stream.on('end', function () {
      log.info('file has ended', path.join(self.journalDir, file));
      callback();
    });
  } else {
    callback();
  }
};


/**
* StratconMetricsStream object.
*/
module.exports = function(journalDir) {
  return new StratconMetricsStream(journalDir);
};

