# Scanner — préparation locale

Le scanner lit les codes-barres 1D via la caméra du téléphone ou par saisie manuelle. Il cherche dans le catalogue chargé après Auth et affiche immédiatement la fiche trouvée. Il ne génère aucun QR code interne et ne modifie jamais le stock lors d'une lecture, d'une association ou d'une création. La caméra exige HTTPS sur smartphone ; GitHub Pages le fournit. L'application utilise `@zxing/browser` pour la lecture et libère la caméra dès qu'un code est reconnu ou que Rémy l'arrête. [API officielle ZXing](https://github.com/zxing-js/browser#using-the-api).

Sur une fiche reconnue, « Sortie chantier » ouvre un formulaire de chantier et de quantité. Une confirmation explicite suit la règle du produit : prise effective des cartouches, boîte de visserie vide, ou sortie manuelle. Après inventaire, la validation appelle `sb_record_stock_movement` et débite le stock. Avant inventaire, elle appelle `sb_record_preinventory_outflow` : une trace distincte « Sortie avant inventaire » contient la quantité consommée, le chantier, l'utilisateur et l'heure serveur, mais aucun stock avant/après ni variation. Le produit reste « Non inventorié ». Aucun post-it n'est créé ni requis. Une lecture simple ne déclenche aucune écriture. Après une réponse incertaine, une nouvelle tentative avec les mêmes paramètres réutilise l'identifiant d'opération pour éviter un doublon.

Vérification fonctionnelle à réaliser après activation d'un compte Auth habilité et de la migration complémentaire : scanner un code connu, constater l'absence de trace créée par le scan, puis confirmer une sortie avant inventaire et vérifier une seule ligne dans `sb_preinventory_outflows`, sans changement de `sb_products.quantite_stock` ni nouveau `sb_stock_movements`. Saisir ensuite la quantité physiquement constatée comme inventaire initial ; elle ne soustrait aucune sortie antérieure. Les sorties suivantes créent des mouvements normaux. Contrôler le refus d'une quantité supérieure au stock après inventaire et d'un utilisateur non habilité. Aucun mouvement de test n'a été créé sur la base distante.

La migration `supabase/migrations/20261123000000_scanner_barcode.sql` est **préparée localement, non appliquée à distance**. Avant exécution sur `dkfwiaulbapfbbrslavy`, vérifier les doublons existants :

```sql
select upper(btrim(code_barres)) as code, count(*)
from public.sb_products
where nullif(btrim(code_barres), '') is not null
group by upper(btrim(code_barres))
having count(*) > 1;
```

Le résultat attendu est zéro ligne. L'index unique normalise casse et espaces ; si des doublons existent, la migration échoue sans modifier la base grâce à sa transaction. Les deux fonctions RPC exigent `auth.uid()` et le rôle `admin` actif dans `sb_private.members`. Les rôles `anon`, non habilité et `lecture` sont refusés. Les droits directs d'écriture sur `sb_products` restent révoqués.

Après validation de la migration, vérifier en transaction annulée : association d'un code libre, refus d'un code déjà utilisé, refus de remplacer un code différent sur une fiche, création avec code conservé, `quantite_stock is null`, `inventoried_at is null`, aucun mouvement supplémentaire ; puis `rollback`. Contrôler aussi le refus pour un compte non administrateur. Activer ensuite `VITE_SCANNER_WRITES_ENABLED=true` dans une version de test seulement après ces contrôles. Le workflow GitHub Pages le maintient actuellement à `false` : lecture et saisie manuelle visibles, association et création désactivées.

Les nouveaux produits reçoivent une référence `PROD-xxxx`, la catégorie sélectionnée, un seuil critique saisi et la règle de débit choisie. Leur statut de validation est `À compléter`. L'inventaire initial reste une opération séparée, confirmée et historisée par `sb_record_stock_movement`.
