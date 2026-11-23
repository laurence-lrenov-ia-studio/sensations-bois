# Mission 06 — connexion de l'application

État au 23 novembre 2026 : implémentation locale compilée, y compris l'écran d'acceptation d'invitation où Rémy choisit son mot de passe. Rémy a confirmé le Site URL et la Redirect URL exacts dans le bon projet. La clé `sb_publishable_…` a été placée uniquement dans `.env.local`, ignoré par Git : l'endpoint Auth répond `200`, et la lecture anonyme de `sb_products` est refusée (`401`, permission denied). L'écran de connexion a été vérifié en navigateur local. La variable GitHub Actions `SENSATIONS_BOIS_SUPABASE_PUBLISHABLE_KEY` est enregistrée dans le bon dépôt. L'invitation Auth, l'habilitation, le test connecté et la vérification sur smartphone restent à faire. Aucun mot de passe ni inventaire réel n'a été saisi par cette application. La préparation du scanner est documentée dans `docs/scanner-codes-barres.md` ; sa migration n'est pas appliquée.

Projet unique : `dkfwiaulbapfbbrslavy` (`https://dkfwiaulbapfbbrslavy.supabase.co`). L'application refuse une autre URL de configuration. Le catalogue et les données métier ne sont jamais intégrés au dépôt ni à la compilation : ils sont demandés après connexion Supabase Auth, sous les politiques RLS de la mission 05.

## Préparation de l'accès de Rémy

1. Dans **ce projet uniquement**, vérifier `Authentication → URL Configuration`. Le **Site URL** doit être exactement `https://laurence-lrenov-ia-studio.github.io/sensations-bois/`. Ajouter aussi cette URL exacte dans **Redirect URLs**, sans joker. La page GitHub Pages actuelle répond, mais la configuration Auth distante n'est pas vérifiable depuis les fichiers locaux. Vérifier que le modèle de courriel « Invite user » utilise le lien de confirmation Supabase (`{{ .ConfirmationURL }}`). [Documentation Supabase des redirections](https://supabase.com/docs/guides/auth/redirect-urls).
2. Renseigner la clé publiable du bon projet dans la variable GitHub indiquée plus bas, publier l'application avec l'écran d'invitation, puis contrôler dans un navigateur sans session que l'écran « Accès professionnel » apparaît. Ne pas envoyer l'invitation vers l'ancienne démonstration.
3. Dans `Authentication → Users`, choisir **Add user → Send invitation**, renseigner l'adresse e-mail existante de Rémy et envoyer l'invitation. Ne choisir aucune option qui fixe un mot de passe à sa place. Supabase crée l'utilisateur invité et envoie un lien qui lui permet de terminer l'inscription. [Procédure officielle Supabase](https://supabase.com/docs/guides/auth/users#using-the-dashboard).
4. Relever l'UUID de cet utilisateur dans `Authentication → Users`. Dans le SQL Editor du projet vérifié, habiliter cet UUID en administrateur. La requête suivante n'insère pas d'utilisateur Auth et ne modifie aucun autre projet :

```sql
insert into sb_private.members (user_id, role, active)
values ('UUID_AUTH_REMY_ICI'::uuid, 'admin', true)
on conflict (user_id) do nothing;
```

5. Vérifier `select user_id, role, active from sb_private.members where user_id = 'UUID_AUTH_REMY_ICI'::uuid;` : une ligne `admin`, `true`. Si une autre ligne existait déjà, la requête ne la modifie pas ; examiner son rôle avant toute correction.
6. Rémy ouvre lui-même le lien reçu dans le navigateur, choisit et confirme son mot de passe dans l'application. Celle-ci appelle `supabase.auth.updateUser({ password })` avec sa session d'invitation, puis contrôle son habilitation. Aucun mot de passe n'est créé par le développeur. Tester ensuite déconnexion, reconnexion, les 38 fiches et le refus d'un utilisateur Auth non habilité. [API officielle `updateUser`](https://supabase.com/docs/reference/javascript/auth-updateuser).

## Configuration locale

Dans un fichier `.env.local` ignoré par Git, renseigner seulement :

```text
VITE_SUPABASE_URL=https://dkfwiaulbapfbbrslavy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=cle_publiable_du_projet
```

Utiliser uniquement la **clé publiable** (`sb_publishable_…`) de ce projet ; l'application et le workflow rejettent une autre forme de clé. Ne jamais utiliser `service_role`, `sb_secret_…`, la chaîne de connexion PostgreSQL ou un jeton d'administration dans Vite/GitHub Pages. La clé publiable figure dans les ressources téléchargées par le navigateur ; la confidentialité dépend de Supabase Auth, des habilitations privées et de RLS. Démarrer avec `npm run dev`, puis `npm run build`.

## Vérifications métier

- Avant inventaire : 38 références, 38 états « Non inventorié », zéro alerte de rupture et zéro mouvement.
- Inventaire initial : saisir une quantité physique (zéro admis), cocher la confirmation, puis vérifier la nouvelle quantité, `inventoried_at` et un mouvement `inventaire_initial`. La fonction SQL refuse un second inventaire de la même fiche.
- Seuil : un produit inventorié est « Rupture » à zéro, « À recommander » lorsque la quantité positive est inférieure ou égale au seuil, « OK » au-dessus. Les produits non inventoriés sont exclus des alertes.
- Post-it : ajouter et cocher un produit ne crée aucun mouvement. Une sortie confirmée passe par l'écran Mouvements et le RPC historisé : `prise_cartouche` pour une cartouche, `boite_vide` pour la visserie, `sortie_manuelle` pour les autres produits.
- Retour : sélectionner le chantier et la sortie d'origine. Le serveur refuse un retour supérieur au reliquat, une mauvaise référence ou un mauvais chantier. L'écran liste les 500 mouvements les plus récents ; une sortie plus ancienne devra être traitée via une interface d'historique étendue.
- Auth : déconnexion, reconnexion, rejet d'un utilisateur absent de `sb_private.members`, vérification des refus d'écriture directe sur produits et mouvements.

## Publication de test GitHub Pages

Dans le dépôt GitHub `laurence-lrenov-ia-studio/sensations-bois`, créer la **variable de dépôt** `SENSATIONS_BOIS_SUPABASE_PUBLISHABLE_KEY` avec la clé publiable du bon projet. Le workflow échoue avant le déploiement si elle est absente. Vérifier Auth, l'habilitation et RLS avant d'envoyer le code sur `main` : GitHub Pages est public, même si les données chargées après connexion sont privées. Le workflow existant compile Vite avec la seule URL contrôlée et cette clé publiable, puis déploie GitHub Pages. Aucun déploiement Netlify n'est prévu.

Avant la publication, contrôler le contenu de `dist` et du commit : aucune fiche produit, CSV client, secret, nom de client ni mot de passe. Après publication, tester dans le navigateur : écran de connexion sans session, accès Rémy aux 38 fiches, absence d'accès pour un utilisateur non habilité, état « Non inventorié », saisie réelle d'un inventaire seulement lorsque Rémy souhaite l'effectuer, puis historique correspondant.
