$(function(){
  $('#login_box').show();
  $('#loggedin_box').hide();
  $('#loginSubmit').click(function(e){
    loginAction(function(err, user){
      if (err) { notificate('UNAUTHENTICATED', 15000); return; }
      $('#username').text(user.username);
      $('#login_box').hide(); $('#loggedin_box').show();
      changeButtons();
    });
    return false;
  });
  $('#logoutAction').click(function(e){
    logoutAction(function(err){
      notificate('LOGOUT', 5000);
      $('#login_box').find('input').val('');
      $('#login_box').show(); $('#loggedin_box').hide();
      changeButtons();
    });
    return false;
  });
  $.get('/session?t=' + (new Date()).getTime(), function(data){
    if (data && data.username) {
      loginUser = data;
      $('#username').text(data.username);
      $('#login_box').hide(); $('#loggedin_box').show();
      changeButtons();
    }
  });

  $('#errorModal').hide(); // in default
  changeButtons();

  // get teams list and show (and set click events to each team boxes)
  var updateTeams = function(callback){
    getTeams(function(err, teams){
      if (err) { notificate('TEAM STATUS MISSING', 10000); return; }
      showTeams(teams);
      if (callback)
        callback();
    });
  };
  updateTeams(function(){ setInterval(updateTeams, 5000); });
  
  // get agents list and show
  var updateAgents = function(callback) {
    getAgents(function(err, agents){
      if (err) { notificate('AGENT LIST MISSING', 30000); return; }
      showAgents(agents);
      if (callback)
        callback();
    });
  };
  updateAgents(function(){ setInterval(updateAgents, 15000); });
});
/**** for (old?) IE ****/
if (!('console' in window)) {
  window.console = {};
  window.console.log = function(obj) { return obj; };
}

// status and caches
var onMemory = { teams: [], agents: [] };
var notification = {message:'', timer:{enabled:false}};
var selectedTeam = null;
var selectedTeamUpdate = null;
var loginUser = null; //{username:string, teams:[teamid(s)], admin:bool}

// UI event functions and its actions

function bindTeamEvents() {
  $('.teamsbox')
    .unbind()
    .click(function(event){
      var match = /^team(\d+)/.exec($(event.target).closest('div.teamsbox').attr('id'));
      var team = getTeam(parseInt(match[1]));
      if (team) {
        selectedTeam = team;
        selectedTeamUpdate = (team.recent && team.recent.inserted_at || null);
        showTeamDetail(team);
      }
      changeButtons();
    });
}

function changeButtons() {
  if (!loginUser) { //logout: release all buttons privilegees
    $('#btn_bench_start,#btn_latest_errors,#btn_kill_bench,#btn_show_ranking,#btn_toggle_restricted').unbind().hide();
    return;
  }
  if (loginUser && loginUser.admin) {
    // admin user has all privileges
    $('#btn_show_ranking').show().unbind().click(showRanking);
    $('#btn_toggle_restricted').show().unbind().click(toggleRestricted);
  }
  if (!selectedTeam) {
    $('#btn_bench_start,#btn_latest_errors,#btn_kill_bench').unbind().hide();
    return;
  }

  if (loginUser.admin || checkPrivilege(loginUser, selectedTeam)) {
    $('#btn_bench_start').show().unbind().click(startBench);
    $('#btn_latest_errors').show().unbind().click(showLatestErrors);
    $('#btn_kill_bench').show().unbind().click(killBench);
  } else {
    $('#btn_bench_start,#btn_latest_errors,#btn_kill_bench').unbind().hide();
  }
}

function startBench() {
  if (! selectedTeam) { notificate('Team not selected', 10000); return; }
  var path = '/bench/' + selectedTeam.id;
  $.ajax({
    url: path,
    type: 'POST',
    dataType: 'json',
    data: {},
    error: function(jqXHR, textStatus, errorThrown) {
      console.log({time:(new Date()), in:'StartBench', message:'failed to POST ' + path, status:textStatus, response:jqXHR.responseText});
      notificate('BENCH FAILED:' + jqXHR.responseText, 15000);
    },
    success: function(data, textStatus, jqXHR) {
      notificate('BENCH START', 10000);
    }
  });
}

function killBench() {
  if (! selectedTeam) { notificate('Team not selected', 10000); return; }
  var path = '/kill/' + selectedTeam.id;
  $.ajax({
    url: path,
    type: 'POST',
    dataType: 'json',
    data: {},
    error: function(jqXHR, textStatus, errorThrown) {
      console.log({time:(new Date()), in:'KillBench', message:'failed to POST ' + path, status:textStatus, response:jqXHR.responseText});
      notificate('KILL BENCH FAILED:' + jqXHR.responseText, 15000);
    },
    success: function(data, textStatus, jqXHR) {
      notificate('OK, KILLED', 10000);
    }
  });
}

function showLatestErrors() {
  if (! selectedTeam) { notificate('Team not selected', 10000); return; }
  if (!selectedTeam.recent || !selectedTeam.recent.detail || selectedTeam.recent.detail.length < 1) {
    errorDialog(['NO ERROR DETAIL']); return;
  }
  errorDialog(selectedTeam.recent.detail);
}

function showRanking() {
  if (!loginUser || !loginUser.admin){ notificate('NON ADMIN USER', 20000); return; }
  $.ajax({
    url: '/ranking?t=' + (new Date()).getTime(),
    type: 'GET',
    dataType: 'json',
    error: function(jqXHR, textStatus, errorThrown) {
      console.log({time:(new Date()), in:'Ranking', message:'failed to GET /ranking', status:textStatus, response:jqXHR.responseText});
      notificate('RANKING ERROR', 10000);
    },
    success: function(data, textStatus, jqXHR) {
      rankingDialog(data);
    }
  });
}

function toggleRestricted() {
  if (!loginUser || !loginUser.admin){ notificate('NON ADMIN USER', 20000); return; }
  $.ajax({
    url: '/restricted',
    type: 'POST',
    dataType: 'json',
    data: {},
    error: function(jqXHR, textStatus, errorThrown) {
      console.log({time:(new Date()), in:'Restricted', message:'failed to POST /restricted', status:textStatus, response:jqXHR.responseText});
      notificate('ERROR ON TOGGLE RESTRICT MODE', 10000);
    },
    success: function(data, textStatus, jqXHR) {
      notificate('RESTRICTED MODE:' + data.restricted, 10000);
    }
  });
}

// function for notification messages
function notificate(message,timeout) { // timeout as msec
  if (notification.message !== '') {
    notification.timer.enabled = false;
  }
  notification.message = message;
  var timer = {enabled:true, timeout:new Date((new Date()).getTime() + timeout)};
  notification.timer = timer;
  setTimeout(function(){ if (timer.enabled) { $('#notification').text(''); } }, timeout);
  $('#notification').text(message);
}

// functions for login/logout/privileges
function loginAction(callback) {
  $.ajax({
    url: '/login',
    type: 'POST',
    dataType: 'json',
    data: {username:$('#login_box > input[name=username]').val(), password:$('#login_box > input[name=password]').val()},
    error: function(jqXHR, textStatus, errorThrown) {
      console.log({time:(new Date()), in:'LoginAction', message:'failed to POST /login', status:textStatus, response:jqXHR.responseText});
      callback(jqXHR.responseText);
    },
    success: function(data, textStatus, jqXHR) {
      loginUser = data;
      callback(null, loginUser);
    }
  });
}
function logoutAction(callback) {
  $.ajax({
    url: '/logout',
    type: 'POST',
    dataType: 'json',
    data: {},
    error: function(jqXHR, textStatus, errorThrown) {
      console.log({time:(new Date()), in:'LogoutAction', message:'failed to POST /logout', status:textStatus, response:jqXHR.responseText});
      loginUser = null;
      callback(true);
    },
    success: function(data, textStatus, jqXHR) {
      loginUser = null;
      callback(null);
    }
  });
}
function checkPrivilege(user, team) {
  for (var t in user.teams) {
    if (user.teams[t] === team.id)
      return true;
  }
  return false;
}

// function for errors dialog
$.template('errorTemplate', '<li>${error}</li>');
function errorDialog(errors) {
  $('#errorModal > div.modal-body > ul.errors').html('');
  $.tmpl('errorTemplate', errors.map(function(e){return {error:e};})).appendTo('#errorModal > div.modal-body > ul.errors');
  $('#errorModal').modal();
}

// show ranking
$.template('rankingTemplate',
           '<tr>' +
           '  <td style="color:${rank};">${failed}${name}</td>' +
           '  <td style="text-align: center;">${tickets} / ${soldoutAt}</td>' +
           '  <td style="text-align: right;"><strong>${score}</strong></td>' +
           '</tr>');
function rankingDialog(teams) {
  $('#rankingModal > div.modal-body > table.ranks').html('');
  $.tmpl('rankingTemplate', teams.map(function(t){
    var r = t.recent;
    if (!r)
      r = {failed:true,tickets:0,soltoutAt:null,score:null};
    var s = (r.soldoutAt ? Math.floor(r.soldoutAt / 1000) : '-');
    return {name:t.name, failed:(r.failed ? '[F]' : ''), tickets:r.tickets, soldoutAt:s, score:r.score};
  })).appendTo('#rankingModal > div.modal-body > table.ranks');
  $('#rankingModal').modal();
}

// show teams
$.template('teamTemplate',
           '<div class="span2 teamsbox ${topteam}" id="team${teamid}">' +
           '  <div class="row team_name ${highlevel}">{{html display}}</div>' +
           '  <div class="row high_score">BEST:${highscore}</div>' +
           '  <div class="row result_tickets">${tickets}</div>' +
           '  <div class="row result_score ${additional_class}">score:${score}</div>' +
           '</div>');
var lastDrawn = null;
function showTeams(teams) { // [ {id:x, name:'', display:'', running:bool, recent:{}, highscore:{}} ]
  var topTeamId, topScore;
  teams.forEach(function(team){
    if (!team.recent || !team.recent.score ||team.recent.failed)
      return;
    if (!topScore || topScore > team.recent.score) {
      topTeamId = team.id;
      topScore = team.recent.score;
    }
  });

  var html = $.tmpl('teamTemplate', teams.map(function(t){
    var cls = '',
        score = '-';
    if (t.running) {
      cls = 'result_running'; score = 'RUNNING';
    } else if (t.recent && t.recent.failed) {
      cls = 'result_failed' ; score = 'FAILED';
    } else if (t.recent && t.recent.score) {
      score = t.recent.score;
    } else { /* nothing to do */ }

    var tickets = (t.recent && t.recent.tickets ? t.recent.tickets + ' tickets' : '-');
    if (t.recent && t.recent.soldoutAt) {
      tickets = 'SoldOut:' + (t.recent.soldoutAt / 1000) + 'sec';
    }
    return {
      topteam: (t.id === topTeamId ? 'topteam' : ''),
      teamid: t.id,
      display: t.display,
      highlevel: (t.highscore && t.highscore.score < 180000 ? 'highlevel' : ''),
      highscore: (t.highscore && t.highscore.score || '-'),
      tickets: tickets,
      score: score,
      additional_class: cls
    };
  }));
  if (html === lastDrawn) {
    return;
  }
  lastDrawn = html;
  $('#teams').html(html);

  if (selectedTeam) {
    var currentTeamStatus = getTeam(selectedTeam.id);
    var currentUpdate = (currentTeamStatus.recent && currentTeamStatus.inserted_at || null);
    if (currentUpdate !== selectedTeamUpdate) {
      notificate('TEAM BENCH RESULT UPDATED', 10000);
      selectedTeam = currentTeamStatus;
      selectedTeamUpdate = currentUpdate;
      showTeamDetail(selectedTeam);
      changeButtons();
    }
  }
  bindTeamEvents();
}

function timeString(d){
  function pad(n){return n<10 ? '0'+n : n;}
  return pad(d.getHours()) + ':' + pad(d.getMinutes())+ ':' + pad(d.getSeconds());
}
 
$.template('teamDetailTemplate',
           '<ul>' +
           '  <li class="team" data-teamid="${teamid}">${name}</li>' +
           '  <li class="score">Score:${score}</li>' +
           '  <li class="tickets">Tickets:${tickets}</li>' +
           '  <li class="soldout">SoldOut:${soldouts}</li>' +
           '  <li class="soldoutAt">SoldOutAt:${soldoutAt}</li>' +
           '  <li class="gets">GET:${gets}</li>' +
           '  <li class="posts">POST:${posts}</li>' +
           '  <li class="errors">Errors:${errors}</li>' +
           '  <li class="timeouts">Timeouts:${timeouts}</li>' +
           '  <li class="inserted_at">Update:${insertedAt}</li>' +
           '</ul>');
function showTeamDetail(team) { // {id:x, name:'', display:'', running:bool, recent:{}, highscore:{}}
  if (team === null) { $('#teamdetail').html(''); return; }

  var update = '-';
  if (team.recent && team.recent.inserted_at) { // inserted_at: "2012-10-30T10:53:26.000Z"
    update = timeString(new Date(team.recent.inserted_at));
  }

  $('#teamdetail').html($.tmpl('teamDetailTemplate', [{
    teamid:team.id,
    name:team.name,
    score: (team.recent && team.recent.score || '-'),
    tickets: (team.recent && team.recent.tickets || '-'),
    soldouts: (team.recent && team.recent.soldouts || '-'),
    soldoutAt: (team.recent && team.recent.soldoutAt || '-'),
    gets: (team.recent && team.recent.gets || '-'),
    posts: (team.recent && team.recent.posts || '-'),
    errors: (team.recent && team.recent.errors || '-'),
    timeouts: (team.recent && team.recent.timeouts || '-'),
    insertedAt: update
  }]));
}

// show agents
$.template('agentTemplate',
           '<li>${name}' +
           '  <span class="badge badge-success">${primary}</span>' +
           '  <span class="badge badge-warning">${secondary}</span>' +
           '</li>');
function showAgents(agents) { // [ {name:'agentN', ip:'192.168.0.1', port:5000, primary:2, secondary:6, modified_at:(date)} ]
  $('#agents').html($.tmpl('agentTemplate', agents.map(function(a){
    return {name:a.name, primary:a.primary, secondary:a.secondary};
  })));
}

function getTeams(callback) {
  $.ajax({
    url: '/current?t=' + (new Date()).getTime(),
    type: 'GET',
    error: function(jqXHR, textStatus, errorThrown) {
      console.log({time:(new Date()), in:'GetTeams', message:'failed to GET /current', status:textStatus, response:jqXHR.responseText});
      callback(true);
    },
    success: function(data, textStatus, jqXHR) {
      onMemory.teams = data;
      callback(null, onMemory.teams);
    }
  });
}
function getAgents(callback) {
  $.ajax({
    url: '/agents?t=' + (new Date()).getTime(),
    type: 'GET',
    error: function(jqXHR, textStatus, errorThrown) {
      console.log({time:(new Date()), in:'GetAgents', message:'failed to GET /agents', status:textStatus, error:jqXHR.responseText});
      callback(true);
    },
    success: function(data, textStatus, jqXHR) {
      onMemory.agents = data;
      callback(null, onMemory.agents);
    }
  });
}

function getTeam(teamid) {
  for (var team in onMemory.teams) {
    if (onMemory.teams[team].id === teamid)
      return onMemory.teams[team];
  }
  return null;
}
