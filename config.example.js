/*
flower configurations 
*/

// the web viewer title
exports.siteName = "Dormitory flow";

// netflowPort
exports.netflowPort = 9991;

// outbound SNMP interface index
exports.outboundInterface = 0x0017;

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

