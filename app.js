//Configuration
var cfg = require('./config/config');
const gpio_pin = cfg.GPIO_PIN;
const sensor_type = cfg.SENSOR_TYPE;
const database_name = cfg.DB_NAME;

console.log('The app is set to read GPIO pin #%d with sensor type of %d', gpio_pin, sensor_type);

//Express
var express = require('express');
//Body parser
var bodyParser = require('body-parser');
//Twig
var twig = require('twig');
//Path
var path = require('path')
//Schedule
var schedule = require('node-schedule');
//SQLite3
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.cached.Database(database_name);
//Redis
var redis = require('redis');
var redisClient = redis.createClient();
//Response time
var rt = require('response-time');

//DHT22 sensor library
//var dht = require('node-dht-sensor');

//Connect to a redis server
redisClient.on('connect', function () {
    console.log('Redis client connected');
    //Poll Raspberry Pi sensor
    pollRpiSensor();
});

//Initialize database structure
db.serialize(function () {
    db.run('CREATE TABLE if not exists data (id SERIAL PRIMARY KEY, tstamp INTEGER, outerTemperature DECIMAL, outerHumidity DECIMAL, outerPressure DECIMAL, weatherCode INTEGER, innerTemperature DECIMAL, innerHumidity DECIMAL)');
    db.run('INSERT INTO data (tstamp, outerTemperature, outerHumidity, outerPressure, weatherCode, innerTemperature, innerHumidity) VALUES(' + Math.floor(new Date().getTime() / 1000) + ', 25, 95, 1020, 5, 10, 50)');
});

//Initialize the application
var app = express();

//App configuration
app.use(rt()); //Response time header
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(bodyParser.text());

//App port
var port = process.env.PORT | 3000;

/**
 * Schedule a new task to poll the sensors every 5 minutes. Update variables as needed
 * @return {[type]} [description]
 */
var sensorPoll = schedule.scheduleJob('*/5 * * * *', function () {
    pollRpiSensor();
});

/*

FUNCTIONS

 */

/**
 * Polling function.
 * @return {[type]} [description]
 */
function pollRpiSensor() {
    console.log('Logging sensor data (timestamp: %d)', Math.floor(new Date().getTime() / 1000));

    /*dht.read(sensor_type, gpio_pin, function(err, temperature, humidity) {
        if (!err) {
            log(25, 95, 1020, 5, temperature.toFixed(1), humidity.toFixed(1));
            console.log('Done logging sensor data.');
        } else {
            console.error('Error logging sensor data: ', err);
        }
    });*/

    //Just for testing purposes
    //var temp = parseFloat(Math.random() * 20 + 10).toFixed(2); //Between 10 and 30
    //var humid = parseFloat(Math.random() * 60 + 40).toFixed(2); //Between 40 and 100

}

/**
 * Log a reading from the sensors.
 * @param {*} outerTemperature 
 * @param {*} outerHumidity 
 * @param {*} outerPressure 
 * @param {*} weatherCode 
 * @param {*} innerTemperature 
 * @param {*} innerHumidity 
 */
function log(outerTemperature, outerHumidity, outerPressure, weatherCode, innerTemperature, innerHumidity) {
    console.log(outerTemperature, outerHumidity, outerPressure, weatherCode, innerTemperature, innerHumidity);
    var stmt = db.prepare('INSERT INTO data (tstamp, outerTemperature, outerHumidity, outerPressure, weatherCode, innerTemperature, innerHumidity) VALUES(?, ?, ?, ?, ?, ?, ?)');
    stmt.run(Math.floor(new Date().getTime() / 1000), outerTemperature, outerHumidity, outerPressure, weatherCode, innerTemperature, innerHumidity);
    stmt.finalize();
}

/**
 * Returns the current reading of the sensors.
 * Redis is used to cache the result to speed things up.
 * @param  {Function} fn [description]
 * @return [type]        [description]
 */
function currentReading(fn) {
    redisClient.get('reading', function (err, reply) {
        //if the key exists, return int from redis
        if (reply) {
            fn(reply);
        } else {
            //Else, fetch it from database
            console.log('Fetching reading from database (Redis key has expired)');
            getCurrentReadingFromDatabase(function (res) {
                var data = JSON.stringify(res);
                redisClient.set('reading', data);
                //Redis expire time is 5 minutes.
                redisClient.expire('reading', 360);
                fn(data);
            });
        }
    });
}

/**
 * Fetches the current reading from the database.
 * @param  {Function} fn [description]
 * @return [type]        [description]
 */
function getCurrentReadingFromDatabase(fn) {
    db.serialize(function () {
        db.all('SELECT * FROM data ORDER BY id DESC LIMIT 1', function (err, res) {
            fn(res[0]);
        });
    });
}

/**
 * Fetches all results from the database.
 * @param  {Function} fn [description]
 * @return [type]        [description]
 */
function getAll(fn) {
    db.serialize(function () {
        db.all('SELECT * FROM data', function (err, res) {
            fn(res);
        });
    });

}

//Routes
/**
 * Return current weather as a JSON string
 */
app.get('/', (request, response) => {
    currentReading(function (res) {
        response.type('json');
        response.send(res);
    });
});

/**
 * Start server
 */
app.listen(port, (err) => {
    if (err) {
        return console.log('Error', err);
    }
    console.log('Back end is listening on port %d', port);
})