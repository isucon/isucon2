#!/usr/bin/env node
var async = require('async');

var starter = require('./lib/starter'),
    checker = require('./lib/checker'),
    buyer = require('./lib/buyer'),
    httpload = require('./lib/httpload');

// process.argv: node bench.js subcommand PARALLELS SECONDS TARGET_IP TARGET_PORT TARGET_ARTIST_ID TARGET_TICKET_ID
var subcommand = process.argv[2],
    parallels = parseInt(process.argv[3]),
    seconds = parseInt(process.argv[4]),
    target_ip = process.argv[5],
    target_port = parseInt(process.argv[6]),
    target_artist = parseInt(process.argv[7]),
    target_ticket = parseInt(process.argv[8]);

var DEFAULT_STARTER_HTTP_TIMEOUTS = {get:15, post:60};
var DEFAULT_HTTP_TIMEOUTS = {get:15, post:60};

var agent;
var error;
if (subcommand === 'starter') { /* init-check-and-init */
  agent = starter.agent({timeout:DEFAULT_STARTER_HTTP_TIMEOUTS});
}
else if (subcommand === 'httpload') { /* http_load agent */
  agent = httpload.agent({timeout:DEFAULT_HTTP_TIMEOUTS, parallels:parallels});
  var killed = function(){
    agent.killed();
    setTimeout(function(){
      process.exit(1);
    });
  };
  process.on('SIGHUP', killed);
  process.on('SIGTERM', killed);
  process.on('SIGINT', killed);
}
else if (subcommand === 'buyer') { /* ticket buyer transaction workers */
  agent = buyer.agent({timeout:DEFAULT_HTTP_TIMEOUTS, parallels:parallels});
}
else if (subcommand === 'checker') { /* ticket buyer and checker */
  agent = checker.agent({timeout:DEFAULT_HTTP_TIMEOUTS});
}
else {
  error = 'unknown bench subcommand:' + subcommand;
}

if (error) {
  console.log(JSON.stringify({err:error}));
  process.exit(1);
}

if (agent && /^(\d{1,3}\.){3}\d{1,3}$/.exec(target_ip) && target_port > 0) {
  /* NOTHING TO DO: valid target (or subcommand error) */
}
else {
  error = 'target_ip and/or target_port invalid ' + target_ip + ':' + target_port;
}

if (error) {
  console.log(JSON.stringify({type:'invalid options',name:subcommand,err:error}));
  process.exit(1);
}

process.on('uncaughtException', function(err) {
  console.log(JSON.stringify({type:'uncaughtException',name:subcommand,err:err}));
  process.exit(2);
});

var watcher = false;
setInterval(function(){ if (watcher) { process.exit(0); return; } }, 500);
setTimeout(function(){
  console.log(JSON.stringify({type:'timeout',name:subcommand,err:'benchmark command timeout!'}));
  process.exit(1);
}, (seconds + 1) * 1000);

agent.execute(target_ip, target_port, target_artist, target_ticket, seconds, function(err, result){
  console.log(JSON.stringify({name:subcommand,err:err, result:result}, null, ' '));
  watcher = true;
});
