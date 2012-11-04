var express = require('express');
var http    = require('http');
var path    = require('path');
var cluster = require('cluster');
var filters = require('./filters');
var routes_index = require('./routes/index');
var routes_admin = require('./routes/admin');

if (cluster.isMaster) {
    for (var i = 0; i < 2; i++) {
        cluster.fork();
    }
} else {
    var app = express();

    app.configure('development', function () {
        app.use(express.logger('dev'));
        app.use(express.errorHandler());
    });

    app.configure(function () {
        app.set('port', process.env.PORT || 5000);
        app.set('view engine', 'jade');
        app.use(express.favicon());
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(express['static'](path.join(__dirname, 'public')));
        app.use(filters.recent_sold);
        app.use(app.router);
        app.locals.pretty = true;
    });

    // main routes
    app.get('/', routes_index.index);
    app.get('/artist/:artistid', routes_index.artist);
    app.get('/ticket/:ticketid', routes_index.ticket);
    app.post('/buy', routes_index.buy);
    // admin routes
    app.get('/admin', routes_admin.get_index);
    app.post('/admin', routes_admin.post_index);
    app.get('/admin/order.csv', routes_admin.order_csv);

    http.createServer(app).listen(app.get('port'), function () {
        console.log("Express server listening on port " + app.get('port'));
    });
}
