FROM alpine:3.20

RUN apk add --no-cache bash curl git openssl coreutils ca-certificates tzdata python3 \
    && git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh \
    && cd /tmp/acme.sh \
    && ./acme.sh --install --nocron --noprofile --home /opt/acme-install \
    && rm -rf /tmp/acme.sh

COPY dns_hook.py upload.py dns_selauto.sh entrypoint.sh /opt/ssl-renewer/
RUN chmod +x /opt/ssl-renewer/entrypoint.sh /opt/ssl-renewer/dns_hook.py /opt/ssl-renewer/upload.py

ENTRYPOINT ["/opt/ssl-renewer/entrypoint.sh"]
