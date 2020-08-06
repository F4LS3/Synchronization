console.clear();

const express = require('express');
const app = express();
const fs = require('fs');
const bodyParser = require('body-parser');
const io = require('socket.io')(30001);
console.log(`[INFO] Started communication on port 30001`);

const Frame = require('./Frame.js');
const Group = require('./Group.js');
const { exec } = require('child_process');
const { stderr } = require('process');

let config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

let groups = [], frames = [], registeredFrames = [];

const fsp = require('fs').promises;

const asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
};

async function loadGroups() {
    const files = await fsp.readdir(`${__dirname}/data`);

    const groups = []

    await asyncForEach(files, async file => {

        if (file.endsWith(".mp4")) {
            const duration = await getVideoDuration(`${__dirname}/data/${file}`);
            const group = new Group(file.split(".")[0], file, null, duration, 0);
            groups.push(group);
        }
    });
}

async function getVideoDuration(video) {
    const buff = Buffer.alloc(100);
    const header = Buffer.from("mvhd");
    const file = await fsp.open(video, "r");
    const {
        buffer
    } = await file.read(buff, 0, 100, 0);

    await file.close();

    const start = buffer.indexOf(header) + 17;
    const timeScale = buffer.readUInt32BE(start);
    const duration = buffer.readUInt32BE(start + 4);

    const audioLength = Math.floor((duration / timeScale) * 1000) / 1000;

    return audioLength;
}

function loadFrames() {
    registeredFrames = [];
    config.frames.forEach(f => {
        registeredFrames.push({ ip: f.ip, name: f.name, group: f.group });
    });
}

loadGroups();
loadFrames();

app.use(express.static('public'));
app.use(bodyParser.json());

var jsonParser = bodyParser.json();

app.get('/videoDuration', (req, res) => {
    let url = req.url.substring(req.url.split("?")[0].length + 1);
    let args = url.split("=");
    console.log(args);
    res.sendFile(`${__dirname}/data/index.html`);
});

app.get('/', (req, res) => {
    res.sendFile(`${__dirname}/data/index.html`);
});

app.get('/video', (req, res) => {
    let frame = frames.find(f => f._ip === req.connection.remoteAddress.replace("::ffff:", ""));
    if (frame == null || frame._group == null) return res.sendStatus(400);

    let videoName = frame._group + ".mp4";
    res.sendFile(`${__dirname}/data/${videoName}`);
    console.log(`[INFO] Sent video from group '${frame._group}' to '${frame._id}'`);
});

app.get('/settings', (req, res) => {
    res.sendFile(`${__dirname}/data/settings.html`);
});

app.get('/frames', (req, res) => {
    let actives = [], fs2 = [], masters = [], gs2 = [];
    frames.forEach(f => {
        actives.push(f._id);
    });

    config.frames.forEach(f => {
        fs2.push({ name: f.name, video: `${f.group}.mp4`, group: f.group });
    });

    groups.forEach(g => {
        gs2.push({ name: g._name });
        if (g._master == null) return;
        masters.push(frames.find(f => f._socket === g._master)._id);
    });

    res.status(200).send({ frames: fs2, actives: actives, masters: masters, groups: gs2 });
});

app.post('/flash', jsonParser, (req, res) => {
    let body = JSON.parse(JSON.stringify(req.body));
    let json = {};
    body.forEach(f1 => {
        let ip = config.frames.find(f2 => f2.name === f1.name).ip;
        f1.ip = ip;
    });
    json.frames = body;
    json.defaultGroup = config.defaultGroup;

    fs.writeFile(`${__dirname}/config.json`, JSON.stringify(json, null, 2), (err) => {
        if (err) return console.error(err);
        config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
        loadFrames();
        io.sockets.emit('demand', "reload=");
        console.log(`[INFO] Wrote changed config`);
    });

    res.status(200).redirect("/settings");
});

io.on('connection', socket => {
    let frame = new Frame(socket.id, socket.handshake.address.replace("::ffff:", ""), config.defaultGroup, socket);
    registeredFrames.forEach(f => {
        if (f.ip == frame._ip) {
            frame.setId(f.name);
            frame.setGroup(f.group);
        }
    });
    let group = groups.find(g => g._name === frame._group);
    frames.push(frame);

    if (group._master == null) {
        group.setMaster(frame._socket);
        console.log(`[INFO] Master of group '${group._name}' changed to '${frame._id}'`);
    } else {
        frame._socket.emit('sync', group._currentTime + 1.4);
    }

    socket.on('disconnect', () => {
        frames.splice(frames.indexOf(frame), 1);
        let availableFrames = frames.filter(f1 => f1._group === group._name);
        if (availableFrames.length > 0) {
            group.setMaster(availableFrames[availableFrames.length - 1]._socket);
            console.log(`[INFO] Master of group '${group._name}' changed to '${frame._id}'`);

        } else {
            group._master = null;
            console.log(`[INFO] Master of group '${group._name}' has disconnected`);
        }

        console.log(`[INFO] Frame disconnected -> ${frame._id}`);
    });

    socket.on('sync', time => {
        groups.find(g => g._master === socket)._currentTime = time;
    });

    console.log(`[INFO] Frame connected -> ${frame._id}`);

});

app.listen(30000, () => console.log(`[INFO] Started webserver on port 30000`));

setInterval(function () {
    groups.forEach(g => {
        if (g._master == null) return;
        g._master.emit('sync', null);

        frames.filter(f1 => f1._group === g._name).forEach(f2 => {
            if (f2._socket == g._master) return;

            if (g._currentTime >= g._maxTime) {
                f2._socket.emit('demand', `time=0`);
            } else {
                f2._socket.emit('demand', `time=${g._currentTime + 1.4}`);
            }
        });
    });
}, 500);