#!/bin/sh
set -eu
umask 077
cp /etc/sport/server.conf.template /tmp/sport.conf
nginx -t
