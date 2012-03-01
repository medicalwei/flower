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
  constructor: (host, port) ->
    server = new mongo.Server host, port, {auto_reconnect: true}, {}
    @db = new mongo.Db 'flower', server
    @db.open -> # does nothing
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

dataStorage = new DataStorage(config.mongoHost, config.mongoPort)

# classes
            
class Data
  constructor: ->
    @upload = 0
    @download = 0
  getTotal: ->
    @upload + @download
  addUpload: (bytes) ->
    @upload += bytes
  addDownload: (bytes) ->
    @download += bytes
  getUploadString: ->
    (@upload/1048576).toPrecision(2)
  getDownloadString: ->
    (@download/1048576).toPrecision(2)
  getTotalString: ->
    (@getTotal()/1048576).toPrecision(2)

class HourlyData
  constructor: ->
    @hours = []
    for hour in [0..23]
      @hours[hour] = new Data()

class IpData extends Data
  constructor: ->
    super
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
    date = new Date()
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
    console.error "* Error receiving Netflow message: #{err}"

netflowClient.bind config.netflowPort

# cron jobs

# daily works
cronJob '0 0 1 * * *', ->
  date = new Date()
  date = date.setDate date.getDate()-1 # get last day
  flowData.deleteDate date
  console.log "* Data at #{dateFormat date, "yyyy-mm-dd"} deleted from memory"

# hourly works
cronJob '0 5 * * * *', ->
  date = new Date()
  date = date.setHours date.getHours()-1 # get last hour
  dataStorage.upsertData flowData.getDate(date), (error, collection)->
    if error
      console.error "* Error on cron job: #{error}"
    else
      console.log "* Data at #{dateFormat date, "yyyy-mm-dd/HH"} upserted to mongodb"

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

app.get '/:ip', (req, res) ->
  ip = req.params.ip
  date = Date() # assuming today if no prompt.
  if not config.ipRule ip
    res.redirect '/category'
    return
  ipData = flowData.getDate(date).getIp(ip)
  res.render 'ip', { ip: ip, ipData: ipData }

app.get '/:ip/:year/:month', (req, res) ->
  res.render 'daily'

app.get '/:ip/:year/:month/:day', (req, res) ->
  res.render 'hourly'

# Start listening

app.listen 3000
console.log "✿ flower"
console.log "* is listening on port #{app.address().port} for web server"
console.log "* is listening on port #{netflowClient.address().port} for netflow client"
console.log "* is running under #{app.settings.env} environment"
