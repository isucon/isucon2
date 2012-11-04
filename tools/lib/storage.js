var util = require('util'),
    async = require('async'),
    mysql = require('mysql');

var init = exports.init = function(teams, callback){
  var storage = new Storage('localhost', 3306, 'isumaster2', 'throwing', 'isumaster2');
  storage.load(teams, function(err, results){
    callback(err, storage);
  });
};

var Storage = exports.Storage = function(host, port, user, password, database){
  this.db = {host:host, port:port, user:user, password:password, database:database};
  this.status = {}; // teamid -> {id:x, name:'', display:'', recent:{}, highscore:{}}
};

Storage.prototype.client = function(){
  return mysql.createClient(this.db);
};

var RESULT_FIELDS = 'teamid,failed,score,tickets,soldouts,soldoutAt,gets,posts,errors,timeouts,detail,inserted_at';
var RESULT_QUERY = 'SELECT ' + RESULT_FIELDS + ' FROM results WHERE id=?';
Storage.prototype.queryResult = function(client, id, callback){
  client.query(RESULT_QUERY, [id], function(err,results){
    if (err || results.length !== 1) { callback(err,null); return; }
    callback(err,results[0]);
  });
};
var RECENT_QUERY = 'SELECT ' + RESULT_FIELDS + ' FROM results WHERE teamid IN (%s) ORDER BY id DESC';
Storage.prototype.queryRecents = function(client, teamids, callback){
  var q = util.format(RECENT_QUERY, teamids.map(function(i){return '?';}).join(','));
  client.query(q, teamids, function(err,results){
    if (err) { callback(err); return; };
    var data = []; var teams = {};
    results.forEach(function(r){
      if (teams[r.teamid]) { return; }
      r.failed = (r.failed === 1 ? true : false);
      r.detail = JSON.parse(r.detail);
      data.push(r);
      teams[r.teamid] = true;
    });
    callback(err,data);
  });
};
var HIGHSCORE_QUERY = 'SELECT ' + RESULT_FIELDS + ' FROM results WHERE teamid IN (%s) AND failed=0 ORDER BY tickets DESC, score ASC';
Storage.prototype.queryHighScores = function(client, teamids, callback){
  var q = util.format(HIGHSCORE_QUERY, teamids.map(function(i){return '?';}).join(','));
  client.query(q, teamids, function(err,results){
    if (err) { callback(err); return; }
    var data = []; var teams = {};
    results.forEach(function(r){
      if (teams[r.teamid]) { return; }
      r.failed = (r.failed === 1 ? true : false);
      r.detail = JSON.parse(r.detail);
      data.push(r);
      teams[r.teamid] = true;
    });
    callback(err,data);
  });
};

Storage.prototype.load = function(teams, callback){
  var self = this;
  var teamids = teams.map(function(t){ return t.id; });
  var client = this.client();
  async.series([
    function(cb){
      teams.forEach(function(team){
        var teamid = team.id;
        self.status[teamid] = {id:teamid, name:team.name, display:team.display, recent:null, highscore:null};
      });
      cb(null);
    },
    function(cb){
      self.queryRecents(client, teamids, function(err,results){
        if (err) { cb(err); return; }
        results.forEach(function(r){ self.status[r.teamid].recent = r; });
        cb(null);
      });
    },
    function(cb){
      self.queryHighScores(client, teamids, function(err,results){
        if (err) { cb(err); return; }
        results.forEach(function(r){ self.status[r.teamid].highscore = r; });
        cb(null);
      });
    }
  ], function(err, results){
    client.end();
    callback(err, self);
  });
};

// obj attributes: teamid, failed, score, tickets, soldouts, soldoutAt, gets, posts, errors, timeouts, detail
Storage.prototype.set = function(obj, callback){
  var self = this;
  var client = this.client();
  var values = [
    obj.teamid, (obj.failed ? 1 : 0),
    obj.score, obj.tickets, obj.soldouts,
    obj.soldoutAt, obj.gets, obj.posts, obj.errors, obj.timeouts, JSON.stringify(obj.detail)
  ];
  var teamid = obj.teamid;
  self.status[teamid].recent = obj;
  client.query('INSERT INTO results (' + RESULT_FIELDS + ') VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())', values, function(err,info){
    if (err) { callback(err); return; }
    self.queryResult(client, info.insertId, function(err,result){
      if (err || result === null) {
        callback({message:'failed to get stored record of id:' + info.insertId + ', message:' + (err || {})['message']});
        return;
      }
      self.status[teamid].recent['inserted_at'] = result.inserted_at;

      /* query high score and set */
      self.queryHighScores(client, [teamid], function(err,results){
        if (err || results.length !== 1) { /* TODO: log errors */ return; }
        self.status[teamid].highscore = results[0];

        client.end();
        callback(null);
      });
    });
  });
};

Storage.prototype.get = function(teamid){
  return this.status[teamid];
};

Storage.prototype.all = function(){
  var self = this;
  var keys = [];
  for (var key in this.status) {
    keys.push(key);
  }
  return keys.sort(function(a,b){return a-b;}).map(function(teamid){
    return self.status[teamid];
  });
};

Storage.prototype.ranking = function(){
  return this.all().sort(function(t1,t2){
    if (t1.recent === null || t2.recent === null) {
      if (t1.recent === null && t2.recent !== null)
        return 1;
      if (t1.recent !== null && t2.recent === null)
        return -1;
      return t1.id - t2.id; // both are null
    }

    var ticketsDiff = t1.recent.tickets - t2.recent.tickets;
    if (ticketsDiff > 0) {
      return -1;
    } else if (ticketsDiff < 0) {
      return 1;
    }
    // same tickets (maybe soldout all tickets)
    if (t1.recent.score === null || t2.recent.score === null) {
      if (t1.recent.score === null && t2.recent.score !== null)
        return 1;
      if (t1.recent.score !== null && t2.recent.score === null)
        return -1;
      return t1.id - t2.id; // same tickets but both benchs failed
    }
    return t1.recent.score - t2.recent.score;
  });
};
