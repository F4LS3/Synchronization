console.clear();

const express = require('express');
const app = express();
const fs = require('fs');
const fileUpload = require("express-fileupload");
const io = require('socket.io')(30001);
console.log(`[INFO] Started communication on port 30001`);

const Frame = require('./Frame.js');
const Group = require('./Group.js');

let config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

let groups = [], frames = [], registeredFrames = [];

const fsp = require('fs').promises;
const { exec } = require('child_process');
const { stdout, stderr } = require('process');

const asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
};

async function loadGroups() {
    const files = await fsp.readdir(`${__dirname}/data`);

    await asyncForEach(files, async file => {

        if (file.endsWith(".mp4")) {
            const duration = await getVideoDuration(`${__dirname}/data/${file}`);
            const group = new Group(file.split(".")[0], file, null, duration, 0);
            groups.push(group);
        }
    });
}

async function getVideoDuration(file) {
    let out;
    exec('ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ' + file, (err, stdout, stderr) => {
        if(err || !stdout) return console.error(`[ERROR] ${err.message || stderr}`);
        out = stdout;
    });
    return out;
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
app.use(express.json());
app.use(fileUpload());

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
    console.log(frame);
    if (frame == null || frame._group == null) return res.sendStatus(400);

    res.sendFile(`${__dirname}/data/${frame._group}.mp4`);
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

app.post('/flash', (req, res) => {
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

app.post('/upload', (req, res) => {
    try {
        if(!req.files) return res.status(400).send({ status: 400, message: 'no files provided' });

        console.log(req.files);

        if(Array.isArray(req.files.upload)) {
            req.files.upload.forEach(file => {
                file.mv(`./data/${file.name}`, err => {
                    if(err) return res.status(500).send({ status: 500, message: err.message })
                });
            });
        } else {
            req.files.upload.mv(`./data/${req.files.upload.name}`, err => {
                if(err) return res.status(500).send({ status: 500, message: err.message });
            });
        }

        groups = [];
        loadGroups();

        return res.status(200).redirect('/settings');

    } catch(err) {
        console.error(`[ERROR] ${err.message}`);
    }
});

io.on('connection', socket => {
    let frame = new Frame(socket.id, socket.handshake.address.replace("::ffff:", ""), config.defaultGroup, socket);
    registeredFrames.forEach(f => {
        if (f.ip === frame._ip) {
            frame.setId(f.name);
            frame.setGroup(f.group);
        }
    });
    let group = groups.find(g => g._name === frame._group);
    frames.push(frame);

    if (group._master === null) {
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

setInterval(() => {
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
}, 15000);