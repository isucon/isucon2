var async = require('async'),
    crypto = require('crypto');

var Worker = require('./worker').Worker;

var CHECKER_DEFAULT_LOOP_INTERVAL = 100; // milliseconds
var CHECKER_CONTENT_CHECK_WAIT = 1010; // 1.01sec (1sec by regulation)

var CHECKER_CSV_CHECK_WAIT = 5010;

var CHECKER_TARGET_STATIC_FILES = [ // and its MD5 checksums
  ['/css/ui-lightness/jquery-ui-1.8.24.custom.css', '19de18fff09262a52224f44216544f2b'],
  ['/css/isucon2.css', 'f32b4253d9f085614a6a7330364db339'],
  ['/js/jquery-1.8.2.min.js', 'cfa9051cc0b05eb519f1e16b2a6645d7'],
  ['/js/jquery-ui-1.8.24.custom.min.js', 'f6148fb67d773df6d2584d2903f50b37'],
  ['/js/isucon2.js', 'd806d6a1e22ee8962be7f553f31da27a'],
  ['/images/isucon_title.jpg', 'f4e250d855a493eb637177c4959b9abc']
];

var agent = exports.agent = function(args) {
  return new Checker(args);
};

var Checker = exports.Checker = function(args) {
  this.timeout = args.timeout;
  this.bought = [];
};

function check_artists(artists) {
  return (
    artists[0].id === 1 && artists[0].name === 'NHN48'
      && artists[1].id === 2 && artists[1].name === 'はだいろクローバーZ'
  ) ? null : 'invalid artists list';
};

function check_tickets(artist_id, tickets) {
  if (artist_id === 1) {
    return (
      tickets.length === 2
        && tickets[0].id === 1 && tickets[0].name === '西武ドームライブ'
        && tickets[1].id === 2 && tickets[1].name === '東京ドームライブ'
    ) ? null : 'invalid tickets for artist 1';
  }
  if (artist_id === 2) {
    return (
      tickets.length === 3
        && tickets[0].id === 3 && tickets[0].name === 'さいたまスーパーアリーナライブ'
        && tickets[1].id === 4 && tickets[1].name === '横浜アリーナライブ'
        && tickets[2].id === 5 && tickets[2].name === '西武ドームライブ'
    ) ? null : 'invalid tickets for artist 2';
  }
  return 'unknown artist id (for tickets check)';
};

function check_variations(ticket_id, variations) {
  // [{name:variation_name, id:variation_id, count:vacancy_count, status:(statusMap[variation_id] || {})}]
  if (ticket_id >= 1 && ticket_id <= 5) {
    if ( variations.length !== 2 || variations[0].id !== (ticket_id * 2 - 1) || variations[0].name !== 'アリーナ席'
         || variations[1].id !== (ticket_id * 2) || variations[1].name !== 'スタンド席')
      return 'invalid variations for ticket id ' + ticket_id;
  } else { // ticket_id is not (1,2,3,4,5)
    return 'unknown ticket id (for variations check)';
  }
  return null;
};

Checker.prototype.transaction = function(worker, artist_id, ticket_id, callback) {
  var self = this;
  var get_results = [],
      buy_result = null,
      later_variation = false,
      previous_seats = null,
      buy_result_seat = null,
      soldout_at = null;
  var target_artist_name = null,
      target_ticket_name = null,
      target_variation_name = null,
      target_variation_id = null;

  async.series([
    // check css/js/image
    function(cb) {
      var contentChecker = function(path, checksum, checkerCallback) {
        worker.getContent(path, function(err, content){
          if (err) { checkerCallback(err); return; }
          var md5sum = crypto.createHash('md5');
          md5sum.update(content.toString('binary'));
          if (md5sum.digest('hex') === checksum) {
            checkerCallback(null);
          } else {
            checkerCallback({message:'content checksum mismatch for ' + path, code:null});
          }
        });
      };
      var checks = CHECKER_TARGET_STATIC_FILES.map(function(pair){
        return function(cb){ contentChecker(pair[0], pair[1], function(err){
          get_results.push({err:err, result:(err ? 0 : 1)});
          cb(null);
        }); };
      });
      async.parallel(checks, function(err, results) {
        cb(null);
      });
    },
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
      } else if (artists[0].name !== 'NHN48' || artists[1].name !== 'はだいろクローバーZ') {
        cb('artist names are not correct');
      } else if (check_artists(artists)) {
        cb(check_artists(artists));
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
      } else if (check_tickets(artist_id, tickets)) {
        cb(check_tickets(artist_id, tickets));
      } else {
        get_results.push({err:err, result:1});
        cb(null);
      }
    }); },
    // show ticket variations and seat view
    function(cb){ worker.getVariations(ticket_id, true, function(err, $, variations){
      if (err) { get_results.push({err:err, result:0}); cb(null); return; }
      // [{name:variation_name, id:variation_id, count:vacancy_count, status:(statusMap[variation_id] || {})}]
      if (check_variations(ticket_id, variations)) {
        cb(check_variations(ticket_id, variations));
        return;
      }

      for(var i = 0 ; i < variations.length ; i++) {
        if (!target_variation_id && variations[i].count > 0) {
          target_variation_name = variations[i].name;
          target_variation_id = variations[i].id;
          previous_seats = variations[i].status;
        }
      }
      if (! target_variation_id) {
        target_variation_id = variations[variations.length - 1].id;
        target_variation_name = variations[variations.length - 1].name;
        previous_seats = variations[variations.length - 1].status;
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
        } else if (res.result !== 'success') {
          // sold out of first variation
        } else {
          if (! /^\d\d-\d\d$/.exec(res.seat)) {
            cb({message:'unknown format of seat number:' + res.seat, code:null}); return;
          } else if (! previous_seats[res.seat]) {
            cb({message:'variation id: ' + target_variation_id + 'seat id ' + res.seat + ' is already unavailable .... double booking?',
                code:null});
            return;
          } else {
            buy_result_seat = res.seat;
            self.bought.push([res.member_id, res.seat]);
          }
        }
        cb(null);
      });
    },
    function(cb){ setTimeout(function(){cb(null);}, CHECKER_CONTENT_CHECK_WAIT); },
    function(cb){
      worker.getVariations(ticket_id, true, function(err, $, variations){
        if (err) { get_results.push({err:err, result:0}); cb(null); return; }
        // [{name:variation_name, id:variation_id, count:vacancy_count, status:(statusMap[variation_id] || {})}]

        if (check_variations(ticket_id, variations)) {
          cb(check_variations(ticket_id, variations));
          return;
        }

        var target_index = null;
        for(var i = 0 ; i < variations.length ; i++) {
          if (variations[i].id === target_variation_id)
            target_index = i;
        }
        if (target_index === null) {
          cb({message:'seat list is not rendered correctly after /buy', code:null}); return;
        }
        var targetSeatStatus = variations[target_index].status;
        if (buy_result_seat) {
          // check previous seat and present seat
          if (targetSeatStatus[buy_result_seat]) { /* bought seat is still 'available' */
            cb({message:'seat list is not updated correctly (still "available"), variation id:' +
                target_variation_id + ', seat id:' + buy_result_seat,
                code:null});
            return;
          }
        } else { /* else ( buy_result_seat is null ), already sold out (or /buy error) */
          if (soldout_at) {
            var blankSeat = false;
            for (var seat in targetSeatStatus) {
              if (targetSeatStatus[seat])
                blankSeat = true;
            }
            if (blankSeat) {
              cb({message:'seat list is not updated correctly, "available" seat exists after sold-out, variation id:' + target_variation_id,
                  code:null});
              return;
            }
          } else {
            get_results.push({err:err, result:1});
          }
        }
        cb(null);
      });
    }
  ], function(err,results){
    if (err) { callback(err); return; }
    callback(null, {get:get_results, buy:buy_result, soldout_at:soldout_at});
  });
};

Checker.prototype.loop = function(start, target_ip, target_port, target_artist, target_ticket, seconds, callback) {
  var workerTimeout = this.timeout - CHECKER_CSV_CHECK_WAIT;

  var worker = new Worker({target_ip:target_ip, target_port:target_port, retries: 3, timeout:workerTimeout});
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
        CHECKER_DEFAULT_LOOP_INTERVAL
      );
    }
  };

  setTimeout(function(){
    if (error_exists) return;

    worker.checkCsv(self.bought, function(err){
      callback(err, counts);
    });
  }, (seconds * 1000 - CHECKER_CSV_CHECK_WAIT));

  this.transaction(worker, target_artist, target_ticket, transaction_callback);
};

Checker.prototype.execute = function(target_ip, target_port, target_artist, target_ticket, seconds, callback) {
  var self = this;
  var start = (new Date()).getTime();
  self.loop(start, target_ip, target_port, target_artist, target_ticket, seconds, callback);
};
