#!/bin/sh
# Copy static files to a writable location (Railway's /app may be read-only)
mkdir -p /tmp/html
cp /app/index.html /tmp/html/index.html
cp /app/popupbagels-legal.html /tmp/html/popupbagels-legal.html

# Inject Airtable token into both HTML files
sed -i "s/%%AIRTABLE_TOKEN%%/$AIRTABLE_TOKEN/g" /tmp/html/index.html
sed -i "s/%%AIRTABLE_TOKEN%%/$AIRTABLE_TOKEN/g" /tmp/html/popupbagels-legal.html

# Build nginx.conf with actual PORT and root pointing to /tmp/html
sed "s/\$PORT/$PORT/g" /app/nginx.conf \
  | sed "s|root /app;|root /tmp/html;|g" \
  > /tmp/nginx.conf

nginx -g 'daemon off;' -c /tmp/nginx.conf
