module.exports = (function () {
    var common = require('./../config/common.' + (process.env.ISUCON_ENV || 'local'));
    return {
        database: {
            host:"192.168.10.12" ,
            port: "3306",
            user: "root",
            password: "",
            database: "isucon2"
        }
    };
}());
