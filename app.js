
/*
✿ flower
2012 Yao Wei <mwei@lxde.org>
*/

(function() {
  var DailyData, Data, DataStorage, FlowData, HourlyData, IpData, NetflowPacket, app, config, cronJob, dataStorage, dateFormat, dgram, express, flowData, mongo, netflowClient, setupCronJobs,
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

  DataStorage = (function() {

    function DataStorage(host, port, callback) {
      var server;
      server = new mongo.Server(host, port, {
        auto_reconnect: true
      }, {});
      this.db = new mongo.Db('flower', server);
      this.db.open(callback);
    }

    DataStorage.prototype.getCollection = function(callback) {
      return this.db.collection('history', function(error, collection) {
        if (error) {
          return callback(error);
        } else {
          return callback(null, collection);
        }
      });
    };

    DataStorage.prototype.upsertData = function(dailyData, callback) {
      return this.getCollection(function(error, collection) {
        var dateString, ip, ipData, _ref;
        if (error) {
          return callback(error);
        } else {
          dateString = dateFormat(dailyData.date, 'yyyy-mm-dd');
          _ref = dailyData.ips;
          for (ip in _ref) {
            ipData = _ref[ip];
            collection.update({
              date: dateString,
              ip: ip
            }, {
              date: dateString,
              ip: ip,
              data: ipData
            }, {
              upsert: true
            });
          }
          return callback(null, collection);
        }
      });
    };

    DataStorage.prototype.getDataFromDate = function(date, callback) {
      return this.getCollection(function(error, collection) {
        var dateString;
        if (error) {
          return callback(error);
        } else {
          dateString = dateFormat(date, 'yyyy-mm-dd');
          return collection.find({
            date: dateString
          }).toArray(callback);
        }
      });
    };

    DataStorage.prototype.getDataFromIP = function(ip, callback) {
      return this.getCollection(function(error, collection) {
        if (error) {
          return callback(error);
        } else {
          return collection.find({
            ip: ip
          }).toArray(callback);
        }
      });
    };

    DataStorage.prototype.getData = function(date, ip, callback) {
      return this.getCollection(function(error, collection) {
        var dateString;
        if (error) {
          return callback(error);
        } else {
          dateString = dateFormat(date, 'yyyy-mm-dd');
          return collection.findOne({
            date: dateString,
            ip: ip
          }, callback);
        }
      });
    };

    return DataStorage;

  })();

  Data = (function() {

    function Data(data) {
      if (data) {
        this.upload = data.upload;
        this.download = data.download;
      } else {
        this.upload = 0;
        this.download = 0;
      }
    }

    Data.prototype.getTotal = function() {
      return this.upload + this.download;
    };

    Data.prototype.addUpload = function(bytes) {
      return this.upload += bytes;
    };

    Data.prototype.addDownload = function(bytes) {
      return this.download += bytes;
    };

    Data.prototype.getUploadString = function() {
      return (this.upload / 1048576).toFixed(2);
    };

    Data.prototype.getDownloadString = function() {
      return (this.download / 1048576).toFixed(2);
    };

    Data.prototype.getTotalString = function() {
      return (this.getTotal() / 1048576).toFixed(2);
    };

    return Data;

  })();

  HourlyData = (function() {

    function HourlyData(data) {
      var hour;
      this.hours = [];
      if (data) {
        for (hour = 0; hour <= 23; hour++) {
          this.hours[hour] = new Data(data.hours[hour]);
        }
      } else {
        for (hour = 0; hour <= 23; hour++) {
          this.hours[hour] = new Data;
        }
      }
    }

    HourlyData.prototype.getPlotData = function() {
      var hour, hourData, r, _len, _ref;
      r = [
        {
          label: 'download',
          data: []
        }, {
          label: 'upload',
          data: []
        }
      ];
      _ref = this.hours;
      for (hour = 0, _len = _ref.length; hour < _len; hour++) {
        hourData = _ref[hour];
        r[0].data[hour] = [hour, hourData.download / 1048576];
        r[1].data[hour] = [hour, hourData.upload / 1048576];
      }
      return r;
    };

    return HourlyData;

  })();

  IpData = (function(_super) {

    __extends(IpData, _super);

    function IpData(data) {
      IpData.__super__.constructor.call(this, data);
      if (data) {
        this.hourlyData = new HourlyData(data.hourlyData);
      } else {
        this.hourlyData = new HourlyData;
      }
    }

    IpData.prototype.isBanned = function() {
      return config.banningRule(this);
    };

    IpData.prototype.addUpload = function(date, bytes) {
      IpData.__super__.addUpload.call(this, bytes);
      return this.hourlyData.hours[date.getHours()].addUpload(bytes);
    };

    IpData.prototype.addDownload = function(date, bytes) {
      IpData.__super__.addDownload.call(this, bytes);
      return this.hourlyData.hours[date.getHours()].addDownload(bytes);
    };

    return IpData;

  })(Data);

  DailyData = (function() {

    function DailyData(date) {
      this.ips = {};
      this.date = date;
    }

    DailyData.prototype.getIp = function(ip, createNew) {
      if (createNew == null) createNew = false;
      if (!(ip in this.ips)) {
        if (createNew) {
          this.ips[ip] = new IpData;
        } else {
          return null;
        }
      }
      return this.ips[ip];
    };

    return DailyData;

  })();

  FlowData = (function() {

    function FlowData() {
      this.days = {};
    }

    FlowData.prototype.getDate = function(date, createNew) {
      var dateString;
      if (createNew == null) createNew = false;
      dateString = dateFormat(date, 'yyyy-mm-dd');
      if (!(dateString in this.days)) {
        if (createNew) {
          this.days[dateString] = new DailyData(date);
        } else {
          return null;
        }
      }
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
    var bytes, dailyData, date, flow, ip, ipData, packet, status, _i, _len, _ref, _results;
    try {
      packet = new NetflowPacket(mesg);
      date = new Date;
      dailyData = flowData.getDate(date, true);
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
          ipData = dailyData.getIp(ip, true);
          switch (status) {
            case "upload":
              _results.push(ipData.addUpload(date, bytes));
              break;
            case "download":
              _results.push(ipData.addDownload(date, bytes));
              break;
            default:
              _results.push(void 0);
          }
        }
        return _results;
      }
    } catch (err) {
      return console.error("* Error receiving Netflow message: " + err);
    }
  });

  setupCronJobs = function() {
    cronJob('0 0 1 * * *', function() {
      var date;
      date = new Date;
      date = date.setDate(date.getDate() - 1);
      flowData.deleteDate(date);
      return console.log("* Data at " + (dateFormat(date, "yyyy-mm-dd")) + " deleted from memory");
    });
    return cronJob('0 */6 * * * *', function() {
      var date;
      date = new Date;
      date = date.setMinutes(date.getMinutes() - 1);
      return dataStorage.upsertData(flowData.getDate(date), function(error, collection) {
        if (error) {
          return console.error("* Error on cron job: " + error);
        } else {
          return console.log("* Data at " + (dateFormat(date, "yyyy-mm-dd HH:MM")) + " upserted to mongodb");
        }
      });
    });
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

  app.get('/:ip', function(req, res) {
    var date, ip, ipData;
    ip = req.params.ip;
    date = new Date;
    if (!config.ipRule(ip)) {
      res.redirect('/category');
      return;
    }
    ipData = flowData.getDate(date).getIp(ip);
    return res.render('ip', {
      ip: ip,
      ipData: ipData
    });
  });

  app.get('/:ip/:year/:month', function(req, res) {
    return res.render('daily');
  });

  app.get('/:ip/:year/:month/:day', function(req, res) {
    return res.render('hourly');
  });

  dataStorage = new DataStorage(config.mongoHost, config.mongoPort, function() {
    var launchDate;
    launchDate = new Date;
    return dataStorage.getDataFromDate(launchDate, function(error, data) {
      var dailyData, ipData, _i, _len;
      if (!error) {
        dailyData = flowData.getDate(launchDate, true);
        for (_i = 0, _len = data.length; _i < _len; _i++) {
          ipData = data[_i];
          dailyData.ips[ipData.ip] = new IpData(ipData.data);
        }
      }
      netflowClient.bind(config.netflowPort);
      app.listen(config.httpPort);
      console.log("✿ flower");
      console.log("* is listening on port " + (app.address().port) + " for web server");
      console.log("* is listening on port " + (netflowClient.address().port) + " for netflow client");
      console.log("* is running under " + app.settings.env + " environment");
      return setupCronJobs();
    });
  });

}).call(this);
