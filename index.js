const fs = require("fs");
const compressing = require('compressing');
const MongoClient = require('mongodb').MongoClient;
const schedule = require('node-schedule');

const http = require("http");
const url = require("url");

if(!fs.existsSync(__dirname + "/backup")) fs.mkdirSync(__dirname + "/backup");
if(!fs.existsSync(__dirname + "/temp")) fs.mkdirSync(__dirname + "/temp");

const server = http.createServer((req, res) => {
    var { pathname } = url.parse(req.url, true);

    res.setHeader("Content-Type", "application/json");

    if (pathname == "/requests/files") {
        var files = []
        var tS = getDirSize(__dirname + "/backup/");
        fs.readdirSync(__dirname + "/backup/").forEach(f => {
            var stat = fs.statSync(__dirname + "/backup/" + f);
            files.push({ name: f, size: stat.size, time: parseDate(f.split(".").reverse().splice(1).reverse().join(".")).getTime() });
        });
        return res.end(JSON.stringify({ status: 200, message: "OK", result: { totalSize: tS, files } }));
    }
    return res.end(JSON.stringify({ status: 404, message: "Not Found" }));
});
server.listen(15203);

var db;

MongoClient.connect(require("./tokens.json").mongodbLink, function(err, client) {
    console.log("Connected successfully to mongodb");

    db = client.db(require("./tokens.json").dbName);

    schedule.scheduleJob("0 0 * * *", () => {
        var sizeBackup = 0;

        do {
            let filesBackup = fs.readdirSync(__dirname + "/backup/");
            sizeBackup = getDirSize(__dirname + "/backup/");

            console.log(sizeBackup)
            if (sizeBackup >= 5e+8) {
                filesBackup.sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime());
                fs.rmSync(__dirname + "/backup/" + filesBackup[0]);
            }
        }
        while (sizeBackup >= 5e+8);

        db.collections().then(collections => {
            async function col(n) {
                var collection = collections[n];

                var arrays = await collection.find(null).toArray();

                fs.writeFile(__dirname + "/temp/" + collection.namespace + ".json", JSON.stringify(arrays), () => {
                    if (n >= collections.length - 1) {
                        compressing.zip.compressDir(__dirname + "/temp/", __dirname + "/backup/" + formatDate(new Date()) + ".zip").then(() => {
                            let files = fs.readdirSync(__dirname + "/temp/");
                            files.forEach(file => {
                                fs.rmSync(__dirname + "/temp/" + file);
                            });
                        });
                    } else col(n + 1);
                });
            }

            col(0);
        });
    }).invoke();
});

function getDirSize(dir) {
    var f = fs.readdirSync(dir);
    var size = 0;

    f.forEach(f1 => {
        var s = fs.statSync(dir + "/" + f1);
        if (s.isDirectory()) size += getDirSize(dir + "/" + f1);
        else size += s.size;
    });

    return size;
}

function parseDate(str) {
    if (str.split("_").length != 2 || str.split("-").length != 3 || str.split(".").length != 3) {
        return new Date();
    }
    var date = str.split("_")[0];
    var hrs = str.split("_")[1];

    var y = date.split("-")[0];
    var m = date.split("-")[1];
    var d = date.split("-")[2];

    var h = hrs.split(".")[0];
    var min = hrs.split(".")[1];
    var s = hrs.split(".")[2];

    return new Date(y, m - 1, d, h, min, s);
}

const formatDate = (dateObj) => {
    var curr_date = dateObj.getDate();
    var curr_month = dateObj.getMonth();
    curr_month = curr_month + 1;
    var curr_year = dateObj.getFullYear();
    var curr_min = dateObj.getMinutes();
    var curr_hr = dateObj.getHours();
    var curr_sc = dateObj.getSeconds();
    if (curr_month.toString().length == 1)
        curr_month = '0' + curr_month;
    if (curr_date.toString().length == 1)
        curr_date = '0' + curr_date;
    if (curr_hr.toString().length == 1)
        curr_hr = '0' + curr_hr;
    if (curr_min.toString().length == 1)
        curr_min = '0' + curr_min;
    if (curr_sc.toString().length == 1)
        curr_sc = '0' + curr_sc;

    return curr_year + "-" + curr_month + "-" + curr_date + "_" + curr_hr + "." + curr_min + "." + curr_sc;
}