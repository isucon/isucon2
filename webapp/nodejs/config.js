module.exports = (function () {
    var common = require('./../config/common.' + (process.env.ISUCON_ENV || 'local'));
    return {
        database: {
            host:"54.248.72.21" ,
            port: "3306",
            user: "isucon2app",
            password: "isunageruna",
            database: "isucon2"
        }
    };
}());
