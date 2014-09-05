var fs = require('fs');
var tls = require('tls');
var Buffer = require('buffer').Buffer;
var setTimeout = require('timers').setTimeout;
var https = require("https");

var _ = require('underscore');
var et = require('elementtree');
var log = require('logmagic').local('ele.lib.noit.client');
var strtok = require('strtok');
var sprintf = require('sprintf').sprintf;
var request = require('request');
var instruments = require('zither').instrument('noit_client');

var settings = require('../settings');


/**
 * Constant for the livestream feed
 */
var LIVESTREAM_HELLO = new Buffer([0xfa, 0x57, 0xfe, 0xed]);


// test self check used for retrieving the noitd version.

// Note: Target is set to something that wouldn't be picked up by the ACL deny.
// Since selfcheck isn't actually a network check this has to be valid ip,
// but not a valid destination.
var VERSION_CHECK = '<?xml version="1.0" encoding="utf8"?>' +
                    '<check>' +
                    '  <attributes>' +
                    '    <name>selfcheck</name>' +
                    '    <module>selfcheck</module>' +
                    '    <target>50.0.0.0</target>' +
                    '    <period>60000</period>' +
                    '    <timeout>5000</timeout>' +
                    '    <filterset>default</filterset>' +
                    '  </attributes>' +
                    '  <config/>' +
                    '</check>';

/**
 * Parse XML returned by noit.
 * @param {String} data XML as returned by noit.
 * @param {Function} callback A Callback called with (err, element).
 */
function parseData(data, callback) {
  var etree;

  if (!data) {
    callback(new Error('No data provided'));
    return;
  }

  try {
    etree = et.parse(data);
  }
  catch (err) {
    callback(err);
    return;
  }

  callback(null, etree);
}



/** NoitClient constructor
 * @constructor
 *
 * @param {String} host noit hostname or IP. defaults to localhost.
 * @param {String} port noit port. defaults to 43191.
 * @param {String} key ssl encryption key.
 * @param {String} cert ssl encryption certificate.
 * @param {String} ca ssl encryption ca.
 * @param {Object} options currently for retries.
 */
function NoitClient(host, port, key, cert, ca, options) {
  this.options = {
    retries: settings.NOIT_CLIENT_DEFAULT_RETRY_COUNT,
    backoff: settings.NOIT_CLIENT_DEFAULT_BACKOFF,
    retry_delay: settings.NOIT_CLIENT_DEFAULT_RETRY_DELAY
  };

  _.extend(this.options, options);
  this.http_options = {
    headers: {},
    host: host || '127.0.0.1',
    port: port || 54102
  };
  this.key = key;
  this.cert = cert;
  this.ca = ca;
  this.headers = {
    'Connection': 'close',
    'Content-Type': 'text/xml'
  };
  this.timeout_noit_requests = settings.TIMEOUT_NOIT_REQUESTS;
  this.timeout_noit_test_set_check = settings.TIMEOUT_NOIT_TEST_SET_CHECK;
}

/**
 * Handle Internal server errors returned by noit.
 * @param {String} method The HTTP method used.
 * @param {String} path The path on which the request was made.
 * @param {String} data XML returned by noit.
 * @param {Function} callback Callback called with (err).
 */
NoitClient.prototype._handle500 = function(method, path, data, callback) {
  var self = this;

  parseData(data, function(err, elem) {
    var root, errMsg;

    if (err) {
      log.error('unable to parse 500 from noit', {
        host: self.http_options.host,
        port: self.http_options.port,
        method: method,
        path: path,
        data: data,
        err: err
      });
      callback(new Error('Malformed 500 from noit').stack);
      return;
    }

    root = elem.getroot();
    errMsg = root.text || 'No error message provided';

    log.error('received 500 from noit', {
      host: self.http_options.host,
      port: self.http_options.port,
      method: method,
      path: path,
      message: errMsg
    });

    callback(new Error(errMsg).stack);
  });
};


/**
 * Perform an actual request.
 *
 * @param {String} method 'GET', 'DELETE', 'POST', etc.
 * @param {String} path URL path.
 * @param {String} payload the body of the HTTP post.
 * @param {?Object} options Optional options object.
 * @param {Function} callback Callback called with (err, data).
 */
NoitClient.prototype.sendrecv = function(method, path, payload, options, callback) {
  options = options || {};
  var agent = new https.Agent({ host: this.http_options.host, port: this.http_options.port, ca: this.ca,
    key: this.key, cert:this.cert});
  var self = this,
      action = options.action || 'unknown',
      req,
      headers,
      url,
      reqOptions = {},
      label, work;

  url = sprintf('https://%s:%s%s', this.http_options.host, this.http_options.port, path);

  // To get the self-signed cert working, and workaround issue #418 in Mikeal's request
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

  reqOptions = {
    headers: this.headers,
    pool: {maxSockets: 10},
    agent: agent,
    url: url,
    method: method,
    body: payload
  };

  reqOptions.timeout = (options.timeout || this.timeout_noit_requests);

  log.debug('NoitClient sendrecv', {
    host: this.http_options.host,
    port: this.http_options.port,
    path: path,
    url: url,
    headers: this.headers,
    payload: payload,
    method: method,
    action: action
  });

  label = sprintf('noit_client.%s:%s.%s', this.http_options.host.replace(/\./g, '_'), this.http_options.port, action);
  work = instruments.work(label);
  work.start();

  request(reqOptions, function(err, res, body) {
    work.stop(err);

    if (!err && res.statusCode === 200) {
      log.debug('NoitClient sendrecv response', {
        host: self.http_options.host,
        port: self.http_options.port,
        path: path,
        statusCode: res.statusCode
      });
      callback(null, res);
    }
    else if (!err && res.statusCode === 500) {
      self._handle500(method, path, body, callback);
    }
    else if (!err && res.statusCode !== 500) {
      log.error('NoitClient sendrecv error (non-500)', {
        host: self.http_options.host,
        port: self.http_options.port,
        path: path,
        statuscode: res.statusCode
      });
      callback(res.statusCode);
    }
    else {
      log.error('NoitClient sendrecv error', {
        host: self.http_options.host,
        port: self.http_options.port,
        path: path,
        err: err,
        body: body
      });
      callback(err);
    }
  });
};



/**
 * applies retry logic.
 *
 * @param {int} max_retries maximum number of times to retry worker.
 * @param {int} initial_delay initial amount of time to wait after failure
 *  before trying again. this value increases at an exponential rate.
 * @param {int} backoff exponential base to calculate retry wait time.
 *  time is initial_delay * Math.pow(backoff, try_num).
 * @param {Function} worker function that does the work. accept a function
 *  callback that accepts an err,result tuple.  the callback passed to this
 *  worker ends up tracking the errors.
 * @param {Function} callback gets called (once) after all retrying is done.
 *  accepts an err,result tuple.
 */
NoitClient.prototype.retrier = function(max_retries, initial_delay, backoff, worker, callback) {
  var f = function() {
    var numTries = 0,
        workerCallback;

    workerCallback = function(err, res) {
      if (err) {
        numTries += 1;
        if (numTries >= max_retries) {
          callback(err, res);
        } else {
          setTimeout(worker.bind(null, workerCallback), initial_delay * Math.pow(backoff, numTries));
        }
      } else {
        callback(null, res);
      }
    };

    worker(workerCallback);
  };

  process.nextTick(f);
};


/**
 * Get a check from noit by uuid
 *
 * @param {String} check uuid.
 * @param {Function} callback function that gets the check object.
 */
NoitClient.prototype.getCheck = function(uuid, callback) {
  var self = this,
      options = {'action': 'getCheck'};

  this.retrier(this.options.retries, this.options.retry_delay, this.options.backoff,
      function getCheckRetrier(callback) {
        var http_options,
            noit_xml = '',
            path,
            req;

        http_options = self.http_options;
        noit_xml = '';
        path = '/checks/show/' + uuid;
        self.sendrecv('GET', path, null, options, function onResponse(err, response) {
          if (err) {
            callback(err);
          } else if (response.statusCode === 404) {
            callback(new Error('Check with uuid ' + uuid + ' does not exist'));
          } else {
            callback(null, response.body);
          }
        });
      }, callback);
};


/** Get all checks from a noit
*
* @param {Function} callback function that gets the array of checks.
*  expects(error, list_of_ch_ids).
*/
NoitClient.prototype.getAllChecks = function(callback) {
  var self = this,
      options = {'action': 'getAllChecks'};

  this.retrier(this.options.retries, this.options.retry_delay, this.options.backoff, function(callback) {
    self.sendrecv('GET', '/config/checks', null, options, function onResponse(err, response) {
      if (err) {
        callback(err);
        return;
      }

      parseData(response.body, function(err, elem) {
        var root, elems, uuids;
        if (err) {
          callback(err);
          return;
        }

        root = elem.getroot();
        elems = root.findall('.//check[@uuid]');

        uuids = elems.reduce(function(list, elem) {
          var uuid = elem.get('uuid');
          list.push(uuid);
          return list;
        }, []);

        callback(null, uuids);
      });
    });
  }, callback);
};


/**
 * Parse data returned by test check and return an object.
 * @param {String} ch Check data.
 * @return {Object} Object with the  following keys: state, available,
 * timestamp, metrics.
 */
exports.parseTestCheck = function parseTestCheck(ch) {
  var etree, root, state, available, status, metrics, i, len, timestamp, mdata = {};
  try {
    etree = et.parse(ch);
  }
  catch (err) {
    return {state: 'error'};
  }

  root = etree.getroot();
  state = root.findtext('.//state/state');
  available = root.findtext('.//state/availability');
  available = (available === 'available') ? true : false;
  status = root.findtext('.//state/status');
  timestamp = root.findtext('.//last_run');
  metrics = root.findall('.//state/metrics/*');

  for (i = 0, len = metrics.length; i < len; ++i) {
    mdata[metrics[i].attrib.name] = {type: metrics[i].attrib.type, data: metrics[i].text};
  }

  return {'state': state, 'available': available, 'status': status, 'timestamp': timestamp, 'metrics': mdata};
};


/**
 * Returns the noitd version.
 * @param {Function} callback expects(err, version_string).
 */
NoitClient.prototype.getVersion = function(callback) {
  var self = this,
      options = {'timeout': this.noit_test_set_check_timeout, 'action': 'getNoitVersion'};
  this.retrier(this.options.retries, this.options.retry_delay, this.options.backoff, function(callback) {
    self.sendrecv('POST', '/checks/test', VERSION_CHECK, options, function(err, response) {
      if (err) {
        callback(err);
      } else {
        try {
          callback(null, et.parse(response.body).find('state/metrics/metric[@name="version"]').text);
        } catch (xmlerr) {
          callback(xmlerr);
        }
      }
    });
  }, callback);
};


/** Test set a serialized check on a noit.
*
* @param {String} uuid of the check.
* @param {Object} serializedCheck object.
* @param {Function} callback function. callback params are (err, status_code).
*/
NoitClient.prototype.testSerializedCheck = function(uuid, serializedCheckXml, callback) {
  var self = this, timeout, options;

  etree = et.parse(serializedCheckXml);
  timeout = parseInt(etree.findtext('./attributes/timeout'), 10) + 20000 || this.timeout_noit_test_set_check;

  options = {'timeout': timeout, 'action': 'testSerializedCheck'};

  this.retrier(this.options.retries, this.options.retry_delay, this.options.backoff, function(callback) {
    var path, body;

    path = '/checks/test';
    self.sendrecv('POST', path, serializedCheckXml, options, function(err, response) {
      if (err) {
        callback(err);
      } else {
        callback(null, exports.parseTestCheck(response.body));
      }
    });
  }, callback);
};


/** Set a serialized check on a noit.
*
* @param {String} uuid of the check.
* @param {Object} serializedCheck object.
* @param {Function} callback function. callback params are (err).
*/
NoitClient.prototype.setSerializedCheck = function(uuid, serializedCheckXml, callback) {
  var self = this;
  this.retrier(this.options.retries, this.options.retry_delay, this.options.backoff,
      function setSerializedCheckRetrier(callback) {
        var path = '/checks/set/' + uuid,
            options = {'action': 'setSerializedCheck'};

        self.sendrecv('PUT', path, serializedCheckXml, options, function onResponse(err, res) {
          if (err) {
            instruments.recordEvent('ele.NoitClient.setSerializedCheck.sendrecv_error');
          }
          callback(err);
        });
      }, callback);
};


/**
* Get a livestream of all the checks
*
* @param {String} uuid string that is a native check uuid.
* @param {Number} period the frequency to run a check.
* @param {Function} callback function that gets called upon every metric load
*  expects(error, ).
* @return {CryptoStream} return the socket object to close later.
*/
NoitClient.prototype.getLiveStream = function(uuid, period, callback) {
  var self = this,
      periodBuffer = new Buffer(4),
      socket,
      numBytes = -1;

  // Load up the buffer
  periodBuffer.writeUInt32BE(period, 0);

  socket = tls.connect(this.http_options.port, this.http_options.host,
                       {key: this.key, cert: this.cert, ca: this.ca}, function(test) {
        // Write the livestream hello!
        socket.write(LIVESTREAM_HELLO);
        // Write the period 256*3
        socket.write(periodBuffer);
        // Write the UUID
        socket.write(new Buffer(uuid));
      });

  socket.on('connect', function() {
    log.info('Connected via livestream', {uuid: uuid.toString()});
  });

  strtok.parse(socket, function(v, cb) {
    if (v === undefined) {
      return strtok.UINT32_BE;
    }

    if (numBytes === -1) {
      numBytes = v;
      return new strtok.StringType(v, 'utf-8');
    }

    callback(null, v);
    numBytes = -1;
    return strtok.UINT32_BE;
  });

  socket.on('error', function(err) {
    log.err('Error connecting over livestream', {
      uuid: uuid.toString(),
      err: err
    });
    callback(err);
  });

  return socket;
};


/**
 * deletes a check.
 *
 * @param {String} uuid uuid of check to delete.
 * @param {Function} callback expects (error).
 */
NoitClient.prototype.deleteCheck = function(uuid, callback) {
  var self = this,
      options = {'action': 'deleteCheck'};

  this.retrier(this.options.retries, this.options.retry_delay, this.options.backoff, function(callback) {
    var path = '/checks/delete/' + uuid;

    self.sendrecv('DELETE', path, null, options, function onResponse(err, response) {
      if (err) {
        callback(err);
        return;
      }

      if (response.statusCode === 404) {
        log.error('received 404 deleting check from noit, will not retry', {
          path: path
        });
      }

      callback();
    });
  }, callback);
};


/** parseData function. */
exports._parseData = parseData;


/** the noit client. expects host, port and cert credentials (key, cert, ca). */
exports.NoitClient = NoitClient;
