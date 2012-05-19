/*
flower configurations 
*/

// the web viewer title
exports.siteName = "Dormitory flow";
exports.siteUri = "http://localhost:3000";

// Ports
exports.netflowPort = 9991;
exports.httpPort = 3000;

// postgresql database uri
exports.databaseUri = "tcp://someone:meow@localhost/flower";

var matcher = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
// valid ip rule
exports.ipRule = function(ip) {
  var c = matcher.exec(ip);
  if (!c) return false;
  return (c[1] == 127 &&
          c[2] == 0 &&
          c[3] >= 0 && c[3] <= 255 &&
          c[4] >= 1 && c[4] <= 254);
}

// banning rule
exports.banningRule = function(user) {
  return user.upload + user.download > 3221225472;
}

/* TODO: banning trigger
exports.banningTrigger = function (ip, upload, download) {
}
*/

