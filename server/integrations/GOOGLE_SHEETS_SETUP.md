# Synchronisation Google Sheets → CRM Data

1. Ouvrez la feuille Google Sheets contenant les leads, puis **Extensions → Apps Script**.
2. Collez le contenu de `google_sheets_crm_sync.gs`.
3. Dans **Paramètres du projet → Propriétés du script**, ajoutez :
   - `CRM_SYNC_URL` = `https://crm.ultex.ma/api/sync/sheets/lead`
   - `CRM_SYNC_API_KEY` = la même valeur que `ULTEX_SYNC_API_KEY` sur le serveur CRM
   - `CRM_SHEET_NAME` = le nom de la feuille (par défaut `Leads`)
   - `CRM_HEADER_ROW` = le numéro de la ligne d’en-têtes (par défaut `1`)
4. Rechargez la feuille, ouvrez le menu **ULTEX CRM**, puis cliquez sur **Installer la synchronisation automatique**.

Le script reconnaît notamment les en-têtes : Nom du client, Code client, Téléphone, Email, Ville, Date de réception, Besoin/Produit, Type de demande, Urgence, Responsable Data, Data Tag, Échéance code, Action suivante et Source.

Deux colonnes techniques sont ajoutées automatiquement :

- `CRM_SYNC_ID` : identifiant permanent empêchant les doublons même après tri des lignes.
- `CRM_SYNC_STATUS` : résultat et heure de la dernière synchronisation.

