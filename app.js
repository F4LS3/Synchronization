console.clear();

const express = require('express');
const app = express();
const fs = require('fs');
const io = require('socket.io')(30001);
console.log(`[INFO] Started communication on port 30001`);

const Frame = require('./Frame.js');
const Group = require('./Group.js');

let groups = [], frames = [], registeredFrames = [];

function loadGroups() {
    fs.readdir(__dirname, (err, files) => {
        if (err) return console.error(`[ERROR] ${err}`);

        files.forEach(file => {
            if (file.endsWith(".mp4")) {
                groups.push(new Group(file.split(".")[0], file));
            }
        });
    });
}

function loadFrames() {
    fs.readFile(`${__dirname}/config.json`, (err, data) => {
        if (err) return console.error(`[ERROR] ${err}`);
        let json = JSON.parse(data);

        json.frames.forEach(f => {
            registeredFrames.push({ ip: f.ip, name: f.name, group: f.group });
        });
    });
}

loadGroups();
loadFrames();

app.get('/', (req, res) => {
    res.sendFile(`${__dirname}/data/index.html`);
});

app.get('/video', (req, res) => {
    let frame = frames.find(f => f._ip === req.connection.remoteAddress.replace("::ffff:", ""));
    let videoName = frame._group + ".mp4";
    res.sendFile(`${__dirname}/data/${videoName}`);
});

io.on('connection', socket => {
    let frame = new Frame(socket.id, socket.handshake.address.replace("::ffff:", ""), null);
    registeredFrames.forEach(f => {
        if (f.ip == frame._ip) {
            frame.setId(f.name);
            frame.setGroup(f.group);
        }
    });

    frames.push(frame);

    socket.on('disconnect', () => {
        console.log(`[INFO] Frame disconnected -> ${frame._id}`);
    });

    console.log(`[INFO] Frame connected -> ${frame._id}`);
});

app.listen(30000, () => {
    console.log(`[INFO] Started webserver on port 30000`);
});

let groupTimes = [];

setInterval(function () {
    if (frames.length > 0) {
        groups.forEach(g => {
            frames.filter(f1 => f1._group === g._name)
                .forEach(f2 => {
                    f2._socket.emit('sync', );
                });
        });
    }
}, 1000);