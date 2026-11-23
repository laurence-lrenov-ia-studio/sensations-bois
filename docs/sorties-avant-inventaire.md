# Sorties avant inventaire — évolution préparée

La migration initiale installée impose un stock chiffré à toute ligne de `sb_stock_movements`. Elle refuse donc une sortie lorsque `sb_products.quantite_stock IS NULL`. La nouvelle règle ne peut pas être représentée par un mouvement normal sans inventer `quantite_avant`, `variation` et `quantite_apres` ; la migration complémentaire crée `sb_preinventory_outflows` à cet effet. Elle ne remplace pas la fonction de stock existante et n'altère aucune quantité.

Une sortie avant inventaire contient le produit, une quantité positive consommée, un chantier appartenant à Rémy, la règle de débit appliquée, un motif, son utilisateur Auth et l'heure serveur. La table n'a aucune colonne de solde ou de variation. L'accès direct en écriture est révoqué ; la fonction RPC contrôle le membre `admin`, la propriété du chantier, la règle du produit et l'état non inventorié. Le verrou produit sérialise la sortie avec un éventuel inventaire initial simultané. L'identifiant d'opération unique rend les relances identiques idempotentes. Après l'inventaire, une nouvelle sortie avant inventaire est refusée, mais la relance de la même opération reste consultable.

L'inventaire initial existant fixe `quantite_stock` à la quantité réellement comptée à cette date. Il n'additionne ni ne soustrait les sorties antérieures. Les opérations postérieures utilisent `sb_record_stock_movement` et ses soldes normaux. Le post-it reste une liste sans débit ; le scan seul ne crée aucune trace.

La migration complémentaire a été appliquée par l'utilisateur au projet Sensations Bois `dkfwiaulbapfbbrslavy`. Son contrôle transmis confirme 38 produits et leurs empreintes inchangées, zéro mouvement et zéro trace, la table et la fonction présentes, RLS active, lecture anonyme et écriture directe refusées. Ce résultat distant n'a pas été reproduit depuis cette session avec une session Auth de Rémy. Le workflow GitHub Pages active désormais `VITE_PREINVENTORY_OUTFLOWS_ENABLED=true` pour la version de test, après ces contrôles. Il conserve `VITE_SCANNER_WRITES_ENABLED=false` tant que la migration distincte d'association des codes-barres n'est pas validée.

## Résultat local du 23 novembre 2026

Docker Desktop a été démarré et le conteneur éphémère `public.ecr.aws/supabase/postgres:17.11.0.006` a reçu la migration initiale, la migration complémentaire puis `validation/preinventory-local.sql`. Les trois scripts se sont terminés avec le code 0. Les scénarios ont vérifié : refus anonyme, non-membre et écriture directe ; isolation entre deux administrateurs ; chantier propriétaire obligatoire ; règle de débit et quantité valides ; sortie avant inventaire tracée avec acteur et heure, sans nouveau mouvement chiffré et avec stock toujours `NULL` ; relance idempotente ; mouvement existant inchangé ; inventaire réel de 7 après une sortie antérieure de 2, sans déduction supplémentaire ; sortie postérieure de 1 donnant un stock de 6. Une nouvelle sortie « avant inventaire » est refusée après le comptage. Le test se termine par `ROLLBACK`. Le contrôle final local a retourné `0|0|0|0|t|f|f` : zéro produit, mouvement, trace et membre de test ; RLS active ; aucune lecture `anon` ni écriture directe `authenticated` sur la nouvelle table. Le conteneur a été arrêté avec `--rm`.

## Vérification après application sur le bon projet

Cette vérification a été effectuée par l'utilisateur après exécution sur `dkfwiaulbapfbbrslavy`. Requêtes de référence en lecture seule :

```sql
select to_regclass('public.sb_preinventory_outflows') as table_trace,
       to_regprocedure('public.sb_record_preinventory_outflow(uuid,uuid,uuid,text,integer,text)') as fonction_trace;

select c.relrowsecurity as rls_active,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_lecture,
       has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE') as ecriture_directe_auth
from pg_class c
where c.oid = 'public.sb_preinventory_outflows'::regclass;

select count(*) as traces_avant_inventaire,
       (select count(*) from public.sb_stock_movements) as mouvements_chiffres,
       (select count(*) from public.sb_products where quantite_stock is null and inventoried_at is null) as produits_non_inventories
from public.sb_preinventory_outflows;
```

Attendu juste après migration : la table et la fonction existent, RLS active, aucune lecture anonyme ni écriture directe authentifiée, zéro nouvelle trace, aucun changement des deux autres compteurs. Les scénarios fonctionnels locaux de `validation/preinventory-local.sql` ont été validés et annulés par `ROLLBACK`. Le test de bout en bout avec une session réelle de Rémy reste à faire après confirmation de son adresse e-mail. Ne pas créer de sortie fictive dans le projet réel.
