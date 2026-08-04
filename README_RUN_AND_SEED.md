# Guide : Démarrage et Seeding de la Base de Données PostgreSQL pour UBOS

Ce guide vous explique pas à pas comment lancer PostgreSQL, appliquer les migrations de base de données, alimenter (seeder) la base de données avec les utilisateurs par défaut, et démarrer le serveur backend Express ainsi que l'application frontend React.

---

## 📋 Prérequis

- **Node.js** (v18+)
- **PostgreSQL** (installé localement OU via Docker)

---

## 🚀 Étape 1 : Démarrer la base de données PostgreSQL

### Option A : Via Docker (Recommandé)
Si vous avez Docker Desktop installé sur votre machine :

```bash
# Se placer dans le dossier server
cd server

# Lancer le conteneur PostgreSQL
docker compose up -d
```

### Option B : Via votre service PostgreSQL local
Si PostgreSQL est installé sur votre ordinateur Windows :
1. Assurez-vous que le service PostgreSQL est démarré (Port `5432`).
2. Créez une base de données nommée `ubos_db`.
3. Vérifiez la chaîne de connexion dans le fichier `server/.env` :
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ubos_db?schema=public"
   ```
   *(Modifiez `postgres:postgres` avec vos identifiants PostgreSQL si nécessaire).*

---

## 🛠️ Étape 2 : Créer les Tables & Seeder la Base de Données

Ouvrez votre terminal et exécutez les commandes suivantes dans le dossier `server` :

```bash
# 1. Naviguer vers le dossier du serveur
cd server

# 2. Installer les dépendances (si ce n'est pas déjà fait)
cmd /c "npm install"

# 3. Appliquer le schéma et créer les tables PostgreSQL
cmd /c "npx prisma db push"

# 4. Générer le client Prisma
cmd /c "npx prisma generate"

# 5. Remplir la base avec les utilisateurs par défaut (Seeding)
cmd /c "npm run prisma:seed"
```

> **Résultat attendu du seed :**
> `🌱 Seeding default users into PostgreSQL...`
> `✅ Seed finished: 8 users created.`

---

## 🖥️ Étape 3 : Démarrer le Serveur Backend Express

Dans le dossier `server` :

```bash
cmd /c "npm start"
# Ou en mode développement avec rechargement automatique :
cmd /c "npm run dev"
```

Le serveur backend va s'allumer et afficher :
> `🚀 Serveur UBOS PostgreSQL prêt sur http://localhost:5000`
> `✅ Connexion PostgreSQL établie.`

---

## 🌐 Étape 4 : Démarrer l'Application Frontend React

Ouvrez un **deuxième terminal** et exécutez :

```bash
# 1. Naviguer vers le dossier frontend
cd ubos-react

# 2. Installer les dépendances (si nécessaire)
cmd /c "npm install"

# 3. Démarrer l'application React
cmd /c "npm run dev"
```

L'application s'ouvrira sur `http://localhost:5173`. Vous verrez le badge `🟢 PostgreSQL` en haut à droite de l'application !

---

## 🔑 Identifiants de Connexion par Défaut (Seeded Users)

Toutes les personnes configurées ont le mot de passe par défaut : **`ubos2026`**

| Identifiant | Nom Complet | Rôle / Service |
| :--- | :--- | :--- |
| `oumaima` | Oumaima | Gérante / Direction |
| `imane` | Imane | Transport int. & Études |
| `mansouri` | Mansouri | Closing & Suivi Client |
| `ouiam` | Ouiam | Data & Demandes |
| `zoubida` | Zoubida | Analyse, Transit & Certif |
| `yasser` | Yasser | Sourcing & PortNet |
| `mohammed` | Mohammed Digital | Digital & Data |
| `nisrine` | Nisrine | Documents & Stockage |

---

## 💡 Remarques Utiles & Dépannage

### ⚠️ Problème courant : `EPERM: operation not permitted` pendant `prisma generate`
Si vous obtenez cette erreur :
```text
Error: EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp'
```

**Pourquoi cela arrive :**
Le serveur Node.js (`node src/index.js`) est actuellement en cours d'exécution et verrouille le fichier du moteur Prisma sous Windows.

**Solution :**
1. **Arrêtez le serveur backend** (Appuyez sur `Ctrl + C` dans le terminal qui exécute `npm start` ou fermez le processus Node).
2. Réexécutez votre commande (`npx prisma generate` ou `npx prisma db push`).
3. Relancez le serveur backend (`npm start`).

---

- **Synchronisation manuelle :** Si vous étiez hors ligne et que vous voulez forcer la synchronisation de vos données locales vers PostgreSQL, cliquez simplement sur le badge `🟢 PostgreSQL` dans la barre supérieure de l'application.
- **Réinitialisation de la DB :** Pour réinitialiser la base de données et tout re-seeder à zéro :
  ```bash
  cd server
  cmd /c "npx prisma db push --force-reset"
  cmd /c "npm run prisma:seed"
  ```

