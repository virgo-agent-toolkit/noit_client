var Transform = require('stream').Transform;
var util = require('util');
var log = require('logmagic').local('ele.lib.noit.jlog_stream');


/**
* @constructor
**/
var ParseJlog = function() {
  Transform.call(this);
  this.type = 'stratcon';
};
util.inherits(ParseJlog, Transform);


/**
* A tranform which gets the journal data and pushes the metrics data. 
* @param {Object} chunk The data being pumped into the stream.
* @param {String} encoding encoding.
* @param {Function} callback function to be called upon completion.
**/
ParseJlog.prototype._transform = function(chunk, encoding, callback) {
  var lines = chunk.toString().split("\n"),
  dataObjectArray = [];
  lines.forEach(function(line) {
    var dataObject = {},
    fields = line.split("\t");
    if (line.charAt(0) == 'B') {
      if (line.charAt(1) == '1') {
        dataObject.timestamp = fields[1]; 
        dataObject.uuid = fields[2];
        dataObject.data = line;
        dataObjectArray.push(dataObject);
      } else if (line.charAt(1) != '2') {
        log.info('Unable to process line: Bad version');
      }
    }
  });
  callback(null, JSON.stringify(dataObjectArray)); 
};


/**
* ParseJlog object.
*/
module.exports = function() {
  return new ParseJlog();
};
