
/*
✿ flower
2012 Yao Wei <mwei@lxde.org>
*/

(function() {
  var DailyData, Data, FlowData, HourlyData, IpData, NetflowPacket, UserStorage, app, config, cronJob, dateFormat, dgram, express, flowData, mongo, netflowClient,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  config = require('./config');

  express = require('express');

  dgram = require('dgram');

  NetflowPacket = require('NetFlowPacket');

  cronJob = require('cron').CronJob;

  dateFormat = require('dateformat');

  mongo = require('mongodb');

  app = module.exports = express.createServer();

  UserStorage = (function() {

    function UserStorage(host, port) {
      var server;
      server = new mongo.Server(host, port, {
        auto_reconnect: true
      }, {});
      this.db = new mongo.Db('flower', server);
      this.db.open(function() {});
    }

    UserStorage.prototype.getCollection = function(callback) {
      return this.db.collection('history', function(error, collection) {
        if (error) {
          return callback(error);
        } else {
          return callback(null, collection);
        }
      });
    };

    UserStorage.prototype.createData = function(dailyData, callback) {
      return this.getCollection(function(error, collection) {
        if (error) {
          return callback(error);
        } else {

        }
      });
    };

    return UserStorage;

  })();

  Data = (function() {

    function Data() {
      this.upload = 0;
      this.download = 0;
    }

    Data.prototype.getUpload = function() {
      return this.upload;
    };

    Data.prototype.getDownload = function() {
      return this.download;
    };

    Data.prototype.getTotal = function() {
      return this.upload + this.download;
    };

    Data.prototype.addUpload = function(bytes) {
      return this.upload += bytes;
    };

    Data.prototype.addDownload = function(bytes) {
      return this.download += bytes;
    };

    return Data;

  })();

  HourlyData = (function() {

    function HourlyData() {
      this.hours = [];
    }

    HourlyData.prototype.getHour = function(hour) {
      if (!(hour in this.hours)) this.hours[hour] = new Data();
      return this.hours[hour];
    };

    HourlyData.prototype.getHours = function() {
      return this.hours;
    };

    return HourlyData;

  })();

  IpData = (function(_super) {

    __extends(IpData, _super);

    function IpData() {
      IpData.__super__.constructor.apply(this, arguments);
      this.hourlyData = new HourlyData;
    }

    IpData.prototype.getHourlyData = function() {
      return this.hourlyData;
    };

    IpData.prototype.isBanned = function() {
      return config.banningRule(this);
    };

    IpData.prototype.addUpload = function(date, bytes) {
      IpData.__super__.addUpload.call(this, bytes);
      return this.hourlyData.getHour(date.getHours()).addUpload(bytes);
    };

    IpData.prototype.addDownload = function(date, bytes) {
      IpData.__super__.addDownload.call(this, bytes);
      return this.hourlyData.getHour(date.getHours()).addDownload(bytes);
    };

    return IpData;

  })(Data);

  DailyData = (function() {

    function DailyData(date) {
      this.ips = {};
      this.date = date;
    }

    DailyData.prototype.getIp = function(ip) {
      if (!(ip in this.ips)) this.ips[ip] = new IpData;
      return this.ips[ip];
    };

    return DailyData;

  })();

  FlowData = (function() {

    function FlowData() {
      this.days = {};
    }

    FlowData.prototype.getDate = function(date) {
      var dateString;
      dateString = dateFormat(date, 'yyyy-mm-dd');
      if (!(dateString in this.days)) this.days[dateString] = new DailyData(date);
      return this.days[dateString];
    };

    FlowData.prototype.deleteDate = function(date) {
      var dateString;
      dateString = dateFormat(date, 'yyyy-mm-dd');
      return delete this.days[dateString];
    };

    return FlowData;

  })();

  flowData = new FlowData;

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
    var bytes, dailyData, date, flow, ip, packet, status, _i, _len, _ref, _results;
    try {
      packet = new NetflowPacket(mesg);
      date = Date();
      dailyData = flowData.getDate(date);
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
          ip = dailyData.getIp(ip);
          switch (status) {
            case "upload":
              _results.push(ip.addUpload(date, bytes));
              break;
            case "download":
              _results.push(ip.addDownload(date, bytes));
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

  cronJob('0 0 0 * * *', function() {
    var list;
    return list = users.rotate();
  });

  app.get('/', function(req, res) {
    var remoteIp;
    remoteIp = req.connection.remoteAddress;
    if (config.ipRule(remoteIp)) {
      return res.redirect('/' + req.connection.remoteAddress);
    } else {
      return res.redirect('/category');
    }
  });

  app.get('/category', function() {
    return res.render('categories');
  });

  app.get('/category/:category', function() {
    return res.render('category');
  });

  app.get('/banned', function() {
    return res.render('banned');
  });

  app.get('/:ip', function(req, res) {
    var date, ip, ipData;
    ip = req.params.ip;
    date = Date();
    if (!config.ipRule(ip)) {
      res.redirect('/category');
      return;
    }
    ipData = flowData.getDate(date).getIp(ip);
    return res.render('ip', {
      ip: ip,
      data: ipData
    });
  });

  app.get('/:ip/:year/:month', function() {
    return res.render('daily');
  });

  app.get('/:ip/:year/:month/:day', function() {
    return res.render('hourly');
  });

  app.listen(3000);

  console.log("✿ flower");

  console.log("* is listening on port %d for web server", app.address().port);

  console.log("* is listening on port %d for netflow client", netflowClient.address().port);

  console.log("* is running under %s environment", app.settings.env);

}).call(this);
