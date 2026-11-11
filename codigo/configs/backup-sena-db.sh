#!/bin/bash
# Respaldo diario de la base de datos del sitio SENA (punto extra: backup automatico)
# Cron (sudo crontab -e):  0 2 * * * /usr/local/bin/backup-sena-db.sh
set -e
DESTINO=/srv/backups/sena-db
mkdir -p "$DESTINO"
DB=$(docker ps --filter name=sena-senadb -q | head -1)
docker exec "$DB" pg_dump -U sena_app sena | gzip > "$DESTINO/sena-$(date +%F_%H%M).sql.gz"
find "$DESTINO" -name '*.sql.gz' -mtime +7 -delete   # guarda 7 dias
ls -lh "$DESTINO" | tail -3
