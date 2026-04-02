#!/bin/sh
# Copy static files to writable temp dir
mkdir -p /tmp/html
cp /app/index.html /tmp/html/index.html

# Generate config.js with tokens from environment variables
cat > /tmp/html/config.js << ENDOFCONFIG
window.AIRTABLE_TOKEN = '${AIRTABLE_TOKEN}';
window.ANTHROPIC_KEY = '${ANTHROPIC_KEY}';
ENDOFCONFIG

# Build nginx.conf with actual PORT and root pointing to /tmp/html
sed "s/\$PORT/$PORT/g" /app/nginx.conf \
  | sed "s|root /app;|root /tmp/html;|g" \
  > /tmp/nginx.conf

nginx -g 'daemon off;' -c /tmp/nginx.conf
