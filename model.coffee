config = require './config'
pg = require 'pg'

class DataStorage
  constructor: (databaseUri, callback) ->
    @db = new pg.Client(databaseUri)
    @db.connect callback
  upsertDailyData: (data, date) ->
    for ip, datum of data
      result = @db.query "SELECT upsert_daily($1, $2, $3, $4)",
        [ip, date, datum.upload, datum.download]

  upsertHourlyData: (data, date) ->
    for ip, datum of data
      result = @db.query "SELECT upsert_hourly($1, $2, $3, $4)",
        [ip, date, datum.upload, datum.download]
    
  getDataFromDate: (date, callback) ->
    @db.query "SELECT * FROM daily ORDER BY ip ASC WHERE date = $1", [date], callback

  getDataFromIP: (ip, since, offset, callback) ->
    @db.query "SELECT * FROM daily WHERE ip = $1 AND date >= $2 ORDER BY date DESC OFFSET $3", [ip, since, offset], callback

  getData: (ip, date, callback) ->
    @db.query "SELECT * FROM daily WHERE ip = $1 AND date = $2", [ip, date], callback

  getHourlyData: (ip, since, offset, callback) ->
    @db.query "SELECT * FROM hourly WHERE ip = $1 AND time >= $2 ORDER BY time DESC OFFSET $3", [ip, since, offset], callback

  getLatestDailyData: (callback) ->
    date = new Date
    date.setHours(0,0,0,0)
    @db.query "SELECT * FROM daily WHERE date = $1", [date], callback

  getLatestHourlyData: (callback) ->
    date = new Date
    date.setMinutes(0,0,0)
    @db.query "SELECT * FROM hourly WHERE time = $1", [date], callback

class Data
  constructor: (data) ->
    if data
      @upload = data.upload
      @download = data.download
    else
      @upload = 0
      @download = 0
  getTotal: -> @upload + @download
  addUpload: (bytes) -> @upload += bytes
  addDownload: (bytes) -> @download += bytes
  getUploadString: -> (@upload/1048576).toFixed(2)
  getDownloadString: -> (@download/1048576).toFixed(2)
  getTotalString: -> (@getTotal()/1048576).toFixed(2)

class Collection
  constructor: (date) ->
    @data = {}
    @rotated = false
    @date = date

  getIp: (ip, createNew=false) ->
    if not (ip of @data)
      @data[ip] = new Data
    return @data[ip]

  setIp: (ip, upload, download) ->
    ip = @getIp ip, true
    ip.upload = upload
    ip.download = download
    return ip

  rotate: (date) ->
    @oldData = @data
    @data = {}
    @oldDate = @date
    @date = date
    @rotated = true

  deleteOld: ->
    @rotated = false
    delete @oldData
    delete @oldDate

class DailyCollection extends Collection
  constructor: (@dataStorage)->
    date = new Date
    date.setHours(0,0,0,0)
    super date

  rotate: ->
    date = new Date
    date.setHours(0,0,0,0)
    super date

  save: ->
    if @rotated
      data = @oldData
      date = @oldDate
    else
      data = @data
      date = @date
    @dataStorage.upsertDailyData data, date
    @deleteOld()

  restore: (callback) ->
    @dataStorage.getLatestDailyData (error, result) ->
      ip = @setIp data.ip, data.upload, data.download for data in result.rows
      callback() if callback

class HourlyCollection extends Collection
  constructor: (@dataStorage)->
    date = new Date
    date.setMinutes(0,0,0)
    super date

  rotate: ->
    date = new Date
    date.setMinutes(0,0,0)
    super date

  save: ->
    if @rotated
      data = @oldData
      date = @oldDate
    else
      data = @data
      date = @date
    @dataStorage.upsertHourlyData data, date
    @deleteOld()

  restore: (callback) ->
    @dataStorage.getLatestHourlyData (error, result) ->
      ip = @setIp data.ip, data.upload, data.download for data in result.rows
      callback() if callback

  getHistoryPlot: (ip, callback)->
    hourlyIpData = @getIp ip
    time = @date.getTime()
    since = new Date(time - 86400000)

    @dataStorage.getHourlyData ip, since, 1, (error, data) ->
      historyPlot=[{label: 'Download', data: []}, {label: 'Upload', data: []}]
      for row in data.rows
        time = row.time.getTime()
        historyPlot[0].data.push [time, row.download/1048576]
        historyPlot[1].data.push [time, row.upload/1048576]

      # reverse the array to get the corrected order
      historyPlot[0].data.reverse()
      historyPlot[1].data.reverse()

      historyPlot[0].data.push [time, hourlyIpData.download/1048576]
      historyPlot[1].data.push [time, hourlyIpData.upload/1048576]

      callback (historyPlot)

dataStorage = new DataStorage config.databaseUri
exports.hourly = new HourlyCollection dataStorage
exports.daily = new DailyCollection dataStorage

