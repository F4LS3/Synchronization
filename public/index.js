const socket = io.connect("192.168.0.176:30001", { reconnection: false });
const video = document.querySelector("video");

let isMaster = false;

socket.on('master', () => {
    isMaster = !isMaster;
});

socket.on('sync', time => {
    if (isMaster) {
        socket.emit('sync', video.currentTime);

    } else {
        video.currentTime = time;
    }
});

socket.on('disconnect', () => {
    console.log(`[WARNING] Disconnected from server`);
    video.pause();
});

socket.on('demand', demand => {
    let args = demand.split("=");

    if (args[0] == "video") {
        if (args[1] == "reset_src") {
            video.load();

        } else if (args[1] == "pause") {
            video.pause();

        } else if (args[1] == "play") {
            video.play();
        }

    } else if (args[0] == "time") {
        video.currentTime = parseInt(args[1]);
    }
});