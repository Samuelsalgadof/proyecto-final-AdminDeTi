# Proyecto final: infraestructura de TI para el SENA

Implementación de servicios de infraestructura para un centro de formación del SENA usando Dokploy y servicios Linux, en una VM Ubuntu Server 24.04.

**Curso:** Administración de Infraestructura de TI, Universidad del Quindío, 2026-1
**Equipo:** Samuel Salgado Figueroa, Maria José, Luisa

## Servicios implementados

| Servicio | Acceso | Estado |
| --- | --- | --- |
| Dokploy | http://192.168.56.10:3000 | ✅ |
| Web SENA (HTTPS) | https://sena.192-168-56-10.traefik.me | ✅ |
| Base de datos PostgreSQL | interna, conectada a la web | ✅ |
| NTP | 192.168.56.10:123/udp | ✅ |
| NIS | dominio `sena.nis` | ✅ |
| NFS | `srv-sena:/srv/nfs/compartido`, `/srv/nfs/home`, `/srv/nfs/raiz` | ✅ |
| Samba | `\\192.168.80.50\documentos` | ✅ |
| CUPS | https://192.168.80.50:631, cola `SENA-Impresora` (CUPS-PDF) | ✅ |
| Extra: firewall UFW | deny por defecto, servicios internos solo para las redes del SENA | ✅ |
| Extra: respaldo de la BD | `/usr/local/bin/backup-sena-db.sh`, cron diario 2:00 a. m. | ✅ |

## Estructura

```
proyecto-final/
├── analisis.md          # Necesidades, justificación, tabla de requisitos, costo-beneficio
├── diagrama.mmd         # Diagrama de arquitectura (Mermaid)
├── documentacion.md     # Instalación, verificación, capturas y problemas
├── README.md
├── capturas/            # Evidencias numeradas
└── codigo/
    ├── sitio-sena/      # App web (Express + PostgreSQL + Dockerfile) desplegada en Dokploy
    └── configs/         # netplan, exports, fstab, ntp.conf, smb.conf, NIS, scripts de backup y UFW
```

## Cómo reproducir

1. Crear la VM (2 vCPU, 4 GB, 40 GB, bridged + host-only) e instalar Ubuntu Server 24.04.
2. Aplicar `codigo/configs/netplan-srv-sena.yaml`.
3. Instalar Dokploy: `curl -sSL https://dokploy.com/install.sh | sudo ADVERTISE_ADDR=192.168.56.10 sh`.
4. Crear en Dokploy el proyecto `sena` con una base PostgreSQL y una aplicación que use `codigo/sitio-sena` (proveedor Drop con el .zip de la carpeta, o Git) con Build Type Dockerfile y la variable `DATABASE_URL` de la base PostgreSQL creada en Dokploy.
5. Seguir `documentacion.md` para NTP, NIS, NFS, Samba y CUPS.

