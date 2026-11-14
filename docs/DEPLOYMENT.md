# Развёртывание

Инструкция рассчитана на новый VPS с Ubuntu 24.04 LTS. Вместо `example.ru` используйте свой домен. Пример каталога приложения: `/var/www/hunter`, системного пользователя: `deploy`. Уже работающий сервер обновляется по [отдельной инструкции](UPDATE_GUIDE.md).

## Требования

Нужны Node.js **24.x**, npm, Nginx, средство управления процессом PM2, HTTPS-сертификат и постоянный локальный диск. SQLite устанавливается как зависимость приложения; утилита `sqlite3` полезна для диагностики и резервных копий. Для сборки нативных модулей могут понадобиться Python 3, компилятор C/C++ и make.

Для небольшого сайта разумная начальная конфигурация: 1–2 ядра, 2 ГБ RAM и от 20 ГБ SSD. Объём диска зависит от фотографий, журналов и копий; установка зависимостей и обработка фото требуют дополнительного запаса памяти.

На управляемом хостинге должны быть Node.js 24, постоянное файловое хранилище, запуск фонового процесса и поддержка нативных SQLite/Sharp. Тариф только со статическими страницами или PHP не подходит. Эфемерный диск и несколько независимых экземпляров приложения не поддерживаются.

## Подготовка системы

Системные команды выполняются от `root`. Приложение работает от отдельного непривилегированного пользователя.

```bash
apt update
apt install -y nginx curl ca-certificates git build-essential python3 pkg-config sqlite3 ufw logrotate snapd
adduser deploy
install -d -o deploy -g deploy -m 750 /var/www/hunter
```

Настройте SSH-доступ для `deploy`. Перед включением firewall проверьте, что разрешён фактический порт SSH. Для стандартного порта 22:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw default deny incoming
ufw default allow outgoing
ufw enable
ufw status verbose
```

Порт приложения `3001` наружу не открывается. Доступы к базе, копиям и секретам должны быть ограничены. Предоставлять `deploy` полный sudo-доступ для работы сайта не требуется.

## Node.js и исходники

Далее команды выполняются от `deploy`. Один из вариантов установки Node.js: [nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```bash
curl -fsSLo "$HOME/nvm-install.sh" https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh
bash "$HOME/nvm-install.sh"
. "$HOME/.nvm/nvm.sh"
nvm install 24
nvm alias default 24
nvm use 24
node -v
npm -v
npm install --global pm2
```

Перенесите исходники архивом или клонируйте репозиторий в `/var/www/hunter`. Каталог должен быть доступен `deploy`. Не переносите локальные `node_modules`, тестовую базу и секреты.

```bash
cd /var/www/hunter
umask 077
npm ci --include=dev
cp .env.example .env
mkdir -p data client/public/images/uploads
chmod 600 .env
chmod 700 data client/public/images/uploads
```

Если `.env` уже существует, не заменяйте его. Заполните:

```dotenv
NODE_ENV=production
SITE_URL=https://example.ru
HOST=127.0.0.1
PORT=3001
TRUST_PROXY=loopback
DB_STORAGE=data/hunter.sqlite
ADMIN_LOGIN=ЗАДАТЬ_ЛОГИН
JWT_SECRET=ЗАДАТЬ_СЛУЧАЙНЫЙ_СЕКРЕТ
```

Секрет и пароль задаются по [инструкции локального запуска](../README.md#локальный-запуск). После настройки выполните:

```bash
npm run admin:password
npm test
npm run format:check
npm audit
pm2 start server/app.js --name hunter --kill-timeout 12000
pm2 save
curl -fsS http://127.0.0.1:3001/healthz
```

Ожидаемый ответ: `{"status":"ok"}`. PM2 по умолчанию запускает один процесс в режиме fork. Не используйте `-i max` или второй экземпляр с той же базой.

Для запуска после перезагрузки выполните `pm2 startup` под `deploy`. Сформированную им системную команду выполните от `root`, затем снова сохраните список через `pm2 save` под `deploy`. После обновления пути к Node.js настройку автозапуска PM2 нужно обновить. [Документация PM2](https://pm2.keymetrics.io/docs/usage/startup/).

## Домен, Nginx и HTTPS

Создайте DNS-записи основного домена и `www` на адрес VPS. Запись AAAA добавляйте только при работающем IPv6.

Под `root` создайте `/etc/nginx/sites-available/hunter`. Начальная конфигурация для получения сертификата:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.ru www.example.ru;

    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Подключите файл и проверьте конфигурацию:

```bash
ln -s /etc/nginx/sites-available/hunter /etc/nginx/sites-enabled/hunter
nginx -t
systemctl reload nginx
```

Установите Certbot по [официальной инструкции](https://certbot.eff.org/instructions?ws=nginx&os=snap). На новой системе с snap:

```bash
snap install --classic certbot
/snap/bin/certbot --nginx -d example.ru -d www.example.ru --redirect
```

При уже установленном Certbot используйте один способ установки и существующую команду. Сохраните конфигурацию Nginx вне `sites-enabled` перед изменением.

После выдачи сертификата приведите файл сайта к единственному основному домену:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.ru www.example.ru;
    return 301 https://example.ru$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.example.ru;

    ssl_certificate /etc/letsencrypt/live/example.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 301 https://example.ru$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name example.ru;

    ssl_certificate /etc/letsencrypt/live/example.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 65s;
        proxy_send_timeout 65s;
    }
}
```

Пути сертификата проверьте по выводу Certbot: при существующих сертификатах имя каталога может отличаться. Все запросы проходят через Express. Корень проекта нельзя публиковать через `root` или `alias` Nginx: в нём есть секреты и база.

В этой схеме Nginx единственный входной прокси и перезаписывает адрес посетителя через `$remote_addr`. Для CDN или дополнительного прокси требуется отдельная настройка доверенных адресов. Не заменяйте её безусловным доверием заголовку из интернета. [Параметры проксирования Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header).

```bash
nginx -t
systemctl reload nginx
/snap/bin/certbot renew --dry-run
```

Reload выполняется только после успешного `nginx -t`. Убедитесь, что таймер продления сертификата включён.

## Проверка после размещения

```bash
curl -I http://example.ru/
curl -I https://www.example.ru/privacy
curl -I https://example.ru/
curl -fsS https://example.ru/healthz
```

Первые два адреса должны перенаправляться на основной HTTPS-домен с сохранением пути, главная отвечать 200. Проверьте админку, загрузку и замену фото, отзыв, документы, cookies, карту и запись с телефона и компьютера.

Перед сбором реальных данных заполните юридические документы и реквизиты, определите доступы и место хранения данных и резервных копий.

Настройте ротацию журналов PM2 и Nginx, контроль ошибок, памяти, диска и срока сертификата. Резервные копии хранятся вне публичного каталога и отдельно от VPS. Порядок копирования и проверки восстановления находится в [инструкции обновления](UPDATE_GUIDE.md).
