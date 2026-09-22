# Google Sheets → CRM — nouveaux clients L

Les deux feuilles partagent la même séquence côté CRM. Les codes vont jusqu'à `L6912`, donc le prochain nouveau client sans doublon recevra `L6913`. Si le CRM contient déjà un code L supérieur, la séquence continue automatiquement après ce code.

## Feuille 1 — formulaire importation

En-têtes reconnus : `Date et Heure`, `Nom Complet`, `Société`, `Email`, `Téléphone`, `Volume d'importation`, `Fournisseur Fiable ?`, `Frustration Actuelle`, `Produit à Importer`.

1. Ouvrir la feuille puis **Extensions → Apps Script**.
2. Remplacer le contenu par `google_sheets_l_formulaire.gs`.
3. Dans **Paramètres du projet → Propriétés du script**, ajouter `CRM_SYNC_API_KEY` avec la même valeur que `ULTEX_SYNC_API_KEY` du serveur CRM.
4. Enregistrer et recharger la feuille.
5. Ouvrir **ULTEX CRM → Autoriser la connexion CRM**, puis accepter toutes les autorisations Google demandées.
6. Ouvrir **ULTEX CRM → Installer la synchronisation**.

Le script de la feuille 1 contient aussi `doPost`, le point d'entrée utilisé par le formulaire du site. Après avoir remplacé le code d'un Web App déjà publié, créer une **nouvelle version du déploiement Web App** en conservant la même URL de déploiement. Aucun redéploiement du CRM n'est nécessaire pour cette étape.

## Feuille 2 — landing page

En-têtes reconnus : `submitted_at`, `nom`, `produit`, `pays`, `whatsapp`, `browser_id`.

Suivre les mêmes étapes en collant `google_sheets_l_landing.gs`.

## Fonctionnement

- Un nouveau téléphone crée un client `L`, une demande CRM et une ligne produit.
- Un téléphone déjà présent conserve son code client et reçoit seulement une nouvelle demande.
- Les deux feuilles utilisent le même verrou et la même séquence CRM : elles ne peuvent pas attribuer le même code.
- Une répétition d'envoi réutilise le `CRM_SYNC_ID` et ne crée pas de doublon.
- Les numéros marocains comme `661865993`, `0661865993` et `+212 661 86 59 93` sont normalisés au même format.
- Les anciennes lignes sont marquées `HISTORIQUE — non importé` pendant l'installation. Pour en importer une, la sélectionner puis choisir **ULTEX CRM → Importer les lignes sélectionnées**.
- Les lignes ajoutées par une saisie ou un formulaire partent immédiatement. Les lignes écrites par un autre script/API sont détectées par une vérification automatique au plus tard une minute après leur arrivée.

Le script ajoute quatre colonnes techniques : `CRM_SYNC_ID`, `CRM_CLIENT_CODE`, `CRM_DEMANDE_CODE` et `CRM_SYNC_STATUS`. Elles permettent de retrouver le résultat et de relancer une ligne en erreur sans la dupliquer.

`CRM_SYNC_URL` est ajouté automatiquement avec `https://crm.ultex.ma/api/sync/sheets/lead-l`. Il peut être remplacé dans les propriétés du script pour tester sur un autre serveur.
