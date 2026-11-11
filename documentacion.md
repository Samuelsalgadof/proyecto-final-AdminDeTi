# Documentación técnica: infraestructura SENA

**Empresa:** SENA, Servicio Nacional de Aprendizaje (centro de formación)
**Materia:** Administración de Infraestructura de TI, Universidad del Quindío, 2026-1
**Equipo:** Maria José Vasquez, Samuel Salgado y Luisa Fernanda Osorio
**Fecha de implementación:** 10 de noviembre de 2026

Este documento registra paso a paso cómo se montó la infraestructura, con los comandos ejecutados, la salida obtenida y la captura de cada verificación. El análisis de necesidades y la justificación están en [analisis.md](analisis.md) y la arquitectura en [diagrama.mmd](diagrama.mmd).

## Contenido

1. [Entorno y máquinas virtuales](#1-entorno-y-máquina-virtual-del-servidor)
2. [Dokploy](#2-dokploy)
3. [Base de datos PostgreSQL](#3-base-de-datos-postgresql)
4. [Servicio web, dominio y HTTPS](#4-servicio-web-dominio-y-https)
5. [NTP](#5-ntp)
6. [NIS](#6-nis)
7. [NFS](#7-nfs)
8. [Samba](#8-samba)
9. [CUPS](#9-cups)
10. [Extras: firewall y respaldo](#10-extras)
11. [Problemas encontrados y solución](#11-problemas-encontrados-y-solución)
12. [Resumen de verificación (rúbrica)](#12-resumen-de-verificación-rúbrica)
13. [Conclusiones](#13-conclusiones)

## Resumen de la implementación

| Equipo | Rol | IP puente (red SENA) | IP solo anfitrión | Recursos |
| --- | --- | --- | --- | --- |
| srv-sena | Servidor de todos los servicios | 192.168.80.50 | 192.168.56.10 | 2 vCPU, 4 GB RAM, 40 GB |
| cli-sena | Cliente Linux de pruebas (NTP, NIS, NFS, CUPS, Samba) | 192.168.80.51 | 192.168.56.20 | 1 vCPU, 2 GB RAM |
| PC Windows | Anfitrión de VirtualBox y cliente Windows (Samba, web, CUPS) | 192.168.80.14 (DHCP) | 192.168.56.1 | n/a |

| Servicio | Dónde se prueba | Estado |
| --- | --- | --- |
| Dokploy + web HTTPS + PostgreSQL | https://sena.192-168-56-10.traefik.me | ✅ |
| NTP (ntpsec) | cli-sena sincroniza con 192.168.56.10 | ✅ |
| NIS (dominio `sena.nis`) | inicio de sesión de aprendiz1 en cli-sena | ✅ |
| NFS | `/srv/nfs/compartido`, `/srv/nfs/home`, `/srv/nfs/raiz` montados en cli-sena | ✅ |
| Samba | `\\192.168.80.50\documentos` desde Windows y `smbclient` desde cli-sena | ✅ |
| CUPS | `SENA-Impresora` (CUPS-PDF), impresión desde cli-sena | ✅ |
| Extras | UFW y respaldo diario de la base de datos | ✅ |

Usuarios del dominio NIS: `aprendiz1`, `aprendiz2` e `instructor1` (grupo `sena-staff`). Las contraseñas que aparecen en este documento (`sena2026` para usuarios y la de la base de datos) son **solo de laboratorio**; en un centro real se cambiarían y no se publicarían.

## 1. Entorno y máquina virtual del servidor

| Elemento | Valor |
| --- | --- |
| Anfitrión | PC Windows con VirtualBox 7 |
| Servidor | VM `srvsena`, hostname `srv-sena`, Ubuntu Server 24.04.3 LTS (kernel 6.8.0-149) |
| Recursos | 2 vCPU, 4096 MB RAM, disco VDI dinámico de 41 GB (raíz LVM de 39 GB) |
| Adaptador 1 (enp0s3) | Puente sobre Realtek Gaming GbE, IP fija 192.168.80.50/24, gateway 192.168.80.1, DNS 8.8.8.8 y 1.1.1.1 |
| Adaptador 2 (enp0s8) | Solo anfitrión (VirtualBox Host-Only Ethernet Adapter), IP fija 192.168.56.10/24 |
| Usuario administrador | `rhlmsamu` |
| Acceso remoto | SSH desde PowerShell: `ssh rhlmsamu@192.168.56.10` |

### 1.1 Creación de la VM

1. VirtualBox > Nueva: nombre `srvsena`, ISO `ubuntu-24.04.3-live-server-amd64.iso`, tipo Linux / Ubuntu (64-bit), **sin** instalación desatendida.
2. Hardware: 4096 MB de RAM y 2 CPU.
3. Red: adaptador 1 en modo puente y adaptador 2 en modo solo anfitrión.

![Adaptador 2 solo anfitrión](capturas/00b-virtualbox-adaptador2.png)

### 1.2 Instalación de Ubuntu Server

Instalador en español, teclado Spanish (Latin American), tipo Ubuntu Server, usuario `rhlmsamu`, OpenSSH server, sin snaps adicionales.

### 1.3 Ampliación del disco a 40 GB

La VM se creó con 25 GB y el instalador usó LVM con solo 11,5 GB para `/`. Se amplió el VDI a 41 GB en Archivo > Herramientas > Media y luego, dentro de Ubuntu:

```bash
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r --extents +100%FREE /dev/ubuntu-vg/ubuntu-lv
df -h /
```

Resultado: `/dev/mapper/ubuntu--vg-ubuntu--lv  39G  4,9G  32G  14% /`

![Disco en VirtualBox](capturas/00c-disco-40gb.png)
![Disco ampliado](capturas/00d-disco-ampliado-lvm.png)

### 1.4 IP fija (netplan)

Archivo `/etc/netplan/50-cloud-init.yaml` (copia en `codigo/configs/netplan-srv-sena.yaml`):

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: false
      addresses: [192.168.80.50/24]
      routes:
        - to: default
          via: 192.168.80.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
    enp0s8:
      dhcp4: false
      addresses: [192.168.56.10/24]
```

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml
echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
sudo netplan apply
ip -br a; ping -c 2 google.com
```

Verificación: `enp0s3 UP 192.168.80.50/24`, `enp0s8 UP 192.168.56.10/24`, ping a google.com con 0 % de pérdida.

![IP fija](capturas/01b-ip-fija-ping.png)

### 1.5 Verificación de requisitos de la VM

`hostnamectl; free -h; nproc; df -h /` muestra: hostname `srv-sena`, Ubuntu 24.04.3 LTS, virtualización oracle (VirtualBox), 3,8 GiB de RAM, 2 CPU y 39 GB en `/`.

![Recursos del servidor](capturas/01-servidor-recursos.png)

### 1.6 VM cliente (cli-sena)

Se creó clonando `srvsena` (clonación completa, nuevas MAC para todos los adaptadores), con 2048 MB de RAM y 1 CPU. Luego, dentro del clon, se le dio identidad propia:

```bash
sudo hostnamectl set-hostname cli-sena
sudo sed -i 's/srv-sena/cli-sena/g' /etc/hosts
sudo rm -f /etc/machine-id /var/lib/dbus/machine-id && sudo systemd-machine-id-setup
sudo rm -f /etc/ssh/ssh_host_* && sudo ssh-keygen -A
# netplan: enp0s3 192.168.80.51/24 (gw 192.168.80.1), enp0s8 192.168.56.20/24
sudo reboot
```

Resultado: hostname `cli-sena`, IP 192.168.80.51 (puente) y 192.168.56.20 (solo anfitrión), acceso con `ssh rhlmsamu@192.168.56.20`.

![Cliente clonado](capturas/01c-cliente-clonado.png)

### 1.7 Resolución de nombres entre servidor y cliente

En las dos VMs se agregaron los nombres a `/etc/hosts` (NIS y NFS los usan):

```bash
echo "192.168.56.10 srv-sena srv-sena.sena.local" | sudo tee -a /etc/hosts
echo "192.168.56.20 cli-sena cli-sena.sena.local" | sudo tee -a /etc/hosts
```

Verificación: `ping -c 2 srv-sena` desde el cliente y `ping -c 2 cli-sena` desde el servidor, ambos con 0 % de pérdida.

![Ping cliente a servidor](capturas/01d-ping-cliente-a-servidor.png)
![Ping servidor a cliente](capturas/01e-ping-servidor-a-cliente.png)

## 2. Dokploy

### 2.1 Instalación

```bash
curl -sSL https://dokploy.com/install.sh | sudo ADVERTISE_ADDR=192.168.56.10 sh
sudo docker ps --format "table {{.Names}}\t{{.Status}}"
```

`ADVERTISE_ADDR` fija la IP de la red host-only para Docker Swarm. Quedaron corriendo `dokploy` (healthy), `dokploy-traefik` y `dokploy-postgres`. Versión instalada: Dokploy v0.31.0.

![docker ps](capturas/02-dokploy-docker-ps.png)

### 2.2 Acceso al panel

Panel en `http://192.168.56.10:3000`, donde se creó la cuenta de administrador. En Settings > Web Server Dokploy detectó la IP pública del router (181.53.99.3); como el sitio usa un dominio escrito a mano que apunta a la IP local, no fue necesario cambiarla.

## 3. Base de datos PostgreSQL

En Dokploy: Projects > `sena` > Create Service > Database > PostgreSQL.

| Campo | Valor |
| --- | --- |
| Name | sena-db (app name `sena-senadb-n7jvj5`) |
| Imagen | postgres:18 |
| Database / User | sena / sena_app |
| Internal Host | sena-senadb-n7jvj5:5432 |
| Puerto externo | No se publicó: la base solo es accesible desde la red interna de Docker |

![Postgres desplegado](capturas/04a-postgres-deploy-log.png)
![Credenciales internas](capturas/04-dokploy-postgres.png)

## 4. Servicio web, dominio y HTTPS

### 4.1 Aplicación

Sitio institucional del SENA en Node.js + Express (`codigo/sitio-sena/`): página con misión, tabla de programas de formación leída de PostgreSQL, formulario de registro de interés que inserta en la tabla `inscripciones` y endpoint `/health` que consulta la base. Al arrancar crea las tablas `programas` e `inscripciones` si no existen.

En Dokploy: proyecto `sena` > Create Service > Application `sena-web`.

| Ajuste | Valor |
| --- | --- |
| Provider | Drop (carga del archivo `sitio-sena.zip`) |
| Build Type | Dockerfile (`node:20-alpine`) |
| Environment | `DATABASE_URL=postgresql://sena_app:****@sena-senadb-n7jvj5:5432/sena`, `PORT=3000` |

![Build](capturas/05-dokploy-app-deploy.png)
![Logs de la app](capturas/05b-app-logs.png)

El log muestra `Sitio SENA en puerto 3000`, es decir, la app se conectó a la base y creó las tablas.

### 4.2 Dominio y HTTPS

Dominio `sena.192-168-56-10.traefik.me`: traefik.me es un DNS comodín gratuito que resuelve cualquier `*.192-168-56-10.traefik.me` a 192.168.56.10. En Domains se configuró Path `/`, Container Port 3000, HTTPS activo y Certificate Provider *None*, con lo que Traefik sirve un certificado autofirmado. Let's Encrypt no se usó porque exige que el servidor sea accesible desde internet por el puerto 80.

![Dominio en Dokploy](capturas/08-dokploy-dominio.png)
![Sitio por HTTPS](capturas/06-web-https.png)
![Barra de dirección](capturas/06b-web-https-barra.png)

### 4.3 Verificación desde el servidor

```bash
curl -skI https://sena.192-168-56-10.traefik.me | head -1
curl -sk https://sena.192-168-56-10.traefik.me/health
echo | openssl s_client -connect 192.168.56.10:443 -servername sena.192-168-56-10.traefik.me 2>/dev/null | openssl x509 -noout -subject -issuer -dates
DB=$(sudo docker ps --filter name=sena-senadb -q | head -1)
sudo docker exec $DB psql -U sena_app -d sena -c "SELECT * FROM programas;" -c "SELECT id, nombre, programa_id, fecha FROM inscripciones;"
```

Resultados: `HTTP/2 200`; `/health` devuelve `{"estado":"ok","base_de_datos":"sena",...}`; certificado `CN = TRAEFIK DEFAULT CERT` válido de 2026-11-11 a 2027-11-11; 4 programas en la tabla y el registro hecho desde el formulario web guardado en `inscripciones`.

![HTTPS y base de datos](capturas/09-db-conectada-https.png)

## 5. NTP

En Ubuntu 24.04 el paquete de NTP es **NTPsec** y su configuración está en `/etc/ntpsec/ntp.conf` (no en `/etc/ntp.conf`). Al instalarlo se desinstala `systemd-timesyncd` del servidor.

### 5.1 Servidor (srv-sena)

```bash
sudo timedatectl set-timezone America/Bogota
sudo apt install -y ntpsec
printf '\n# Red del SENA\nserver pool.ntp.org iburst\nrestrict 192.168.56.0 mask 255.255.255.0 nomodify notrap\nrestrict 192.168.80.0 mask 255.255.255.0 nomodify notrap\n' | sudo tee -a /etc/ntpsec/ntp.conf
sudo systemctl restart ntpsec && sudo systemctl enable ntpsec
ntpq -p; sudo ntpq -c mrulist
```

Las líneas `restrict` permiten que los equipos de las dos redes del SENA consulten la hora sin poder modificar el servidor. `ntpq -p` muestra la fuente elegida con `*` (prod-ntp-5.ntp4.ps5.canonical.com, estrato 2) y otras candidatas con `+` (co.ntp.edgeuno.com, unad.edu.co). `ntpq -c mrulist` muestra a `cli-sena` entre los equipos que consultaron el servidor.

![Instalación NTPsec](capturas/10a-ntp-instalacion.png)
![NTP servidor](capturas/10-ntp-servidor.png)

### 5.2 Cliente (cli-sena)

```bash
sudo timedatectl set-timezone America/Bogota
sudo sed -i 's/^#\?NTP=.*/NTP=192.168.56.10/' /etc/systemd/timesyncd.conf
sudo systemctl restart systemd-timesyncd
timedatectl timesync-status
```

Resultado: `Server: 192.168.56.10`, `Stratum: 3` (uno más que la fuente del servidor), offset de unos 2 ms.

![NTP cliente](capturas/11-ntp-cliente.png)

## 6. NIS

NIS centraliza las cuentas: los aprendices e instructores existen solo en `srv-sena` y cualquier equipo del SENA los reconoce. Dominio NIS: `sena.nis`.

### 6.1 Servidor maestro (srv-sena)

El paquete `nis` pregunta el dominio en una pantalla interactiva; se respondió antes con `debconf-set-selections` para que la instalación no se detuviera.

```bash
echo "nis nis/domain string sena.nis" | sudo debconf-set-selections
sudo DEBIAN_FRONTEND=noninteractive apt install -y nis
echo sena.nis | sudo tee /etc/defaultdomain
sudo domainname sena.nis
sudo sed -i 's/^NISSERVER=.*/NISSERVER=master/; s/^NISCLIENT=.*/NISCLIENT=false/' /etc/default/nis

# Solo las redes del SENA pueden consultar el NIS
sudo sed -i 's/^0.0.0.0/#0.0.0.0/' /etc/ypserv.securenets
printf '255.255.255.0 192.168.56.0\n255.255.255.0 192.168.80.0\n' | sudo tee -a /etc/ypserv.securenets

# Incluir las contraseñas (shadow) en los mapas passwd y group
sudo sed -i 's/^MERGE_PASSWD=.*/MERGE_PASSWD=true/; s/^MERGE_GROUP=.*/MERGE_GROUP=true/' /var/yp/Makefile
```

Usuarios del SENA. Los homes se crean en `/srv/nfs/home` porque esa carpeta se exporta por NFS (sección 7), así cada usuario tiene la misma carpeta personal en cualquier equipo.

| Usuario | UID | Grupo | Home |
| --- | --- | --- | --- |
| aprendiz1 | 2001 | sena-staff (3000) | /srv/nfs/home/aprendiz1 |
| aprendiz2 | 2002 | sena-staff (3000) | /srv/nfs/home/aprendiz2 |
| instructor1 | 2003 | sena-staff (3000) | /srv/nfs/home/instructor1 |

```bash
sudo groupadd -g 3000 sena-staff
sudo mkdir -p /srv/nfs/home
sudo useradd -m -d /srv/nfs/home/aprendiz1   -u 2001 -g sena-staff -s /bin/bash aprendiz1
sudo useradd -m -d /srv/nfs/home/aprendiz2   -u 2002 -g sena-staff -s /bin/bash aprendiz2
sudo useradd -m -d /srv/nfs/home/instructor1 -u 2003 -g sena-staff -s /bin/bash instructor1
printf 'aprendiz1:sena2026\naprendiz2:sena2026\ninstructor1:sena2026\n' | sudo chpasswd

sudo systemctl enable --now rpcbind ypserv yppasswdd ypxfrd
sudo /usr/lib/yp/ypinit -m < /dev/null
sudo systemctl restart ypserv
rpcinfo -p | grep yp
ypcat -h localhost -d sena.nis passwd
```

Resultado: `srv-sena has been set up as a NIS master server`, `rpcinfo` muestra `ypserv` registrado y `ypcat` lista a aprendiz1, aprendiz2 e instructor1.

> Cada vez que se crea o cambia un usuario o grupo en el servidor hay que regenerar los mapas: `cd /var/yp && sudo make`.

![NIS servidor](capturas/12-nis-servidor.png)

### 6.2 Cliente (cli-sena)

```bash
echo "nis nis/domain string sena.nis" | sudo debconf-set-selections
sudo DEBIAN_FRONTEND=noninteractive apt install -y nis
echo sena.nis | sudo tee /etc/defaultdomain
sudo domainname sena.nis
echo "domain sena.nis server srv-sena" | sudo tee -a /etc/yp.conf
sudo sed -i 's/^NISSERVER=.*/NISSERVER=false/; s/^NISCLIENT=.*/NISCLIENT=true/' /etc/default/nis

# Buscar usuarios primero en archivos locales y luego en NIS
sudo sed -i -E '/^(passwd|group|shadow):/ s/$/ nis/' /etc/nsswitch.conf

# systemd-logind trae IPAddressDeny=any y bloquea las consultas NIS al iniciar sesión
sudo mkdir -p /etc/systemd/system/systemd-logind.service.d
printf '[Service]\nIPAddressAllow=any\n' | sudo tee /etc/systemd/system/systemd-logind.service.d/nis.conf
sudo systemctl daemon-reload && sudo systemctl restart systemd-logind

sudo systemctl enable --now rpcbind ypbind
ypwhich; ypcat passwd; id aprendiz1
grep aprendiz1 /etc/passwd || echo "aprendiz1 NO esta en el clon: viene de NIS"
```

Resultado: `ypwhich` responde `srv-sena`, `id aprendiz1` da `uid=2001(aprendiz1) gid=3000(sena-staff)` y aprendiz1 **no existe** en el `/etc/passwd` del clon: viene del servidor.

![NIS cliente](capturas/13-nis-cliente.png)

### 6.3 Inicio de sesión con un usuario NIS

Desde Windows: `ssh aprendiz1@192.168.56.20` (el clon) con la contraseña del servidor.

```bash
pwd; whoami; id; ls -l /mnt/compartido; cat /mnt/compartido/acta-aprendiz1.txt
```

Resultado: el inicio de sesión funciona aunque aprendiz1 no existe en el clon. `pwd` da `/srv/nfs/home/aprendiz1` (su home llega del servidor por NFS), `id` da `uid=2001(aprendiz1) gid=3000(sena-staff)` y puede leer el archivo `acta-aprendiz1.txt` que creó en la carpeta compartida, con dueño `aprendiz1` y grupo `sena-staff`. Esto demuestra NIS (cuenta única) y NFS (archivos compartidos) trabajando juntos.

![Login NIS](capturas/18-nis-login.png)

## 7. NFS

Se siguió el ejemplo del profesor (libresoftwarexd.blogspot.com/p/nfs.html): aumentar los hilos de nfsd, exportar primero en temporal con `exportfs`, luego en permanente con `/etc/exports`, y una carpeta `raiz` con `home` y `etc` montadas con bind.

| Carpeta exportada | Para qué | Quién | Permisos |
| --- | --- | --- | --- |
| /srv/nfs/compartido | Material de clase compartido | 192.168.56.0/24 y 192.168.80.0/24 | rw, root_squash, solo grupo sena-staff (2770) |
| /srv/nfs/home | Carpetas personales de los usuarios NIS | 192.168.56.0/24 | rw, root_squash |
| /srv/nfs/raiz | Vista de /home y /etc del servidor | 192.168.56.0/24 | ro, crossmnt |

### 7.1 Instalación e hilos de nfsd (srv-sena)

```bash
sudo apt install -y nfs-kernel-server
sudo ss -tulpn | grep -E ':2049 |:111 '

sudo nfsconf --set nfsd threads 8 && sudo systemctl restart nfs-server
sudo cat /proc/fs/nfsd/threads          # 8 (por defecto)
sudo nfsconf --set nfsd threads 30 && sudo systemctl restart nfs-server
sudo cat /proc/fs/nfsd/threads          # 30
pgrep nfsd | wc -l
```

En Ubuntu 24.04 los hilos ya no se cambian con `RPCNFSDCOUNT` en `/etc/default/nfs-kernel-server`, sino con `nfsconf` (que escribe en `/etc/nfs.conf`). Resultado: el puerto 2049 queda en `LISTEN` y los hilos pasan de **8 a 30**.

![Instalación NFS](capturas/14a-nfs-instalacion-puertos.png)
![Hilos](capturas/14-nfs-hilos.png)

### 7.2 Carpetas, bind mounts y exportaciones (srv-sena)

```bash
sudo mkdir -p /srv/nfs/compartido /srv/nfs/raiz/home /srv/nfs/raiz/etc
sudo chown root:sena-staff /srv/nfs/compartido
sudo chmod 2770 /srv/nfs/compartido      # setgid: lo nuevo hereda el grupo sena-staff

# Carpeta raiz: /home y /etc montadas con bind (permanente en fstab)
echo '/home /srv/nfs/raiz/home none bind 0 0' | sudo tee -a /etc/fstab
echo '/etc  /srv/nfs/raiz/etc  none bind 0 0' | sudo tee -a /etc/fstab
sudo systemctl daemon-reload && sudo mount -a

# Exportación TEMPORAL (se pierde al reiniciar)
sudo exportfs -o rw,sync,no_subtree_check 192.168.56.20:/srv/nfs/compartido
sudo exportfs -v
sudo exportfs -u 192.168.56.20:/srv/nfs/compartido
```

Exportaciones permanentes en `/etc/exports`:

```
/srv/nfs/compartido 192.168.56.0/24(rw,sync,no_subtree_check,root_squash) 192.168.80.0/24(rw,sync,no_subtree_check,root_squash)
/srv/nfs/home       192.168.56.0/24(rw,sync,no_subtree_check,root_squash)
/srv/nfs/raiz       192.168.56.0/24(ro,sync,no_subtree_check,crossmnt)
```

```bash
sudo exportfs -ra && sudo exportfs -v
sudo systemctl enable nfs-server
```

`crossmnt` es necesario en `raiz` para que el cliente pueda entrar a `home` y `etc`, que son otros montajes dentro de esa carpeta. Resultado: la exportación temporal aparece en `exportfs -v` y desaparece con `exportfs -u`; luego quedan activas las tres permanentes.

![Exports](capturas/15-nfs-exports.png)

### 7.3 Cliente (cli-sena)

```bash
sudo apt install -y nfs-common
showmount -e srv-sena
sudo mkdir -p /mnt/compartido /srv/nfs/home /mnt/raiz
sudo mount -t nfs srv-sena:/srv/nfs/compartido /mnt/compartido
sudo mount -t nfs srv-sena:/srv/nfs/home /srv/nfs/home
sudo mount -t nfs srv-sena:/srv/nfs/raiz /mnt/raiz
echo "srv-sena:/srv/nfs/compartido /mnt/compartido nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab
echo "srv-sena:/srv/nfs/home /srv/nfs/home nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab
df -h -t nfs4
ls /mnt/raiz
```

`_netdev` hace que el sistema espere a la red antes de montar al arrancar. `/srv/nfs/home` se monta en la misma ruta que en el servidor para que el home de los usuarios NIS coincida. Resultado: `showmount` lista las 3 exportaciones, `df` muestra los 3 montajes NFS4 y `/mnt/raiz` contiene `etc` y `home` del servidor.

![Cliente](capturas/16-nfs-cliente.png)

### 7.4 Prueba de permisos (cli-sena)

| Prueba | Resultado | Por qué |
| --- | --- | --- |
| `sudo touch /mnt/compartido/root.txt` | Permission denied | `root_squash`: el root del cliente se convierte en `nobody` |
| `touch /mnt/compartido/rhlmsamu.txt` (rhlmsamu) | Permission denied | rhlmsamu no pertenece a sena-staff |
| aprendiz1 escribe `acta-aprendiz1.txt` | ESCRITO OK | aprendiz1 es usuario NIS del grupo sena-staff |
| `ls -l /mnt/compartido` (rhlmsamu) | Permission denied | la carpeta es 2770, sin acceso para otros |
| `sudo touch /mnt/raiz/etc/prueba` | Read-only file system | `raiz` se exportó con `ro` |

Los "errores" son la evidencia de que los permisos están bien aplicados: solo el personal del SENA (sena-staff) escribe en la carpeta compartida y nadie puede modificar el servidor a través de `raiz`.

![Permisos](capturas/17-nfs-permisos.png)

## 8. Samba

Samba ofrece la carpeta `documentos` de la coordinación académica del SENA a los equipos Windows de la red. Solo entran los usuarios del grupo `sambashare` (instructor1 y aprendiz1), con su contraseña Samba.

### 8.1 Servidor (srv-sena)

```bash
sudo apt install -y samba
sudo mkdir -p /srv/samba/documentos
sudo chown root:sambashare /srv/samba/documentos
sudo chmod 2770 /srv/samba/documentos
sudo cp /etc/samba/smb.conf /etc/samba/smb.conf.bak
```

Recurso agregado al final de `/etc/samba/smb.conf`:

```ini
[documentos]
   comment = Documentos SENA - Coordinacion academica
   path = /srv/samba/documentos
   browseable = yes
   writable = yes
   guest ok = no
   valid users = @sambashare
   force group = sambashare
   create mask = 0660
   directory mask = 2770
```

```bash
sudo usermod -aG sambashare instructor1
sudo usermod -aG sambashare aprendiz1
printf 'sena2026\nsena2026\n' | sudo smbpasswd -a -s instructor1
printf 'sena2026\nsena2026\n' | sudo smbpasswd -a -s aprendiz1
(cd /var/yp && sudo make)          # el cambio de grupos también se publica en NIS
sudo systemctl restart smbd nmbd && sudo systemctl enable smbd nmbd
testparm -s; sudo pdbedit -L; sudo ss -tlpn | grep -E ':445 |:139 '
```

- `guest ok = no` y `valid users = @sambashare`: no hay acceso anónimo, solo el grupo autorizado.
- `force group = sambashare` y `directory mask = 2770`: todo lo que se crea queda del grupo y lo pueden abrir los demás miembros.
- Samba guarda su propia contraseña (`smbpasswd`), distinta del hash de Linux; por eso se registra cada usuario.

Resultado: `testparm` muestra el recurso `[documentos]`, `pdbedit -L` lista `instructor1:2003` y `aprendiz1:2001`, y `smbd` escucha en los puertos 139 y 445.

![Config](capturas/19-samba-config.png)

### 8.2 Prueba desde Windows

En el equipo Windows: **Windows + R** → `\\192.168.80.50\documentos`, usuario `instructor1`. Se creó el archivo `plan-formacion.txt` desde el Explorador.

![Windows](capturas/21-samba-windows.png)

### 8.3 Verificación en Linux

En el servidor:

```bash
sudo ls -l /srv/samba/documentos
sudo smbstatus
```

El archivo creado en Windows aparece en el servidor como `instructor1 sambashare plan-formacion.txt`. `smbstatus` muestra la sesión de `instructor1` desde el equipo Windows (192.168.80.14) con protocolo **SMB3_11** conectada al recurso `documentos`.

![smbstatus](capturas/22-samba-smbstatus.png)

Desde el clon, como segundo cliente:

```bash
sudo apt install -y smbclient
smbclient -L //srv-sena -U aprendiz1%sena2026
echo "Horario ficha 2026" > /tmp/horario.txt
smbclient //srv-sena/documentos -U aprendiz1%sena2026 -c 'put /tmp/horario.txt horario.txt; ls'
```

Resultado: el servidor publica `documentos` y aprendiz1 sube `horario.txt`; en el listado aparecen los dos archivos, el de Windows y el de Linux, en la misma carpeta.

![Linux](capturas/20-samba-linux.png)

## 9. CUPS

CUPS ofrece la impresora de la coordinación académica a toda la red. Como el laboratorio no tiene impresora física, se usó **CUPS-PDF**, una impresora virtual que guarda cada trabajo como PDF en la carpeta `~/PDF` del usuario que imprime.

### 9.1 Servidor (srv-sena)

```bash
sudo apt install -y cups printer-driver-cups-pdf
sudo usermod -aG lpadmin rhlmsamu
sudo cupsctl --remote-admin --remote-any --share-printers
sudo systemctl restart cups && sudo systemctl enable cups
PPD=$(lpinfo -m | grep -i 'cups-pdf' | head -1 | awk '{print $1}')
sudo lpadmin -p SENA-Impresora -E -v cups-pdf:/ -m "$PPD" -D "Impresora SENA" -L "Coordinacion academica" -o printer-is-shared=true
sudo lpoptions -d SENA-Impresora
lpstat -t
sudo ss -tlpn | grep ':631 '
```

- `cupsctl --remote-admin --remote-any --share-printers`: permite administrar CUPS por web desde la red y compartir las impresoras.
- `lpadmin`: crea la cola `SENA-Impresora` con el driver `lsb/usr/cups-pdf/CUPS-PDF_noopt.ppd`.

Resultado: `SENA-Impresora` es el destino predeterminado y acepta trabajos, y `cupsd` escucha en `0.0.0.0:631`. El aviso *"Printer drivers are deprecated"* es informativo en CUPS 2.4 y no afecta.

![CUPS servidor](capturas/23a-cups-servidor.png)

### 9.2 Interfaz web desde Windows

`https://192.168.80.50:631/printers` (certificado autofirmado de CUPS, se acepta la advertencia). Aparecen `SENA-Impresora` (Impresora SENA, Coordinación académica) y la cola `PDF` que crea el paquete.

![Web CUPS](capturas/23-cups-web.png)

### 9.3 Impresión desde el cliente (cli-sena)

```bash
sudo apt install -y cups-client
echo "Acta de reunion SENA - prueba de impresion desde cli-sena" > /tmp/acta.txt
lp -h srv-sena:631 -d SENA-Impresora -t "Acta-SENA" /tmp/acta.txt
lpstat -h srv-sena:631 -W completed -o
```

Resultado: el trabajo `SENA-Impresora-1` de `rhlmsamu` aparece como terminado.

![Cola](capturas/24-cups-cola.png)

### 9.4 PDF generado en el servidor

```bash
sudo lpstat -W all -o
sudo find / -xdev -name '*.pdf' -mmin -15
sudo tail -15 /var/log/cups/cups-pdf-SENA-Impresora_log
```

El log de CUPS-PDF muestra `directory created: /home/rhlmsamu/PDF` y `PDF creation successfully finished for rhlmsamu`; el archivo quedó en `/home/rhlmsamu/PDF/Acta-SENA__mu_PDF.pdf`. Los mensajes *"Unable to encrypt connection: A TLS fatal alert"* del `error_log` son del navegador de Windows rechazando el certificado autofirmado antes de aceptar la advertencia.

![PDF](capturas/25-cups-pdf.png)

## 10. Extras

### 10.1 Firewall UFW (srv-sena)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp            # SSH
sudo ufw allow 80,443/tcp        # Web (Traefik)
sudo ufw allow 3000/tcp          # Panel de Dokploy
sudo ufw allow from 192.168.56.0/24
sudo ufw allow from 192.168.80.0/24
sudo ufw --force enable
sudo ufw status verbose
```

Todo lo que entra se niega por defecto. Quedan abiertos SSH, la web y Dokploy, y los servicios de red interna (NTP, NIS, NFS, Samba, CUPS), que usan muchos puertos, solo se aceptan desde las dos redes del SENA. Después de activarlo se mantuvo la sesión SSH y los servicios siguieron respondiendo.

![UFW](capturas/26-ufw.png)

### 10.2 Respaldo automático de la base de datos

Script `/usr/local/bin/backup-sena-db.sh` (también en `codigo/configs/backup-sena-db.sh`):

```bash
#!/bin/bash
# Respaldo diario de la base de datos del sitio SENA
set -e
DESTINO=/srv/backups/sena-db
mkdir -p "$DESTINO"
DB=$(docker ps --filter name=sena-senadb -q | head -1)
docker exec "$DB" pg_dump -U sena_app sena | gzip > "$DESTINO/sena-$(date +%F_%H%M).sql.gz"
find "$DESTINO" -name '*.sql.gz' -mtime +7 -delete
ls -lh "$DESTINO" | tail -3
```

Programado en el crontab de root todos los días a las 2:00 a. m.:

```
0 2 * * * /usr/local/bin/backup-sena-db.sh >> /var/log/backup-sena-db.log 2>&1
```

El script busca el contenedor de PostgreSQL que creó Dokploy (`sena-senadb-...`), ejecuta `pg_dump` dentro de él, guarda la copia comprimida y borra las de más de 7 días. Resultado de la primera ejecución: `sena-2026-11-10_2042.sql.gz` (1,2 KB) con `CREATE TABLE public.inscripciones`, `CREATE TABLE public.programas` y los datos (`COPY`) de las dos tablas.

Para restaurar: `zcat sena-FECHA.sql.gz | docker exec -i <contenedor> psql -U sena_app sena`.

![Backup](capturas/27-backup.png)

## 11. Problemas encontrados y solución

| # | Problema | Causa | Solución |
| --- | --- | --- | --- |
| 1 | Dokploy detectó la IP pública (181.53.99.3) como IP del servidor | Detecta la IP de salida a internet | Escribir a mano el dominio `sena.192-168-56-10.traefik.me`, que apunta a la IP local |
| 2 | Let's Encrypt no puede emitir certificado | El servidor no es alcanzable desde internet por el puerto 80 | Certificado autofirmado de Traefik (Certificate Provider: None) |
| 3 | `/etc/ntp.conf` no existe | Ubuntu 24.04 usa NTPsec | Editar `/etc/ntpsec/ntp.conf` |
| 4 | El usuario NIS no puede iniciar sesión aunque `ypcat` funciona | systemd-logind bloquea conexiones de red (`IPAddressDeny`) | Override con `IPAddressAllow=any` |
| 5 | La VM no arrancaba (pantalla negra) | Se creó sin ISO y con plantilla Windows 11 (TPM, Secure Boot) | Se eliminó y se recreó con la ISO de Ubuntu y tipo Linux/Ubuntu |
| 6 | Se había descargado Ubuntu 26.04 | La página de descargas ofrece la última versión | Se usó Ubuntu Server 24.04.3 LTS desde releases.ubuntu.com/24.04, como exige el enunciado |
| 7 | VirtualBox iba a hacer instalación desatendida | Opción activa por defecto al detectar la ISO | Desmarcar "Proceed with Unattended Installation" |
| 8 | "Login incorrect" con la contraseña correcta | Distinto mapeo de teclado al escribir la clave | Modo recuperación (GRUB > recovery mode > root), `mount -o remount,rw /` y `passwd rhlmsamu` |
| 9 | Disco de 25 GB y `/` de solo 11,5 GB | Tamaño por defecto del asistente y LVM del instalador usa la mitad | Ampliar VDI a 41 GB y `growpart`, `pvresize`, `lvextend -r` |
| 10 | No se puede pegar en la consola de VirtualBox | La consola no comparte portapapeles sin Guest Additions | Administrar por SSH desde PowerShell |
| 11 | Crear la VM cliente tomaba otra instalación completa | Repetir todo el instalador | Clonar `srvsena` con nuevas MAC y regenerar hostname, machine-id, llaves SSH e IPs |
| 12 | `cat /proc/fs/nfsd/threads` da Permission denied | Archivo solo legible por root | Usar `sudo cat` |
| 13 | `RPCNFSDCOUNT` no cambia los hilos de nfsd | Ubuntu 24.04 lee `/etc/nfs.conf` | `sudo nfsconf --set nfsd threads 30` |
| 14 | Al pegar un bloque dos veces quedó un prompt `>` | Comilla sin cerrar | Ctrl+C y pegar el bloque una sola vez |
| 15 | `lpstat -o` en el servidor no mostraba el trabajo del clon | CUPS oculta trabajos de otros clientes a usuarios sin privilegios | Consultar con `sudo lpstat -W all -o` |

## 12. Resumen de verificación (rúbrica)

| Criterio | Evidencia (capturas) |
| --- | --- |
| VM y requisitos (Ubuntu 24.04, 2 vCPU, 4 GB, 40 GB, IP fija) | 00b-00d, 01, 01b-01e |
| Dokploy funcional | 02, 05, 05b, 08 |
| Servicio web con HTTPS | 06, 06b, 08 |
| Base de datos | 04, 04a, 09 |
| NTP | 10a, 10, 11 |
| NIS | 12, 13, 18 |
| NFS (hilos, exports, cliente y permisos) | 14a, 14, 15, 16, 17 |
| Samba | 19, 20, 21, 22 |
| CUPS | 23a, 23, 24, 25 |
| Extras: firewall y respaldo automático | 26, 27 |

## 13. Conclusiones

- Se implementaron los **6 servicios** pedidos (Dokploy con web HTTPS y base de datos, NTP, NIS, NFS, Samba y CUPS) más dos extras (firewall UFW y respaldo automático), todos en un solo servidor Ubuntu Server 24.04 y probados desde un cliente Linux y desde Windows.
- NIS y NFS funcionan juntos: una cuenta creada una sola vez en el servidor inicia sesión en el cliente y encuentra su carpeta personal, que vive en el servidor. Esto resuelve la rotación trimestral de aprendices del SENA.
- Los permisos se comprobaron con pruebas negativas: `root_squash` bloquea al root del cliente, solo el grupo `sena-staff` escribe en la carpeta compartida, `raiz` es de solo lectura y Samba solo acepta usuarios de `sambashare`.
- Dokploy simplificó el despliegue de la web y la base de datos (contenedores, proxy Traefik y certificado) desde un panel; los servicios clásicos de Linux se configuraron a mano.
- Limitaciones: el certificado HTTPS es autofirmado porque el servidor no es accesible desde internet (Let's Encrypt lo exige), y un único servidor es punto único de falla (nivel I según ICREA, ver [analisis.md](analisis.md)).
