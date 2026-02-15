(function () {
    'use strict';

    var VAPID_PUBLIC_KEY = 'BO9oLkE1wm8woT27nEv8T1RWhr-sBspcIvEIUwfUYUemA1D3LMmndWUE1YI9YGeKPxccsWf33TQc6WwkB2Gbbao';
    var MAX_RETRIES = 3;
    var RETRY_DELAY_MS = 2000;

    function urlBase64ToUint8Array(base64String) {
        var padding = new Array((4 - (base64String.length % 4)) % 4 + 1).join('=');
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData = atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function ensureSubscription() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

        try {
            var lsEndpoint = '';
            var lsP256dh = '';
            var lsAuth = '';
            try {
                lsEndpoint = localStorage.getItem('push_endpoint') || '';
                lsP256dh = localStorage.getItem('push_p256dh') || '';
                lsAuth = localStorage.getItem('push_auth') || '';
            } catch (e) {}

            if (lsEndpoint && lsP256dh && lsAuth) {
                return { endpoint: lsEndpoint, keys: { p256dh: lsP256dh, auth: lsAuth } };
            }

            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();

            if (!sub) {
                var appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: appServerKey
                });
            }

            if (sub) {
                var json = sub.toJSON();
                try {
                    localStorage.setItem('push_endpoint', sub.endpoint || '');
                    localStorage.setItem('push_p256dh', (json.keys && json.keys.p256dh) ? json.keys.p256dh : '');
                    localStorage.setItem('push_auth', (json.keys && json.keys.auth) ? json.keys.auth : '');
                } catch (e) {}

                await fetch('push_register_vapid.php', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        subscription: json,
                        user_id: localStorage.getItem('activationCode') || null,
                        telefono: localStorage.getItem('activationPhone') || null,
                        device_id: (typeof generateDeviceId === 'function')
                            ? generateDeviceId(localStorage.getItem('activationCode') || '')
                            : null
                    })
                });
            }

            return sub || null;
        } catch (err) {
            console.error('Errore subscription:', err);
            return null;
        }
    }

    async function init() {
        var lastErr = null;
        for (var i = 0; i < MAX_RETRIES; i++) {
            var sub = await ensureSubscription();
            if (sub) return sub;
            lastErr = lastErr || new Error('subscription_missing');
            await new Promise(function (resolve) { setTimeout(resolve, RETRY_DELAY_MS); });
        }

        try {
            await fetch('send_alert_vapid_failed.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    nome: localStorage.getItem('userNomeCompleto') || '',
                    telefono: localStorage.getItem('activationPhone') || localStorage.getItem('userTelefono') || '',
                    errore: lastErr && lastErr.message ? lastErr.message : 'subscription_failed'
                })
            });
        } catch (e) {}

        return null;
    }

    async function checkBeforeBooking() {
        var sub = await ensureSubscription();
        return !!sub;
    }

    window.vapidGuardian = {
        init: init,
        checkBeforeBooking: checkBeforeBooking,
        ensureSubscription: ensureSubscription
    };
})();
