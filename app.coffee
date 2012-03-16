###
✿ flower
2012 Yao Wei <mwei@lxde.org>
###

config = require './config'
express = require 'express'
dgram = require 'dgram'
NetflowPacket = require 'NetFlowPacket'
cronJob = require('cron').CronJob
dateFormat = require 'dateformat'
pg = require 'pg'

app = module.exports = express.createServer()
 
# postgresql database
# TODO
class DataStorage
  constructor: (databaseUri, callback) ->
    @db = new pg.Client(databaseUri)
    @db.connect callback
  upsertData: (dailyCollection, hourlyCollection) ->
    #TODO
    if collection.rotated
      dailyData = collection.oldData
      hourlyData = hourlyCollection.oldData
      dailyDate = collection.oldDate
      hourlyTime = hourlyCollection.oldTime
    else
      dailyData = collection.data
      hourlyData = hourlyCollection.data
      dailyDate = collection.date
      hourlyTime = hourlyCollection.time

    for ip, data of dailyData
      result = @db.query "SELECT upsert_daily($1, $2, $3, $4)",
        [ip, dailyDate, data.upload, data.download]

    for ip, data of hourlyData
      result = @db.query "SELECT upsert_hourly($1, $2, $3, $4)",
        [ip, hourlyTime, data.upload, data.download]

    collection.deleteOld()
    hourlyCollection.deleteOld()
    
  getDataFromDate: (date, callback) ->
    @db.query "SELECT * FROM daily ORDER BY ip ASC WHERE date = $1", [date], callback
  getDataFromIP: (ip, offset, limit, callback) ->
    @db.query "SELECT * FROM daily WHERE ip = $1 ORDER BY date DESC OFFSET $2 LIMIT $3", [ip, offset, limit], callback
  getData: (ip, date, callback) ->
    @db.query "SELECT * FROM daily WHERE ip = $1 AND date = $2", [ip, date], callback
  getHourlyData: (ip, offset, limit, callback) ->
    @db.query "SELECT * FROM hourly WHERE ip = $1 ORDER BY time DESC OFFSET $2 LIMIT $3", [ip, offset, limit], callback
  getLatestDailyData: (callback) ->
    date = new Date
    date.setHours(0,0,0,0)
    @db.query "SELECT * FROM daily WHERE date = $1", [date], callback
  getLatestHourlyData: (callback) ->
    date = new Date
    date.setMinutes(0,0,0)
    @db.query "SELECT * FROM hourly WHERE time = $1", [date], callback


# classes
            
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
  constructor: ->
    @data = {}
    @rotated = false;
  getIp: (ip, createNew=false) ->
    if not (ip of @data)
      if createNew
        @data[ip] = new Data
      else
        return null
    return @data[ip]
  rotate: ->
    @oldData = @data
    @data = {}
    @rotated = true
  deleteOld: ->
    @rotated = false
    delete @oldData

class DailyCollection extends Collection
  constructor: ->
    date = new Date
    date.setHours(0,0,0,0)
    super
    @date = date
  rotate: ->
    date = new Date
    date.setHours(0,0,0,0)
    super
    @oldDate = @date
    @date = date
  deleteOld: ->
    super
    delete @oldDate

class HourlyCollection extends Collection
  constructor: ->
    time = new Date
    time.setMinutes(0,0,0)
    super
    @time = time
  rotate: ->
    time = new Date
    time.setMinutes(0,0,0)
    super
    @oldTime = @time
    @time = time
  deleteOld: ->
    super
    delete @oldTime

collection = new DailyCollection
hourlyCollection = new HourlyCollection

if app.settings.env == "development"
  dummy = collection.getIp("127.0.0.1", true)
  dummy.upload   = 123456789
  dummy.download = 987654321

# Configuration

app.configure ->
  app.set 'views', __dirname + '/views'
  app.set 'view engine', 'jade'
  app.use express.bodyParser()
  app.use express.methodOverride()
  app.use app.router
  app.use express.static(__dirname + '/public')

app.configure 'development', ->
  app.use express.errorHandler({ dumpExceptions: true, showStack: true })

app.configure 'production', ->
  app.use express.errorHandler()

# Packet receiving event

netflowClient = dgram.createSocket "udp4"

netflowClient.on "message", (mesg, rinfo) ->
  try
    packet = new NetflowPacket mesg
    if packet.header.version == 5
      for flow in packet.v5Flows
        if flow.input == config.outboundInterface
          # this flow means download
          ip = flow.dstaddr[0] + "." +
               flow.dstaddr[1] + "." +
               flow.dstaddr[2] + "." +
               flow.dstaddr[3]
          status = "download"
          bytes = flow.dOctets
        else if flow.output == config.outboundInterface
          # this flow means upload
          ip = flow.srcaddr[0] + "." +
               flow.srcaddr[1] + "." +
               flow.srcaddr[2] + "." +
               flow.srcaddr[3]
          status = "upload"
          bytes = flow.dOctets
        else
          # not interested
          continue

        continue if not config.ipRule ip

        ipData = collection.getIp ip, true
        hourlyIpData = hourlyCollection.getIp ip, true
        switch status
          when "upload"
            ipData.addUpload bytes
            hourlyIpData.addUpload bytes
          when "download"
            ipData.addDownload bytes
            hourlyIpData.addDownload bytes

        # TODO: do banning in packet receiving event

  catch err
    console.error "* error receiving Netflow message: #{err}"


# Some global variables used for view

global.views = {
  siteName: config.siteName
  # TODO sidebar: 
}

# Routes

app.get '/', (req, res) ->
  remoteIp = req.connection.remoteAddress
  if config.ipRule remoteIp
    res.redirect '/'+req.connection.remoteAddress
  else
    res.redirect '/category'

app.get '/category', (req, res) ->
  res.render 'categories'

app.get '/category/:category', (req, res) ->
  res.render 'category'

app.get '/banned', (req, res) ->
  res.render 'banned'

app.get '/:ip', (req, res, next) ->
  ip = req.params.ip
  if not config.ipRule ip
    res.redirect '/category'
    return
  ipData = collection.getIp ip

  if ipData
    dataStorage.getHourlyData ip, 1, 29, (error, data) ->
      historyPlot=[{label: 'Download', data: []}, {label: 'Upload', data: []}]
      hourlyIpData = hourlyCollection.getIp ip, true # tolerant here
      for row in data.rows
        time = row.time.getTime();
        historyPlot[0].data.push [time, row.download/1048576]
        historyPlot[1].data.push [time, row.upload/1048576]
      time = hourlyCollection.time.getTime();
      historyPlot[0].data.push [time, hourlyIpData.download/1048576]
      historyPlot[1].data.push [time, hourlyIpData.upload/1048576]
      
      res.render 'ip', { ip: ip, ipData: ipData, historyPlot: historyPlot }
  else
    next()

app.get '/:ip/log', (req, res) ->
  res.render 'log'

app.get '/:ip/log/:year/:month', (req, res) ->
  # get from a single month.

app.get '/:ip/log/:year/:month/:day', (req, res) ->
  # get from a single day.

# cron jobs
setupCronJobs = ->

  # daily works
  cronJob '0 0 0 * * *', ->
    collection.rotate()
    
  # hourly works
  cronJob '0 0 * * * *', ->
    hourlyCollection.rotate()

  # per 10 minute works
  cronJob '0 2,12,22,32,42,52 * * * *', ->
    dataStorage.upsertData collection, hourlyCollection
    console.log "* data upserted"

# Restore values from database, and launch the system.
loadDatabase = (callback)->
  launchDate = new Date
  dataStorage.getLatestDailyData (error, result) ->
    for data in result.rows
      ip = collection.getIp data.ip, true
      ip.upload = data.upload
      ip.download = data.download

    dataStorage.getLatestHourlyData (error, result) ->
      for data in result.rows
        ip = hourlyCollection.getIp data.ip, true
        ip.upload = data.upload
        ip.download = data.download

      # then call callback
      callback()

launch = -> 
  # start cron jobs
  setupCronJobs()
  
  # start listening
  netflowClient.bind config.netflowPort
  app.listen config.httpPort
  console.log "✿ flower"
  console.log "* running under #{app.settings.env} environment"
  console.log "* listening on port #{app.address().port} for web server"
  console.log "* listening on port #{netflowClient.address().port} for netflow client"
  
# ready, set, go!
dataStorage = new DataStorage(config.databaseUri)
loadDatabase launch

