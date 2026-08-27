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

var DEFAULT_THRESHOLDS = { savingsLow:12, savingsGood:20, fixedGood:40, fixedMax:50, variableGood:8, variableMax:15, comfortMargin:150 };
var DEFAULT_AUTOMATIONS = { overspendAlert:true, dueReminder:true, uncatDetect:true, monthClose:true, rollover:false, weeklyDigest:false };

var SEED_CATEGORIES = [
  ["Essence","⛽",280], ["Courses","🛒",200], ["Courses Sup.","🛒",20], ["Shopping","🛍️",50],
  ["Voiture","🚗",30], ["Chat","🐱",60], ["Restaurant","🍽️",50], ["Autre","✳️",20],
  ["Crypto","🪙",50], ["Travaux / Entretiens","🔧",50], ["Médecin","🩺",30], ["Coiffeur","💇",26.5],
  ["Sortie","🎉",40], ["Cadeau","🎁",30], ["Musique","🎵",50], ["Amendes / Stationnement","🚧",10],
  ["Cigarette Electronique","💨",30], ["Tabac","🚬",30], ["Poste & Colis","📦",10], ["Cinéma","🎬",20],
  ["Psychologue","🧠",60]
];

var SEED_CHARGES = [
  ["Loyer","🏠",295.00,1,"communes",false],
  ["Électricité","💡",94.00,10,"communes",false],
  ["Internet","📶",19.00,10,"communes",true],
  ["Assurance Habitation","🛡️",22.00,5,"communes",false],
  ["Poubelle & eau","🚰",30.00,15,"communes",false],
  ["Assurance Auto Golf","🛡️",72.37,5,"personnelles",false],
  ["Assurance Auto Fiat","🛡️",35.30,5,"personnelles",false],
  ["Assurance Auto Opel","🛡️",30.55,5,"personnelles",false],
  ["Spotify","🎧",18.21,18,"personnelles",true],
  ["Prêt bancaire","🏦",207.89,7,"personnelles",false],
  ["ADN","🧬",6.99,20,"personnelles",true],
  ["Abonnement Téléphonique","📞",53.99,10,"personnelles",true]
];

// données réelles importées depuis Budget_2026_v2.gsheet — juillet 2026 seulement (mois le plus complet).
var SEED_TX_JULY = [
  ["2026-07-01","revenu","Salaire",1463.78],
  ["2026-07-01","revenu","CAF",57.50],
  ["2026-07-01","revenu","Remboursement Opel (papa)",33.00],
  ["2026-07-01","revenu","Remboursement CPAM",27.10],
  ["2026-07-01","variable","Sortie",9.50],
  ["2026-07-01","variable","Coiffeur",26.50],
  ["2026-07-01","variable","Amendes / Stationnement",0.72],
  ["2026-07-01","variable","Sortie",31.00],
  ["2026-07-01","variable","Courses Sup.",19.50],
  ["2026-07-01","variable","Médecin",25.00],
  ["2026-07-01","variable","Voiture",45.46],
  ["2026-07-01","variable","Cadeau",45.00],
  ["2026-07-02","variable","Amendes / Stationnement",1.42],
  ["2026-07-05","variable","Courses",147.35],
  ["2026-07-08","variable","Essence",35.00],
  ["2026-07-08","variable","Courses Sup.",0.80],
  ["2026-07-11","variable","Chat",52.00],
  ["2026-07-11","variable","Courses Sup.",18.40],
  ["2026-07-11","variable","Musique",7.90],
  ["2026-07-11","variable","Courses",70.10],
  ["2026-07-14","variable","Courses",95.72],
  ["2026-07-01","epargne","Livret A",200.00]
];

var MONTHLY_HISTORY = {
  "2026-06": {revenus:2332.94, depenses:2107.00, epargne:50.00, solde:76.22},
  "2026-07": {revenus:1581.38, depenses:1377.20, epargne:200.00, solde:4.18},
  "2026-08": {revenus:1243.00, depenses:1063.30, epargne:50.00, solde:129.70}
};

export function seedIfEmpty(){
  return db.get('settings', 'seeded').then(function(flag){
    if(flag && flag.value) return false;
    return Promise.all([
      db.getAll('categories'), db.getAll('fixedCharges')
    ]).then(function(res){
      var catP = res[0].length ? Promise.resolve() : Promise.all(SEED_CATEGORIES.map(function(c){
        return db.add('categories', {name:c[0], icon:c[1], monthlyBudget:c[2]});
      }));
      var chargeP = res[1].length ? Promise.resolve() : Promise.all(SEED_CHARGES.map(function(c){
        return db.add('fixedCharges', {name:c[0], icon:c[1], amount:c[2], dueDay:c[3], group:c[4], isSubscription:c[5]});
      }));
      return Promise.all([catP, chargeP]);
    }).then(function(){
      return db.getAll('transactions');
    }).then(function(existing){
      if(existing.length) return;
      return Promise.all(SEED_TX_JULY.map(function(t){
        return db.add('transactions', {date:t[0], type:t[1], category:t[2], amount:t[3], needsReview:false});
      })).then(function(){
        return db.add('transactions', {date:'2026-07-01', type:'variable', category:null, amount:232.00, needsReview:true, note:'Virement · Morgane Lanari', suggestedCategory:'Cadeau'});
      });
    }).then(function(){
      return db.getAll('patrimoineAccounts');
    }).then(function(existing){
      if(existing.length) return;
      return Promise.all([
        db.add('patrimoineAccounts', {name:'Épargne Banque', goal:3000, snapshots:{"2026-06":0}}),
        db.add('patrimoineAccounts', {name:'Revolut — Bourse', goal:500, snapshots:{"2026-06":50}}),
        db.add('patrimoineAccounts', {name:'Revolut — Crypto', goal:200, snapshots:{"2026-06":50}})
      ]);
    }).then(function(){
      return db.getAll('sinkingFunds');
    }).then(function(existing){
      if(existing.length) return;
      return Promise.all([
        db.add('sinkingFunds', {name:'Assurance auto (renouvellement annuel)', icon:'🛡️', annualTarget:1200, monthly:100, accumulated:300}),
        db.add('sinkingFunds', {name:'Cadeaux de Noël', icon:'🎁', annualTarget:300, monthly:25, accumulated:75}),
        db.add('sinkingFunds', {name:'Entretien voiture', icon:'🔧', annualTarget:600, monthly:50, accumulated:150})
      ]);
    }).then(function(){
      return Promise.all([
        db.put('settings', {key:'thresholds', value:DEFAULT_THRESHOLDS}),
        db.put('settings', {key:'automations', value:DEFAULT_AUTOMATIONS}),
        db.put('settings', {key:'calStartBalance', value:1200}),
        db.put('settings', {key:'loan', value:{monthlyPayment:207.89, principal:12000, remaining:8450}}),
        db.put('settings', {key:'monthlyHistory', value:MONTHLY_HISTORY}),
        db.put('settings', {key:'chargePayments', value:{}}),
        db.put('settings', {key:'seeded', value:true})
      ]);
    }).then(function(){ return true; });
  });
}
