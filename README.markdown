✿ flower — Netflow viewer
==========================

This package is based on Sghazzawi's [Node-Netflowd](https://github.com/Sghazzawi/Node-Netflowd),
and is intended to replace National Taiwan Ocean University's dormitory
flow viewer.

Design
------
* Gathers all Netflow packets and updates on-the-fly.
* TODO: Trigger to deal with banned users.
* For an interval (1 hour), the system writes the data to mongodb
  database.
* TODO: The user can check the usage history in daily and hourly
  perspective.
* TODO: The usage log can be deleted after a long period.
* TODO: API support for external program.

Prerequisities
--------------
* A Cisco router (or compatible one) which can output Netflow packet v5
  format.
* node.js with npm (nvm for rescue)

Up and running
--------------
* TODO: should install NetFlowPacket first
* npm install
* cp config.example.js config.js
* edit config.js
* node app

It is prefered to use `forever` to run for a long period.
