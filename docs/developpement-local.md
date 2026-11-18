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

Le fichier `.env.example` prépare uniquement les noms des futures variables Supabase. Aucune connexion Supabase n'est configurée.
