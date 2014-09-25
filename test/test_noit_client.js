var fs = require('fs');

var test = require('tape');
var et = require('elementtree');

var noitClient = require('../lib/noit_client');
var NoitClient = noitClient.NoitClient;

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


function noit_client(host, port, options) {
  host = host || '127.0.0.1';
  port = port || 54102;
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

test('test_get_version_dead_host', function(t) {
  var client = noit_client(undefined, 11111);
  client.getVersion(function(err, version) {
   t.ok(err, "Get version should error, when hitting a dead host");
   t.end();
  });
});

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
