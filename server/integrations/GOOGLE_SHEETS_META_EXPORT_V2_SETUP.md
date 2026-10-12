# Google Sheets Meta export → CRM V2 (codes E)

Ce connecteur traite ensemble les onglets `Formulaire export` et `Formulaire export (v4)`. Il envoie exclusivement vers `https://crm.ultex.ma/api-v2/` et le serveur refuse cette route sur le CRM principal.

## Installation

1. Déployer le backend CRM contenant la route `/api-v2/sync/sheets/meta-export-v2`.
2. Dans le Google Sheet, ouvrir **Extensions → Apps Script**.
3. Remplacer le contenu par `google_sheets_meta_export_v2.gs`, puis enregistrer.
4. Dans **Paramètres du projet → Propriétés du script**, ajouter :
   - `CRM_SYNC_API_KEY` : la même valeur que `ULTEX_SYNC_API_KEY` de `ubos_backend_v2_prod`.
   - `CRM_V2_SYNC_URL` est facultatif ; sa valeur par défaut est `https://crm.ultex.ma/api-v2/sync/sheets/meta-export-v2`.
5. Recharger le Google Sheet.
6. Lancer **ULTEX CRM V2 → 1. Autoriser la connexion**, accepter les autorisations Google, puis lancer **2. Installer la synchronisation**.

L’installation ajoute les colonnes `CRM_SYNC_ID`, `CRM_CLIENT_CODE`, `CRM_DEMANDE_CODE`, `CRM_SYNC_STATUS` et `CRM_SYNCED_AT` aux deux onglets.

## Règles

- Un nouveau prospect reçoit le prochain code `E` disponible dans la base V2.
- Le numéro de code est réservé côté PostgreSQL sous verrou ; les deux onglets ne peuvent pas recevoir le même code.
- Un téléphone ou e-mail déjà rattaché à un unique client `E` réutilise ce client et crée une nouvelle demande.
- L’ID Meta rend l’import idempotent : une relance ne duplique ni le client ni la demande.
- Un doublon ambigu est marqué `CONFLIT` dans la feuille et n’est pas importé silencieusement.
- Les réponses françaises et arabes, la campagne Meta, le produit, la priorité, le pays déduit du téléphone et les réponses au questionnaire sont conservés dans la demande.
- Les lignes déjà présentes au moment de l’installation sont marquées `HISTORIQUE — non importé`. Le menu **Importer tout l’historique** permet de les mettre volontairement en file.
- Les nouveaux leads ajoutés par Meta sont détectés au plus tard une minute après leur arrivée, même lorsque Google ne déclenche pas `onEdit`.

## Vérification rapide

Après un test réel, la ligne doit afficher :

- `CRM_CLIENT_CODE` : un code `E...` ;
- `CRM_DEMANDE_CODE` : un code `DMD...` ;
- `CRM_SYNC_STATUS` : `OK — E... — DMD...`.

Le lead doit apparaître uniquement sur `https://crm.ultex.ma/v2/`.
