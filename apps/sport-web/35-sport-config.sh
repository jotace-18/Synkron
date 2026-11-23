#!/bin/sh
set -eu
umask 077
SPORT_DEMO_TOKEN=${SPORT_DEMO_TOKEN:-}

if [ "${#SPORT_DEMO_TOKEN}" -ne 64 ]; then
    echo "SPORT_DEMO_TOKEN debe contener 64 caracteres hexadecimales." >&2
    exit 1
fi
case "$SPORT_DEMO_TOKEN" in
    *[!0-9a-f]*)
        echo "SPORT_DEMO_TOKEN contiene caracteres no admitidos." >&2
        exit 1
        ;;
esac

envsubst '${SPORT_DEMO_TOKEN}' \
    < /etc/sport/server.conf.template \
    > /tmp/sport.conf
nginx -t
