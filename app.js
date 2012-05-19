
/*
✿ flower
2012 Yao Wei <mwei@lxde.org>
*/

(function() {
  var NetflowPacket, app, config, cronJob, dgram, express, io, launch, loadDatabase, model, netflowClient, pushingTargets, setupCronJobs,
    __indexOf = Array.prototype.indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  config = require('./config');

  express = require('express');

  dgram = require('dgram');

  NetflowPacket = require('Netflow/lib/NetFlowPacket');

  app = module.exports = express.createServer();

  model = require('./model');

  cronJob = require('cron').CronJob;

  io = require('socket.io').listen(app);

  app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    return app.use(express.static(__dirname + '/public'));
  });

  app.configure('development', function() {
    var dummy;
    app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
    dummy = model.daily.getIp("127.0.0.1");
    dummy.upload = 123456789;
    return dummy.download = 987654321;
  });

  app.configure('production', function() {
    app.use(express.errorHandler());
    io.enable('browser client minification');
    io.enable('browser client etag');
    io.enable('browser client gzip');
    io.set('log level', 1);
    return io.set('transports', ['websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
  });

  pushingTargets = {};

  io.sockets.on('connection', function(socket) {
    socket.emit('ready');
    socket.on('set ip', function(data) {
      if (config.ipRule(data.ip)) {
        return socket.set('ip', data.ip, function() {
          return pushingTargets[socket.id] = {
            ip: data.ip,
            socket: socket
          };
        });
      }
    });
    socket.on('update graph', function() {
      return socket.get('ip', function(error, ip) {
        return model.hourly.getHistoryPlot(ip, function(historyPlot) {
          return socket.emit('graph update', historyPlot);
        });
      });
    });
    return socket.on('disconnect', function() {
      return socket.get('ip', function(error, ip) {
        var _ref;
        if (_ref = socket.id, __indexOf.call(pushingTargets, _ref) >= 0) {
          return delete pushingTargets[socket.id];
        }
      });
    });
  });

  netflowClient = dgram.createSocket("udp4");

  netflowClient.on("message", function(mesg, rinfo) {
    var bytes, dstIP, dstIPInbound, flow, hourlyIpData, ipData, packet, socketId, srcIP, srcIPInbound, status, target, updatedIps, _i, _len, _ref, _results;
    try {
      packet = new NetflowPacket(mesg);
      if (packet.header.version === 5) {
        updatedIps = {};
        _ref = packet.v5Flows;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          flow = _ref[_i];
          srcIP = flow.srcaddr.join('.');
          srcIPInbound = config.ipRule(srcIP);
          dstIP = flow.dstaddr.join('.');
          dstIPInbound = config.ipRule(dstIP);
          if (dstIPInbound && !srcIPInbound) {
            status = "download";
            bytes = flow.dOctets;
          } else if (srcIPInbound && !dstIPInbound) {
            status = "upload";
            bytes = flow.dOctets;
          } else {
            continue;
          }
          if (!config.ipRule(ip)) continue;
          ipData = model.daily.getIp(ip);
          hourlyIpData = model.hourly.getIp(ip);
          switch (status) {
            case "upload":
              ipData.addUpload(bytes);
              hourlyIpData.addUpload(bytes);
              break;
            case "download":
              ipData.addDownload(bytes);
              hourlyIpData.addDownload(bytes);
          }
          updatedIps[ip] = 1;
        }
        _results = [];
        for (socketId in pushingTargets) {
          target = pushingTargets[socketId];
          if (target.ip in updatedIps) {
            _results.push(target.socket.volatile.emit('update', model.daily.getIp(target.ip)));
          } else {
            _results.push(void 0);
          }
        }
        return _results;
      }
    } catch (err) {
      return console.error("* error receiving Netflow message: " + err);
    }
  });

  global.views = {
    siteName: config.siteName,
    siteUri: config.siteUri
  };

  app.get('/', function(req, res) {
    var remoteIp;
    remoteIp = req.connection.remoteAddress;
    if (config.ipRule(remoteIp)) {
      return res.redirect('/' + req.connection.remoteAddress);
    } else {
      return res.redirect('/category');
    }
  });

  app.get('/category', function(req, res) {
    return res.render('categories');
  });

  app.get('/category/:category', function(req, res) {
    return res.render('category');
  });

  app.get('/banned', function(req, res) {
    return res.render('banned');
  });

  app.get('/:ip', function(req, res, next) {
    var ip, ipData;
    ip = req.params.ip;
    if (!config.ipRule(ip)) {
      res.redirect('/category');
      return;
    }
    ipData = model.daily.getIp(ip);
    return model.hourly.getHistoryPlot(ip, function(historyPlot) {
      return res.render('ip', {
        ip: ip,
        ipData: ipData,
        historyPlot: historyPlot
      });
    });
  });

  app.get('/:ip/log', function(req, res) {
    return res.render('log');
  });

  app.get('/:ip/log/:year/:month', function(req, res) {});

  app.get('/:ip/log/:year/:month/:day', function(req, res) {});

  loadDatabase = function(callback) {
    return model.daily.restore(function() {
      return model.hourly.restore(function() {
        return callback();
      });
    });
  };

  setupCronJobs = function() {
    cronJob('0 0 0 * * *', function() {
      return model.daily.rotate();
    });
    cronJob('0 0 * * * *', function() {
      return model.hourly.rotate();
    });
    return cronJob('1 */10 * * * *', function() {
      model.daily.save();
      model.hourly.save();
      return console.log("* data upserted");
    });
  };

  launch = function() {
    setupCronJobs();
    netflowClient.bind(config.netflowPort);
    app.listen(config.httpPort);
    console.log("✿ flower");
    console.log("* running under " + app.settings.env + " environment");
    console.log("* listening on port " + (app.address().port) + " for web server");
    return console.log("* listening on port " + (netflowClient.address().port) + " for netflow client");
  };

  loadDatabase(launch);

}).call(this);
