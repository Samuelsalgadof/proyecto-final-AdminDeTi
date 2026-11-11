# Proyecto final: infraestructura de TI para el SENA

Implementación de servicios de infraestructura para un centro de formación del SENA usando Dokploy y servicios Linux, en una VM Ubuntu Server 24.04.

**Materia:** Administración de Infraestructura de TI, Universidad del Quindío, 2026-1
**Empresa:** SENA, Servicio Nacional de Aprendizaje
**Equipo:** Maria José Vasquez, Samuel Salgado y Luisa Fernanda Osorio

## Documentos de entrega

| Archivo | Contenido |
| --- | --- |
| [analisis.md](analisis.md) | Contexto del SENA, necesidades, justificación de cada servicio, tabla de requisitos, nivel ICREA y costo-beneficio |
| [diagrama.mmd](diagrama.mmd) | Diagrama de arquitectura en Mermaid (se puede abrir en mermaid.live); la versión resumida se ve dentro de analisis.md |
| [documentacion.md](documentacion.md) | Instalación paso a paso con comandos, resultados, capturas, problemas encontrados y tabla de la rúbrica |
| [capturas/](capturas/) | 38 evidencias numeradas en el orden de la documentación |
| [codigo/](codigo/) | Sitio web desplegado en Dokploy y archivos de configuración de cada servicio |

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
5. Seguir [documentacion.md](documentacion.md) para NTP, NIS, NFS, Samba, CUPS y los extras.

## Entorno

- **srv-sena:** Ubuntu Server 24.04.3 en VirtualBox, 192.168.80.50 (puente) y 192.168.56.10 (solo anfitrión).
- **cli-sena:** clon del servidor usado como cliente Linux, 192.168.80.51 y 192.168.56.20.
- **Cliente Windows:** el PC anfitrión, para Samba, la web y la administración de CUPS.

> Las contraseñas que aparecen en la documentación son solo de laboratorio.
