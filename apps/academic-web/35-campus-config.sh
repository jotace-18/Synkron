#!/bin/sh
set -eu

umask 077

if [ -z "${ACADEMIC_DEMO_TOKEN:-}" ]; then
    echo "Falta ACADEMIC_DEMO_TOKEN para iniciar Campus." >&2
    exit 1
fi

case "$ACADEMIC_DEMO_TOKEN" in
    *[!A-Za-z0-9._~+/=-]*)
        echo "ACADEMIC_DEMO_TOKEN contiene caracteres no admitidos." >&2
        exit 1
        ;;
esac

envsubst '${ACADEMIC_DEMO_TOKEN}' \
    < /etc/campus/server.conf.template \
    > /tmp/campus.conf

nginx -t