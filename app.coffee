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

class UserStorage
  constructor: (host, port) ->
    server = new mongo.Server host, port, {auto_reconnect: true}, {}
    @db = new mongo.Db 'flower', server
    @db.open ->
      # does nothing
  getCollection: (callback) ->
    @db.collection 'history', (error, collection) ->
      if error 
        callback error
      else 
        callback null, collection
  createData: (dailyData, callback) ->
    @getCollection (error, collection) ->
      if error
        callback error
      else
        # TODO

class Data
  constructor: ->
    @upload = 0
    @download = 0
  getUpload: ->
    @upload
  getDownload: ->
    @download
  getTotal: ->
    @upload + @download
  addUpload: (bytes) ->
    @upload += bytes
  addDownload: (bytes) ->
    @download += bytes

class HourlyData
  constructor: ->
    @hours = []
  getHour: (hour) ->
    if not (hour of @hours)
      @hours[hour] = new Data()
    @hours[hour]
  getHours: ->
    @hours

class IpData extends Data
  constructor: ->
    super
    @hourlyData = new HourlyData
  getHourlyData: ->
    @hourlyData
  isBanned: ->
    config.banningRule this
  addUpload: (date, bytes) ->
    super bytes
    @hourlyData.getHour(date.getHours()).addUpload(bytes)
  addDownload: (date, bytes) ->
    super bytes
    @hourlyData.getHour(date.getHours()).addDownload(bytes)

class DailyData
  constructor: (date)->
    @ips = {}
    @date = date
  getIp: (ip) ->
    if not (ip of @ips)
      @ips[ip] = new IpData
    @ips[ip]

class FlowData
  constructor: -> @days = {}
  getDate: (date) ->
    dateString = dateFormat date, 'yyyy-mm-dd'
    if not (dateString of @days)
      @days[dateString] = new DailyData(date)
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
  app.use express.compiler({ src: __dirname + '/public', enable: ['less'] })
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
    date = Date()
    dailyData = flowData.getDate(date)
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
        ip = dailyData.getIp ip
        switch status
          when "upload" then ip.addUpload date, bytes
          when "download" then ip.addDownload date, bytes

        # TODO: do banning in packet receiving event

  catch err
    console.error err

netflowClient.bind config.netflowPort

# cron job

cronJob '0 0 0 * * *', ->
  list = users.rotate()

# Routes

app.get '/', (req, res) ->
  remoteIp = req.connection.remoteAddress
  if config.ipRule remoteIp
    res.redirect '/'+req.connection.remoteAddress
  else
    res.redirect '/category'

app.get '/category', ->
  res.render 'categories'

app.get '/category/:category', ->
  res.render 'category'

app.get '/banned', ->
  res.render 'banned'

app.get '/:ip', (req, res) ->
  ip = req.params.ip
  date = Date() # assuming today if no prompt.
  if not config.ipRule ip
    res.redirect '/category'
    return
  ipData = flowData.getDate(date).getIp(ip)
  res.render 'ip', { ip: ip, data: ipData }

app.get '/:ip/:year/:month', ->
  res.render 'daily'

app.get '/:ip/:year/:month/:day', ->
  res.render 'hourly'

# Start listening

app.listen 3000
console.log "✿ flower"
console.log "* is listening on port %d for web server", app.address().port
console.log "* is listening on port %d for netflow client", netflowClient.address().port
console.log "* is running under %s environment", app.settings.env
