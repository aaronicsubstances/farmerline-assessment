#!/bin/bash
set -e

# assume being in home directory after ssh remote login,
# or in any directory with permissions which will 
# allow successful git clone

export SERVER_DOMAIN=farmerlinetranscription.local
export DOTENV_PATH=".env.production"
export RUN_MIGRATIONS=1
export FIREWALL_OPENING_REQD=
export COMPOSER_ALLOW_SUPERUSER=1

if [ "$SERVER_DOMAIN" = "" ]; then
    echo "SERVER_DOMAIN variable must be set"
    exit 1
fi

if [ ! -f "$DOTENV_PATH" ]; then
    echo ".env file not found"
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

echo "Installing Apache server..."
sudo apt-get install -y apache2 libapache2-mod-php8.3
if [ -n "$FIREWALL_OPENING_REQD" ]; then
    sudo ufw allow 'Apache'
fi

sudo rm -rf /var/www/$SERVER_DOMAIN
sudo mkdir -p /var/www/$SERVER_DOMAIN
sudo chown -R $USER:$USER /var/www/$SERVER_DOMAIN
chmod -R 755 /var/www/$SERVER_DOMAIN

echo "Downloading and building applilcation..."
rm -rf farmerline-assessment
git clone https://github.com/aaronicsubstances/farmerline-assessment.git
cp -r farmerline-assessment/backend/. /var/www/$SERVER_DOMAIN
cp "$DOTENV_PATH" /var/www/$SERVER_DOMAIN/.env
cp -r farmerline-assessment/frontend/. /var/www/$SERVER_DOMAIN/public
touch /var/www/$SERVER_DOMAIN/public/js/env.js
mv /var/www/$SERVER_DOMAIN/public/index.html /var/www/$SERVER_DOMAIN/public/start.html

# give www-data user and group write access to bootstrap/cache
# and storage folders
chmod -R 777 /var/www/$SERVER_DOMAIN/bootstrap/cache
chmod -R 777 /var/www/$SERVER_DOMAIN/storage

cd /var/www/$SERVER_DOMAIN
composer install --no-plugins --no-scripts
composer dump-autoload -o
php artisan key:generate
if [ -n "$RUN_MIGRATIONS" ]; then
    php artisan migrate --force
fi
php artisan optimize
php artisan optimize:clear
echo

echo "Deploying app to nginx..."
APACHE_CONFIG=$(
cat << 'END_HEREDOC'
<VirtualHost *:80>
    ServerName your_domain
    ServerAlias www.your_domain
    ServerAdmin webmaster@localhost
    DocumentRoot /srv/your_domain/public
    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined

    <Directory "/srv/your_domain/public">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
END_HEREDOC
)
APACHE_CONFIG="${APACHE_CONFIG//your_domain/$SERVER_DOMAIN}"

echo "$APACHE_CONFIG" | sudo tee /etc/apache2/sites-available/$SERVER_DOMAIN.conf
sudo a2ensite "$SERVER_DOMAIN"
sudo a2enmod rewrite
sudo apache2ctl configtest
sudo systemctl reload apache2
