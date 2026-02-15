(function() {
    var CHECK_KEY = 'lastVersionCheck';
    var VERSION_KEY = 'app_file_version';
    var MIN_INTERVAL = 60000;
    try {
        var lastCheck = parseInt(sessionStorage.getItem(CHECK_KEY) || '0', 10);
        if (Date.now() - lastCheck < MIN_INTERVAL) return;
        sessionStorage.setItem(CHECK_KEY, String(Date.now()));
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'get_version.php?t=' + Date.now(), true);
        xhr.onload = function() {
            try {
                var data = JSON.parse(xhr.responseText);
                var serverVersion = data.version || '';
                var savedVersion = localStorage.getItem(VERSION_KEY) || '';
                if (!savedVersion) {
                    localStorage.setItem(VERSION_KEY, serverVersion);
                    return;
                }
                if (savedVersion !== String(serverVersion)) {
                    localStorage.setItem(VERSION_KEY, String(serverVersion));
                    window.location.reload(true);
                }
            } catch (e) {}
        };
        xhr.send();
    } catch (e) {}
})();
