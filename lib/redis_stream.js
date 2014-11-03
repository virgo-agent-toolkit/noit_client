var redis = require('redis');
var Writable = require('stream').Writable;
var redis_stream = new Writable();
var util = require('util');


/**
* @param {Number} port redis port
* @param {String} host redis host
* @constructor
*/
var RedisStream = function(port, host) {
  var self = this;
  Writable.call(this);
  this.redisPort = port || 6379;
  this.redisHost = host || 'localhost';
  this.redisClient = redis.createClient(this.redisPort, this.redisHost, {});
  this.on('pipe', function (source) {
    // a label for this run, will allow us to store data for different test runs
    self.label = source.type + '-' + Date.now();
  });
};
util.inherits(RedisStream, Writable);


/**
* A Writeable stream which get the required metrics from journals
* @param {Object} dataObjectArray array of metrics from one journal
* @param {String} enc encoding
* @param {Function} callback callback to be called after completion
**/
RedisStream.prototype._write = function(dataObjectArray, enc, callback) {
  var self = this;
  try {
    dataObjectArray = JSON.parse(dataObjectArray);
  } catch (e) {
    callback();
  }  
  dataObjectArray.forEach(function(dataObject) {
    // create a key for this check and the timestamp from this particualar metric chunk
    var key = dataObject.uuid + ':' + dataObject.timestamp;
    // stores the timestamp for this key
    self.redisClient.hset(key, 'timestamp', dataObject.timestamp, redis.print);
    // stores the encoded metric data for this key
    self.redisClient.hset(key, 'data', dataObject.data, redis.print);
    // set to store individual metrics and corresponding data
    self.redisClient.sadd(dataObject.uuid, key, redis.print);
    // a higher level set to store sets of metrics for checks
    self.redisClient.sadd(self.label, dataObject.uuid, redis.print);
    // to quickly see this in action : https://gist.github.com/ynachiket/bca3335c218b5e476800 
  });
  callback();
};


/**
* RedisStream object.
*/
module.exports = function (port, host) {
  return new RedisStream(port, host);
};
