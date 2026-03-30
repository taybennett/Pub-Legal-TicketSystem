#!/bin/sh
# Railway injects $PORT at runtime — substitute it into the nginx config
sed -i "s/\$PORT/$PORT/g" /app/nginx.conf
nginx -g 'daemon off;' -c /app/nginx.conf
