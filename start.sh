#!/bin/sh
# Railway injects $PORT and $AIRTABLE_TOKEN at runtime

# Substitute PORT into nginx config
sed -i "s/\$PORT/$PORT/g" /app/nginx.conf

# Inject Airtable token into both HTML files
sed -i "s/%%AIRTABLE_TOKEN%%/$AIRTABLE_TOKEN/g" /app/index.html
sed -i "s/%%AIRTABLE_TOKEN%%/$AIRTABLE_TOKEN/g" /app/popupbagels-legal.html

nginx -g 'daemon off;' -c /app/nginx.conf
