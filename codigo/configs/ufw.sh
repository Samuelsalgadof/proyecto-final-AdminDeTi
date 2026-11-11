#!/bin/bash
# Firewall de srv-sena (punto extra). Permite SSH y solo la red local para los servicios.
set -e
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80,443/tcp
ufw allow 3000/tcp
ufw allow from 192.168.56.0/24
ufw allow from 192.168.80.0/24
ufw --force enable
ufw status verbose
