# Деплой на Hetzner VPS

## 1. Создать VPS на Hetzner

- Зайти на [hetzner.com](https://www.hetzner.com/cloud)
- Создать сервер: **CX22** (2 vCPU, 4GB RAM, 40GB SSD) — ~4€/месяц
- OS: **Ubuntu 24.04**
- Добавить SSH ключ (если есть) или запомнить пароль root
- Запомнить IP адрес сервера

---

## 2. Первоначальная настройка сервера

Подключиться по SSH:
```bash
ssh root@YOUR_SERVER_IP
```

Установить Docker и Git:
```bash
apt update && apt upgrade -y
apt install -y git curl

# Docker (официальный способ)
curl -fsSL https://get.docker.com | sh

# Проверить что Docker работает
docker --version
docker compose version
```

---

## 3. Загрузить код на сервер

На **маке** инициализировать Git репозиторий (один раз):
```bash
cd "/Users/ginko/Сервис"
git init
git add .
git commit -m "Initial commit"
```

Создать приватный репозиторий на [GitHub](https://github.com/new), затем:
```bash
git remote add origin https://github.com/YOUR_USERNAME/garage-inventory.git
git push -u origin main
```

На **сервере** клонировать:
```bash
git clone https://github.com/YOUR_USERNAME/garage-inventory.git /opt/garage-inventory
cd /opt/garage-inventory
```

---

## 4. Настроить переменные окружения

На сервере:
```bash
cd /opt/garage-inventory

# Сгенерировать безопасный ключ
openssl rand -hex 32

# Создать .env файл
nano .env
```

Содержимое `.env`:
```
POSTGRES_PASSWORD=придумай_сложный_пароль
SECRET_KEY=вставь_сюда_вывод_openssl_rand_hex_32
```

---

## 5. Запустить приложение

```bash
cd /opt/garage-inventory
docker compose up -d --build
```

Подождать 1-2 минуты пока соберётся. Проверить:
```bash
docker compose ps
docker compose logs backend --tail=20
```

Открыть в браузере: `http://YOUR_SERVER_IP`

**Логин по умолчанию:**
- Email: `admin@garage.local`
- Пароль: `admin123`

> ⚠️ **СРАЗУ поменяй пароль!** Войди → поменяй через API или через /api/docs

---

## 6. Настроить домен + HTTPS (необязательно но желательно)

Если есть домен (например `sklad.example.com`), добавить A-запись на IP сервера.

На сервере:
```bash
apt install -y certbot

# Остановить nginx на время получения сертификата
docker compose stop nginx

# Получить сертификат
certbot certonly --standalone -d sklad.example.com

# Отредактировать nginx.conf — раскомментировать HTTPS блок
# и заменить YOUR_DOMAIN на твой домен
nano /opt/garage-inventory/nginx/nginx.conf

# Запустить обратно
docker compose up -d nginx
```

Автообновление сертификата добавить в cron:
```bash
crontab -e
# Добавить строку:
0 3 * * * certbot renew --quiet && docker compose -f /opt/garage-inventory/docker-compose.yml restart nginx
```

---

## 7. Настроить ежедневные бэкапы

```bash
chmod +x /opt/garage-inventory/scripts/backup.sh

crontab -e
# Добавить строку (бэкап в 2:00 ночи):
0 2 * * * /opt/garage-inventory/scripts/backup.sh >> /var/log/garage-backup.log 2>&1
```

Проверить что бэкап работает:
```bash
/opt/garage-inventory/scripts/backup.sh
ls /opt/garage-inventory/backups/
```

---

## 8. Обновление приложения (после изменений на маке)

На **маке** после изменений:
```bash
cd "/Users/ginko/Сервис"
git add .
git commit -m "описание изменений"
git push
```

На **сервере**:
```bash
cd /opt/garage-inventory
git pull
docker compose up -d --build
```

Занимает 1-3 минуты. Данные в базе не теряются.

---

## Структура проекта

```
Сервис/
├── backend/          # FastAPI + Python
│   └── app/
│       ├── main.py   # Точка входа
│       ├── models.py # Таблицы базы данных
│       └── routers/  # API endpoints
├── frontend/         # React + TypeScript
│   └── src/
│       ├── pages/    # Страницы
│       └── api/      # Запросы к бэкенду
├── nginx/            # Конфиг nginx
├── scripts/          # Бэкапы
├── docker-compose.yml
└── DEPLOY.md         # Эта инструкция
```

## Полезные команды

```bash
# Смотреть логи
docker compose logs -f

# Перезапустить только бэкенд
docker compose restart backend

# Подключиться к базе данных
docker compose exec db psql -U postgres garage_inventory

# Ручной бэкап
/opt/garage-inventory/scripts/backup.sh

# Восстановить бэкап
/opt/garage-inventory/scripts/restore.sh backups/garage_2026-01-01_02-00.sql.gz
```
