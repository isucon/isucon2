var http = require('http'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    cheerio = require('cheerio');

var Worker = exports.Worker = function(args) {
  this.ip = args.target_ip;
  this.port = args.target_port;
  this.agent = args.user_agent || 'ISUCON Agent 2012';
  this.timeout = {};
  for (var method in args.timeout) {
    this.timeout[method] = args.timeout[method] * 1000; // sec -> msec
  }
  if (! this.timeout.get)
    this.timeout.get = 15000;
  if (! this.timeout.post)
    this.timeout.post = 60000;

  this.retries = args.retries || null;
};

function execute_request_once(options, timeout_milliseconds, callback){
  var timeouted = false;

  var body = null;
  if (options.body !== undefined) {
    body = options.body;
    delete options.body;
  }
  var binary = false;
  if (options.binary !== undefined) {
    binary = options.binary;
    delete options.binary;
  }

  var req = http.request(options, function(res) {
    if (timeouted) { return; } /* this request is already timeouted */
    if (res.statusCode !== 200) {
      callback({message:'Response code: ', code:res.statusCode}); return;
    }
    var chunks = [];
    var chunkSize = 0;
    res.on('data', function (chunk) {
      chunks.push(chunk);
      chunkSize += chunk.length;
    }).on('end', function(){
      if (chunkSize < 1) { callback(null, ''); return; }

      var buf = new Buffer(chunkSize);
      var pos = 0;
      for (var i = 0 ; i < chunks.length ; i++) {
        chunks[i].copy(buf, pos);
        pos += chunks[i].length;
      }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] === 'gzip') {
        zlib.gunzip(buf, function(error, result){
          if (error){ console.error(error); callback({message:'Failed to gunzip of content body:' + error.message}); return; }
          callback(null, result.toString(binary ? 'binary' : 'utf8'));
        });
      } else {
        callback(null, buf.toString(binary ? 'binary' : 'utf8'));
      }
    });
  });
  req.on('error', function(e) {
    callback({message:'Request error: ' + e.message, code:null});
  });
  req.setTimeout(timeout_milliseconds, function(){
    // without this callback, request error event invoked?
    timeouted = true;
    callback({message:'Request timeout', code:null, timeout:true});
  });

  if (body) { req.end(body); }
  else { req.end(); }
}

function execute_request(options, timeout_milliseconds, retries, callback){
  var allowRedirect = false;
  if (options.allowRedirect !== undefined) {
    allowRedirect = options.allowRedirect;
    delete options.allowRedirect;
  }
  execute_request_once(options, timeout_milliseconds, function(err, content){
    if (err && allowRedirect && err.code < 400) {
      callback(err, content); return;
    }
    if (err && retries > 0) {
      execute_request(options, timeout_milliseconds, retries - 1, callback); return;
    }
    callback(err, content);
  });
}

Worker.prototype.getContent = function(path, callback) {
  var retries = this.retries || 0;

  var headers = {'User-Agent': this.agent, 'Accept-Encoding': 'gzip'};
  var options = {
    host: this.ip,
    port: this.port,
    path: path,
    method: 'GET',
    headers: headers,
    agent: false, // don't use connection pooling, and sets 'Connection: close'
    binary: true
  };
  execute_request(options, this.timeout.get, retries, function(err, content){
    if (err) { callback(err); return; }
    callback(err, content);
  });
};

Worker.prototype.getPage = function(pagename, id, callback) {
  var path = '/';
  switch(pagename) {
  case "index":
  case "artists": path = "/"; break;
  case "tickets": path = "/artist/" + id; break;
  case "variations": path = "/ticket/" + id; break;
  default: callback("undefined page name:" + pagename + ", id:" + id); return;
  }

  var retries = this.retries || 0;

  var headers = {'User-Agent': this.agent, 'Accept-Encoding': 'gzip'};
  var options = {
    host: this.ip,
    port: this.port,
    path: path,
    method: 'GET',
    headers: headers,
    agent: false // don't use connection pooling, and sets 'Connection: close'
  };
  execute_request(options, this.timeout.get, retries, function(err, content){
    if (err) { callback(err); return; }
    if ((content.indexOf('<html>') < 0 && content.indexOf('<HTML>') < 0) ||
        (content.indexOf('</html>') < 0 && content.indexOf('</HTML>') < 0)) {
      /* broken html page .... */
      callback({message:'broken html content (doesn\'t contain whole <html>...</html> document)', code:null});
      return;
    }
    callback(err, content);
  });
};

Worker.prototype.getIndex = function(callback) {
  this.getPage('artists', null, function(err, content){
    if (err) { callback(err, null, []); return; }
    var $ = cheerio.load(content);
    var artists = $('#content > ul > li').map(function(i,element){
      var e = $(element);
      var artist_id = parseInt(e.find('a').attr('href').substr(8)); /* 8: length of '/artist/' */
      var artist_name = e.find('span.artist_name').text();
      return {name:artist_name, id:artist_id};
    });
    callback(err, $, artists);
  });
};

Worker.prototype.getTickets = function(artist_id, callback) {
  this.getPage('tickets', artist_id, function(err, content){
    if (err) { callback(err, null, []); return; }
    var $ = cheerio.load(content);

    var tickets = $('li.ticket').map(function(i, element){
      var e = $(element);
      var link = e.find('a');
      var ticket_name = link.text();
      var ticket_id = parseInt(link.attr('href').substr(8)); /* 8: length of '/ticket/' */
      var ticket_count = parseInt(e.find('span.count').text());
      return {name:ticket_name, id:ticket_id, count:ticket_count};
    });
    callback(err, $, tickets);
  });
};

Worker.prototype.getVariations = function(ticket_id, getStatus, callback) {
  this.getPage('variations', ticket_id, function(err, content){
    if (err) { callback(err, null, []); return; }

    var variations = [];
    var statusMap = {};
    var $ = null;
    if (getStatus) {
      $ = cheerio.load(content);
      $('.seats').each(function(i, table){
        var t = $(table);
        var variationId = parseInt(t.attr('data-variationid'));
        statusMap[variationId] = {};
        t.find('td').each(function(i, variation){
          var v = $(variation);
          statusMap[variationId][v.attr('id')] = v.hasClass('available');
        });
      });
      variations = $('li.variation').map(function(i, element){
        var e = $(element);
        var variation_id = parseInt(e.find('input[name=variation_id]').attr('value'));
        var variation_name = e.find('span.variation_name').text();
        var vacancy_count = parseInt(e.find('span.vacancy').text());
        return {name:variation_name, id:variation_id, count:vacancy_count, status:(statusMap[variation_id] || {})};
      });
    } else {
      var formRegexp = /<form.*action="\/buy".*>/ig;
      var formEndRegexp = /<\/form>/ig;
      var nameRegexp = /<span [^>]*class="variation_name"[^>]*>(.+)<\/span>.*<span [^>]*class="vacancy"[^>]*>(\d+)<\/span>/im;
      var idRegexp = /<input [^>]*name="variation_id"[^>]*>/im;
      var valueRegexp = /value="(\d+)"/im;
      var form, formend, formpart, idpart, valuepart, namepart, name, id, count;
      while ((form = formRegexp.exec(content)) !== null && (formend = formEndRegexp.exec(content)) !== null) {
        formpart = content.substring(form.index, formend.index).split(/\r?\n/).join('');
        name = null;
        count = null;
        id = null;
        if ((idpart = idRegexp.exec(formpart)) !== null)
          if ((valuepart = valueRegexp.exec(idpart)) !== null)
            id = parseInt(valuepart[1]);
        if ((namepart = nameRegexp.exec(formpart)) !== null) {
          name = namepart[1];
          count = parseInt(namepart[2]);
        }
        variations.push({name:name, id:id, count:count, status:{}});
      }
    }
    callback(err, $, variations);
  });
};

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
function generateMemberId(){
  return crypto.createHash('md5').update((Math.random()).toString() + (new Date()).toString()).digest('hex');
};

// callback: function(err, $, {result:'success'(or 'soldout'), seat:'01-01'(or null)})
Worker.prototype.buyTicket = function(ticket_id, variation_id, callback) {
  var path = '/buy';
  var retries = this.retries || 0;
  var member_id = generateMemberId();

  var request_body = generateFormBody({ticket_id:ticket_id, variation_id:variation_id, member_id:member_id});
  var dataLength = (new Buffer(request_body, 'utf8')).length;
  var headers = {
    'User-Agent': this.agent,
    'Content-Type':'application/x-www-form-urlencoded',
    'Content-Length': dataLength
  };
  var options = {
    host: this.ip,
    port: this.port,
    path: path,
    method: 'POST',
    headers: headers,
    body: request_body, // this argument removed before http.request(), and used as req.end(body)
    agent: false // don't use connection pooling, and sets 'Connection: close'
  };
  execute_request(options, this.timeout.post, retries, function(err, content){
    if (err) { callback(err, null, null); return; }

    if ((content.indexOf('<html>') < 0 && content.indexOf('<HTML>') < 0) ||
        (content.indexOf('</html>') < 0 && content.indexOf('</HTML>') < 0)) {
      /* broken html page .... */
      callback({message:'broken html content (doesn\'t contain whole <html>...</html> document)', code:null}, null);
      return;
    }
    var $ = cheerio.load(content);
    var result = ($('span.result').attr('data-result') === 'success' ? 'success' : 'soldout');
    var seat = $('span.seat').text();
    callback(err, $, {result:result, seat:seat, member_id:member_id});
  });
};

// callback: function(err, $, {result:'success'(or 'soldout'), seat:'01-01'(or null)})
Worker.prototype.initialize = function(callback) {
  var path = '/admin';
  var retries = this.retries || 0;

  var headers = { 'User-Agent': this.agent, 'Accept-Encoding': 'gzip', 'Content-Length': 0 };
  var options = {
    allowRedirect: true,
    host: this.ip,
    port: this.port,
    path: path,
    method: 'POST',
    headers: headers,
    agent: false // don't use connection pooling, and sets 'Connection: close'
  };
  execute_request(options, this.timeout.post, retries, function(err, content){
    if (err && err.code === 302) {
      callback(null, 'ok'); return;
    }
    if (err) {
      callback(err, content); /* non-302(redirect) is error */
      return;
    }
    callback({message:'Initialize POST /admin must return 302',code:200});
  });
};

Worker.prototype.parseSideBar = function($){
  var recents = $('#sidebar > table > tr').map(function(i, tr){
    if (i === 0) {
      return null;
    }
    var data = {};
    $(tr).find('td').each(function(j, td){
      if (j === 0) {
        var parts = $(td).text().split(' ');
        data['artist_name'] = parts[0];
        data['ticket_name'] = parts[1];
        data['variation_name'] = parts[2];
      } else {
        data['seat'] = $(td).text();
      }
    });
    return data;
  });
  recents.shift();
  return recents;
};

Worker.prototype.checkCsv = function(bought, callback){
  var path = '/admin/order.csv';
  var retries = this.retries || 0;
  var headers = { 'User-Agent': this.agent, 'Accept-Encoding': 'gzip', 'Content-Length': 0 };
  var options = {
    allowRedirect: true,
    host: this.ip,
    port: this.port,
    path: path,
    method: 'GET',
    headers: headers,
    agent: false // don't use connection pooling, and sets 'Connection: close'
  };
  /* timeout for long time waiting by 'this.timeout.post' instead of 'timeout.getLog' or others. */
  execute_request(options, this.timeout.post, retries, function(err, content){
    if (err) { callback(err); return; }

    var lines = content.split(/\r?\n/);
    var failures = [];
    bought.forEach(function(result){
      var pattern = ',' + result.join(',') + ',';
      var matched = lines.filter(function(line){return line.indexOf(pattern) >= 0;}).length;
      if (matched !== 1) {
        failures.push({seat:result[1], memberId:result[0]});
      }
    });
    if (failures.length > 0) {
      callback({message:'order record not found in csv, for:' + failures.map(function(r){return r.seat + '/' + r.memberId;}).join(','),
                code:null});
      return;
    }
    callback(null);
  });
};
