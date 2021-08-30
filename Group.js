class Group {
    constructor(name, video, master, maxTime, currentTime) {
        this._name = name;
        this._video = video;
        this._master = master;
        this._maxTime = maxTime;
        this._currentTime = currentTime;
    }

    setMaster(master) {
        if(this._master != null) {
            this._master.emit('master');
        }

        this._master = master;
        this._master.emit('master');
    }
};

module.exports = Group;