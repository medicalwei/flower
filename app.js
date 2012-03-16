
/*
✿ flower
2012 Yao Wei <mwei@lxde.org>
*/

(function() {
  var Collection, DailyCollection, Data, DataStorage, HourlyCollection, NetflowPacket, app, collection, config, cronJob, dataStorage, dateFormat, dgram, dummy, express, hourlyCollection, launch, loadDatabase, netflowClient, pg, setupCronJobs,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  config = require('./config');

  express = require('express');

  dgram = require('dgram');

  NetflowPacket = require('NetFlowPacket');

  cronJob = require('cron').CronJob;

  dateFormat = require('dateformat');

  pg = require('pg');

  app = module.exports = express.createServer();

  DataStorage = (function() {

    function DataStorage(databaseUri, callback) {
      this.db = new pg.Client(databaseUri);
      this.db.connect(callback);
    }

    DataStorage.prototype.upsertData = function(dailyCollection, hourlyCollection) {
      var dailyData, dailyDate, data, hourlyData, hourlyTime, ip, result;
      if (collection.rotated) {
        dailyData = collection.oldData;
        hourlyData = hourlyCollection.oldData;
        dailyDate = collection.oldDate;
        hourlyTime = hourlyCollection.oldTime;
      } else {
        dailyData = collection.data;
        hourlyData = hourlyCollection.data;
        dailyDate = collection.date;
        hourlyTime = hourlyCollection.time;
      }
      for (ip in dailyData) {
        data = dailyData[ip];
        result = this.db.query("SELECT upsert_daily($1, $2, $3, $4)", [ip, dailyDate, data.upload, data.download]);
      }
      for (ip in hourlyData) {
        data = hourlyData[ip];
        result = this.db.query("SELECT upsert_hourly($1, $2, $3, $4)", [ip, hourlyTime, data.upload, data.download]);
      }
      collection.deleteOld();
      return hourlyCollection.deleteOld();
    };

    DataStorage.prototype.getDataFromDate = function(date, callback) {
      return this.db.query("SELECT * FROM daily ORDER BY ip ASC WHERE date = $1", [date], callback);
    };

    DataStorage.prototype.getDataFromIP = function(ip, offset, limit, callback) {
      return this.db.query("SELECT * FROM daily WHERE ip = $1 ORDER BY date DESC OFFSET $2 LIMIT $3", [ip, offset, limit], callback);
    };

    DataStorage.prototype.getData = function(ip, date, callback) {
      return this.db.query("SELECT * FROM daily WHERE ip = $1 AND date = $2", [ip, date], callback);
    };

    DataStorage.prototype.getHourlyData = function(ip, offset, limit, callback) {
      return this.db.query("SELECT * FROM hourly WHERE ip = $1 ORDER BY time DESC OFFSET $2 LIMIT $3", [ip, offset, limit], callback);
    };

    DataStorage.prototype.getLatestDailyData = function(callback) {
      var date;
      date = new Date;
      date.setHours(0, 0, 0, 0);
      return this.db.query("SELECT * FROM daily WHERE date = $1", [date], callback);
    };

    DataStorage.prototype.getLatestHourlyData = function(callback) {
      var date;
      date = new Date;
      date.setMinutes(0, 0, 0);
      return this.db.query("SELECT * FROM hourly WHERE time = $1", [date], callback);
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

  Collection = (function() {

    function Collection() {
      this.data = {};
      this.rotated = false;
    }

    Collection.prototype.getIp = function(ip, createNew) {
      if (createNew == null) createNew = false;
      if (!(ip in this.data)) {
        if (createNew) {
          this.data[ip] = new Data;
        } else {
          return null;
        }
      }
      return this.data[ip];
    };

    Collection.prototype.rotate = function() {
      this.oldData = this.data;
      this.data = {};
      return this.rotated = true;
    };

    Collection.prototype.deleteOld = function() {
      this.rotated = false;
      return delete this.oldData;
    };

    return Collection;

  })();

  DailyCollection = (function(_super) {

    __extends(DailyCollection, _super);

    function DailyCollection() {
      var date;
      date = new Date;
      date.setHours(0, 0, 0, 0);
      DailyCollection.__super__.constructor.apply(this, arguments);
      this.date = date;
    }

    DailyCollection.prototype.rotate = function() {
      var date;
      date = new Date;
      date.setHours(0, 0, 0, 0);
      DailyCollection.__super__.rotate.apply(this, arguments);
      this.oldDate = this.date;
      return this.date = date;
    };

    DailyCollection.prototype.deleteOld = function() {
      DailyCollection.__super__.deleteOld.apply(this, arguments);
      return delete this.oldDate;
    };

    return DailyCollection;

  })(Collection);

  HourlyCollection = (function(_super) {

    __extends(HourlyCollection, _super);

    function HourlyCollection() {
      var time;
      time = new Date;
      time.setMinutes(0, 0, 0);
      HourlyCollection.__super__.constructor.apply(this, arguments);
      this.time = time;
    }

    HourlyCollection.prototype.rotate = function() {
      var time;
      time = new Date;
      time.setMinutes(0, 0, 0);
      HourlyCollection.__super__.rotate.apply(this, arguments);
      this.oldTime = this.time;
      return this.time = time;
    };

    HourlyCollection.prototype.deleteOld = function() {
      HourlyCollection.__super__.deleteOld.apply(this, arguments);
      return delete this.oldTime;
    };

    return HourlyCollection;

  })(Collection);

  collection = new DailyCollection;

  hourlyCollection = new HourlyCollection;

  if (app.settings.env === "development") {
    dummy = collection.getIp("127.0.0.1", true);
    dummy.upload = 123456789;
    dummy.download = 987654321;
  }

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
    var bytes, flow, hourlyIpData, ip, ipData, packet, status, _i, _len, _ref, _results;
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
          ipData = collection.getIp(ip, true);
          hourlyIpData = hourlyCollection.getIp(ip, true);
          switch (status) {
            case "upload":
              ipData.addUpload(bytes);
              _results.push(hourlyIpData.addUpload(bytes));
              break;
            case "download":
              ipData.addDownload(bytes);
              _results.push(hourlyIpData.addDownload(bytes));
              break;
            default:
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
    siteName: config.siteName
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
    ipData = collection.getIp(ip);
    if (ipData) {
      return dataStorage.getHourlyData(ip, 1, 29, function(error, data) {
        var historyPlot, hourlyIpData, row, time, _i, _len, _ref;
        historyPlot = [
          {
            label: 'Download',
            data: []
          }, {
            label: 'Upload',
            data: []
          }
        ];
        hourlyIpData = hourlyCollection.getIp(ip, true);
        _ref = data.rows;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          row = _ref[_i];
          time = row.time.getTime();
          historyPlot[0].data.push([time, row.download / 1048576]);
          historyPlot[1].data.push([time, row.upload / 1048576]);
        }
        time = hourlyCollection.time.getTime();
        historyPlot[0].data.push([time, hourlyIpData.download / 1048576]);
        historyPlot[1].data.push([time, hourlyIpData.upload / 1048576]);
        return res.render('ip', {
          ip: ip,
          ipData: ipData,
          historyPlot: historyPlot
        });
      });
    } else {
      return next();
    }
  });

  app.get('/:ip/log', function(req, res) {
    return res.render('log');
  });

  app.get('/:ip/log/:year/:month', function(req, res) {});

  app.get('/:ip/log/:year/:month/:day', function(req, res) {});

  setupCronJobs = function() {
    cronJob('0 0 0 * * *', function() {
      return collection.rotate();
    });
    cronJob('0 0 * * * *', function() {
      return hourlyCollection.rotate();
    });
    return cronJob('1 */10 * * * *', function() {
      dataStorage.upsertData(collection, hourlyCollection);
      return console.log("* data upserted");
    });
  };

  loadDatabase = function(callback) {
    var launchDate;
    launchDate = new Date;
    return dataStorage.getLatestDailyData(function(error, result) {
      var data, ip, _i, _len, _ref;
      _ref = result.rows;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        data = _ref[_i];
        ip = collection.getIp(data.ip, true);
        ip.upload = data.upload;
        ip.download = data.download;
      }
      return dataStorage.getLatestHourlyData(function(error, result) {
        var data, _j, _len2, _ref2;
        _ref2 = result.rows;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          data = _ref2[_j];
          ip = hourlyCollection.getIp(data.ip, true);
          ip.upload = data.upload;
          ip.download = data.download;
        }
        return callback();
      });
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

  dataStorage = new DataStorage(config.databaseUri);

  loadDatabase(launch);

}).call(this);
