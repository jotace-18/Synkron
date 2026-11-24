#!/bin/sh
set -eu
umask 077
cp /etc/campus/server.conf.template /tmp/campus.conf
nginx -t
