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
ipRegex = /^140.121.\d+.\d+$/;
exports.ipRule = function(ip) {
  return ipRegex.exec(ip);
}

// banning rule
exports.banningRule = function(user) {
  return user.upload + user.download > 3221225472;
}

/* TODO: banning trigger
exports.banningTrigger = function (ip, upload, download) {
}
*/

