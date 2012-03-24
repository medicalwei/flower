(function() {
  var Collection, DailyCollection, Data, DataStorage, HourlyCollection, config, dataStorage, pg,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  config = require('./config');

  pg = require('pg');

  DataStorage = (function() {

    function DataStorage(databaseUri, callback) {
      this.db = new pg.Client(databaseUri);
      this.db.connect(callback);
    }

    DataStorage.prototype.upsertDailyData = function(data, date) {
      var datum, ip, result, _results;
      _results = [];
      for (ip in data) {
        datum = data[ip];
        _results.push(result = this.db.query("SELECT upsert_daily($1, $2, $3, $4)", [ip, date, datum.upload, datum.download]));
      }
      return _results;
    };

    DataStorage.prototype.upsertHourlyData = function(data, date) {
      var ip, result, _results;
      _results = [];
      for (ip in data) {
        data = data[ip];
        _results.push(result = this.db.query("SELECT upsert_hourly($1, $2, $3, $4)", [ip, date, data.upload, data.download]));
      }
      return _results;
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

    function Collection(date) {
      this.data = {};
      this.rotated = false;
      this.date = date;
    }

    Collection.prototype.getIp = function(ip, createNew) {
      if (createNew == null) createNew = false;
      if (!(ip in this.data)) this.data[ip] = new Data;
      return this.data[ip];
    };

    Collection.prototype.setIp = function(ip, upload, download) {
      ip = this.getIp(ip, true);
      ip.upload = upload;
      ip.download = download;
      return ip;
    };

    Collection.prototype.rotate = function(date) {
      this.oldData = this.data;
      this.data = {};
      this.oldDate = this.date;
      this.date = date;
      return this.rotated = true;
    };

    Collection.prototype.deleteOld = function() {
      this.rotated = false;
      delete this.oldData;
      return delete this.oldDate;
    };

    return Collection;

  })();

  DailyCollection = (function(_super) {

    __extends(DailyCollection, _super);

    function DailyCollection(dataStorage) {
      var date;
      this.dataStorage = dataStorage;
      date = new Date;
      date.setHours(0, 0, 0, 0);
      DailyCollection.__super__.constructor.call(this, date);
    }

    DailyCollection.prototype.rotate = function() {
      var date;
      date = new Date;
      date.setHours(0, 0, 0, 0);
      return DailyCollection.__super__.rotate.call(this, date);
    };

    DailyCollection.prototype.save = function() {
      var data, date;
      if (collection.rotated) {
        data = this.oldData;
        date = this.oldDate;
      } else {
        data = this.data;
        date = this.date;
      }
      this.dataStorage.upsertDailyData(data, date);
      return collection.deleteOld();
    };

    DailyCollection.prototype.restore = function(callback) {
      return this.dataStorage.getLatestDailyData(function(error, result) {
        var data, ip, _i, _len, _ref;
        _ref = result.rows;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          data = _ref[_i];
          ip = this.setIp(data.ip, data.upload, data.download);
        }
        if (callback) return callback();
      });
    };

    return DailyCollection;

  })(Collection);

  HourlyCollection = (function(_super) {

    __extends(HourlyCollection, _super);

    function HourlyCollection(dataStorage) {
      var date;
      this.dataStorage = dataStorage;
      date = new Date;
      date.setMinutes(0, 0, 0);
      HourlyCollection.__super__.constructor.call(this, date);
    }

    HourlyCollection.prototype.rotate = function() {
      var date;
      date = new Date;
      date.setMinutes(0, 0, 0);
      return HourlyCollection.__super__.rotate.call(this, date);
    };

    HourlyCollection.prototype.save = function() {
      var data, date;
      if (collection.rotated) {
        data = this.oldData;
        date = this.oldDate;
      } else {
        data = this.data;
        date = this.date;
      }
      this.dataStorage.upsertHourlyData(data, date);
      return collection.deleteOld();
    };

    HourlyCollection.prototype.restore = function(callback) {
      return this.dataStorage.getLatestHourlyData(function(error, result) {
        var data, ip, _i, _len, _ref;
        _ref = result.rows;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          data = _ref[_i];
          ip = this.setIp(data.ip, data.upload, data.download);
        }
        if (callback) return callback();
      });
    };

    HourlyCollection.prototype.getHistoryPlot = function(ip, callback) {
      var hourlyIpData, time;
      hourlyIpData = this.getIp(ip);
      time = this.date.getTime();
      return this.dataStorage.getHourlyData(ip, 1, 29, function(error, data) {
        var historyPlot, row, _i, _len, _ref;
        historyPlot = [
          {
            label: 'Download',
            data: []
          }, {
            label: 'Upload',
            data: []
          }
        ];
        _ref = data.rows;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          row = _ref[_i];
          time = row.time.getTime();
          historyPlot[0].data.push([time, row.download / 1048576]);
          historyPlot[1].data.push([time, row.upload / 1048576]);
        }
        historyPlot[0].data.reverse();
        historyPlot[1].data.reverse();
        historyPlot[0].data.push([time, hourlyIpData.download / 1048576]);
        historyPlot[1].data.push([time, hourlyIpData.upload / 1048576]);
        return callback(historyPlot);
      });
    };

    return HourlyCollection;

  })(Collection);

  dataStorage = new DataStorage(config.databaseUri);

  exports.hourly = new HourlyCollection(dataStorage);

  exports.daily = new DailyCollection(dataStorage);

}).call(this);
