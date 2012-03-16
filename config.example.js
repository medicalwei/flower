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

// postgresql database uri
exports.databaseUri = "tcp://someone:meow@localhost/flower";

// valid ip rule
exports.ipRule = function(ip) {
  var s = ip.split(".");
  var c = [];
  c[0] = parseInt(s[0]);
  c[1] = parseInt(s[1]);
  c[2] = parseInt(s[2]);
  c[3] = parseInt(s[3]);
  return (c[0] == 127 &&
          c[1] == 0 &&
          c[2] >= 0 && c[2] <= 255 &&
          c[3] >= 1 && c[3] <= 254);
}

// banning rule
exports.banningRule = function(user) {
  return user.upload + user.download > 3221225472;
}

/* TODO: banning trigger
exports.banningTrigger = function (ip, upload, download) {
}
*/

