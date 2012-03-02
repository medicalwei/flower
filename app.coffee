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
mongo = require 'mongodb'

app = module.exports = express.createServer()

# mongodb database

class DataStorage
  constructor: (host, port, callback) ->
    server = new mongo.Server host, port, {auto_reconnect: true}, {}
    @db = new mongo.Db 'flower', server
    @db.open callback
  getCollection: (callback) ->
    @db.collection 'history', (error, collection) ->
      if error 
        callback error
      else 
        callback null, collection
  upsertData: (dailyData, callback) ->
    @getCollection (error, collection) ->
      if error
        callback error
      else
        dateString = dateFormat dailyData.date, 'yyyy-mm-dd'
        for ip, ipData of dailyData.ips
          collection.update {date: dateString, ip: ip}, {date: dateString, ip: ip, data: ipData}, {upsert: true}
        callback null, collection
  getDataFromDate: (date, callback) ->
    @getCollection (error, collection) ->
      if error
        callback error
      else
        dateString = dateFormat date, 'yyyy-mm-dd'
        collection.find({date: dateString}).toArray(callback);
  getDataFromIP: (ip, callback) ->
    @getCollection (error, collection) ->
      if error
        callback error
      else
        collection.find({ip: ip}).toArray(callback);
  getData: (date, ip, callback) ->
    @getCollection (error, collection) ->
      if error
        callback error
      else
        dateString = dateFormat date, 'yyyy-mm-dd'
        collection.findOne({date: dateString, ip: ip}, callback);

# classes
            
class Data
  constructor: (data) ->
    if data
      @upload = data.upload
      @download = data.download
    else
      @upload = 0
      @download = 0
  getTotal: ->
    @upload + @download
  addUpload: (bytes) ->
    @upload += bytes
  addDownload: (bytes) ->
    @download += bytes
  getUploadString: ->
    (@upload/1048576).toFixed(2)
  getDownloadString: ->
    (@download/1048576).toFixed(2)
  getTotalString: ->
    (@getTotal()/1048576).toFixed(2)

class HourlyData
  constructor: (data) ->
    @hours = []
    if data
      for hour in [0..23]
        @hours[hour] = new Data data.hours[hour]
    else
      for hour in [0..23]
        @hours[hour] = new Data
  getPlotData: ->
    r=[{label: 'Download', data: []}, {label: 'Upload', data: []}]
    for hourData,hour in @hours
      r[0].data[hour] = [hour, hourData.download/1048576]
      r[1].data[hour] = [hour, hourData.upload/1048576]
    return r

class IpData extends Data
  constructor: (data) ->
    super data
    if data
      @hourlyData = new HourlyData data.hourlyData
    else
      @hourlyData = new HourlyData
  isBanned: ->
    config.banningRule this
  addUpload: (date, bytes) ->
    super bytes
    @hourlyData.hours[date.getHours()].addUpload(bytes)
  addDownload: (date, bytes) ->
    super bytes
    @hourlyData.hours[date.getHours()].addDownload(bytes)

class DailyData
  constructor: (date)->
    @ips = {}
    @date = date
  getIp: (ip, createNew=false) ->
    if not (ip of @ips)
      if createNew
        @ips[ip] = new IpData
      else
        return null
    @ips[ip]

class FlowData
  constructor: -> @days = {}
  getDate: (date, createNew=false) ->
    dateString = dateFormat date, 'yyyy-mm-dd'
    if not (dateString of @days)
      if createNew
        @days[dateString] = new DailyData(date)
      else
        return null
    @days[dateString]
  deleteDate: (date)->
    dateString = dateFormat date, 'yyyy-mm-dd'
    delete @days[dateString]

flowData = new FlowData

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
    date = new Date
    dailyData = flowData.getDate date, true
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
        ipData = dailyData.getIp ip, true
        switch status
          when "upload" then ipData.addUpload date, bytes
          when "download" then ipData.addDownload date, bytes

        # TODO: do banning in packet receiving event

  catch err
    console.error "* error receiving Netflow message: #{err}"

# cron jobs

setupCronJobs = ->

  # daily works
  cronJob '0 0 1 * * *', ->
    date = new Date
    date = date.setDate date.getDate()-1 # get last day
    flowData.deleteDate date
    console.log "* data at #{dateFormat date, "yyyy-mm-dd"} deleted from memory"

  # per 10 minute works
  cronJob '0 */10 * * * *', ->
    date = new Date
    date = date.setMinutes date.getMinutes()-1 # get last minute
    dataStorage.upsertData flowData.getDate(date), (error, collection)->
      if error
        console.error "* error on cron job: #{error}"
      else
        console.log "* data at #{dateFormat date, "yyyy-mm-dd HH:MM"} upserted to mongodb"

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
  date = new Date # assuming today if no prompt.
  if not config.ipRule ip
    res.redirect '/category'
    return
  ipData = flowData.getDate(date).getIp(ip)
  if ipData
    res.render 'ip', { ip: ip, ipData: ipData }
  else
    next()

app.get '/:ip/:year/:month', (req, res) ->
  res.render 'daily'

app.get '/:ip/:year/:month/:day', (req, res) ->
  res.render 'hourly'

# Restore values from database, and launch the system.

onDatabaseSetup = ->
  dataStorage.getCollection (error, collection) ->
    if not error
      collection.ensureIndex {ip: 1, date: -1}
  launchDate = new Date
  dataStorage.getDataFromDate launchDate, (error, data) ->
    # i think we should tolerant error here.
    if not error
      dailyData = flowData.getDate launchDate, true
      for ipData in data
        dailyData.ips[ipData.ip] = new IpData(ipData.data)

    # then launch
    launch()

launch = ->
  # begin cron jobs
  setupCronJobs()

  # start listening
  netflowClient.bind config.netflowPort
  app.listen config.httpPort
  console.log "✿ flower"
  console.log "* running under #{app.settings.env} environment"
  console.log "* listening on port #{app.address().port} for web server"
  console.log "* listening on port #{netflowClient.address().port} for netflow client"

# FIXME: The line below causes the big bang. Looks really dirty.
dataStorage = new DataStorage config.mongoHost, config.mongoPort, onDatabaseSetup
