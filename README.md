# Noit Client

A client interface for [Reconnoiter](http://labs.omniti.com/labs/reconnoiter)


## How to Install

npm install noit_client

## Simple to Use:

```javascript
var client = require('noit_client').NoitClient;
// values for key, cert, ca are passed here
var noit_client = client('127.0.0.1', '8900', key, cert, ca);

noit_client.getVersion(function(err, response){
  if (response) {
  	console.log("getNoitVersion Response: ", response)
  }
})
```

## Noit operations supported
 * [Get version of Noitd](http://labs.omniti.com/labs/reconnoiter/ticket/115)
 * [Test check](http://labs.omniti.com/labs/reconnoiter/docs/config.noitd.modules.html#idp2749153219392)
 * [Set check](http://labs.omniti.com/labs/reconnoiter/docs/noitd.wire.protocol.html#idp2749155183824)
 * [Get check](http://labs.omniti.com/labs/reconnoiter/docs/noitd.wire.protocol.html#idp2749155193872)
 * [Delete check](http://labs.omniti.com/labs/reconnoiter/docs/noitd.wire.protocol.html#idp2749155178256)
 * Get all checks
 * Get a live stream of all checks

## License

noit_client is distributed under the [Apache License 2.0][apache].

[apache]: http://www.apache.org/licenses/LICENSE-2.0.html

