#!/bin/sh
# Copy static files to writable temp dir
mkdir -p /tmp/html
cp /app/index.html /tmp/html/index.html

# Generate config.js with the Airtable token from the environment variable
echo "window.AIRTABLE_TOKEN = '${AIRTABLE_TOKEN}';" > /tmp/html/config.js

# Build nginx.conf with actual PORT and root pointing to /tmp/html
sed "s/\$PORT/$PORT/g" /app/nginx.conf \
  | sed "s|root /app;|root /tmp/html;|g" \
  > /tmp/nginx.conf

nginx -g 'daemon off;' -c /tmp/nginx.conf
