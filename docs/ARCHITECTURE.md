# Arquitectura

PassNexus es un monorepo npm con dos aplicaciones: `apps/web` es una SPA React 19 construida con Vite, Material UI y `lucide-react`; `apps/api` es una API NestJS 11 con Prisma y PostgreSQL.

El navegador usa `VITE_API_URL` o `http://127.0.0.1:3000/api` para llamar a la API. La API publica el prefijo `/api`, resuelve navegación, organizaciones, administración, autenticación y vaults. Swagger se sirve en `/docs`.

Los datos persistentes se modelan en `apps/api/prisma/schema.prisma`. El vault conserva únicamente claves y contenido cifrado; el frontend usa Web Crypto en `apps/web/src/lib/crypto.ts` para crear y desbloquear claves locales. Las rutas de acceso no autenticado se seleccionan por hash en `App.tsx`, incluyendo `#recuperar` y `#reset?token=...`.

La autenticación crea un access token para peticiones Bearer y una cookie HTTP-only `passnexus_refresh` para renovación. El dashboard carga menú y vaults después de autenticar.