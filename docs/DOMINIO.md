# Dominio vocify.es

Comprado en Hostinger el 12/11/2026. La web (la app, la presentación y las páginas legales) la sirve `voces-web` en Render, así que el dominio tiene que apuntar a Render. Lo haces tú porque hay que entrar en tus cuentas; son unos 10 minutos más lo que tarde en propagarse el DNS.

## 1. Render: añadir el dominio

`render.yaml` ya lleva `domains: [vocify.es]` en `voces-web`.

1. Render › **Blueprints › voces › Manual sync** (o, si prefieres no sincronizar el Blueprint: **voces-web › Settings › Custom Domains › Add** › `vocify.es`).
2. Render añade también `www.vocify.es`, que redirige a `vocify.es`.
3. En **Custom Domains** verás los registros que espera. Deberían ser estos:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| A | `@` | `216.24.57.1` |
| CNAME | `www` | `voces-web.onrender.com` |

Si Render te enseña otros valores, usa los suyos.

## 2. Hostinger: los registros DNS

Hostinger › **Dominios › vocify.es › DNS / Nameservers** › **Registros DNS**:

1. **Borra** los registros `A` y `CNAME` que Hostinger pone por defecto para `@` y `www` (apuntan a su página de aparcamiento), y **cualquier registro `AAAA`**: Render solo usa IPv4 y un `AAAA` hace que falle.
2. Añade los dos de la tabla de arriba (TTL: el que venga, p. ej. 3600).
3. **No toques** los registros `MX` ni los `TXT` si vas a usar el correo de Hostinger (`soporte@vocify.es`).

En Render, pulsa **Verify** en cada dominio. Cuando el DNS se propaga (de minutos a unas horas), Render emite el certificado HTTPS solo.

## 3. Supabase: aceptar la nueva dirección

Supabase › proyecto **Voces** › **Authentication › URL Configuration**:

- **Site URL:** `https://vocify.es/`
- **Redirect URLs:** añade `https://vocify.es/**` y `https://www.vocify.es/**` (deja las que ya hay).

Sin esto, los enlaces de «entrar por correo» y «recuperar contraseña» seguirían llevando a la dirección antigua.

## 4. Render: la API acepta la nueva web

`render.yaml` ya añade `https://vocify.es` y `https://www.vocify.es` a `VOCES_CORS_ORIGINS` de `voces-api`. Se aplica con el **Manual sync** del paso 1 (y un **Manual Deploy** de `voces-api` si no se reinicia solo).

## 5. Correo `soporte@vocify.es`

Las páginas legales y la ficha de la App Store dan `soporte@vocify.es`. Créalo en Hostinger (**Emails**) o, si no quieres otro buzón, una **redirección** a tu correo de siempre. Apple y la ley (LSSI) exigen que funcione.

Opcional y recomendable: con ese buzón puedes configurar el **SMTP propio en Supabase** (*Authentication › Emails › SMTP Settings*) para que los correos de la app lleguen desde `@vocify.es` y sin el límite de envíos del correo gratuito de Supabase.

## 6. Datos del titular

Las páginas legales muestran «pendiente» donde van tu nombre (o el de tu empresa), el NIF y el domicilio. Rellénalos en `scripts/sitio/comun.mjs` (`titular`, `nif`, `domicilio`), ejecuta `node scripts/sitio/generar.mjs` y publica. No los he puesto yo porque son datos personales tuyos.

## Comprobar

- https://vocify.es → la app.
- https://vocify.es/conoce/ → la presentación.
- https://vocify.es/privacidad/, `/condiciones/`, `/soporte/`, `/borrar-cuenta/` y sus versiones en `/en/`.
- Entrar con una cuenta desde https://vocify.es (prueba la nube y la IA).
