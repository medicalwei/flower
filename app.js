
/*
✿ flower
2012 Yao Wei <mwei@lxde.org>
*/

(function() {
  var NetflowPacket, User, Users, app, config, dgram, express, netflowClient, users;

  config = require('./config');

  express = require('express');

  dgram = require('dgram');

  NetflowPacket = require('NetFlowPacket');

  app = module.exports = express.createServer();

  User = (function() {

    function User() {
      this.upload = 0;
      this.download = 0;
    }

    User.prototype.getUpload = function() {
      return this.upload;
    };

    User.prototype.getDownload = function() {
      return this.download;
    };

    User.prototype.getTotal = function() {
      return this.upload + this.download;
    };

    User.prototype.addUpload = function(bytes) {
      return this.upload += bytes;
    };

    User.prototype.addDownload = function(bytes) {
      return this.download += bytes;
    };

    User.prototype.isBanned = function() {
      return config.banningRule(this);
    };

    return User;

  })();

  Users = (function() {

    function Users() {
      this.list = {};
    }

    Users.prototype.getUser = function(ip) {
      if (!(ip in this.list)) this.list[ip] = new User;
      return this.list[ip];
    };

    return Users;

  })();

  users = new Users;

  app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.compiler({
      src: __dirname + '/public',
      enable: ['less']
    }));
    app.use(app.router);
    return app.use(express.static(__dirname + '/public'));
  });

  app.configure('development', function() {
    return app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
  });

  app.configure('production', function() {
    return app.use(express.errorHandler());
  });

  netflowClient = dgram.createSocket("udp4");

  netflowClient.on("message", function(mesg, rinfo) {
    var bytes, flow, ip, packet, status, user, _i, _len, _ref, _results;
    try {
      packet = new NetflowPacket(mesg);
      if (packet.header.version === 5) {
        _ref = packet.v5Flows;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          flow = _ref[_i];
          if (flow.input === config.outboundInterface) {
            ip = flow.dstaddr[0] + "." + flow.dstaddr[1] + "." + flow.dstaddr[2] + "." + flow.dstaddr[3];
            status = "download";
            bytes = flow.dOctets;
          } else if (flow.output === config.outboundInterface) {
            ip = flow.srcaddr[0] + "." + flow.srcaddr[1] + "." + flow.srcaddr[2] + "." + flow.srcaddr[3];
            status = "upload";
            bytes = flow.dOctets;
          } else {
            continue;
          }
          if (!config.ipRule(ip)) continue;
          user = users.getUser(ip);
          switch (status) {
            case "upload":
              _results.push(user.addUpload(bytes));
              break;
            case "download":
              _results.push(user.addDownload(bytes));
              break;
            default:
              _results.push(void 0);
          }
        }
        return _results;
      }
    } catch (err) {
      return console.error(err);
    }
  });

  netflowClient.bind(config.netflowPort);

  app.get('/', function(req, res) {
    var remoteIp;
    remoteIp = req.connection.remoteAddress;
    if (config.ipRule(remoteIp)) {
      return res.redirect('/' + req.connection.remoteAddress);
    } else {
      return res.redirect('/category');
    }
  });

  app.get('/:ip', function(req, res) {
    var ip, user;
    ip = req.params.ip;
    if (!config.ipRule(ip)) res.redirect('/category');
    user = users.getUser(ip);
    return res.render('ip', {
      ip: ip,
      user: user
    });
  });

  app.listen(3000);

  console.log("✿ flower");

  console.log("* is listening on port %d for web server", app.address().port);

  console.log("* is listening on port %d for netflow client", netflowClient.address().port);

  console.log("* is running under %s environment", app.settings.env);

}).call(this);
