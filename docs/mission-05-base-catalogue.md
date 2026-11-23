# Mission 05 — clôturée

Le 20 novembre 2026, Rémy a confirmé l'exécution de la migration et l'import sur le projet Sensations Bois `dkfwiaulbapfbbrslavy`. Son contrôle SQL final a retourné `38, 38, 38, 14, 24, 0` : 38 fiches importées, 38 références distinctes, 38 stocks non inventoriés, et aucun mouvement créé. Les deux compteurs intermédiaires (`14` et `24`) sont conservés tels que transmis, sans interprétation faute d'intitulés de colonnes dans ce message. Aucune quantité fictive n'a été créée. Cette confirmation est fournie par l'utilisateur ; aucune connexion distante n'a été utilisée pour la reproduire dans cette session.

La mission 06 connecte l'application au schéma existant. Voir `docs/mission-06-connexion.md`.

Projet Supabase : `dkfwiaulbapfbbrslavy` (Sensations Bois). Le diagnostic initial transmis depuis son SQL Editor indiquait : aucune table dans `public` ou `sb_private`, aucun objet `sb_`, PostgreSQL 17.6, `auth.users`, `auth.uid()` et `gen_random_uuid()` disponibles. La migration et l'import ont ensuite été exécutés par Rémy.

## Fichiers

- `supabase/migrations/20261118000000_prepare_business_schema.sql` : schéma transactionnel préparatoire, non appliqué à distance. Le CLI Supabase n'étant pas installé ici, le fichier a été créé localement sans commande `supabase migration new` ; vérifier son nom et son ordre dans l'historique du projet avant exécution.
- `validation/mission-05-local.sql` : scénarios locaux sur PostgreSQL Supabase, exécutés dans une transaction annulée.
- `scripts/prepare-catalogue-import.mjs` : valide le CSV privé puis crée, sur demande, un SQL confidentiel **hors du dépôt**. Il n'exécute aucune requête distante.
- `src/features/stock/stock-status.ts` : règle d'affichage : `quantite_stock IS NULL` signifie « Non inventorié ».

## Contrôles déjà réalisés

Le fichier privé `C:\Users\lreno\Downloads\sensations_bois_catalogue_preimport_v01.csv` a été lu sans être copié dans le dépôt. Son SHA-256 est `194de7cf8987a7cf3e52477332fd9e10dd3a50e23e465aaf781c531b507ab961`. Il contient 38 `id_interne` distincts, 14 colonnes, et 4 catégories : Colles 14, Abrasifs 5, Visserie 15, Assemblage 4. Il ne contient pas `quantite_initiale`. Quatre unités restent vides selon le contrôle V05. Les observations historiques sont conservées comme texte source ; `debit_rule` suit les règles validées après ce contrôle.

## Procédure appliquée par Rémy (archive)

1. Vérifier que le SQL Editor affiche le projet `dkfwiaulbapfbbrslavy`. Le diagnostic de catalogue système a déjà confirmé l'absence d'objets `sb_` et les prérequis Auth/PostgreSQL.
2. Appliquer la migration entière, `begin` à `commit`, en une seule exécution sur ce projet. Elle crée les tables et droits ensemble, sans fenêtre d'exposition intermédiaire. Vérifier ensuite les avis de sécurité et les droits Data API. Aucune ligne de membre n'est créée automatiquement. Ajouter Rémy avec le rôle `admin` après avoir vérifié son `auth.users.id` ; accorder d'autres rôles seulement sur décision métier.
4. Contrôler la lecture avec un utilisateur autorisé, un utilisateur Auth non autorisé et `anon`. Vérifier que les écritures directes sur produits et mouvements sont refusées. Tester la fonction de mouvement dans une transaction annulée, y compris double `operation_id`, stock insuffisant et produit non inventorié.
5. Vérifier le CSV local : `node scripts/prepare-catalogue-import.mjs --check "C:\Users\lreno\Downloads\sensations_bois_catalogue_preimport_v01.csv"`.
6. Générer le SQL confidentiel hors dépôt : `node scripts/prepare-catalogue-import.mjs --sql-out "C:\Users\lreno\Downloads\sensations_bois_catalogue_preimport_v01.csv" "C:\Users\lreno\Downloads\sensations_bois_import_prive.sql"`. Le fichier ne peut pas être écrasé. Exécuter ce SQL **uniquement** sur le projet contrôlé. L'opération est transactionnelle, ignore les fiches déjà présentes avec la même référence et échoue si leurs champs diffèrent. Elle ne touche pas aux quantités ou aux mouvements.
7. Vérifier exactement 38 produits pour les identifiants du CSV, les 4 catégories et 0 mouvement généré par l'import. Si la base contenait déjà des mouvements, comparer le total avant/après plutôt que d'exiger zéro.

## Règles métier et sécurité

- `quantite_stock` est `NULL` avant inventaire ; seule la saisie confirmée d'un inventaire initial fixe cette valeur et crée le mouvement correspondant. La fonction réserve cette opération à un membre `admin`. Rémy doit être ce membre lors de la saisie réelle.
- Les sorties `prise_cartouche`, `boite_vide` et `sortie_manuelle` exigent respectivement la règle du produit et un chantier. `est_prepare` dans `sb_postit_items` signifie seulement « prêt sur la liste » : l'ajout ou la modification du post-it ne débite rien. La prise confirmée est un appel séparé à `sb_record_stock_movement`.
- Un retour exige `p_sortie_movement_id`, pointant vers une sortie du même produit et du même chantier. La fonction verrouille le produit puis la sortie et refuse que la somme des retours dépasse la quantité sortie. Les retours restent des mouvements positifs distincts ; une relance avec le même `operation_id` est idempotente.
- Les chantiers appartiennent à leur créateur Auth (`owner_id`). Rémy, une fois habilité comme membre `admin`, peut créer et modifier ses chantiers, leurs interventions et leurs post-it. Les politiques RLS contrôlent l'ancien et le nouvel état ; les autorisations de colonnes empêchent de modifier `owner_id`, les identifiants et les horodatages. Aucun droit d'écriture direct n'est accordé sur les produits ou mouvements.
- Chaque mouvement mémorise l'heure serveur, le produit, le type, les quantités avant et après, la variation, le motif, l'utilisateur et le chantier le cas échéant. Le verrouillage de la ligne produit et `operation_id` unique protègent les opérations concurrentes et les relances.
- Le client React a été connecté dans la mission 06. La clé publiable est une configuration du navigateur ; aucune clé secrète ni donnée du catalogue n'est intégrée au dépôt.
- Les champs `fournisseur`, `emplacement` et les unités manquantes restent vides. Les photos client restent hors dépôt.

La fonction de stock est `SECURITY DEFINER` car les rôles clients n'ont aucun droit d'écriture direct. Son exécution est limitée à `authenticated`, son `search_path` est vide et elle vérifie `auth.uid()` et le rôle privé. Un avis Supabase peut néanmoins signaler toute fonction `SECURITY DEFINER` exposée ; revoir son usage et ses privilèges lors de l'audit avant de connecter l'application.

## Vérification locale effectuée

La migration a été exécutée dans un conteneur temporaire `public.ecr.aws/supabase/postgres:17.11.0.006`, sans base distante. `validation/mission-05-local.sql` a validé les refus `anon`/non-membre, l'isolation entre deux administrateurs, les créations et modifications autorisées, le contrôle de cohérence intervention/chantier, l'absence de débit sur le post-it, l'inventaire préalable obligatoire, les règles de débit, les retours partiels, le retour excessif refusé et l'idempotence. Après annulation des données fictives : 0 produit, 0 mouvement, 0 membre ; RLS active sur les huit tables, 0 droit de table pour `anon`, 0 droit d'écriture direct `authenticated` sur produits et mouvements.
