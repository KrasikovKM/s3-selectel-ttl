FROM alpine:3.20

RUN apk add --no-cache bash curl git openssl coreutils ca-certificates tzdata python3 \
    && curl -s https://get.acme.sh | sh -s -- --nocron \
    && mv /root/.acme.sh /opt/acme-install

COPY dns_hook.py upload.py dns_selauto.sh entrypoint.sh /opt/ssl-renewer/
RUN chmod +x /opt/ssl-renewer/entrypoint.sh /opt/ssl-renewer/dns_hook.py /opt/ssl-renewer/upload.py

ENTRYPOINT ["/opt/ssl-renewer/entrypoint.sh"]
