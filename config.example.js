/*
flower configurations 
*/

// the web viewer title
exports.siteName = "Dormitory flow";

// Ports
exports.netflowPort = 9991;
exports.httpPort = 3000;

// outbound SNMP interface index
exports.outboundInterface = 0x0017;

// mongodb host and port
exports.mongoHost = "localhost";
exports.mongoPort = 27017;

// valid ip rule
exports.ipRule = function(ip) {
  var s = ip.split(".");
  var c = [];
  c[0] = parseInt(s[0]);
  c[1] = parseInt(s[1]);
  c[2] = parseInt(s[2]);
  c[3] = parseInt(s[3]);
  return (c[0] == 140 &&
          c[1] == 121 &&
          c[2] > 1 && c[2] < 255 &&
          c[3] > 1 && c[3] < 255);
}

// banning rule
exports.banningRule = function(user) {
  return user.upload + user.download > 3221225472;
}

/* TODO: banning trigger
exports.banningTrigger = function (ip, upload, download) {
}
*/

