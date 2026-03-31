FROM nginx:alpine

# Copy app files to /app
COPY index.html /app/index.html
COPY nginx.conf /app/nginx.conf
COPY start.sh /app/start.sh

RUN chmod +x /app/start.sh

CMD ["sh", "/app/start.sh"]
