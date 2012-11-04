var mysql  = require('mysql');
var config = require('../config');

exports.recent_sold = function (req, res, next) {
    if (req.url === '/buy') {
        next();
    } else {
        (function () {
            var client = mysql.createClient(config.database);
            client.query(
                'SELECT stock.seat_id, variation.name AS v_name, ticket.name AS t_name, artist.name AS a_name FROM stock' +
                '  JOIN variation ON stock.variation_id = variation.id' +
                '  JOIN ticket ON variation.ticket_id = ticket.id' +
                '  JOIN artist ON ticket.artist_id = artist.id' +
                '  WHERE order_id IS NOT NULL ORDER BY order_id DESC LIMIT 10',
                function (err, results) {
                    if (err) { throw err; }
                    client.end();
                    res.locals.recent_sold = results;
                    next();
                }
            );
        }());
    }
};
