#!/bin/sh
set -eu
umask 077
cp /etc/personal/server.conf.template /tmp/personal.conf
nginx -t
