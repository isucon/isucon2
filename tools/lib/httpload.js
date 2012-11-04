var fs = require('fs'),
    util = require('util'),
    path = require('path'),
    child_process = require('child_process');

var HTTP_LOAD_BIN_PATH = path.resolve('./http_load_isucon2/http_load'),
    HTTP_LOAD_URLFILE_PATH = path.resolve('./urlfile');

var HTTP_LOAD_TARGETS = [
  ['path', '/'],
  ['path', '/css/ui-lightness/jquery-ui-1.8.24.custom.css'], ['path', '/css/isucon2.css'],
  ['path', '/js/jquery-1.8.2.min.js'], ['path', '/js/jquery-ui-1.8.24.custom.min.js'], ['path', '/js/isucon2.js'],
  ['path', '/images/isucon_title.jpg'],
  ['artist', '/artist/%d'], ['ticket', '/ticket/%d']
];

var agent = exports.agent = function(args) {
  return new HttpLoad(args);
};

var HttpLoad = exports.HttpLoad = function(args) {
  this.parallels = args.parallels;
  this.timeout = args.timeout.get;
  this.child = null;
};

function createUrlFile(filePath, target_ip, target_port, target_artist, target_ticket) {
  var genURL = function(path){ return 'http://' + target_ip + (target_port === 80 ? '' : ':' + target_port) + path; };
  var urls = HTTP_LOAD_TARGETS.map(function(pair){
    var path = pair[1];
    if (pair[0] === 'artist') {
      path = util.format(pair[1], target_artist);
    } else if (pair[0] === 'ticket') {
      path = util.format(pair[1], target_ticket);
    }
    return genURL(path);
  });
  fs.writeFileSync(filePath, urls.join('\n') + '\n', 'utf8');
};

/* *** - http_load: SYNOPSIS
 * usage:  ./http_load [-checksum] [-throttle] [-proxy host:port] [-verbose] [-timeout secs] [-sip sip_file]
 *             -parallel N | -rate N [-jitter]
 *             -fetches N | -seconds N
 *             url_file
 * One start specifier, either -parallel or -rate, is required.
 * One end specifier, either -fetches or -seconds, is required.
 */
function buildExecOptions(binPath, urlsPath, seconds, parallel, timeout) {
  return util.format( '%s -timeout %d -parallel %d -seconds %d %s', binPath, timeout, parallel, seconds, urlsPath );
};

/* *** - OUTPUT example of http_load
  49 fetches, 2 max parallel, 289884 bytes, in 10.0148 seconds
  5916 mean bytes/connection
  4.89274 fetches/sec, 28945.5 bytes/sec
  msecs/connect: 28.8932 mean, 44.243 max, 24.488 min
  msecs/first-response: 63.5362 mean, 81.624 max, 57.803 min
  HTTP response codes:
    code 200 -- 49
 */
function parseResult(stdout) {
  var result = {status:{}, fetches:null};
  stdout.split('\n').map(function(line){ return line.trim(); }).forEach(function(line){
    var match;
    if ((match = /^(\d+) fetches/.exec(line)) !== null) {
      result.fetches = parseInt(match[1]);
    } else if ((match = /^code (\d+) -- (\d+)$/.exec(line)) !== null) {
      result.status[parseInt(match[1])] = parseInt(match[2]);
    } else {
    }
  });
  return result;
};

HttpLoad.prototype.execute = function(target_ip, target_port, target_artist, target_ticket, seconds, callback) {
  var self = this;

  createUrlFile(HTTP_LOAD_URLFILE_PATH, target_ip, target_port, target_artist, target_ticket);
  var command = buildExecOptions(HTTP_LOAD_BIN_PATH, HTTP_LOAD_URLFILE_PATH, seconds, this.parallels, this.timeout);

  var child = child_process.exec(command, function(err, stdout, stderr){
    var error;
    if (err) {
      error = {message:err.message + (err.signal ? '(' + err.signal + ')' : ''), code:err.code};
    }
    var result;
    if (stdout) {
        result = parseResult(stdout);
      if (result.fetches < 1 || !result.status[200] || result.status[200] < 1) {
        callback({message:'GET success fetches are too few',code:null}, result); return;
      }
    }
    callback(error, result);
  });
  this.child = child;
};

HttpLoad.prototype.killed = function() {
  this.child.kill('SIGTERM');
};
