# File: Dockerfile
# Why: Serve static site reliably using Nginx in Docker.
FROM nginx:alpine
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 80