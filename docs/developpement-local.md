# Développement local

Prérequis : Node.js compatible avec Vite et npm.

```sh
npm install
npm run dev
```

Ouvrir l'adresse affichée par Vite (par défaut `http://localhost:5173/`).

Pour vérifier la compilation et servir la version compilée :

```sh
npm run build
npm run preview
```

La PWA est générée pendant `npm run build`. Son installation se vérifie dans un navigateur compatible sur l'URL locale affichée par `npm run preview`. Pour y accéder depuis un smartphone, utiliser un serveur HTTPS ou un tunnel sécurisé : le service worker nécessite un contexte sécurisé en dehors de `localhost`.

La connexion Supabase nécessite `.env.local` avec l'URL exacte du projet Sensations Bois et sa clé publiable. Voir `docs/mission-06-connexion.md`. Sans cette configuration, l'application affiche un message de configuration et ne charge aucune donnée.
