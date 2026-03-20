## Supabase Setup

Esta app ya quedo preparada para usar Supabase como backend real en produccion:

- Base de datos: tabla `institutions`
- Storage: bucket `institution-images`
- Frontend: lee `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y opcionalmente `VITE_SUPABASE_STORAGE_BUCKET`

### 1. Crear proyecto

Crea un proyecto en Supabase desde el panel.

### 2. Ejecutar el esquema SQL

En el SQL Editor de Supabase, pega y ejecuta el contenido de:

`supabase/schema.sql`

Eso crea:

- la tabla `public.institutions`
- el trigger `updated_at`
- las politicas RLS necesarias
- el bucket publico `institution-images`

### 3. Configurar variables de entorno

En local, crea `.env.local` con:

```env
VITE_SUPABASE_URL="https://TU-PROYECTO.supabase.co"
VITE_SUPABASE_ANON_KEY="TU_ANON_KEY"
VITE_SUPABASE_STORAGE_BUCKET="institution-images"
SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
SUPABASE_CLEAR_BEFORE_IMPORT="true"
```

En Vercel, agrega al menos estas variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`

### 4. Importar la base local actual

Si quieres arrancar en Supabase con lo que hoy tienes en `edumap.db`, corre:

```bash
npm run supabase:import
```

Por defecto el script:

- lee la base local `edumap.db`
- sube a Storage cualquier imagen embebida en base64
- borra la tabla remota actual antes de importar
- vuelve a insertar todas las instituciones en Supabase

### 5. Redeploy

Despues de guardar esas variables en Vercel, haz un redeploy del proyecto.

### Comportamiento de guardado

Cuando Supabase esta configurado:

- los cambios se guardan en la base remota
- las imagenes se guardan en Supabase Storage
- si el guardado remoto falla, la app avisa el error y no lo disfraza como guardado local en navegador

### Nota de seguridad

La app actual usa un PIN en frontend para el panel admin. Eso no reemplaza autenticacion real.
Para una presentacion o demo funciona, pero si mas adelante quieres seguridad real, conviene agregar login con Supabase Auth y endurecer las politicas RLS.
