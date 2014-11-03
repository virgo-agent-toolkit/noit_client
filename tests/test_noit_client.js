require('longjohn');
var noit_ready = require('depends-on')(['postgres', 'noit_stratcon']);
var stratcon_ready = require('depends-on')(['redis', 'stratcon_ingestor']);
var cleanup = require('depends-on')(['kill_postgres', 'kill_noit_stratcon', 'kill_ingestor',
  'kill_redis', 'remove_postgres', 'remove_noit','remove_redis', 'remove_ingestor']);
var fs = require('fs');
var test = require('tape');
var et = require('elementtree');
var NoitClient = require('../lib/noit_client').NoitClient;
var http = require('http');
var redis = require("redis");
var exec = require('child_process').exec;
var async = require('async');
var log = require('logmagic').local('ele.lib.noit.test_noit_client');


var CHECK_XML = '<?xml version="1.0" encoding="utf-8"?>' +
                '<check>' +
                '  <attributes>' +
                '    <name>test</name>' +
                '    <module>selfcheck</module>' +
                '    <target>127.0.0.1</target>' +
                '    <period>60001</period>' +
                '    <timeout>5000</timeout>' +
                '    <filterset>default</filterset>' +
                '  </attributes>' +
                '  <config>' +
                '    <code>200</code>' +
                '    <url>https://labs.omniti.com/</url>' +
                '  </config>' +
                '</check>',
  CHECK_ID = 'edc4760b-5bdb-45d6-ab82-34160eda8187',
  // path to the cert and key.
  NOIT_KEY_PATH = '/usr/local/etc/cert.key',
  NOIT_CERT_PATH = '/usr/local/etc/cert.crt';

test('init', function(t) {
  child = exec("boot2docker ip", function (error, stdout, stderr) {
    if (error !== null || stderr.indexOf('boot2docker') > -1) {
      ip = '127.0.0.1';
    } else {
      ip = stdout;
    }
    t.end();
  });
}); 

test('up', noit_ready);


function noit_client(host, port, options) {
  host = host || ip;
  port = port || 8888;
  options = options || {};
  var key = null;
  var cert = null;

  if (fs.existsSync(NOIT_KEY_PATH) && fs.existsSync(NOIT_CERT_PATH)) {
    key = fs.readFileSync(NOIT_KEY_PATH);
    cert = fs.readFileSync(NOIT_CERT_PATH);
  }
  return new NoitClient(host, port, key, cert, null, options);
}

function setup(t) {
  test('setup', function(t) {
    var client = noit_client();
    client.setSerializedCheck(CHECK_ID, CHECK_XML, function(err) {
      t.error(err, "Set check should not error");
      t.end();
    });
  });
}

function teardown(t) {
  test('teardown', function(t) {
    var client = noit_client();
    client.deleteCheck(CHECK_ID, function(err) {
      t.error(err, "Delete check should not error");
      t.end();
    });
  });
}

test('test_get_version', function(t) {
  var client = noit_client();
  client.getVersion(function(err, version) {
   t.ifError(err, "Get version should not error");
   t.ok(version, "Noitd version should be returned");
   t.end();
  });
});

/* Fixing this test is out of scope for this PR 
https://gist.github.com/ynachiket/562e7bd86a7f795a6b62
test('test_get_version_dead_host', function(t) {
  var client = noit_client(undefined, 11111);
  client.getVersion(function(err, version) {
   t.ok(err, "Get version should error, when hitting a dead host");
   t.end();
  });
});
*/

test('test_set_check', function(t){
  var client = noit_client();
  client.setSerializedCheck(CHECK_ID, CHECK_XML, function(err) {
    t.error(err, "Set check should not error");
    t.end();
  });
});
teardown(test);

setup(test);
test('test_get_check', function(t) {
  var client = noit_client();
  client.getCheck(CHECK_ID, function(err, ch_xml) {
    t.error(err, "Get check for a valid check id should not error");
    etree = et.parse(ch_xml);
    root = etree.getroot();
    attributes = root.find('.//attributes');
    id = attributes.findtext('.//uuid');
    t.equal(id, CHECK_ID, "Check id from getCheck should match the check id used during setCheck");
    });
  t.end();
});
teardown(test);

test('test_get_invalid_check_id', function(t) {
  var invalid_check_id = 'invalid-check-id';
  var client = noit_client();
  client.getCheck(invalid_check_id, function(err, chk) {
    t.ok(err, "getCheck with an invalid check id should error with statusCode 404");
    t.ok(!chk, "getCheck with an invalid check id should not return a check");
    t.end();
  });
});

setup(test);
test('test_get_all_checks', function(t) {
  var client = noit_client();
  client.getAllChecks(function(err, uuids) {
    t.error(err, "getAllChecks should not error");
    t.ok(uuids.length >= 1);
    len = uuids.filter(function(_uuid) {
      return _uuid === CHECK_ID;
      }).length;
    t.equal(len, 1, "Number of checks created should match the getAllChecks count");
  });
  t.end();
});
teardown(test);

setup(test);
test('test_delete_checks', function(t) {
  var client = noit_client();
  client.deleteCheck(CHECK_ID, function(err) {
    t.error(err, "deleteCheck should not error");
  });
  t.end();
});

test('test_check_test', function(t) {
  var client = noit_client();
  client.testSerializedCheck(CHECK_ID, CHECK_XML, function(err, result) {
    t.error(err, "testCheck should not error");
    t.ok(result.hasOwnProperty('metrics'), "testCheck should return metrics");
    t.deepEqual(result.state, 'good', "testCheck should be of state good");
    t.end();
  });
});

test('test_retry_and_failure', function(t) {
  var client = noit_client(null, null, {retries: 3}),
      retryCount = 0,
      cb;

  cb = function(err, uuids) {
    t.ok(err, "Retries should not error");
    t.ok(retryCount === client.options.retries, "Retry count is as expected");
    t.end();
  };

  client.retrier(client.options.retries, client.options.retry_delay, client.options.backoff, function(callback) {
    retryCount++;
    process.nextTick(callback.bind(null, new Error('Fake error to force retry')));
  }, cb);
});

test('test_error_500_from_noit', function(t){
  var client = noit_client();
  invalid_check_xml = CHECK_XML.replace('<code>200</code>', '< code>200</ code>');
  client.setSerializedCheck(CHECK_ID, invalid_check_xml, function(err) {
    t.ok(err, "Set check should error with status code 500 when the check xml is invalid");
    t.end();
  });
});

setup(test); // create the test check
test('up', stratcon_ready);
test('basic_ingestion', function(t) {
  var parent_set, metric_set;

  async.series([

    function(callback) {
      r_client = redis.createClient(6379, ip);
      callback();
    },
    function(callback) {
      var dbsize = 0,
          desiredDbSize = 50; 
      async.whilst(function () { return dbsize < desiredDbSize; },
        function (callback) {
          r_client.dbsize(function(err, data) {
            if (err) callback(); // not using a t.error as it corrupts the test run output 
            log.info('Waiting for ingestion. Waiting till', desiredDbSize);
            log.info('Current Db size', data);
            dbsize = data;// https://gist.github.com/ynachiket/a36861af2d93ecb51d82
            callback();
          });
        }, callback);
    },
    function(callback) {
      r_client.keys('stratcon*', function (err, data) {
        t.error(err, 'Found tag for this execution');
        t.ok(data, 'A new set with stratcon tag should be created');
        parent_set = data;
        callback();
      });
    },
    function(callback) {
      r_client.smembers(parent_set.pop(), function (err, data) {
        t.error(err, 'Expected checks available');
        t.ok(data, 'A new set with metrics grouped by checks');
        metric_set = data;
        callback();
      });
    },
    function(callback) {
      r_client.smembers(CHECK_ID, function (err, data) { // This test proves that the noit_client
        t.error(err, 'Found data corresponding to expected check');// was successfull in creating a new check with CHECk_ID               
        t.ok(data, 'The check created by noit_client should have emited metrics');
        metric_set = data;
        callback();
      });
    },
    function(callback) {
      var empty = true;
      async.whilst( function () { return empty; },
        function (callback) {
          r_client.hgetall(metric_set[0], function(err, data) {
            if (err) callback();
            empty = false;
            callback();
          });
        }, callback);
    },
    function(callback) {
      r_client.hgetall(metric_set[0], function (err, data) {
        t.error(err, 'Found metrics for this check');
        t.ok(data, 'Detailed metrics should be available');
        r_client.end();
        callback();
      });
    }
  ], function(err) {
    t.error(err, 'Tests Completed');
    t.end();
  });
});

test("down", cleanup);
