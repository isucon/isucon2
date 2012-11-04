var fs     = require('fs');
var async  = require('async');
var mysql  = require('mysql');
var moment = require('moment');
var config = require('../config');

// amdin

exports.get_index = function (req, res) {
    res.render('admin');
};

exports.post_index = function (req, res) {
    var client = mysql.createClient(config.database);
    fs.readFile(__dirname + '/../../config/database/initial_data.sql', 'utf-8', function (err, data) {
        var sqls = data.split(/\n/).filter(function (e) { return e.length > 0; });
        async.forEachSeries(sqls, function (sql, callback) {
            client.query(sql, callback);
        }, function (err, results) {
            if (err) { throw err; }
            client.end();
            res.redirect('/admin');
        });
    });
};

exports.order_csv = function (req, res) {
    var client = mysql.createClient(config.database);
    client.query(
        'SELECT order_request.*, stock.seat_id, stock.variation_id, stock.updated_at' + 
        '  FROM order_request JOIN stock ON order_request.id = stock.order_id' + 
        '  ORDER BY order_request.id ASC',
        [],
        function (err, results) {
            if (err) { throw err; }
            var body = '';
            results.forEach(function (e) {
                var updated_at = moment(e.updated_at).format('YYYY-MM-DD HH:mm:ss');
                body += [e.id, e.member_id, e.seat_id, e.variation_id, updated_at].join(',');
                body += '\n';
            });
            res.set('Content-Type', 'text/csv');
            res.send(body);
        }
    );
};
