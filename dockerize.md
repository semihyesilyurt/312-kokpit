# Kokpit Docker ile Yeni Sunucuya Taşıma Rehberi

Bu rehber, Kokpit projesinin Docker container'ları ile yeni bir sunucuya kurulumu için adım adım talimatlar içermektedir.

## İçindekiler

1. [Gereksinimler](#1-gereksinimler)
2. [Mevcut Sunucuda Hazırlık](#2-mevcut-sunucuda-hazırlık)
3. [Yeni Sunucu Kurulumu](#3-yeni-sunucu-kurulumu)
4. [Proje Aktarımı](#4-proje-aktarımı)
5. [Environment Yapılandırması](#5-environment-yapılandırması)
6. [SSL Sertifikası](#6-ssl-sertifikası)
7. [Veritabanı Migration](#7-veritabanı-migration)
8. [Production Deployment](#8-production-deployment)
9. [Backup ve Restore](#9-backup-ve-restore)
10. [Monitoring ve Logging](#10-monitoring-ve-logging)
11. [Hızlı Referans Komutları](#11-hızlı-referans-komutları)
12. [Kontrol Listesi](#12-kontrol-listesi)
13. [Sorun Giderme](#13-sorun-giderme)

---

## 1. Gereksinimler

### Minimum Sunucu Özellikleri

| Kaynak | Minimum | Açıklama |
|--------|---------|----------|
| CPU | 2 vCPU | İşlemci çekirdeği |
| RAM | 4 GB | Bellek |
| Disk | 40 GB SSD | Depolama |
| İşletim Sistemi | Ubuntu 22.04 LTS | Debian tabanlı dağıtım |

### Önerilen Sunucu Özellikleri (Production)

| Kaynak | Önerilen | Açıklama |
|--------|----------|----------|
| CPU | 4 vCPU | İşlemci çekirdeği |
| RAM | 8 GB | Bellek |
| Disk | 100 GB SSD | Depolama |
| İşletim Sistemi | Ubuntu 22.04 LTS | Debian tabanlı dağıtım |

### Yazılım Gereksinimleri

- Docker Engine 24.0+
- Docker Compose v2.20+
- Git 2.x
- Certbot (SSL için)

---

## 2. Mevcut Sunucuda Hazırlık

### 2.1 Veritabanı Yedekleme

```bash
# MySQL veritabanı yedeği al
docker exec kokpit-mysql mysqldump -u root -p'ROOT_PASSWORD' kokpit > kokpit_backup_$(date +%Y%m%d_%H%M%S).sql

# Sıkıştırılmış yedek (önerilir)
docker exec kokpit-mysql mysqldump -u root -p'ROOT_PASSWORD' kokpit | gzip > kokpit_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 2.2 Redis Yedekleme

```bash
# Redis RDB snapshot al
docker exec kokpit-redis redis-cli -a REDIS_PASSWORD BGSAVE

# RDB dosyasını kopyala
docker cp kokpit-redis:/data/dump.rdb ./redis_backup_$(date +%Y%m%d_%H%M%S).rdb
```

### 2.3 Environment ve Konfigürasyon Dosyaları

```bash
# Environment dosyası
cp .env .env.backup

# SSL sertifikaları
tar -czvf ssl_backup.tar.gz docker/nginx/ssl/

# Yüklenen dosyalar (varsa)
tar -czvf uploads_backup.tar.gz uploads/
```

### 2.4 Yedekleri Kontrol Et

```bash
# SQL dosya boyutunu kontrol et
ls -lh kokpit_backup_*.sql*

# Yedek içeriğini doğrula (opsiyonel)
gunzip -c kokpit_backup_*.sql.gz | head -100
```

---

## 3. Yeni Sunucu Kurulumu

### 3.1 Sistem Güncellemesi

```bash
# Sistem paketlerini güncelle
sudo apt update && sudo apt upgrade -y

# Gerekli araçları kur
sudo apt install -y curl wget git unzip htop
```

### 3.2 Docker Kurulumu

```bash
# Docker GPG key ekle
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Docker repository ekle
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker kur
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Docker'ı sudo olmadan kullan (opsiyonel)
sudo usermod -aG docker $USER
newgrp docker

# Docker servisini başlat ve etkinleştir
sudo systemctl start docker
sudo systemctl enable docker

# Kurulumu doğrula
docker --version
docker compose version
```

### 3.3 Güvenlik Duvarı (UFW) Yapılandırması

```bash
# UFW'yi etkinleştir
sudo ufw enable

# SSH erişimi (önemli - önce bunu yap!)
sudo ufw allow 22/tcp

# HTTP ve HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Durumu kontrol et
sudo ufw status verbose
```

### 3.4 Swap Alanı Oluştur (Opsiyonel - RAM < 4GB için)

```bash
# 2GB swap dosyası oluştur
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Kalıcı yap
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. Proje Aktarımı

### Seçenek A: Git Clone (Önerilen)

```bash
# Proje dizinine git
cd /opt

# Projeyi klonla
sudo git clone https://github.com/USERNAME/kokpit.git
cd kokpit

# Sahipliği değiştir
sudo chown -R $USER:$USER /opt/kokpit
```

### Seçenek B: SCP ile Transfer

```bash
# Eski sunucuda - projeyi sıkıştır
tar -czvf kokpit_project.tar.gz /path/to/kokpit

# Yeni sunucuya transfer et
scp kokpit_project.tar.gz user@NEW_SERVER_IP:/opt/

# Yeni sunucuda - arşivi aç
cd /opt
tar -xzvf kokpit_project.tar.gz
```

### Seçenek C: rsync ile Transfer

```bash
# Eski sunucudan yeni sunucuya senkronize et
rsync -avz --progress /path/to/kokpit/ user@NEW_SERVER_IP:/opt/kokpit/
```

### Dizin Yapısını Doğrula

```bash
# Gerekli dosyaların varlığını kontrol et
ls -la /opt/kokpit/
# Beklenen:
# - apps/api/
# - apps/web/
# - docker/
# - docker-compose.yml
# - docker-compose.prod.yml
# - .env.example

# Docker dosyalarını kontrol et
cat docker-compose.prod.yml | head -20
```

---

## 5. Environment Yapılandırması

### 5.1 Production .env Dosyası Oluştur

```bash
cd /opt/kokpit
cp .env.example .env
nano .env
```

### 5.2 Güçlü Şifre Üretimi

```bash
# JWT Secret (64 karakter)
openssl rand -base64 64

# MySQL Root Password (32 karakter)
openssl rand -base64 32

# MySQL User Password (32 karakter)
openssl rand -base64 32

# Redis Password (32 karakter)
openssl rand -base64 32
```

### 5.3 Production .env Şablonu

```env
# ============================================
# Kokpit Production Environment Configuration
# ============================================

# Environment
NODE_ENV=production

# ============================================
# Service Ports
# ============================================
API_PORT=3001
WEB_PORT=3000
MYSQL_PORT=3306
REDIS_PORT=6379

# ============================================
# MySQL Configuration
# ============================================
MYSQL_ROOT_PASSWORD=<GÜÇLÜ_ROOT_ŞİFRESİ>
MYSQL_DATABASE=kokpit
MYSQL_USER=kokpit
MYSQL_PASSWORD=<GÜÇLÜ_KULLANICI_ŞİFRESİ>

# ============================================
# Redis Configuration
# ============================================
REDIS_PASSWORD=<GÜÇLÜ_REDIS_ŞİFRESİ>

# ============================================
# JWT Configuration
# ============================================
JWT_SECRET=<64_KARAKTERLİK_GÜÇLÜ_SECRET>
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# ============================================
# CORS Configuration
# ============================================
CORS_ORIGIN=https://yourdomain.com

# ============================================
# Frontend Configuration
# ============================================
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
NEXT_PUBLIC_WS_URL=wss://yourdomain.com

# ============================================
# Platform API Keys
# ============================================
TRENDYOL_API_KEY=<TRENDYOL_API_KEY>
TRENDYOL_API_SECRET=<TRENDYOL_API_SECRET>
TRENDYOL_SUPPLIER_ID=<TRENDYOL_SUPPLIER_ID>

GETIR_API_KEY=<GETIR_API_KEY>
GETIR_API_SECRET=<GETIR_API_SECRET>

YEMEKSEPETI_API_KEY=<YEMEKSEPETI_API_KEY>
YEMEKSEPETI_API_SECRET=<YEMEKSEPETI_API_SECRET>

MIGROS_API_KEY=<MIGROS_API_KEY>
MIGROS_API_SECRET=<MIGROS_API_SECRET>

# ============================================
# Firebase (Push Notifications)
# ============================================
FIREBASE_PROJECT_ID=<FIREBASE_PROJECT_ID>
FIREBASE_PRIVATE_KEY=<FIREBASE_PRIVATE_KEY>
FIREBASE_CLIENT_EMAIL=<FIREBASE_CLIENT_EMAIL>
```

### 5.4 Environment Değişkenleri Listesi

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `NODE_ENV` | Evet | Ortam (production/development) |
| `MYSQL_ROOT_PASSWORD` | Evet | MySQL root şifresi |
| `MYSQL_DATABASE` | Evet | Veritabanı adı |
| `MYSQL_USER` | Evet | Veritabanı kullanıcısı |
| `MYSQL_PASSWORD` | Evet | Veritabanı şifresi |
| `REDIS_PASSWORD` | Evet | Redis şifresi |
| `JWT_SECRET` | Evet | JWT imzalama anahtarı |
| `CORS_ORIGIN` | Evet | İzin verilen origin |
| `NEXT_PUBLIC_API_URL` | Evet | Frontend API URL |
| `NEXT_PUBLIC_WS_URL` | Evet | WebSocket URL |
| `TRENDYOL_*` | Hayır | Trendyol entegrasyonu |
| `GETIR_*` | Hayır | Getir entegrasyonu |
| `YEMEKSEPETI_*` | Hayır | Yemeksepeti entegrasyonu |
| `MIGROS_*` | Hayır | Migros entegrasyonu |
| `FIREBASE_*` | Hayır | Push notification |

---

## 6. SSL Sertifikası

### 6.1 Certbot Kurulumu

```bash
# Certbot kur
sudo apt install -y certbot

# Snap ile kurulum (alternatif - daha güncel)
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### 6.2 SSL Sertifikası Alma (Standalone Mode)

```bash
# Port 80'in boş olduğundan emin ol
sudo systemctl stop nginx 2>/dev/null || true
docker compose down 2>/dev/null || true

# Sertifika al
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Sertifikalar şu konumda oluşur:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### 6.3 Sertifikaları Docker Nginx İçin Kopyala

```bash
# SSL dizini oluştur
mkdir -p /opt/kokpit/docker/nginx/ssl

# Sertifikaları kopyala
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/kokpit/docker/nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/kokpit/docker/nginx/ssl/

# İzinleri ayarla
sudo chown -R $USER:$USER /opt/kokpit/docker/nginx/ssl/
chmod 644 /opt/kokpit/docker/nginx/ssl/fullchain.pem
chmod 600 /opt/kokpit/docker/nginx/ssl/privkey.pem
```

### 6.4 Otomatik Yenileme

```bash
# Yenileme scripti oluştur
sudo tee /opt/kokpit/scripts/renew-ssl.sh > /dev/null <<'EOF'
#!/bin/bash
certbot renew --quiet

# Yeni sertifikaları kopyala
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/kokpit/docker/nginx/ssl/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/kokpit/docker/nginx/ssl/

# Nginx'i yeniden yükle
cd /opt/kokpit && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
EOF

# Scripti çalıştırılabilir yap
sudo chmod +x /opt/kokpit/scripts/renew-ssl.sh

# Cron job ekle (her gün 03:00'da)
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/kokpit/scripts/renew-ssl.sh >> /var/log/ssl-renew.log 2>&1") | crontab -
```

---

## 7. Veritabanı Migration

### 7.1 İlk Kurulum (Yeni Veritabanı)

```bash
cd /opt/kokpit

# Sadece MySQL ve Redis'i başlat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d mysql redis

# MySQL'in başlamasını bekle
echo "MySQL başlaması bekleniyor..."
sleep 30

# Health check
docker exec kokpit-mysql mysqladmin ping -h localhost -u root -p'ROOT_PASSWORD'

# Prisma migration çalıştır
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api npx prisma migrate deploy

# Seed verisi yükle (opsiyonel)
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api npx prisma db seed
```

### 7.2 Mevcut Veritabanını Restore Et

```bash
cd /opt/kokpit

# MySQL container'ını başlat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d mysql

# MySQL'in başlamasını bekle
sleep 30

# Yedekten restore et
# Sıkıştırılmış yedek için:
gunzip -c kokpit_backup_YYYYMMDD_HHMMSS.sql.gz | docker exec -i kokpit-mysql mysql -u root -p'ROOT_PASSWORD' kokpit

# Sıkıştırılmamış yedek için:
docker exec -i kokpit-mysql mysql -u root -p'ROOT_PASSWORD' kokpit < kokpit_backup_YYYYMMDD_HHMMSS.sql

# Bekleyen migration'ları uygula
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

### 7.3 Redis Restore (Opsiyonel)

```bash
# Redis container'ını durdur
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop redis

# RDB dosyasını kopyala
docker cp redis_backup_YYYYMMDD_HHMMSS.rdb kokpit-redis:/data/dump.rdb

# Redis'i başlat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d redis
```

---

## 8. Production Deployment

### 8.1 Docker Images Build

```bash
cd /opt/kokpit

# Production için build (bu işlem zaman alabilir)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache

# Alternatif: Sadece değişen servisleri build et
docker compose -f docker-compose.yml -f docker-compose.prod.yml build api web
```

### 8.2 Servisleri Başlat

```bash
# Tüm servisleri başlat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Başlangıç loglarını izle
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Belirli bir servisin loglarını izle
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
```

### 8.3 Health Check Doğrulama

```bash
# Container durumlarını kontrol et
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# API health check
curl -f http://localhost:3001/api/health || echo "API health check failed"

# Web health check
curl -f http://localhost:3000 || echo "Web health check failed"

# Nginx üzerinden (SSL ile)
curl -f https://yourdomain.com/api/health || echo "HTTPS health check failed"

# MySQL bağlantısı
docker exec kokpit-mysql mysqladmin ping -h localhost -u root -p'ROOT_PASSWORD'

# Redis bağlantısı
docker exec kokpit-redis redis-cli -a REDIS_PASSWORD ping
```

### 8.4 Servis Durumları

Başarılı deployment sonrası beklenen çıktı:

```
NAME             STATUS      PORTS
kokpit-mysql     healthy     0.0.0.0:3306->3306/tcp
kokpit-redis     healthy     0.0.0.0:6379->6379/tcp
kokpit-api       healthy     0.0.0.0:3001->3001/tcp
kokpit-web       healthy     0.0.0.0:3000->3000/tcp
kokpit-nginx     running     0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

---

## 9. Backup ve Restore

### 9.1 Otomatik Backup Scripti

```bash
# Scripts dizini oluştur
mkdir -p /opt/kokpit/scripts /opt/kokpit/backups

# Backup scripti oluştur
cat > /opt/kokpit/scripts/backup.sh << 'EOF'
#!/bin/bash
set -e

# Değişkenler
BACKUP_DIR="/opt/kokpit/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Backup dizini oluştur
mkdir -p $BACKUP_DIR

# MySQL Backup
echo "[$(date)] MySQL backup başlıyor..."
docker exec kokpit-mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" kokpit | gzip > "$BACKUP_DIR/mysql_$DATE.sql.gz"

# Redis Backup
echo "[$(date)] Redis backup başlıyor..."
docker exec kokpit-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
sleep 5
docker cp kokpit-redis:/data/dump.rdb "$BACKUP_DIR/redis_$DATE.rdb"

# Eski backup'ları temizle
echo "[$(date)] Eski backup'lar temizleniyor..."
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

# Boyutları göster
echo "[$(date)] Backup tamamlandı:"
ls -lh $BACKUP_DIR/*_$DATE*

echo "[$(date)] Backup işlemi başarıyla tamamlandı."
EOF

# İzinleri ayarla
chmod +x /opt/kokpit/scripts/backup.sh
```

### 9.2 Cron Job Yapılandırması

```bash
# Environment değişkenlerini cron için hazırla
cat > /opt/kokpit/scripts/backup-env.sh << EOF
export MYSQL_ROOT_PASSWORD='YOUR_ROOT_PASSWORD'
export REDIS_PASSWORD='YOUR_REDIS_PASSWORD'
EOF

chmod 600 /opt/kokpit/scripts/backup-env.sh

# Günlük backup cron job (her gün 02:00'da)
(crontab -l 2>/dev/null; echo "0 2 * * * source /opt/kokpit/scripts/backup-env.sh && /opt/kokpit/scripts/backup.sh >> /var/log/kokpit-backup.log 2>&1") | crontab -
```

### 9.3 Manuel Restore Prosedürü

```bash
# Mevcut servisleri durdur
cd /opt/kokpit
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Sadece veritabanlarını başlat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d mysql redis
sleep 30

# MySQL Restore
gunzip -c /opt/kokpit/backups/mysql_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i kokpit-mysql mysql -u root -p'ROOT_PASSWORD' kokpit

# Redis Restore
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop redis
docker cp /opt/kokpit/backups/redis_YYYYMMDD_HHMMSS.rdb kokpit-redis:/data/dump.rdb
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d redis

# Tüm servisleri başlat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 10. Monitoring ve Logging

### 10.1 Log İzleme Komutları

```bash
# Tüm servislerin logları
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Belirli servis logları
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f nginx

# Son 100 satır log
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 api

# Zaman aralığına göre log
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since="2024-01-01" api
```

### 10.2 Health Check Scripti

```bash
cat > /opt/kokpit/scripts/health-check.sh << 'EOF'
#!/bin/bash

# Renk kodları
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Kokpit Health Check - $(date)"
echo "=========================================="

# API Health
if curl -sf http://localhost:3001/api/health > /dev/null; then
    echo -e "API:   ${GREEN}✓ Healthy${NC}"
else
    echo -e "API:   ${RED}✗ Unhealthy${NC}"
fi

# Web Health
if curl -sf http://localhost:3000 > /dev/null; then
    echo -e "Web:   ${GREEN}✓ Healthy${NC}"
else
    echo -e "Web:   ${RED}✗ Unhealthy${NC}"
fi

# MySQL Health
if docker exec kokpit-mysql mysqladmin ping -h localhost -u root -p"$MYSQL_ROOT_PASSWORD" 2>/dev/null | grep -q "alive"; then
    echo -e "MySQL: ${GREEN}✓ Healthy${NC}"
else
    echo -e "MySQL: ${RED}✗ Unhealthy${NC}"
fi

# Redis Health
if docker exec kokpit-redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q "PONG"; then
    echo -e "Redis: ${GREEN}✓ Healthy${NC}"
else
    echo -e "Redis: ${RED}✗ Unhealthy${NC}"
fi

# Nginx Health
if curl -sf http://localhost/health > /dev/null; then
    echo -e "Nginx: ${GREEN}✓ Healthy${NC}"
else
    echo -e "Nginx: ${RED}✗ Unhealthy${NC}"
fi

echo "=========================================="

# Container durumları
echo ""
echo "Container Durumları:"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
EOF

chmod +x /opt/kokpit/scripts/health-check.sh
```

### 10.3 Basit Alarm Sistemi

```bash
cat > /opt/kokpit/scripts/alert.sh << 'EOF'
#!/bin/bash

# Konfigürasyon
ALERT_EMAIL="admin@yourdomain.com"
HOSTNAME=$(hostname)

# Health check
API_STATUS=$(curl -sf http://localhost:3001/api/health > /dev/null && echo "UP" || echo "DOWN")
WEB_STATUS=$(curl -sf http://localhost:3000 > /dev/null && echo "UP" || echo "DOWN")

# Alarm gönder (API veya Web down ise)
if [ "$API_STATUS" = "DOWN" ] || [ "$WEB_STATUS" = "DOWN" ]; then
    SUBJECT="[ALERT] Kokpit Service Down - $HOSTNAME"
    BODY="Alarm zamanı: $(date)

API Durumu: $API_STATUS
Web Durumu: $WEB_STATUS

Lütfen kontrol edin: ssh user@$HOSTNAME"

    # Email gönder (mailutils kurulu olmalı)
    echo "$BODY" | mail -s "$SUBJECT" $ALERT_EMAIL 2>/dev/null || \
    echo "[$(date)] ALERT: API=$API_STATUS, WEB=$WEB_STATUS" >> /var/log/kokpit-alerts.log
fi
EOF

chmod +x /opt/kokpit/scripts/alert.sh

# Her 5 dakikada bir kontrol et
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/kokpit/scripts/alert.sh") | crontab -
```

### 10.4 Disk ve Kaynak Kullanımı

```bash
# Container kaynak kullanımı
docker stats --no-stream

# Disk kullanımı
df -h

# Docker disk kullanımı
docker system df

# Temizlik (dikkatli kullanın)
docker system prune -f
docker volume prune -f
```

---

## 11. Hızlı Referans Komutları

### Başlatma / Durdurma / Restart

```bash
cd /opt/kokpit

# Başlat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Durdur
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart

# Belirli servisi restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart api
```

### Log Görüntüleme

```bash
# Canlı loglar
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# API logları
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api

# Son 100 satır
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 api
```

### Container'a Bağlanma

```bash
# API container'a shell bağlantısı
docker exec -it kokpit-api sh

# MySQL'e bağlan
docker exec -it kokpit-mysql mysql -u root -p

# Redis CLI
docker exec -it kokpit-redis redis-cli -a REDIS_PASSWORD
```

### Güncelleme İşlemi

```bash
cd /opt/kokpit

# Kod değişikliklerini çek
git pull origin main

# Yeniden build et
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache api web

# Servisleri yeniden başlat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Migration'ları uygula (gerekirse)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### Alias Tanımlamaları (Opsiyonel)

```bash
# ~/.bashrc'ye ekle
cat >> ~/.bashrc << 'EOF'

# Kokpit aliases
alias kp='cd /opt/kokpit'
alias kp-up='docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d'
alias kp-down='docker compose -f docker-compose.yml -f docker-compose.prod.yml down'
alias kp-restart='docker compose -f docker-compose.yml -f docker-compose.prod.yml restart'
alias kp-logs='docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f'
alias kp-ps='docker compose -f docker-compose.yml -f docker-compose.prod.yml ps'
alias kp-api-logs='docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api'
alias kp-health='/opt/kokpit/scripts/health-check.sh'
EOF

source ~/.bashrc
```

---

## 12. Kontrol Listesi

### Deployment Öncesi

- [ ] Yeni sunucu minimum gereksinimleri karşılıyor
- [ ] Domain DNS kaydı yeni sunucu IP'sine yönlendirildi
- [ ] Mevcut veritabanı yedeği alındı
- [ ] Environment dosyaları yedeklendi
- [ ] SSL sertifikaları yedeklendi (varsa)
- [ ] Platform API anahtarları hazır

### Deployment Sırası

- [ ] Docker ve Docker Compose kuruldu
- [ ] Güvenlik duvarı yapılandırıldı (22, 80, 443)
- [ ] Proje dosyaları aktarıldı
- [ ] .env dosyası oluşturuldu ve yapılandırıldı
- [ ] SSL sertifikası alındı
- [ ] Sertifikalar nginx/ssl dizinine kopyalandı
- [ ] Veritabanı restore edildi veya migration çalıştırıldı
- [ ] Docker images build edildi
- [ ] Servisler başlatıldı

### Deployment Sonrası

- [ ] Tüm container'lar healthy durumda
- [ ] API health check başarılı: `curl https://domain.com/api/health`
- [ ] Web erişimi çalışıyor: `curl https://domain.com`
- [ ] WebSocket bağlantısı test edildi
- [ ] Login/Auth işlemi test edildi
- [ ] Platform entegrasyonları test edildi (Trendyol, Getir, Migros, Yemeksepeti)
- [ ] Sipariş oluşturma/güncelleme test edildi
- [ ] Otomatik backup cron job'ı eklendi
- [ ] SSL otomatik yenileme cron job'ı eklendi
- [ ] Health check/alert scripti yapılandırıldı

---

## 13. Sorun Giderme

### Container Başlamıyor

```bash
# Detaylı log kontrolü
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs api

# Container detayları
docker inspect kokpit-api

# Yeniden build dene
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache api
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Veritabanı Bağlantı Hatası

```bash
# MySQL durumunu kontrol et
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps mysql

# MySQL logları
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs mysql

# Manuel bağlantı testi
docker exec -it kokpit-mysql mysql -u kokpit -p -e "SELECT 1"
```

### SSL Sertifika Sorunu

```bash
# Sertifika dosyalarını kontrol et
ls -la /opt/kokpit/docker/nginx/ssl/

# Nginx logları
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs nginx

# Sertifika geçerliliğini kontrol et
openssl x509 -in /opt/kokpit/docker/nginx/ssl/fullchain.pem -noout -dates
```

### Yüksek Kaynak Kullanımı

```bash
# Container kaynak kullanımı
docker stats

# Gereksiz imajları temizle
docker image prune -a

# Eski logları temizle
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=0

# Volume'ları kontrol et
docker volume ls
docker system df
```

### WebSocket Bağlantı Sorunu

```bash
# API WebSocket logları
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs api | grep -i socket

# Nginx WebSocket konfigürasyonunu kontrol et
cat /opt/kokpit/docker/nginx/nginx.conf | grep -A 10 "socket.io"

# Tarayıcı konsolunda test (client tarafı)
# DevTools > Network > WS sekmesini kontrol et
```

---

## Önemli Notlar

1. **Şifreleri Asla Commit Etmeyin**: `.env` dosyası `.gitignore`'da olmalıdır.

2. **Düzenli Yedekleme**: Günlük otomatik backup mutlaka yapılandırılmalıdır.

3. **SSL Yenileme**: Let's Encrypt sertifikaları 90 günde bir yenilenir. Otomatik yenileme cron job'ı yapılandırın.

4. **Log Rotasyonu**: Docker log sınırları zaten `docker-compose.prod.yml`'de yapılandırılmıştır.

5. **Güvenlik**:
   - Root kullanıcısı yerine normal kullanıcı tercih edin
   - Gereksiz portları kapatın
   - Düzenli güvenlik güncellemeleri yapın

6. **Platform Entegrasyonları**: Her platform için ayrı API anahtarları kullanın ve bunları güvenli bir şekilde saklayın.

---

## Yardım ve Destek

Sorun yaşarsanız:

1. Bu rehberdeki "Sorun Giderme" bölümünü kontrol edin
2. Docker ve servis loglarını inceleyin
3. Health check scriptini çalıştırın
4. Container durumlarını kontrol edin

```bash
# Hızlı durum kontrolü
/opt/kokpit/scripts/health-check.sh
```
