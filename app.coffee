###
✿ flower
2012 Yao Wei <mwei@lxde.org>
###

config = require './config'
express = require 'express'
dgram = require 'dgram'
NetflowPacket = require 'NetFlowPacket'

app = module.exports = express.createServer()

# Dummy data

data = {
         15399:
           {
             '127.0.0.1':
               {
                 upload: 1234325231
                 download: 2412533235
               }
           }
       }

banList = {
            '127.0.0.2':
              {
                days: 1
                since: 1330475702
              }
          }

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
  date = new Date;
  offset = date.getTimezoneOffset() * 60000
  epoch = (date.getTime() + offset) / 86400000
  try
    packet = new NetflowPacket mesg;
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
        data[epoch][ip][status] += bytes;
        # TODO: do banning in packet receiving event

  catch err
    console.error err

netflowClient.bind(config.netflowPort)

# Routes

app.get '/', (req, res) ->
  # TODO: check if the address is valid
  res.redirect '/'+req.connection.remoteAddress

# TODO: app.get '/category', routes.categories

# TODO: app.get '/category/:category', routes.category

# TODO: app.get '/banned', routes.banned

app.get '/:ip', (req, res) ->
  ip = req.params.ip
  if ip of data
    res.render 'ip', { ip: ip, data: data[ip] }

# TODO: app.get '/:ip/:year/:month', routes.ipHistoryPerDay

# TODO: app.get '/:ip/:year/:month/:day', routes.ipHistoryPerHours

# Start listening

app.listen 3000
console.log "✿ flower"
console.log "* is listening on port %d for web server", app.address().port
console.log "* is listening on port %d for netflow client", netflowClient.address().port
console.log "* is running under %s environment", app.settings.env