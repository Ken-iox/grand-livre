// © 2026 Ken-iox — Tous droits réservés. Voir LICENSE. Toute réutilisation est interdite sans autorisation écrite.
const CACHE = 'grand-livre-v11';
const DATA_CACHE = 'gl-data';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './js/db.js',
  './js/app.js'
];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE && k !== DATA_CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function(cached){
      var network = fetch(e.request).then(function(res){
        if(res && res.status === 200){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});

/* ============ RAPPELS MEILLEUR EFFORT (Periodic Background Sync) ============
   Non garanti : Chrome/Android uniquement, app installée requise, l'intervalle
   réel dépend de l'engagement utilisateur et de l'optimisation de batterie. */
self.addEventListener('periodicsync', function(e){
  if(e.tag === 'reminders-check') e.waitUntil(checkReminders());
});

function checkReminders(){
  return caches.open(DATA_CACHE)
    .then(function(c){ return c.match('/reminders.json'); })
    .then(function(res){ return res ? res.json() : null; })
    .then(function(data){
      if(!data || !data.charges) return;
      var today = new Date();
      var todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      var jobs = data.charges.map(function(c){
        if(data.paidThisMonth && data.paidThisMonth[c.id]) return null;
        var due = new Date(today.getFullYear(), today.getMonth(), c.dueDay);
        var diffDays = Math.round((due - todayMidnight) / 86400000);
        if(diffDays < 0 || diffDays > 3) return null;
        return self.registration.showNotification('Grand Livre', {
          body: c.icon+' '+c.name+' — '+c.amount.toFixed(2)+' € dans '+diffDays+' jour'+(diffDays===1?'':'s'),
          tag: 'charge-'+c.id,
          icon: 'icons/icon.svg'
        });
      }).filter(Boolean);
      return Promise.all(jobs);
    });
}
