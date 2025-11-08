# Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# Base de datos PostgreSQL
DATABASE_URL="postgresql://usuario:password@localhost:5432/ecommerce?schema=public"

# Servidor
PORT=3000
NODE_ENV=development
```

## Ejemplo de DATABASE_URL

### PostgreSQL local
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/ecommerce?schema=public"
```

### PostgreSQL con usuario personalizado
```env
DATABASE_URL="postgresql://mi_usuario:mi_password@localhost:5432/ecommerce?schema=public"
```

### PostgreSQL remoto
```env
DATABASE_URL="postgresql://usuario:password@host:5432/ecommerce?schema=public"
```

## Notas

- Asegúrate de tener PostgreSQL instalado y corriendo
- Crea la base de datos `ecommerce` antes de ejecutar las migraciones:
  ```sql
  CREATE DATABASE ecommerce;
  ```
- No subas el archivo `.env` al repositorio (ya está en `.gitignore`)

