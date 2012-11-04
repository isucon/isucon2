var fs     = require('fs');
var async  = require('async');
var mysql  = require('mysql');
var config = require('../config');

// main

exports.index = function (req, res) {
    var client = mysql.createClient(config.database);
    client.query('SELECT * FROM artist', function (err, results) {
        if (err) { throw err; }
        client.end();
        res.render('index', { artists: results });
    });
};

exports.artist = function (req, res) {
    var client = mysql.createClient(config.database);
    async.series([
        function (callback) {
            client.query(
                'SELECT id, name FROM artist WHERE id = ? LIMIT 1',
                [ req.params.artistid ],
                callback
            );
        },
        function (callback) {
            client.query(
                'SELECT id, name FROM ticket WHERE artist_id = ?',
                [ req.params.artistid ],
                callback
            );
        }
    ], function (err, results) {
        if (err) { throw err; }
        var artist  = results[0][0][0];
        var tickets = results[1][0];

        async.map(tickets, function (ticket, callback) {
            client.query(
                'SELECT COUNT(*) AS count FROM variation INNER JOIN stock ON stock.variation_id = variation.id WHERE variation.ticket_id = ? AND stock.order_id IS NULL',
                [ ticket.id ],
                callback
            );
        }, function (err, results) {
            if (err) { throw err; }
            results.forEach(function (e, i) {
                tickets[i].count = e[0].count;
            });
            client.end();
            res.render('artist', {
                artist: artist,
                tickets: tickets
            });
        });
    });
};

exports.ticket = function (req, res) {
    var client = mysql.createClient(config.database);
    async.series([
        function (callback) {
            client.query(
                'SELECT t.*, a.name AS artist_name FROM ticket t INNER JOIN artist a ON t.artist_id = a.id WHERE t.id = ? LIMIT 1',
                [ req.params.ticketid ],
                callback
            );
        },
        function (callback) {
            client.query(
                'SELECT id, name FROM variation WHERE ticket_id = ?',
                [ req.params.ticketid ],
                callback
            );
        }
    ], function (err, results) {
        if (err) { throw err; }
        var ticket = results[0][0][0];
        var variations = results[1][0];

        async.map(variations, function (variation, callback) {
            async.series([
                function (callback) {
                    client.query(
                        'SELECT seat_id, order_id FROM stock WHERE variation_id = ?',
                        [ variation.id ],
                        callback
                    );
                },
                function (callback) {
                    client.query(
                        'SELECT COUNT(*) AS count FROM stock WHERE variation_id = ? AND order_id IS NULL',
                        [ variation.id ],
                        callback
                    );
                }
            ], callback);
        }, function (err, results) {
            if (err) { throw err; }
            results.forEach(function (e, i) {
                variations[i].stock = {};
                e[0][0].forEach(function (e) {
                    variations[i].stock[e.seat_id] = e;
                });
                variations[i].vacancy = e[1][0][0].count;
            });
            client.end();
            res.render('ticket', {
                ticket: ticket,
                variations: variations
            });
        });
    });
};

exports.buy = function (req, res) {
    var variation_id = req.param('variation_id');
    var member_id    = req.param('member_id');
    var client = mysql.createClient(config.database);

    var order_id = undefined;
    async.waterfall([
        function (callback) {
            client.query('BEGIN', callback);
        },
        function (info, callback) {
            client.query(
                'INSERT INTO order_request (member_id) VALUES (?)',
                [ member_id ],
                callback
            );
        },
        function (info, callback) {
            order_id = info.insertId;
            client.query(
                'UPDATE stock SET order_id = ? WHERE variation_id = ? AND order_id IS NULL ORDER BY RAND() LIMIT 1',
                [ order_id, variation_id ],
                callback
            );
        },
        function (info, callback) {
            if (info.affectedRows > 0) {
                client.query(
                    'SELECT seat_id FROM stock WHERE order_id = ? LIMIT 1',
                    [ order_id ],
                    callback
                );
            } else {
                callback('soldout');
            }
        }
    ], function (err, result) {
        if (err) {
            var error = err;
            client.query('ROLLBACK', function (err) {
                if (err) { throw err; }
                client.end();
                if (error === 'soldout') {
                    res.render('soldout');
                } else {
                    throw error;
                }
            });
        } else {
            client.query('COMMIT', function (err) {
                if (err) { throw err; }
                client.end();
                res.render('complete', {
                    seat_id: result[0].seat_id,
                    member_id: member_id
                });
            });
        }
    });
};
