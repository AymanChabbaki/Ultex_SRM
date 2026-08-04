# 🌐 Guide de Déploiement Production (srm.ultex.ma)

Ce guide détaille les étapes pour déployer l'application **UBOS SRM** sur votre serveur Linux (`105.156.171.225`) avec support **HTTPS SSL** sur la sous-domaine **`srm.ultex.ma`**.

---

## 🏗️ Architecture du Déploiement

Le projet utilise **Docker Compose** en production pour éviter tout conflit de ports avec vos services existants (ports 5432, 5433, 80, 443 déjà utilisés) :

- **`ubos-postgres`** : Base PostgreSQL de production (Port interne 5432, exposé sur 5434).
- **`ubos-backend`** : Serveur API Express + Prisma (Exposé sur le port 5050).
- **`ubos-frontend`** : Nginx servant l'application React & proxying `/api` (Exposé sur le port 8080).

---

## 🚀 Étape 1 : Cloner / Transférer le projet sur le serveur

Sur votre serveur Linux (`ultex@ultexserver`) :

```bash
cd /opt # Ou dans votre dossier de projets
git clone <URL_DE_VOTRE_REPO_GIT> Ultex_SRM
cd Ultex_SRM
```

---

## 🐳 Étape 2 : Démarrer les conteneurs Docker en Production

Dans le dossier du projet sur le serveur, lancez :

```bash
# 1. Binder et démarrer les 3 services (DB, Backend, Frontend)
docker compose -f docker-compose.prod.yml up -d --build

# 2. Appliquer les migrations de base de données dans le conteneur backend
docker exec -it ubos_backend_prod npx prisma db push

# 3. Exécuter le seed pour créer les utilisateurs par défaut
docker exec -it ubos_backend_prod npm run prisma:seed
```

---

## 🔒 Étape 3 : Configuration du Proxy Inverse & SSL (HTTPS srm.ultex.ma)

Puisque les ports **80** et **443** de votre serveur sont gérés par un Docker Proxy (Nginx Proxy Manager ou Traefik/Caddy/Nginx) :

### Option A : Si vous utilisez **Nginx Proxy Manager** (Interface Web)
1. Connectez-vous à votre Nginx Proxy Manager.
2. Allez dans **Proxy Hosts** > **Add Proxy Host**.
3. Remplissez les champs :
   - **Domain Names:** `srm.ultex.ma`
   - **Scheme:** `http`
   - **Forward Hostname / IP:** `127.0.0.1` (ou `105.156.171.225`)
   - **Forward Port:** `8080`
   - Cochez **Block Common Exploits** et **Websockets Support**.
4. Dans l'onglet **SSL** :
   - Sélectionnez **Request a new SSL Certificate**.
   - Cochez **Force SSL** et **HTTP/2 Support**.
   - Acceptez les conditions et cliquez sur **Save**.

---

### Option B : Si vous utilisez un fichier de configuration **Nginx classique** sur le serveur

Ajoutez cette configuration dans `/etc/nginx/sites-available/srm.ultex.ma` :

```nginx
server {
    listen 80;
    server_name srm.ultex.ma;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name srm.ultex.ma;

    ssl_certificate /etc/letsencrypt/live/srm.ultex.ma/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/srm.ultex.ma/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Pour obtenir le certificat SSL gratuit avec Certbot :
```bash
sudo certbot --nginx -d srm.ultex.ma
```

---

## ✅ Étape 4 : Vérification

Ouvrez votre navigateur :
- 🌐 **HTTPS URL :** `https://srm.ultex.ma`
- 🖥️ **Direct IP HTTP :** `http://105.156.171.225:8080`

Identifiants de connexion par défaut :
- Identifiant : `oumaima`
- Mot de passe : `ubos2026`
