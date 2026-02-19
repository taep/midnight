#!/bin/bash
set -e

echo "========================================="
echo "  Midnight Station - Server Deployment"
echo "========================================="
echo ""

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

# --- 1. Node.js 20 LTS ---
if ! command -v node &> /dev/null; then
    echo "[1/6] Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[1/6] Node.js already installed: $(node -v)"
fi

# --- 2. PM2 ---
if ! command -v pm2 &> /dev/null; then
    echo "[2/6] Installing PM2..."
    sudo npm install -g pm2
else
    echo "[2/6] PM2 already installed: $(pm2 -v)"
fi

# --- 3. Nginx ---
if ! command -v nginx &> /dev/null; then
    echo "[3/6] Installing Nginx..."
    sudo apt-get update
    sudo apt-get install -y nginx
else
    echo "[3/6] Nginx already installed"
fi

# --- 4. Build ---
echo "[4/6] Installing dependencies & building..."
npm install
npm run build

# --- 5. Nginx config ---
echo "[5/6] Configuring Nginx..."
sudo cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/midnight-station
sudo ln -sf /etc/nginx/sites-available/midnight-station /etc/nginx/sites-enabled/midnight-station
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# --- 6. PM2 start ---
echo "[6/6] Starting app with PM2..."
pm2 stop midnight-station 2>/dev/null || true
pm2 delete midnight-station 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null | grep "sudo" | bash 2>/dev/null || true

# --- Firewall ---
if command -v ufw &> /dev/null; then
    sudo ufw allow 80/tcp
    sudo ufw allow 22/tcp
    echo "Firewall: port 80, 22 opened"
fi

echo ""
echo "========================================="
echo "  Deployment complete!"
echo "  http://$(hostname -I | awk '{print $1}')"
echo "========================================="
echo ""
echo "Useful commands:"
echo "  pm2 status          - Check app status"
echo "  pm2 logs            - View logs"
echo "  pm2 restart all     - Restart app"
