# sunat-peru

Emite facturas y boletas electrónicas a SUNAT desde Node.js, sin un servicio PHP al lado. Le pasas los datos de la venta y se encarga de calcular los impuestos, armar el XML UBL 2.1, firmarlo, enviarlo y decirte qué respondió SUNAT.

No guarda nada ni tiene pantallas: es una pieza para integrar en tu sistema.

SUNAT beta acepta las facturas y boletas que genera, y su XML se compara en las pruebas con el de [Greenter](https://github.com/thegreenter/greenter). Va en versión 0.x y todavía no se ha usado en producción, así que prueba tus casos en beta primero.

## Instalación

Clona el repositorio y compílalo, porque aún no está publicada en npm:

```bash
git clone https://github.com/BrayanHuincho/sunat-peru.git
cd sunat-peru
npm install
npm run build
```

Necesitas Node 20 o superior. Funciona con ESM y CommonJS.

## Uso

```ts
import { readFileSync } from 'node:fs';
import { Sunat } from 'sunat-peru';

const sunat = new Sunat({
  entorno: 'beta',
  emisor: {
    ruc: '20000000001',
    razonSocial: 'MI EMPRESA SAC',
    domicilio: {
      ubigeo: '150101',
      departamento: 'LIMA',
      provincia: 'LIMA',
      distrito: 'LIMA',
      direccion: 'AV. PRINCIPAL 123',
    },
  },
  usuarioSol: process.env.SUNAT_USUARIO!,
  claveSol: process.env.SUNAT_CLAVE!,
  certificado: readFileSync('certificado.pfx'),
  claveCertificado: process.env.SUNAT_CERTIFICADO_CLAVE,
});

const resultado = await sunat.enviar({
  tipo: '01',
  serie: 'F001',
  correlativo: 1,
  fechaEmision: '2026-11-09',
  preciosIncluyenIgv: true,
  cliente: { tipoDocumento: '6', numeroDocumento: '20100066603', nombre: 'CLIENTE SAC' },
  items: [{ descripcion: 'Teclado mecánico', cantidad: 2, precioUnitario: '118.00' }],
});

if (resultado.estado === 'aceptado') {
  guardar(resultado.numero, resultado.xml, resultado.cdrZip);
}
```

Dos cosas que conviene saber desde el inicio:

- Si no pasas `preciosIncluyenIgv: true`, los precios se toman sin IGV.
- Usa `string` para los importes. Así los decimales no pasan por el redondeo de JavaScript.

## Probarlo en cinco minutos

SUNAT tiene un usuario de demostración público para beta (`MODDATOS` / `moddatos`), y beta acepta un certificado autofirmado. Con estas variables no hace falta nada real:

```powershell
$env:SUNAT_RUC="20000000001"
$env:SUNAT_DEMO_USUARIO="MODDATOS"
$env:SUNAT_DEMO_CLAVE="moddatos"
$env:SUNAT_CERTIFICADO_RUTA="C:\ruta\a\certificado.pem"

node examples/enviar-beta.mjs
```

Debe responder `estado: 'aceptado'` y `codigo: '0'`.

Para generar el certificado de prueba con OpenSSL:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=Prueba" -keyout clave.pem -out cert.pem
cat clave.pem cert.pem > certificado.pem
```

Si solo quieres ver el cálculo y el XML, sin red ni variables:

```bash
node examples/preparar.mjs
```

## Probarlo en Postman

Como es una librería, no expone rutas por sí sola. En [`examples/servidor.mjs`](examples/servidor.mjs) hay un servidor mínimo que también sirve de ejemplo de integración. Con las variables de arriba:

```bash
node examples/servidor.mjs
```

Después importa [`examples/postman/sunat-peru.postman_collection.json`](examples/postman/sunat-peru.postman_collection.json) y ejecuta las peticiones.

| Ruta             | Qué hace                                   |
| ---------------- | ------------------------------------------ |
| `POST /preparar` | Calcula y firma, sin enviar                |
| `POST /enviar`   | Envía a SUNAT beta y devuelve la respuesta |

El servidor es de ejemplo y no tiene autenticación. No lo expongas a internet.

## `preparar` y `enviar`

`preparar` valida, calcula, arma el XML y lo firma, sin tocar la red. Devuelve `{ comprobante, xml, hash, qr, nombreArchivo }`. Te sirve para mostrar los totales o generar tu PDF.

`enviar` hace lo mismo y además lo manda a SUNAT.

Si los datos están mal, ambas lanzan `ErrorValidacion` con todos los problemas juntos en `error.problemas`, indicando el campo exacto:

```ts
[{ campo: 'items[0].cantidad', mensaje: 'debe ser mayor que cero' }];
```

Lo demás no lanza excepciones. Un rechazo de SUNAT o una caída de red vuelven como un resultado normal.

## Qué hacer con el resultado

| `estado`    | Significa                              | Qué hacer                                         |
| ----------- | -------------------------------------- | ------------------------------------------------- |
| `aceptado`  | SUNAT lo aceptó                        | Guarda `xml` y `cdrZip`                           |
| `observado` | Aceptado, con observaciones en `notas` | Es válido. Corrige la causa en los siguientes     |
| `rechazado` | SUNAT lo rechazó                       | No tiene validez. Corrige y emite con otro número |
| `error`     | SUNAT no decidió sobre el comprobante  | Mira `reintentable` y `codigo`                    |

La librería no reintenta sola. Reintenta solo si `reintentable` es `true`, dejando tiempo entre intentos, y siempre con el mismo número: un corte de red no te dice si SUNAT alcanzó a recibirlo.

Si al reintentar llega el código `1033`, ese comprobante ya estaba registrado. No lo emitas con otro número y verifícalo en la consulta de SUNAT, porque la librería todavía no descarga CDR de comprobantes anteriores.

En beta, varios envíos muy seguidos pueden devolver `HTTP 401` aunque las credenciales estén bien. Déjales un par de segundos de separación.

Los códigos más comunes están en [docs/CODIGOS.md](docs/CODIGOS.md).

## Pasar a producción

1. Date de alta como emisor electrónico y crea un usuario SOL secundario.
2. Consigue un certificado digital a nombre de tu RUC y regístralo en SOL.
3. Cambia `entorno` a `'produccion'` y usa tus credenciales.
4. Emite un primer comprobante de monto bajo y revísalo en la consulta de SUNAT.

Que algo pase en beta no garantiza que pase en producción. Nunca subas el certificado ni las claves al repositorio.

## Qué cubre

- Factura y boleta, en soles o dólares.
- Operaciones gravadas, exoneradas e inafectas, ICBPER y descuentos por línea.
- Pago al contado o a crédito con cuotas.
- Certificados PFX y PEM.

Todavía no: PDF, operaciones gratuitas, exportación, detracciones, percepciones ni consulta de CDR. Lo siguiente son notas de crédito y débito, resúmenes diarios, bajas y guías de remisión.

Si necesitas hoy alguno de esos documentos o trabajas en PHP, usa Greenter, que lleva años en uso y cubre mucho más. Hay otros paquetes de JavaScript para SUNAT que también vale la pena mirar.

## Desarrollo

```bash
npm test
npm run lint
npm run typecheck
```

Para incluir el envío real a beta, define las variables de `.env.example` y `SUNAT_BETA=1`.

