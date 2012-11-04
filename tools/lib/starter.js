var async = require('async');

var Worker = require('./worker').Worker;

var STARTER_DEFAULT_LOOP_INTERVAL = 100; // msec
var STARTER_CONTENT_CHECK_WAIT = 1010; // 1.01sec

var agent = exports.agent = function(args) {
  return new Starter(args);
};

var Starter = exports.Starter = function(args) {
  this.timeout = args.timeout;
};

function checkNextSeat(seat1, seat2) {
  var match1 = /^(\d\d)-(\d\d)$/.exec(seat1);
  var match2 = /^(\d\d)-(\d\d)$/.exec(seat2);
  if (Math.abs(parseInt(match1[1]) - parseInt(match2[1])) === 1 &&
      Math.abs(parseInt(match1[2]) - parseInt(match2[2])) === 1)
    return true;
  return false;
};

Starter.prototype.transaction = function(worker, callback) {
  var artist_id, ticket_id, variation_id;
  var bought_seats = [];

  async.series([
    function(cb){ /* initialize */
      worker.initialize(function(err, content){
        if (err) { cb(err); return; }
        cb(null);
      });
    },
    function(cb){ /* check all tickets counts is 200 */
      async.parallel([
        function(c){
          worker.getTickets(1, function(err, $, tickets) {
            if (err) { c(err); return; }
            if (tickets[0].id === 1 && tickets[0].count === (4096 * 2) &&
                tickets[1].id === 2 && tickets[1].count === (4096 * 2)) {
              c(null, true); return;
            }
            c(null, false);
          });
        },
        function(c){
          worker.getTickets(2, function(err, $, tickets) {
            if (err) { c(err); return; }
            if (tickets[0].id === 3 && tickets[0].count === (4096 * 2) &&
                tickets[1].id === 4 && tickets[1].count === (4096 * 2) &&
                tickets[2].id === 5 && tickets[2].count === (4096 * 2)) {
              c(null, true); return;
            }
            c(null, false);
          });
        }
      ], function(err, results) {
        if (err) { cb(err); return; }
        if (results[0] && results[1]) { cb(null); return; }
        cb({message:'ticket counts are not initialized correctly',code:null});
      });
    },
    function(cb){ /* select one artist-ticket pair */
      var triples = [ [1,1,[1,2]], [1,2,[3,4]], [2,3,[5,6]], [2,4,[7,8]], [2,5,[9,10]] ];
      var triple = triples[Math.floor(Math.random() * 5)];
      artist_id = triple[0];
      ticket_id = triple[1];
      variation_id = triple[2][Math.floor(Math.random() * 2)];
      cb(null);
    },
    function(cb){ /* buy three tickets, and check randomness */
      var buyTicket = function(c){
        worker.buyTicket(ticket_id, variation_id, function(err, $, res){
          if (err) { c(err); return; }
          bought_seats.unshift(res.seat);
          c(null);
        });
      };
      async.series([buyTicket, buyTicket, buyTicket], function(err, results) {
        if (err) { cb(err); return; }
        if (checkNextSeat(bought_seats[0], bought_seats[1]) && checkNextSeat(bought_seats[1], bought_seats[2])) {
          cb({message:'Seats must be selected randomly.',code:null});
        }
        cb(null);
      });
    },
    function(cb){ /* wait 1sec */
      setTimeout(function(){ cb(null); }, STARTER_CONTENT_CHECK_WAIT);
    },
    function(cb){ /* check sidebar */
      worker.getIndex(function(err, $, artists) {
        var seats = worker.parseSideBar($);
        var check = true;
        if (seats.length === bought_seats.length) {
          for (var i = 0 ; i < seats.length ; i++) {
            if (seats[i].seat !== bought_seats[i]) {
              check = false;
            }
          }
        }
        else {
          check = false;
        }
        if (! check) {
          cb({message:'Sidebar is not updated correctly',code:null});
          return;
        }
        cb(null);
      });
    },
    function(cb){ /* initialize 2nd */
      worker.initialize(function(err, content){
        if (err) { cb(err); return; }
        cb(null);
      });
    }
  ], function(err, results) { /* callback */
    if (err) { callback(err, {}); return; }
    callback(null, {result:'success'});
  });
};

Starter.prototype.execute = function(target_ip, target_port, target_artist, target_ticket, seconds, callback) {
  var self = this;
  var worker = new Worker({target_ip:target_ip, target_port:target_port, retries: 3, timeout:this.timeout});
  self.transaction(worker, callback);
};
