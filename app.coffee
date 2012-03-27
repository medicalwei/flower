###
✿ flower
2012 Yao Wei <mwei@lxde.org>
###

config = require './config'
express = require 'express'
dgram = require 'dgram'
NetflowPacket = require 'NetFlowPacket'
app = module.exports = express.createServer()
model = require './model'
cronJob = require('cron').CronJob
io = require('socket.io').listen(app)
 
# Configuration

app.configure ->
  app.set 'views', __dirname + '/views'
  app.set 'view engine', 'jade'
  app.use express.bodyParser()
  app.use express.methodOverride()
  app.use app.router
  app.use express.static(__dirname + '/public')

# add dummy data on development mode
app.configure 'development', ->
  app.use express.errorHandler({ dumpExceptions: true, showStack: true })
  dummy = model.daily.getIp "127.0.0.1"
  dummy.upload   = 123456789
  dummy.download = 987654321

app.configure 'production', ->
  app.use express.errorHandler()


# socket.io processes
pushingIps = {}
io.sockets.on 'connection', (socket) ->
  socket.emit 'ready'
  socket.on 'set ip', (data) ->
    if config.ipRule data.ip
      socket.set 'ip', data.ip, ->
        pushingIps[data.ip] = socket
  socket.on 'update graph', ->
    socket.get 'ip', (error, ip) ->
      model.hourly.getHistoryPlot ip, (historyPlot) ->
        socket.emit 'graph update', historyPlot
  socket.on 'disconnect', ->
    socket.get 'ip', (error, ip) ->
      delete pushingIps[ip] if ip in pushingIps

# Packet receiving event
netflowClient = dgram.createSocket "udp4"
netflowClient.on "message", (mesg, rinfo) ->
  try
    packet = new NetflowPacket mesg
    if packet.header.version == 5
      updatedIps = {}
      for flow in packet.v5Flows
        if flow.input == config.outboundInterface
          # this flow means download
          ip = "#{flow.dstaddr[0]}.#{flow.dstaddr[1]}.#{flow.dstaddr[2]}.#{flow.dstaddr[3]}"
          status = "download"
          bytes = flow.dOctets
        else if flow.output == config.outboundInterface
          # this flow means upload
          ip = "#{flow.srcaddr[0]}.#{flow.srcaddr[1]}.#{flow.srcaddr[2]}.#{flow.srcaddr[3]}"
          status = "upload"
          bytes = flow.dOctets
        else
          # not interested
          continue

        continue if not config.ipRule ip

        ipData = model.daily.getIp ip
        hourlyIpData = model.hourly.getIp ip
        switch status
          when "upload"
            ipData.addUpload bytes
            hourlyIpData.addUpload bytes
          when "download"
            ipData.addDownload bytes
            hourlyIpData.addDownload bytes

        updatedIps[ip] = 1

        # TODO: do banning in packet receiving event

      for ip of pushingIps
        if ip of updatedIps
          pushingIps[ip].volatile.emit 'update', model.daily.getIp(ip)

  catch err
    console.error "* error receiving Netflow message: #{err}"

# Some global variables used for view
global.views = {
  siteName: config.siteName
  siteUri: config.siteUri
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

  ipData = model.daily.getIp ip

  model.hourly.getHistoryPlot ip, (historyPlot) ->
    res.render 'ip', { ip: ip, ipData: ipData, historyPlot: historyPlot }

app.get '/:ip/log', (req, res) ->
  res.render 'log'

app.get '/:ip/log/:year/:month', (req, res) ->
  # get from a single month.

app.get '/:ip/log/:year/:month/:day', (req, res) ->
  # get from a single day.
    
# Restore values from database, and launch the system.
loadDatabase = (callback)->
  model.daily.restore ->
    model.hourly.restore ->
      callback()

setupCronJobs = ->
  cronJob '0 0 0 * * *', ->
    model.daily.rotate()
  cronJob '0 0 * * * *', ->
    model.hourly.rotate()
  cronJob '1 */10 * * * *', ->
    model.daily.save()
    model.hourly.save()
    console.log "* data upserted"

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
loadDatabase launch

