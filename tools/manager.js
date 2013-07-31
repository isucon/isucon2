var async = require('async'),
    crypto = require('crypto'),
    util = require('util'),
    fs = require('fs'),
    http = require('http');

http.globalAgent.maxSockets = 30;

var express = require('express'),
    app = express();

var BENCH_AGENT_TIMEOUT = 5000, // 5sec
    BENCH_AGENTS_EMPTY_WAIT = 15000,
    BENCH_AGENTS_FAILED_RETRY_WAIT = 15000;

var BENCH_SECONDS_SHORT = 60,
    BENCH_SECONDS_NORMAL = 180;

var TICKETS = 8192,
    SCORE_SOLDOUT_PARAM = 0.01,
    SCORE_GETS_PARAM = 0.001;

var BENCH_SETTINGS = {
  testing: {
    starter:  {parallels:1,  timeout:30, procs:1},
    httpload: {parallels:50, timeout:BENCH_SECONDS_SHORT, procs:1},
    buyer:    {parallels:25, timeout:BENCH_SECONDS_SHORT, procs:2},
    checker:  {parallels:1,  timeout:BENCH_SECONDS_SHORT, procs:1}
  },
  normal: {
    starter:  {parallels:1,  timeout:30, procs:1},
    httpload: {parallels:50, timeout:BENCH_SECONDS_SHORT, procs:1},
    buyer:    {parallels:25, timeout:BENCH_SECONDS_SHORT, procs:2},
    checker:  {parallels:1,  timeout:BENCH_SECONDS_SHORT, procs:1}
  },
  restricted: {
    starter:  {parallels:1,  timeout:30,  procs:1},
    httpload: {parallels:50, timeout:BENCH_SECONDS_NORMAL, procs:2},
    buyer:    {parallels:25, timeout:BENCH_SECONDS_NORMAL, procs:4},
    checker:  {parallels:1,  timeout:BENCH_SECONDS_NORMAL, procs:1}
  }
};
function benchConfig() {
  if (config.testing)
    return BENCH_SETTINGS.testing;
  if (app.get('restrict'))
    return BENCH_SETTINGS.restricted;
  return BENCH_SETTINGS.normal;
}
function benchSlots() {
  var config = benchConfig();
  var slotNum = 0;
  for (var agentType in config) {
    slotNum += config[agentType].procs;
  }
  return slotNum;
}
function benchTime() { // milliseconds
  if (app.get('restrict'))
    return BENCH_SECONDS_NORMAL * 1000;
  return BENCH_SECONDS_SHORT * 1000;
}
var BENCH_TARGETS = [ [1,1], [1,2], [2,3], [2,4], [2,5] ];

app.set('restrict', false);

var storage = require('./lib/storage');

// [ {name:'agentN', ip:'192.168.0.1', port:5000, primary:2, secondary:6, modified_at:(date)} ]
var agents = [];
/* benchid -> {teamid:num,
               started_at:(date),
               artistid:num, ticketid:num,
               sessions:{sessionid -> {type:'starter/httpload/buyer/checker', result:result_part_from_agents}} }  */
var runnings = {};

var config = JSON.parse(fs.readFileSync(__dirname + '/config.json'));

// index.html, isucon2manager.css, isucon2manager.js
app.use(express.static(__dirname + '/public'));
app.use(express.cookieParser());
app.use(express.cookieSession({secret:'isuisu'}));
// app.use(express.logger());
app.use(express.bodyParser()); /* json, urlencoded, multipart */
app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

/*** from browser authentication / administrations ***/
app.post('/login', function(req,res){
  var username = req.body.username,
      password = req.body.password;
  var result = null;
  config.users.forEach(function(user){
    if (result) { return; }
    if (user.name === username && user.password === password) {
      result = {username:user.name, teams:user.teams, admin:user.admin};
    }
  });
  if (result === null) {
    res.send(403, 'username or password mismatch'); return;
  }
  req.session = result;
  res.json(result);
});
app.post('/logout', function(req,res){
  req.session = null;
  res.json({message:'OK'});
});
app.get('/session', function(req,res){ // send as json: {username:string, teams:[teamid(s)], admin:bool}
  if (! req.session) { res.send(404, 'Login first'); return; }
  res.json(req.session);
});
app.post('/restricted', function(req, res){
  if (!req.session || !req.session.admin) {
    res.send(403, 'You are not admin user'); return;
  }
  app.set('restrict', !(app.get('restrict')));
  res.json({message:'OK',restricted:app.get('restrict')});
});

app.get('/ranking', function(req,res){
  if (!req.session || !req.session.admin) {
    res.send(403, 'You are not admin user'); return;
  }
  res.json(storage.ranking());
});

/*** team status, results and agent status ***/
app.get('/current', function(req,res){
  if (app.get('restrict') && (!req.session || !req.session.admin)) { res.json([]); return; }

  var teamBenches = {};
  for (var benchid in runnings) {
    teamBenches[runnings[benchid].teamid] = true;
  }
  var teams = storage.all();
  teams.forEach(function(team){
    team['running'] = (teamBenches[team.id] ? true : false);
  });
  res.json(teams); // [ {id:n, name:'', display:'', running:bool, recent:{}, highscore:{}} ]
});

app.get('/agents', function(req,res){
  if (app.get('restrict') && (!req.session || !req.session.admin)) { res.json([]); return; }
  res.json(agents);
});

/*** team operations ***/
app.get('/latest/:teamid', function(req,res){
  if (app.get('restrict') && (!req.session || !req.session.admin)) { res.send(403, 'restricted'); return; }
  res.json(storage.get(parseInt(req.params.teamid)));
});

// post /bench/:teamid (execute bench series for :teamid)
app.post('/bench/:teamid', function(req,res){
  if (app.get('restrict') && (!req.session || !req.session.admin)) { res.send(403, 'restricted'); return; }

  var teamid = parseInt(req.params.teamid);
  if (benchByTeamId(teamid) !== null) {
    res.send(403, 'Bench test already running'); return;
  }
  var team = teamByTeamId(teamid);
  if (! checkPrivilege(req.session, team) && !req.session.admin) {
    res.send(403, 'You are not owner of this team'); return;
  }
  var slotNum = benchSlots();
  if (selectAgents(slotNum) === null) {
    res.send(403, 'Available slots too few: ' + slotNum + " please update agent's slots or start more agents." ); return;
  }

  var benchid = generateBenchId();
  var target_pair = BENCH_TARGETS[Math.floor(Math.random() * BENCH_TARGETS.length)];
  var sessions = {};
  var session;
  var sessionid;
  var starterSessionId = null;

  var benchSettings = benchConfig();
  for (var agentType in benchSettings) {
    for (var i = 0 ; i < benchSettings[agentType].procs ; i++) {
      session = {type:agentType, agent:null, result:null};
      sessionid = generateSessionId(benchid, agentType, i);
      sessions[sessionid] = session;
    }
    if (agentType === 'starter')
      starterSessionId = sessionid;
  }
  runnings[benchid] = {teamid:teamid, artistid:target_pair[0], ticketid:target_pair[1], started_at:(new Date()), sessions:sessions};

  var selectedAgent = selectAgents(1);
  if (!selectedAgent || selectedAgent.length < 1){
    /* if no one agent can be got, bench cannot be run. */
    res.send(400, 'All agents are busy. Please retry few minutes after.'); return;
  }
  postBenchRequest(selectedAgent[0], benchid, starterSessionId, function(err){
    if (err) {
      console.log(JSON.stringify({time:(new Date()), in:'/bench/' + teamid, benchStart:err}, null, '  '));
      res.send(400, 'Failed to run starter, report administrator.');
      return;
    }
    res.json(200, {message:'OK, bench starting...'});
  });
});

app.post('/kill/:teamid', function(req,res){
  if (app.get('restrict') && (!req.session || !req.session.admin)) { res.send(403, 'restricted'); return; }

  var teamid = parseInt(req.params.teamid);
  var team = teamByTeamId(teamid);
  if (! checkPrivilege(req.session, team) && !req.session.admin) {
    res.send(403, 'You are not owner of this team'); return;
  }
  var bench = benchByTeamId(teamid);
  if (! bench) {
    res.send(404, 'No benches running'); return;
  }

  for (var bid in runnings) {
    if (runnings[bid].teamid === teamid) {
      bench = runnings[bid];
      delete runnings[bid];
    }
  }
  if (bench) {
    killRunningSessions(bench, function(err){
      if (err) { /* agent down or timeout....*/
        console.log(JSON.stringify(err,null,'  '));
      }
      res.json({message:'OK, killed'});
    });
  } else {
    res.json({message:'OK, killed'});
  }
});

// TODO: post /reset/:teamid (reset xen machines)

/*** from agent ***/
app.post('/ping', function(req,res){
  var ip = req.ip,
      port = parseInt(req.body.port),
      primary = parseInt(req.body.primary),
      secondary = parseInt(req.body.secondary);
  var exists = false;
  agents.forEach(function(agent){
    if (exists) return;
    if (agent.ip !== ip) return;

    // agent.ip === ip
    agent.port = port;
    agent.primary = primary;
    agent.secondary = secondary;
    agent.modified_at = new Date();
    exists = true;
  });
  if (! exists) {
    agents.push({name:'agent'+(agents.length), ip:ip, port:port, primary:primary, secondary:secondary, modified_at:(new Date())});
  }
  res.send(200, 'OK');
});

app.post('/result', function(req,res){
  var benchid = req.body.benchid,
      sessionid = req.body.sessionid,
      result = req.body.result;
  if (! runnings[benchid]) { res.send(404, 'Target benchid not found:' + benchid); return; }
  if (! runnings[benchid].sessions[sessionid]) { res.send(404, 'Target sessionid not found:' + sessionid); return; }
  runnings[benchid].sessions[sessionid].result = result;

  res.send(200, 'OK');

  if (runnings[benchid].sessions[sessionid].type === 'starter') {
    if (result.err) { /* if starter result with error, no more bench are executed */
      var failed = runnings[benchid];
      delete runnings[benchid];
      makeScore(failed);
      return;
    }
    /* execute httpload/buyer/checker */
    executeMainBench(benchid);
    return;
  }
  /* non starter result */
  var blankExists = false;
  for (var session in runnings[benchid].sessions) {
    if (runnings[benchid].sessions[session].result === null)
      blankExists = true;
  }
  if (blankExists)
    return;

  /* all sessions' results are stored */
  var complete = runnings[benchid];
  delete runnings[benchid];
  makeScore(complete);
});

storage.init(config.teams, function(err,instance){
  if (err) { throw err; }
  storage = instance;
  app.listen(5001);
});

/*** local functions ***/
function benchByTeamId(teamid){
  for (var bid in runnings) {
    if (runnings[bid].teamid === teamid)
      return runnings[bid];
  }
  return null;
};
function teamByTeamId(teamid){
  for (var team in config.teams) {
    if (config.teams[team].id === teamid)
      return config.teams[team];
  }
  return null;
};
function checkPrivilege(user, team) {
  for (var t in user.teams) {
    if (user.teams[t] === team.id)
      return true;
  }
  return false;
}

function generateBenchId(){
  return crypto.createHash('md5').update('benchid' + (new Date()).toString() + Math.random()).digest('hex');
};
function generateSessionId(benchid, type, index){
  return crypto.createHash('md5').update('sessionid' + benchid + ':' + type + ':' + index).digest('hex');
};

Array.prototype.shuffle = function() { // from http://la.ma.la/blog/diary_200608300350.htm
  var i = this.length;
  while(i){
    var j = Math.floor(Math.random()*i);
    var t = this[--i];
    this[i] = this[j];
    this[j] = t;
  }
  return this;
};
function selectAgents(num){
  var selectFromList = function(num, agents, list){
    while (agents.length < num && list.length > 0) {
      for (var i = list.length - 1 ; i >= 0 ; i--) {
        if (list[i][1] > 0) {
          agents.push(list[i][0]);
          list[i][1] -= 1;
        } else {
          list.splice(i,1);
        }
        if (agents.length === num)
          break;
      }
    }
    return agents;
  };

  var primaryList = agents.concat().shuffle().sort(function(a,b){ /* shuffle to sort randomly, that has same empty slots */
    return a.primary - b.primary; /* primary ASC */
  }).map(function(agent){ return [agent, agent.primary]; });

  var selectedAgents = selectFromList(num, [], primaryList);
  if (selectedAgents.length === num)
    return selectedAgents;

  /* all primary slots are empty, so select from secondary... */
  var secondaryList = agents.concat().shuffle().sort(function(a,b){ /* shuffle to sort randomly, that has same empty slots */
    return a.secondary - b.secondary; /* secondary ASC */
  }).map(function(agent){ return [agent, agent.secondary]; });

  selectedAgents = selectFromList(num, selectedAgents, secondaryList);
  if (selectedAgents.length === num)
    return selectedAgents;

  // failed to get enough number of agents' slots....
  return null;
};

// send bench request to agent post('/:subcmd/:benchid/:sessionid/:parallels/:seconds/:ip/:port/:artist/:ticket')
function postBenchRequest(agent, benchid, sessionid, callback){
  // agent: {ip:'192.168.0.1', port:5000, primary:2, secondary:6, modified_at:(date)}
  var bench = runnings[benchid];
  var type = bench.sessions[sessionid].type;
  var benchInfo = (benchConfig())[type];
  var team = teamByTeamId(bench.teamid);

  var path = util.format(
    '/%s/%s/%s/%s/%s/%s/%s/%s/%s',
    type, benchid, sessionid,
    benchInfo.parallels, benchInfo.timeout,
    team.target_ip, team.target_port, bench.artistid, bench.ticketid
  );
  var headers = {
    'User-Agent': 'Isucon2 Bench Manager RPC',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': 0
  };
  var options = {
    host: agent.ip,
    port: agent.port,
    path: path,
    headers: headers,
    method: 'POST'
  };
  var finished = false;
  var req = http.request(options, function(res){
    finished = true;
    if (res.statusCode !== 200) {
      /* select other agent */
      callback({message:'agent returns error code:' + res.statusCode}); return;
    }
    /* ok, successfully runs on agent */
    bench.sessions[sessionid].agent = agent;
    callback(null);
  });
  req.on('error', function(err){
    callback({message:(err.message || 'request to agent failed with error:' + JSON.stringify(err))});
  });
  req.on('timeout', function () {
    if ( finished ) { return; }
    req.abort();
  });
  req.setTimeout(BENCH_AGENT_TIMEOUT);
  req.end();
};

function killBenchRequest(agent, sessionid, callback){
  // agent: {ip:'192.168.0.1', port:5000, primary:2, secondary:6, modified_at:(date)}
  var path = util.format('/kill/%s', sessionid);
  var headers = {
    'User-Agent': 'Isucon2 Bench Manager RPC',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': 0
  };
  var options = {
    host: agent.ip,
    port: agent.port,
    path: path,
    headers: headers,
    method: 'POST'
  };
  var finished = false;
  var req = http.request(options, function(res){
    finished = true;
    if (res.statusCode !== 200) {
      /* select other agent */
      callback({message:'agent returns error code:' + res.statusCode}); return;
    }
    callback(null);
  });
  req.on('error', function(err){
    callback({message:(err.message || 'request to agent failed with error:' + JSON.stringify(err))});
  });
  req.on('timeout', function () {
    if ( finished ) { return; }
    req.abort();
  });
  req.setTimeout(BENCH_AGENT_TIMEOUT);
  req.end();
};

function killRunningSessions(bench, callback){
  if (!bench) { return; }

  var killSessionIds = [];
  for (var sid in bench.sessions) {
    if (! bench.sessions[sid].result)
      killSessionIds.push(sid);
  }
  if (killSessionIds.length > 0) {
    var kills = killSessionIds.map(function(sid){
      var session = bench.sessions[sid];
      delete bench.sessions[sid];

      var agent = session.agent;
      return function(cb){
        if (! agent) {
          cb(null); return;
        }
        killBenchRequest(agent, sid, function(err){
          if (err) { /* agent down or timeout....*/
            callback(null, {
              time:(new Date()),
              message:'Failed to communicate agent to kill session ' + sid + ', ' + agent.ip + ':' + agent.port,
              err:err
            });
          }
          cb(null);
        });
      };
    });
    async.parallel(kills, function(err,failures){
      var errors = [];
      for (var v in failures) {
        if (v)
          errors.push(v);
      }
      callback(errors.length > 0 ? errors : null);
    });
  } else {
    callback(null);
  }
}

function executeMainBench(benchid){
  /* sends httpload/buyer/checker (or wait seconds without enough slots...) */

  var bench = runnings[benchid];
  var sessionIds = [];
  var agentNum = 0;
  for (var sessionid in bench.sessions) {
    if (bench.sessions[sessionid].result !== null)
      continue;
    agentNum += 1;
    sessionIds.push(sessionid);
  }
  var selecteds = selectAgents(agentNum);
  if (! selecteds) {
    console.log(JSON.stringify({time:(new Date()), in:'ExecuteMainBench', executeMainBench:'Too few agent slots, wait...'}, null, '  '));
    setTimeout(function(){
      executeMainBench(benchid);
    }, BENCH_AGENTS_EMPTY_WAIT);
    return;
  }

  // function postBenchRequest(agent, benchid, sessionid, callback){
  var tasks = sessionIds.map(function(sessionid){
    return function(cb){
      postBenchRequest(selecteds.shift(), benchid, sessionid, function(err){
        if (err) { cb(err); return; }
        cb(null, sessionid);
      });
    };
  });

  async.parallel(tasks, function(err,results){
    if (err) { // one or more agents failed to execute benchmark....
      console.log(JSON.stringify({executeMainBench:'one or more agent bench failed', message:err.message}, null, '  '));
      /* KILL bench in running, and re-execute */
      killRunningSessions(bench, function(err){
        setTimeout(function(){ executeMainBench(benchid); }, BENCH_AGENTS_FAILED_RETRY_WAIT);
      });
      return;
    }
  });
};

function makeScore(bench){
  var teamid = bench.teamid;
  var sessions = bench.sessions;
  var tickets = 0,
      soldouts = 0,
      soldoutAt = null,
      gets = 0,
      posts = 0,
      errors = 0,
      timeouts = 0,
      detail = [];

  var fatal = false;
  var error_pickup = function(t,e){
    var header = config.testing ? 'Main Bench(' + t + '):' : 'Main Bench:';
    if (t === 'starter')
      header = 'Starting Check:';
    return header + (e.message ? (e.code ? e.message + e.code : e.message) : JSON.stringify(e));
  };

  var s,e,t,d;
  var dataList = [];
  for (var sessionid in sessions) {
    var session = sessions[sessionid];
    var type = session.type;
    var data = session.result; /* session's result is {err:{},result:{}}, this is strongly misleading.... */
    if (! data) /* not executed sessions because test is killed or starter failed */
      continue;
    dataList.push(data);

    var result = data.result;
    var err = data.err;
    if (type === 'starter') {
      if (err) { /* starter error is fatal and no more tests are checked */
        fatal = true;
        detail.push(error_pickup(type,err));
        break;
      }
    } else if (type === 'httpload') {
      if (err) { fatal = true; detail.push(error_pickup(type, err)); continue; }
      s = result.status['200'];
      e = 0;
      for (var code in result.status) {
        if (code !== '200')
          e += result.status[code];
      }
      t = result.fetches - (s + e);
      gets += s;
      errors += e;
      timeouts += t;
    } else if (type === 'buyer') {
      if (err) { fatal = true; detail.push(error_pickup(type, err)); continue; }
      gets += result.get.success;
      posts += result.buy.success + result.buy.soldout;
      timeouts += result.get.timeout + result.buy.timeout;
      e = 0;
      for (var x1 in result.get.error) {
        d = {}; d[x1] = result.get.error[x1];
        detail.push(JSON.stringify(d));
        e += result.get.error[x1];
      }
      for (var x2 in result.buy.error) {
        d = {}; d[x2] = result.buy.error[x2];
        detail.push(JSON.stringify(d));
        e += result.buy.error[x2];
      }
      errors += e;
      tickets += result.buy.success;
      soldouts += result.buy.soldout;
      if (result.first_soldout) {
        if (!soldoutAt  || result.first_soldout < soldoutAt)
          soldoutAt = result.first_soldout;
      }
    } else if (type === 'checker') {
      if (err) { fatal = true; detail.push(error_pickup(type, err)); continue; }
      gets += result.get.success;
      posts += result.buy.success + result.buy.soldout;
      timeouts += result.get.timeout + result.buy.timeout;
      e = 0;
      for (var y1 in result.get.error) {
        d = {}; d[y1] = result.get.error[y1];
        detail.push(JSON.stringify(d));
        e += result.get.error[y1];
      }
      for (var y2 in result.buy.error) {
        d = {}; d[y2] = result.buy.error[y2];
        detail.push(JSON.stringify(d));
        e += result.buy.error[y2];
      }
      errors += e;
      tickets += result.buy.success;
      soldouts += result.buy.soldout;
      if (result.first_soldout) {
        if (!soldoutAt  || result.first_soldout < soldoutAt)
          soldoutAt = result.first_soldout;
      }
    } else {
      console.log(JSON.stringify({time:(new Date()), in:'MakeScore',
                                  message:'invalid type in scoring...',type:type,err:err,result:result}, null, '  '));
    }
  }

  if ((gets + posts) * 100.0 / (gets + posts + errors + timeouts) < 99) {
    fatal = true;
    var percentage = Math.floor((gets + posts) * 1000.0 / (gets + posts + errors + timeouts)) / 10.0;
    detail.push('GET failure response too many, success response: ' + percentage + '%');
  }

  var score;
  if (tickets < 1) {
    score = null;
  } else {
    var basicScore = soldoutAt;
    if (! soldoutAt)
      basicScore = Math.floor( TICKETS * benchTime() / tickets );

    score = Math.floor( basicScore - SCORE_SOLDOUT_PARAM * soldouts - SCORE_GETS_PARAM * gets );
  }
  console.log(JSON.stringify({message:'scoring....', score:score, dataList:dataList}, null, ' '));
  storage.set({
    teamid:teamid,
    failed:fatal, score:score, tickets:tickets, soldouts:soldouts, soldoutAt:soldoutAt,
    gets:gets, posts:posts, errors:errors, timeouts:timeouts,
    detail:detail
  }, function(err){
    if (err) {
      console.log(JSON.stringify({time:(new Date()), in:'MakeScore',
                                  message:'Failed to store scores into database',
                                  score:score, err:err}, null, '  '));
    }
  });
};

// check to expired agents (setInterval)
// check to expired sessions (setInterval)
