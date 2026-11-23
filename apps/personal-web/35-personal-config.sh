#!/bin/sh
set -eu
umask 077
PERSONAL_DEMO_TOKEN=${PERSONAL_DEMO_TOKEN:-}

if [ "${#PERSONAL_DEMO_TOKEN}" -ne 64 ]; then
    echo "PERSONAL_DEMO_TOKEN debe contener 64 caracteres hexadecimales." >&2
    exit 1
fi
case "$PERSONAL_DEMO_TOKEN" in
    *[!0-9a-f]*)
        echo "PERSONAL_DEMO_TOKEN contiene caracteres no admitidos." >&2
        exit 1
        ;;
esac

envsubst '${PERSONAL_DEMO_TOKEN}' \
    < /etc/personal/server.conf.template \
    > /tmp/personal.conf
nginx -t
