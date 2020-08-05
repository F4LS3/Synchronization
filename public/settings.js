const table = document.querySelector("table");

document.querySelector("#reload").addEventListener('click', () => {
    table.innerHTML = `<tr class="table-header"><th>Frame</th><th style="color: rgb(43, 160, 255);">_</th><th>Video</th><th>Status</th></tr>`
    loadData();
});

document.querySelector("#submit").addEventListener('click', () => {
    let data = [];
    table.querySelectorAll("tr").forEach(r => {
        if (r.classList.contains("table-header")) return;
        let name = r.querySelector("td").innerHTML;
        let select = r.querySelector(`#${name}`);
        let selectedVideo = select.options[select.options.selectedIndex].value;
        let selectedGroup = selectedVideo.split(".")[0];
        data.push({ name: name, group: selectedGroup });
    });
    const socket = io('192.168.0.176:30001/flush', { forceNew: true });


    //location.reload();
});

window.onload = () => {
    loadData();
} 

function loadData() {
    fetch('frames').then(res => {
        return res.json();
    }).then(json => {
        let counter = 0;
        json.frames.forEach(frame => {
            let actives = JSON.parse(JSON.stringify(json.actives));
            let masters = JSON.parse(JSON.stringify(json.masters));
            let groups = JSON.parse(JSON.stringify(json.groups));
            let groupFrameIsIn = groups.find(g => g.name === frame.group).name;

            if (counter == 0) {
                table.insertAdjacentHTML("beforeend", `<tr class="even"><td>${frame.name}</td><td>${masters.includes(frame.name) ? "<a class='tag green'>Master der Gruppe '" + frame.group + "'</a>" : ""}</td><td><select name="video" id="${frame.name}"></select></td><td>${actives.includes(frame.name) ? "<a class='tag green'>Verbunden</a>" : "<a class='tag red'>Nicht Verbunden</a>"}</td></tr>`);
                counter++;
            } else {
                table.insertAdjacentHTML("beforeend", `<tr class="odd"><td>${frame.name}</td><td>${masters.includes(frame.name) ? "<a class='tag green'>Master der Gruppe '" + frame.group + "'</a>" : ""}</td><td><select name="video" id="${frame.name}"></select></td><td>${actives.includes(frame.name) ? "<a class='tag green'>Verbunden</a>" : "<a class='tag red'>Nicht Verbunden</a>"}</td></tr>`);
                counter = 0;
            }

            let dropdown = table.querySelector(`#${frame.name}`);
            dropdown.insertAdjacentHTML("beforeend", `<option value="${groupFrameIsIn}.mp4">${groupFrameIsIn}.mp4</option>`);
            groups.forEach(g => {
                if (g.name == groupFrameIsIn) return;
                dropdown.insertAdjacentHTML("beforeend", `<option value="${g.name}.mp4">${g.name}.mp4</option>`);
            });
        });
    });
}