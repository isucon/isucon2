var async = require('async'),
    fs = require('fs'),
    http = require('http'),
    child = require('child_process');

http.globalAgent.maxSockets = 30;

var express = require('express'),
    app = express();

var config = JSON.parse(fs.readFileSync(__dirname + '/agent.json'));

var BENCH_AGENT_PING_STARTING = 2000,
    BENCH_AGENT_PING_INTERVAL = 5000;

// app.use(express.logger());
app.use(express.bodyParser()); /* json, urlencoded, multipart */
app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

var maxSlots = {primary:config.slots.primary, secondary:config.slots.secondary};
var slots = {primary:config.slots.primary, secondary:config.slots.secondary};

app.get('/status', function(req, res){ /* returns slot status */
  res.json(slots);
}); 

function command(subcmd, parallels, seconds, ip, port, artist, ticket) {
  return ['node bench.js', subcmd, parallels, seconds, ip, port, artist, ticket].join(' ');
};

function execSubCommand(subcmd, params, callback) {
  var parallels = params.parallels,
      seconds = params.seconds,
      ip = params.ip,
      port = params.port,
      artist = params.artist,
      ticket = params.ticket;
  var p = child.exec(
    command(subcmd, parallels, seconds, ip, port, artist, ticket),
    { maxBuffer: 1000 * 1024 },
    function(err, stdout, stderr){
      if (err) {
        // JSON.stringify([Error] object) is drop 'message' attribute...
        var error = {message:'agent bench command execute error, code:' + err.code};
        callback({err:error});
        return;
      }
      if (stderr && stderr.length > 0) {
        console.log(JSON.stringify({
          date: (new Date()),
          param: {subcmd:subcmd,parallels:parallels,seconds:seconds},
          target: {ip:ip,port:port,artist:artist,ticket:ticket},
          stdout:stdout,
          stderr:stderr
        }, null, ' '));
      }
      callback(JSON.parse(stdout));
    }
  );
  return p;
};

function getSlot() {
  if (slots.primary > 0) {
    slots.primary -= 1;
    return true;
  }
  if (slots.secondary > 0) {
    slots.secondary -= 1;
    return true;
  }
  return false;
};

function releaseSlot() {
  if (slots.secondary < maxSlots.secondary) {
    slots.secondary += 1;
    return;
  }
  slots.primary += 1;
};

var runnings = {};

app.post('/:subcmd/:benchid/:sessionid/:parallels/:seconds/:ip/:port/:artist/:ticket', function(req,res){
  var subcmd = req.params.subcmd,
      benchid = req.params.benchid,
      sessionid = req.params.sessionid;
  if (! getSlot()) { res.json(400, {err:'no more slots available for subcommand:' + subcmd}); return; }

  var child = execSubCommand(subcmd, req.params, function(result){
    releaseSlot();
    if (runnings[sessionid]) {
      /* send result to manager */
      delete runnings[sessionid];
      if (config.manager.skip) {
        console.log(JSON.stringify({sessionid:sessionid,result:result}, null, ' '));
      } else {
        sendResult({benchid:benchid,sessionid:sessionid,result:result});
      }
    } else { // session killed
      // nothing to do
    }
  });
  runnings[sessionid] = child;
  res.json(200, {});
});

app.post('/kill/:sessionid', function(req,res){
  var sessionid = req.params.sessionid;
  if (runnings[sessionid]) {
    runnings[sessionid].kill('SIGTERM');
    delete runnings[sessionid];
    releaseSlot();
  }
  res.json(200, {});
});

function uriEncodeForFormData(str){
  // see: https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/encodeURIComponent
  return encodeURIComponent(str).replace(/%20/g, '+');
};
function generateFormBody(obj){
  var pairs = [];
  for (var key in obj){
    pairs.push(uriEncodeForFormData(key) + '=' + uriEncodeForFormData(obj[key]));
  }
  return pairs.join('&');
};
/* in init sequence, communicate with manager, and get  */
function postManager(path, data, type){
  var headers = { 'User-Agent': 'Isucon2 Bench Agent RPC' };
  var body;
  if (!type || type === 'form') {
    body = generateFormBody(data);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (type === 'json') {
    body = JSON.stringify(data);
    headers['Content-Type'] = 'application/json';
  } else {
    throw {message:'unknown format for postManager:type'};
  }
  headers['Content-Length'] = (new Buffer(body, 'utf8')).length;

  var options = {
    host: config.manager.address,
    port: config.manager.port,
    path: path,
    headers: headers,
    method: 'POST'
  };
  var req = http.request(options, function(res){
    if (res.statusCode !== 200)
      console.log('Error, Isucon2 manager returns code:' + res.statusCode + ', for path:' + path);
  });
  req.on('error', function(err){
    console.log('Error, Failed to send status to Isucon2 manager for path:' + path);
    console.log(err);
  });
  req.end(body);
}

function sendStatus(){
  postManager('/ping', {port:config.agent.port, primary:slots.primary, secondary:slots.secondary});
};
function sendResult(data){
  postManager('/result', data, 'json');
};

if (!config.agent || !config.manager || !config.slots) {
  if (!config.testing) {
    console.log('Fatal, manager address and/or agent slots information missing.');
    process.exit(1);
  }
}
setTimeout(function(){
  if (config.manager.skip) {
    console.log('WARNING: Skipping to send status to manager by configuration config.manager.skip');
    return;
  }
  sendStatus();
  setInterval(sendStatus, BENCH_AGENT_PING_INTERVAL);
}, BENCH_AGENT_PING_STARTING);

app.listen(config.agent.port);
