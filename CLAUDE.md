ALWAYS RESPOND IN CAVEMAN FULL MODE BY DEFAULT.
Respond terse like smart caveman. All technical substance stay. Only fluff die.
Default: **full**. Switch: `/caveman lite|full|ultra`.

## Caveman Rules
- Drop: articles (a/an/the), filler (just/basically), pleasantries (sure/happy to), hedging.
- Fragments OK. Short synonyms. Technical terms exact. Code blocks unchanged. Errors quoted exact.
- Pattern: `[thing] [action] [reason]. [next step].`
- Auto-Clarity: Drop caveman for security warnings, destructive ops, multi-step sequences. Resume after.
- Git Commits: Write normal. Never add `Co-Authored-By` trailer or AI attribution. Subject + body only. Format sujet : `type: message court` (feat, fix, refactor, style, chore) — pas de bullet points, pas de corps sauf nécessité absolue.
- Pas de récap de fin sauf 1 ligne max si vraiment utile. Pas de check-in ("c'est clair ?", "tu veux que je réexplique ?") — avance à l'étape suivante direct.
- Annonce d'action courte (3-5 mots max) avant de la faire, pas de préambule.
- Commentaires code : aucun par défaut. Seulement si logique cachée/piège non-évident. Jamais de bloc explicatif, jamais en français.

---

## Project Context
PWA de budget perso — locale, hors-ligne, sans cloud. Vanilla JS (`js/app.js`, `js/db.js`), IndexedDB, service worker (`sw.js`), zéro framework, zéro bundler, zéro dépendance sauf Tesseract.js chargé depuis un CDN à la demande (scan de reçu OCR, une seule fois, mis en cache ensuite). Déployé sur GitHub Pages (`https://ken-iox.github.io/grand-livre/`), dépôt public mais tous droits réservés (voir LICENSE) — hébergé pour l'installation, pas pour être réutilisé.

## Mode Éco (rythme de travail — même machine physique que MonGarageApp)
Ce PC a un historique de reboots matériels (WHEA "Machine Check Exception") sous charge CPU soutenue. Grand Livre n'a ni build natif ni bundler ni étape de compilation (juste `npx serve` en dev, `git push` en prod) — le risque réel est donc faible ici comparé à un build Android/Expo. Mais si le workflow évolue un jour vers quelque chose de plus lourd (bundler, tests headless en boucle, build d'assets), reprendre le même réflexe que sur mon-garage : pas d'enchaînement d'opérations lourdes dos à dos sans pause, découper plutôt qu'un long enchaînement.

## Performance (adapté au vanilla JS — pas de React ici)
- **Thread principal jamais bloqué :** tout traitement coûteux (OCR Tesseract, reconnaissance vocale) reste asynchrone / délégué au navigateur (Web Worker interne à Tesseract.js) — ne jamais lancer un calcul lourd de façon synchrone dans un handler de clic.
- **Pas de spinner cosmétique :** un `db.add`/`db.put` IndexedDB est quasi instantané — aucun état de chargement dessus. Un spinner/état "en cours" est réservé aux vraies opérations lentes/externes (chargement Tesseract, reconnaissance vocale) — patron déjà suivi (`scan-status`, `.recording` sur le bouton micro), à garder.
- **Pas de recalcul redondant :** éviter d'appeler deux fois `diagnostics()`/`monthAggregate()` pour le même mois dans un seul passage de rendu — stocker le résultat dans une variable locale plutôt que rappeler la fonction.
- **Pas de virtualisation prématurée :** liste de transactions en `.map()`+innerHTML direct, adapté au volume d'un budget perso (dizaines/centaines de lignes). Revisiter seulement si la liste devient réellement lente à l'usage (milliers de lignes), pas par anticipation.
- **Schéma IndexedDB versionné :** toute évolution de la forme des données passe par un bump de `DB_VERSION` (`js/db.js`) + logique dans `onupgradeneeded` — jamais de mutation silencieuse de la forme d'un objet stocké sans migration explicite. Pas de dépendance de validation externe (type Zod) à ajouter — reste cohérent avec le zéro-dépendance du projet.
- **Zéro dépendance par défaut :** ne pas introduire de framework/bundler/librairie sans raison forte — le projet est vanilla JS par choix, pas par oubli.
