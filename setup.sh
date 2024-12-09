#!/bin/bash
set -e

# assume being in home directory after ssh remote login,
# or in any directory with permissions which will 
# allow successful git clone

export SERVER_DOMAIN=
export DOTENV_PATH=".env.production"
export RUN_MIGRATIONS=1
export FIREWALL_OPENING_REQD=
export COMPOSER_ALLOW_SUPERUSER=1

if [ "$SERVER_DOMAIN" = "" ]; then
    echo "SERVER_DOMAIN variable must be set"
    exit 1
fi

if [ ! -f "$DOTENV_PATH" ]; then
    echo ".env.production file not found"
    exit 1
fi

sudo add-apt-repository -y ppa:git-core/ppa
sudo apt update

echo "Installing Git and other prerequisites..."
sudo apt-get -y install git
echo

sudo apt-get -y  install curl

echo "Installing PHP with MySQL and Laravel support..."
sudo apt-get -y  install php8.3 php8.3-cli php8.3-mysql php8.3-common php8.3-zip php8.3-mbstring php8.3-curl php8.3-xml
echo

echo "Installing Composer..."
php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
php -r "if (hash_file('sha384', 'composer-setup.php') === 'dac665fdc30fdd8ec78b38b9800061b4150413ff2e3b6f88543c636f7cd84f6db9189d43a81e5503cda447da73c7e5b6') { echo 'Installer verified'; } else { echo 'Installer corrupt'; unlink('composer-setup.php'); } echo PHP_EOL;"
php composer-setup.php
php -r "unlink('composer-setup.php');"
sudo mv composer.phar /usr/local/bin/composer
echo

echo "Installing Nginx..."
sudo apt-get install -y php-fpm nginx
if [ -n "$FIREWALL_OPENING_REQD" ]; then
    sudo ufw allow 'Nginx HTTP'
fi

sudo rm -rf /srv/$SERVER_DOMAIN
sudo mkdir -p /srv/$SERVER_DOMAIN
sudo chown -R $USER:$USER /srv/$SERVER_DOMAIN
chmod -R 775 /srv/$SERVER_DOMAIN

echo "Downloading and building applilcation..."
rm -rf farmerline-assessment
git clone https://github.com/aaronicsubstances/farmerline-assessment.git
cp -r farmerline-assessment/backend/. /srv/$SERVER_DOMAIN
cp "$DOTENV_PATH" /srv/$SERVER_DOMAIN/.env
cp -r farmerline-assessment/frontend/. /srv/$SERVER_DOMAIN/public
echo "window.API_BASE_URL = '';" > /srv/$SERVER_DOMAIN/public/js/env.js

# give www-data user and group write access to bootstrap/cache
# and storage folders
chmod -R 777 /srv/$SERVER_DOMAIN/bootstrap/cache
chmod -R 777 /srv/$SERVER_DOMAIN/storage

cd /srv/$SERVER_DOMAIN
composer install --no-plugins --no-scripts --optimize-autoloader --no-dev
php artisan key:generate
if [ -n "$RUN_MIGRATIONS" ]; then
    php artisan migrate --force
fi
php artisan optimize
php artisan optimize:clear
echo

echo "Deploying app to nginx..."
NGINX_CONFIG=$(
cat << 'END_HEREDOC'
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    root /srv/example.com/public;
 
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
 
    index index.php;
 
    charset utf-8;
 
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
 
    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }
 
    error_page 404 /index.php;
 
    location ~ ^/index\.php(/|$) {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }
 
    location ~ /\.(?!well-known).* {
        deny all;
    }
}
END_HEREDOC
)
NGINX_CONFIG="${NGINX_CONFIG//example.com/$SERVER_DOMAIN}"

echo "$NGINX_CONFIG" | sudo tee /etc/nginx/sites-available/default

sudo nginx -t
sudo nginx -s reload
