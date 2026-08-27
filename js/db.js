// © 2026 Ken-iox — Tous droits réservés. Voir LICENSE. Toute réutilisation est interdite sans autorisation écrite.
const DB_NAME = 'grand-livre';
const DB_VERSION = 1;

function openDB(){
  return new Promise(function(resolve, reject){
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e){
      var db = e.target.result;
      if(!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', {keyPath:'id', autoIncrement:true});
      if(!db.objectStoreNames.contains('fixedCharges')) db.createObjectStore('fixedCharges', {keyPath:'id', autoIncrement:true});
      if(!db.objectStoreNames.contains('transactions')){
        var t = db.createObjectStore('transactions', {keyPath:'id', autoIncrement:true});
        t.createIndex('date', 'date');
      }
      if(!db.objectStoreNames.contains('chargePayments')) db.createObjectStore('chargePayments', {keyPath:'id'});
      if(!db.objectStoreNames.contains('patrimoineAccounts')) db.createObjectStore('patrimoineAccounts', {keyPath:'id', autoIncrement:true});
      if(!db.objectStoreNames.contains('sinkingFunds')) db.createObjectStore('sinkingFunds', {keyPath:'id', autoIncrement:true});
      if(!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', {keyPath:'key'});
    };
    req.onsuccess = function(e){ resolve(e.target.result); };
    req.onerror = function(e){ reject(e.target.error); };
  });
}

var _dbPromise = openDB();

function withStore(storeName, mode, fn){
  return _dbPromise.then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(storeName, mode);
      var store = tx.objectStore(storeName);
      var result = fn(store);
      tx.oncomplete = function(){ resolve(result); };
      tx.onerror = function(e){ reject(e.target.error); };
    });
  });
}

function reqToPromise(req){
  return new Promise(function(resolve, reject){
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(e){ reject(e.target.error); };
  });
}

export var db = {
  getAll: function(store){
    return _dbPromise.then(function(d){
      return reqToPromise(d.transaction(store, 'readonly').objectStore(store).getAll());
    });
  },
  get: function(store, key){
    return _dbPromise.then(function(d){
      return reqToPromise(d.transaction(store, 'readonly').objectStore(store).get(key));
    });
  },
  put: function(store, val){
    return withStore(store, 'readwrite', function(s){ return s.put(val); }).then(function(){
      return _dbPromise.then(function(d){ return reqToPromise(d.transaction(store,'readonly').objectStore(store).get(val.id || val.key)); });
    });
  },
  add: function(store, val){
    var id;
    return _dbPromise.then(function(d){
      return new Promise(function(resolve, reject){
        var tx = d.transaction(store, 'readwrite');
        var req = tx.objectStore(store).add(val);
        req.onsuccess = function(){ id = req.result; };
        tx.oncomplete = function(){ val.id = id; resolve(val); };
        tx.onerror = function(e){ reject(e.target.error); };
      });
    });
  },
  delete: function(store, key){
    return withStore(store, 'readwrite', function(s){ return s.delete(key); });
  }
};

// Seuils et réglages génériques uniquement — aucune donnée personnelle.
// Catégories, charges fixes, transactions, comptes et prêt se créent depuis l'app (Paramètres / Patrimoine / Saisie rapide).
var DEFAULT_THRESHOLDS = { savingsLow:12, savingsGood:20, fixedGood:40, fixedMax:50, variableGood:8, variableMax:15, comfortMargin:150 };
var DEFAULT_AUTOMATIONS = { overspendAlert:true, dueReminder:true, uncatDetect:true, rollover:false, weeklyDigest:false };

export function seedIfEmpty(){
  return db.get('settings', 'seeded').then(function(flag){
    if(flag && flag.value) return false;
    return Promise.all([
      db.put('settings', {key:'thresholds', value:DEFAULT_THRESHOLDS}),
      db.put('settings', {key:'automations', value:DEFAULT_AUTOMATIONS}),
      db.put('settings', {key:'calStartBalance', value:0}),
      db.put('settings', {key:'loan', value:{}}),
      db.put('settings', {key:'monthlyHistory', value:{}}),
      db.put('settings', {key:'chargePayments', value:{}}),
      db.put('settings', {key:'categoryRules', value:[]}),
      db.put('settings', {key:'dismissedSuggestions', value:[]}),
      db.put('settings', {key:'appLock', value:{enabled:false, pinHash:null}}),
      db.put('settings', {key:'onboarded', value:false}),
      db.put('settings', {key:'pushReminders', value:false}),
      db.put('settings', {key:'seeded', value:true})
    ]).then(function(){ return true; });
  });
}
