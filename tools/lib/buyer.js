var async = require('async');

var Worker = require('./worker').Worker;

var BUYER_DEFAULT_LOOP_INTERVAL = 0; // milliseconds
var BUYER_START_TIMING_MAX = 2000; // milliseconds

var agent = exports.agent = function(args) {
  return new Buyer(args);
};

var Buyer = exports.Buyer = function(args) {
  this.parallels = args.parallels;
  this.timeout = args.timeout;
};

Buyer.prototype.transaction = function(worker, artist_id, ticket_id, callback) {
  var get_results = [],
      buy_result = null,
      later_variation = false,
      soldout_at = null;
  var target_artist_name = null,
      target_ticket_name = null,
      target_variation_name = null,
      target_variation_id = null;

  async.series([
    // show toppage
    function(cb){ worker.getIndex(function(err, $, artists){
      if (err) { get_results.push({err:err, result:0}); cb(null); return; }
      // [{name:artist_name, id:artist_id}]
      artists.forEach(function(a){
        if (a.id === artist_id)
          target_artist_name = a.name;
      });
      if (! target_artist_name) {
        cb('target artist id not found: ' + artist_id);
      } else {
        get_results.push({err:err, result:1});
        cb(null);
      }
    }); },
    // show tickets list
    function(cb){ worker.getTickets(artist_id, function(err, $, tickets){
      if (err) { get_results.push({err:err, result:0}); cb(null); return; }
      // [{name:ticket_name, id:ticket_id, count:ticket_count}]
      tickets.forEach(function(t){
        if (t.id === ticket_id) {
          target_ticket_name = t.name;
        }
      });
      if (! target_ticket_name) {
        cb('target ticket id not found: ' + ticket_id);
      } else {
        get_results.push({err:err, result:1});
        cb(null);
      }
    }); },
    // show ticket variations and seat view
    function(cb){ worker.getVariations(ticket_id, false, function(err, $, variations){
      if (err) { get_results.push({err:err, result:0}); cb(null); return; }
      if (variations.length < 1) {
        get_results.push({err:{message:'No one tickets are rendered in /ticket/x'}, result:0}); cb(null); return;
      }
      // [{name:variation_name, id:variation_id, count:vacancy_count, status:(statusMap[variation_id] || {})}]
      for(var i = 0 ; i < variations.length ; i++) {
        if (!target_variation_id && variations[i].count > 0) {
          target_variation_name = variations[i].name;
          target_variation_id = variations[i].id;
        }
      }
      if (! target_variation_id) {
        target_variation_id = variations[variations.length - 1].id;
        target_variation_name = variations[variations.length - 1].name;
      }
      if (target_variation_id === variations[variations.length - 1].id) {
        later_variation = true;
      }
      get_results.push({err:err, result:1});
      cb(null);
    }); },
    // buy!
    function(cb){
      if (! target_variation_id) { cb(null); return; }

      worker.buyTicket(ticket_id, target_variation_id, function(err, $, res){
      if (err) { buy_result = {err:err, result:null}; cb(null); return; }
      // res: {result:result, seat:seat}
      buy_result = {err:err, result:res.result};
      if (res.result !== 'success' && later_variation) {
        // sold out (later variation -> all tickets)
        soldout_at = new Date();
      }
      cb(null);
    }); }
  ], function(err,results){
    if (err) { callback(err); return; }
    callback(null, {get:get_results, buy:buy_result, soldout_at:soldout_at});
  });
};

Buyer.prototype.loop = function(start, target_ip, target_port, target_artist, target_ticket, seconds, callback) {
  var worker = new Worker({target_ip:target_ip, target_port:target_port, timeout:this.timeout});
  var end = new Date(start + seconds * 1000);
  var counts = {
    get: {success:0, timeout:0, error:{}}, /* error: map of responseCode -> count */
    buy: {success:0, soldout:0, timeout:0, error:{}},
    first_soldout: null
  };
  var error_exists = false;

  var self = this;
  var transaction_callback = function(err, result){
    if (err) { error_exists = true; callback(err); return; }

    // result: { get: [...], buy: obj, soldout_at: obj/null }
    result.get.forEach(function(r){
      var get = counts.get;
      if (r.err) {
        var err = r.err;
        if (err.timeout) {
          get.timeout += 1;
        } else {
          var key = err.message + (err.code || '');
          get.error[key] = (get.error[key] || 0) + 1;
        }
      } else {
        counts.get.success += 1;
      }
    });
    if (result.buy) {
      var buy = counts.buy;
      if (result.buy.err) {
        if (result.buy.err.timeout) {
          buy.timeout += 1;
        } else {
          var key = result.buy.err.message + (result.buy.err.code || '');
          buy.error[key] = (buy.error[key] || 0) + 1;
        }
      } else {
        if (result.buy.result === 'success') {
          counts.buy.success += 1;
        } else { /* soldout */
          counts.buy.soldout += 1;
        }
      }
      if (result.soldout_at && (! counts.first_soldout || result.soldout_at < counts.first_soldout)) {
        counts.first_soldout = result.soldout_at.getTime() - start;
      }
    }
    if (end > (new Date())) {
      setTimeout(
        function(){self.transaction(worker, target_artist, target_ticket, transaction_callback);},
        BUYER_DEFAULT_LOOP_INTERVAL
      );
    }
  };

  setTimeout(function(){
    if (error_exists) return;
    callback(null, counts);
  }, (seconds * 1000 + 50));

  this.transaction(worker, target_artist, target_ticket, transaction_callback);
};

Buyer.prototype.execute = function(target_ip, target_port, target_artist, target_ticket, seconds, callback) {
  var self = this;
  var start = (new Date()).getTime();

  var start_timing_interval_unit = (BUYER_START_TIMING_MAX / this.parallels).toFixed();

  var routines = new Array(this.parallels);
  for(var i = 0 ; i < this.parallels ; i++) {
    routines[i] = function(cb){ setTimeout(
      function(){ self.loop(start, target_ip, target_port, target_artist, target_ticket, seconds, cb); },
      Math.floor(Math.random() * this.parallels) * start_timing_interval_unit
    ); };
  }
  /* results: array of counts(below)
  {
    get: {success:0, timeout:0, error:{}},
    buy: {success:0, soldout:0, timeout:0, error:{}},
    first_soldout: null
  };
  */
  async.parallel(routines, function(err, results){
    if (err) { callback(err); return; }

    var counts = {
      get: {success:0, timeout:0, error:{}},
      buy: {success:0, soldout:0, timeout:0, error:{}},
      first_soldout: null
    };
    results.forEach(function(r){
      counts.get.success += r.get.success;
      counts.get.timeout += r.get.timeout;
      for(var getErrorKey in r.get.error) {
        counts.get.error[getErrorKey] = (counts.get.error[getErrorKey] || 0) + r.get.error[getErrorKey];
      }
      counts.buy.success += r.buy.success;
      counts.buy.soldout += r.buy.soldout;
      counts.buy.timeout += r.buy.timeout;
      for(var buyErrorKey in r.buy.error) {
        counts.buy.error[buyErrorKey] = (counts.buy.error[buyErrorKey] || 0) + r.buy.error[buyErrorKey];
      }
      if ((!counts.first_soldout) || counts.first_soldout > r.first_soldout) {
        counts.first_soldout = r.first_soldout;
      }
    });
    callback(err, counts);
  });
};
