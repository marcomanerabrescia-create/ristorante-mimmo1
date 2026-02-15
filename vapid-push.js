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

var vapidPublicKeyCache = null;

function getVapidPublicKey() {
  if (vapidPublicKeyCache) {
    return Promise.resolve(vapidPublicKeyCache);
  }
  return fetch('vapid_keys.php', { cache: 'no-store' }).then(function(response) {
    if (!response.ok) {
      throw new Error('Impossibile caricare vapid_keys.php (' + response.status + ')');
    }
    return response.json();
  }).then(function(payload) {
    if (!payload.public_key) {
      throw new Error('Chiave pubblica VAPID non trovata');
    }
    vapidPublicKeyCache = payload.public_key;
    return vapidPublicKeyCache;
  });
}

function startVapidRegistration() {
  console.log('[VAPID] STEP 1 - avvio registrazione');
  try {
    console.log('[VAPID] STEP 2 - supporto serviceWorker:', 'serviceWorker' in navigator);
    if (!('serviceWorker' in navigator)) {
      console.log('[VAPID] STEP 2 FAIL - serviceWorker non supportato');
      if (typeof showCustomAlert === 'function') {
        showCustomAlert('Service Worker non supportato su questo dispositivo.', true);
      }
      alert('Service Worker non supportato');
      return;
    }
    console.log('[VAPID] STEP 3 - supporto PushManager:', 'PushManager' in window);
    if (!('PushManager' in window)) {
      console.log('[VAPID] STEP 3 FAIL - PushManager non supportato');
      if (typeof showCustomAlert === 'function') {
        showCustomAlert('Push Manager non supportato su questo dispositivo.', true);
      }
      alert('Push Manager non supportato');
      return;
    }

    console.log('[VAPID] STEP 4 - registrazione SW start');
    navigator.serviceWorker.register('/ristorantemimmo1/PRENOTAZIONI/sw-toilet-001.js', {
      scope: '/ristorantemimmo1/PRENOTAZIONI/',
      updateViaCache: 'none'
    }).then(function(reg) {
      console.log('[VAPID] STEP 5 - registrazione SW completata', { scope: reg.scope, active: reg.active, waiting: reg.waiting, installing: reg.installing });

      console.log('[VAPID] STEP 6 - Notification.permission (prima):', Notification.permission);
      if (Notification.permission !== 'granted') {
        return Notification.requestPermission().then(function(result) {
          console.log('[VAPID] STEP 6b - requestPermission result:', result);
          if (typeof showCustomAlert === 'function' && result !== 'granted') {
            showCustomAlert('Permesso notifiche non concesso.', true);
          }
          return reg;
        }).catch(function(err) {
          console.log('[VAPID] STEP 6d - requestPermission error:', err);
          if (typeof showCustomAlert === 'function') {
            showCustomAlert('Errore richiesta permessi notifiche.', true);
          }
          return reg;
        });
      }
      console.log('[VAPID] STEP 7 - prima di serviceWorker.ready');
      return navigator.serviceWorker.ready.then(function() {
        console.log('[VAPID] STEP 8 - serviceWorker.ready OK');
        return reg.update().then(function() {
          console.log('[VAPID] STEP 9 - reg.update OK (1)');
          return navigator.serviceWorker.ready.then(function() {
            console.log('[VAPID] STEP 10 - serviceWorker.ready OK (2)');
            return reg.update().then(function() {
              console.log('[VAPID] STEP 11 - reg.update OK (2)');
              return reg;
            });
          });
        });
      });
    }).then(function(reg) {
      return navigator.serviceWorker.ready.then(function() {
        console.log('[VAPID] STEP 12 - fetch chiave pubblica: vapid_keys.php');
        return getVapidPublicKey().then(function(publicKey) {
          return { reg: reg, publicKey: publicKey };
        });
      });
    }).then(function(ctxReady) {
      console.log('[VAPID] STEP 14 - validazione dati attivazione');
      var activationData = getActivationData();
      var activationCode = activationData.code || '';
      var activationPhone = activationData.phone || '';
      var deviceId = generateDeviceId(activationCode || '');

        if (!activationPhone || !activationCode) {
          console.log('[VAPID] STEP 14 FAIL - dati mancanti', { activationCode: activationCode, activationPhone: activationPhone });
          if (typeof showCustomAlert === 'function') {
            showCustomAlert('Inserisci telefono e codice prima di attivare notifiche.', true);
          }
          alert('Inserisci e salva il tuo telefono e codice prima di attivare le notifiche.');
          return Promise.reject(new Error('Dati attivazione mancanti'));
        }

      console.log('[VAPID] STEP 15 - dati validati OK', { activationCode: activationCode, activationPhone: activationPhone });
      console.log('[VAPID] STEP 16 - controllo subscription esistente');
      return ctxReady.reg.pushManager.getSubscription().then(function(sub) {
        if (sub) {
          console.log('[VAPID] STEP 17 - subscription esistente, la riutilizzo');
          return { sub: sub, publicKey: ctxReady.publicKey, activationCode: activationCode, activationPhone: activationPhone, deviceId: deviceId };
        }
        console.log('[VAPID] STEP 17b - nessuna subscription, procedo con subscribe');
        if (typeof showCustomAlert === 'function') {
          showCustomAlert('Registrazione notifiche in corso...', false);
          setTimeout(function() {
            var alertEl = document.getElementById('custom-alert');
            if (alertEl) alertEl.classList.remove('show');
          }, 1000);
        }
        return ctxReady.reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(ctxReady.publicKey)
        }).then(function(newSub) {
          console.log('[VAPID] STEP 18 - subscribe OK', newSub);
          return { sub: newSub, publicKey: ctxReady.publicKey, activationCode: activationCode, activationPhone: activationPhone, deviceId: deviceId };
        }).catch(function(err) {
          console.log('[VAPID] STEP 18 FAIL - subscribe error', err);
          if (typeof showCustomAlert === 'function') {
            showCustomAlert('Errore attivazione notifiche.', true);
          }
          alert('Errore attivazione notifiche: ' + err.message);
          throw err;
        });
      });
    }).then(function(ctx) {
      console.log('[VAPID] STEP 17 - invio a push_register_vapid.php', {
        user_id: ctx.activationCode || null,
        telefono: ctx.activationPhone || null,
        device_id: ctx.deviceId || null,
        endpoint: ctx.sub.endpoint
      });
      return fetch('push_register_vapid.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          subscription: ctx.sub.toJSON(),
          user_id: ctx.activationCode || null,
          telefono: ctx.activationPhone || null,
          device_id: ctx.deviceId || null
        })
      });
    }).then(function(resp) {
      return resp.text().then(function(respText) {
        console.log('[VAPID] STEP 18 - risposta push_register_vapid.php', { status: resp.status, body: respText });
        if (!resp.ok) {
          console.error('[VAPID] STEP 18 FAIL - registrazione fallita', { status: resp.status, body: respText });
          if (typeof showCustomAlert === 'function') {
            showCustomAlert('Errore registrazione notifiche.', true);
          }
          alert('Errore registrazione notifiche: ' + resp.status);
          throw new Error('registrazione fallita');
        }
        console.log('[VAPID] STEP 19 - REGISTRAZIONE COMPLETATA');
        if (typeof showCustomAlert === 'function') {
//           showCustomAlert('Notifiche attivate!', false);
        }
        // alert('? Notifiche attivate');
        localStorage.setItem('vapidRegistrato', 'true');
      });
    }).catch(function(error) {
      console.log('[VAPID] STEP ERROR:', error);
      if (typeof showCustomAlert === 'function') {
        showCustomAlert('Errore registrazione notifiche.', true);
      }
    });
  } catch (error) {
    console.log('[VAPID] STEP ERROR:', error);
    if (typeof showCustomAlert === 'function') {
      showCustomAlert('Errore registrazione notifiche.', true);
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var btnRegistrati = document.getElementById('btnRegistrati');
  if (btnRegistrati) {
    btnRegistrati.addEventListener('click', startVapidRegistration);
    btnRegistrati.disabled = false;
    btnRegistrati.style.pointerEvents = 'auto';
  }
  try {
    startVapidRegistration();
  } catch (_) {}
});

var SW_SCOPE = '/ristorantemimmo1/PRENOTAZIONI/';
var SW_URL = '/ristorantemimmo1/PRENOTAZIONI/sw-toilet-001.js';
var VAPID_RETRY_DELAYS = [0, 5000, 30000, 120000]; // ms
var vapidRetryTimer = null;

function getOrRegisterServiceWorker() {
  return navigator.serviceWorker.getRegistrations().then(function(regs){
    var match = regs.find(function(r){ return (r.scope || '').includes(SW_SCOPE); });
    if (match) return match;
    console.log('[VAPID][AUTO] nessuna registration trovata, registro SW...');
    return navigator.serviceWorker.register(SW_URL, {
      scope: SW_SCOPE,
      updateViaCache: 'none'
    });
  });
}

function ensureVapidIntegrity(attempt) {
  if (attempt === undefined) attempt = 0;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return;
  try {
    var activationData = getActivationData();
    var activationCode = activationData.code || '';
    var activationPhone = activationData.phone || '';
    if (!activationCode || !activationPhone) return;
    var deviceId = generateDeviceId(activationCode || '');
    getOrRegisterServiceWorker()
      .then(function(reg){
        return navigator.serviceWorker.ready.then(function(){
          return getVapidPublicKey().then(function(publicKey){
            return reg.pushManager.getSubscription().then(function(sub){
              if (sub) return { sub: sub, publicKey: publicKey, reg: reg };
              console.log('[VAPID][AUTO] subscribe...');
              return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
              }).then(function(newSub){
                return { sub: newSub, publicKey: publicKey, reg: reg };
              });
            });
          });
        }).then(function(ctx){
          return fetch('push_register_vapid.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              subscription: ctx.sub.toJSON(),
              user_id: activationCode || null,
              telefono: activationPhone || null,
              device_id: deviceId || null
            })
          }).then(function(resp){
            return resp.text().then(function(respText){
              console.log('[VAPID][AUTO] registrazione server', { status: resp.status, body: respText });
              if (!resp.ok) {
                throw new Error('registrazione push fallita: ' + resp.status);
              }
              localStorage.setItem('vapidRegistrato', 'true');
              if (vapidRetryTimer) {
                clearTimeout(vapidRetryTimer);
                vapidRetryTimer = null;
              }
            });
          });
        }).catch(function(err){
          throw err;
        });
      })
      .catch(function(err){
        console.warn('[VAPID][AUTO] ensure error', err);
        if (attempt + 1 < VAPID_RETRY_DELAYS.length) {
          var delay = VAPID_RETRY_DELAYS[attempt + 1];
          if (vapidRetryTimer) clearTimeout(vapidRetryTimer);
          vapidRetryTimer = setTimeout(function(){ ensureVapidIntegrity(attempt + 1); }, delay);
        } else {
          console.warn('[VAPID][AUTO] retry esauriti');
        }
      });
  } catch (errOuter) {
    console.warn('[VAPID][AUTO] ensure error outer', errOuter);
  }
}

ensureVapidIntegrity(0);
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    ensureVapidIntegrity(0);
  }
});
setInterval(function(){ ensureVapidIntegrity(0); }, 300000); // ogni 5 minuti

// Gestisce messaggi dal Service Worker (apertura view-messaggio e aggiornamento versione)
(function() {
  var banner = document.getElementById('update-banner');
  var updateBtn = document.getElementById('update-reload-btn');
  var autoReloadTimer = null;

  function reloadNow() {
    if (autoReloadTimer) clearTimeout(autoReloadTimer);
    location.reload();
  }

  function showUpdateBanner(version) {
    if (!banner) return;
    banner.style.display = 'flex';
    if (updateBtn) {
      updateBtn.onclick = reloadNow;
    }
    autoReloadTimer = setTimeout(reloadNow, 300000); // 5 minuti
    try {
      localStorage.setItem('swVersionNotified', version || '');
    } catch (e) {
      console.warn('SW version store error:', e);
    }
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'OPEN_MESSAGE_VIEW' && event.data.url) {
        navigaRobusta(event.data.url);
      }
      if (event.data && event.data.type === 'OPEN_PROMO_VIEW') {
        localStorage.setItem('ultimaPromoRicevuta', JSON.stringify({ title: event.data.title, body: event.data.body }));
        mostraUltimaPromo();
      }
      if (event.data && event.data.type === 'SW_VERSION') {
        var version = event.data.version;
        var lastNotified = '';
        try {
          lastNotified = localStorage.getItem('swVersionNotified') || '';
        } catch (e) {
          console.warn('SW version read error:', e);
        }
        if (version && version !== lastNotified) {
          showUpdateBanner(version);
        }
      }
    });
  }

})();

(function debugPromoInit() {
    console.log('[DEBUG PROMO] init');
    var swPromise = Promise.resolve([]);
    try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
            swPromise = navigator.serviceWorker.getRegistrations();
        }
    } catch (e) {
        swPromise = Promise.resolve([]);
    }
    swPromise.then(function(regs){
        try {
            console.log('[DEBUG PROMO] SW registrati:', regs.map(function(r){ return (r && ((r.active && r.active.scriptURL) || r.scriptURL)); }));
        } catch (e) {
            console.warn('[DEBUG PROMO] errore lettura SW:', e);
        }
        return caches.keys();
    }).then(function(keys){
        console.log('[DEBUG PROMO] cache keys:', keys);
        if (keys.indexOf('ultimaPromo') !== -1) {
            return caches.open('ultimaPromo').then(function(cache){
                return cache.match('ultimaPromo').then(function(resp){
                    if (resp) {
                        return resp.text().then(function(txt){
                            console.log('[DEBUG PROMO] ultimaPromo content:', txt);
                        });
                    } else {
                        console.log('[DEBUG PROMO] ultimaPromo vuota (no match)');
                    }
                });
            });
        } else {
            console.log('[DEBUG PROMO] cache ultimaPromo assente');
        }
    }).catch(function(e){
        console.warn('[DEBUG PROMO] errore cache:', e);
    });
})();

function debugPromoClick() {
    console.log('[DEBUG PROMO] CLICK PROMO');
    return caches.open('ultimaPromo').then(function(cache){
        return cache.match('ultimaPromo').then(function(resp){
            if (resp) {
                return resp.text().then(function(txt){
                    console.log('[DEBUG PROMO] click: ultimaPromo content:', txt);
                });
            } else {
                console.log('[DEBUG PROMO] click: ultimaPromo vuota (no match)');
            }
        });
    }).catch(function(e){
        console.warn('[DEBUG PROMO] errore cache in click:', e);
    });
}
