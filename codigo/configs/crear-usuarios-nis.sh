#!/bin/bash
# Crea los usuarios del SENA en srv-sena y actualiza los mapas NIS
set -e
groupadd -f -g 3000 sena-staff
mkdir -p /srv/nfs/home
crear() { id "$1" &>/dev/null || useradd -m -d /srv/nfs/home/$1 -u $2 -g sena-staff -s /bin/bash $1; }
crear aprendiz1 2001
crear aprendiz2 2002
crear instructor1 2003
echo "Asigna claves con: passwd aprendiz1 / aprendiz2 / instructor1"
cd /var/yp && make
