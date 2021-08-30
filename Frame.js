class Frame {
    constructor(id, ip, group, socket) {
        this._id = id;
        this._ip = ip;
        this._group = group;
        this._socket = socket;
    }

    setId(id) {
        this._id = id;
    }

    setGroup(group) {
        this._group = group;
    }
};

module.exports = Frame;