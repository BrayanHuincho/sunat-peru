# Arquitectura de sunat-peru

Librería TypeScript para emitir comprobantes electrónicos a SUNAT. Sin base de datos, sin pantallas, sin estado global. Alcance actual: factura (01) y boleta (03), con la estructura lista para notas, resúmenes, bajas y guías.

## Principios

- El núcleo es puro: cálculo, validación, XML y lectura de CDR no hacen E/S y no leen variables de entorno ni el reloj.
- La única E/S está en `transporte/`, y `fetch` se inyecta.
- Dependencias hacia adentro: `cliente` usa todo, los módulos internos solo dependen de `tipos`, `errores` y sus propios archivos, salvo lo indicado abajo.
- Cada carpeta expone su API en `index.ts`. Nadie importa archivos internos de otra carpeta.
- Dinero con `decimal.js`; hacia afuera siempre `string` con decimales fijos. Nunca `number` para importes.
- Node 20+, ESM y CJS. TypeScript estricto, sin `any`.

## Estilo

Código de nivel senior, simple y legible. Los nombres explican la intención.

Comentarios: como máximo uno o dos por archivo, solo donde el porqué no sea obvio (una regla rara de SUNAT, por ejemplo). Tono natural, en español, en minúscula y sin punto final. Sin banners, sin JSDoc decorativo, sin comentarios que repitan el código.

La API pública sí lleva TSDoc breve en lo exportado desde `src/index.ts`.

Tests junto al código (`x.test.ts`), con vitest.

## Módulos

```
src/
  tipos.ts            tipos compartidos, fuente única
  errores.ts          ErrorSunat, ErrorValidacion, ErrorCertificado, ErrorTransporte
  index.ts            API pública
  catalogos/          catálogos SUNAT 01, 05, 06, 07, 16, unidades
  dinero/             Decimal, redondeo HALF_UP, formato
  impuestos/          calcularComprobante
  letras/             montoEnLetras
  validacion/         validarComprobante
  xml/                construirXmlComprobante, nombreArchivo
  firma/              cargarCertificado, firmarXml
  transporte/         comprimirXml, enviarZip, endpoints
  cdr/                leerCdr, clasificarCodigo
  qr/                 cadenaQr
  cliente/            clase Sunat
test/
  integracion/        contra SUNAT beta, se activa con SUNAT_BETA=1
  comparacion/        XML frente a Greenter
```

## Contratos entre módulos

```ts
// errores
class ErrorSunat extends Error { codigo: string }
class ErrorValidacion extends ErrorSunat { problemas: { campo: string; mensaje: string }[] }
class ErrorCertificado extends ErrorSunat {}
class ErrorTransporte extends ErrorSunat { reintentable: boolean }

// dinero
decimal(v: NumeroEntrada): Decimal
redondear(v: Decimal, decimales?: number): Decimal   // HALF_UP, 2 por defecto
fijo(v: Decimal, decimales?: number): string

// letras
montoEnLetras(total: NumeroEntrada, moneda: Moneda): string

// validacion
validarComprobante(entrada: ComprobanteEntrada, emisor: Emisor, hoy: string): void   // lanza ErrorValidacion

// impuestos
calcularComprobante(entrada: ComprobanteEntrada): ComprobanteCalculado

// xml
construirXmlComprobante(comprobante: ComprobanteCalculado, emisor: Emisor): string
nombreArchivo(ruc: string, comprobante: { tipo: string; numero: string }): string   // 20000000001-01-F001-1

// firma
cargarCertificado(contenido: Uint8Array | string, clave?: string): Certificado   // PFX o PEM, detecta por bytes
firmarXml(xml: string, certificado: Certificado): XmlFirmado

// transporte
endpointPara(entorno: Entorno): string
comprimirXml(nombre: string, xml: string): Uint8Array
enviarZip(args: { endpoint: string; credenciales: CredencialesSol; nombreZip: string; zip: Uint8Array; tiempoLimiteMs?: number; fetch?: typeof fetch }): Promise<RespuestaSoap>

// cdr
leerCdr(zip: Uint8Array): Cdr
clasificarCodigo(codigo: string): Clasificacion

// qr
cadenaQr(emisor: Emisor, comprobante: ComprobanteCalculado, hash: string): string

// cliente
class Sunat { constructor(o: OpcionesSunat); preparar(e: ComprobanteEntrada): { comprobante, xml, hash, qr, nombreArchivo }; enviar(e: ComprobanteEntrada): Promise<ResultadoEnvio> }
```

## Flujo de `enviar`

validar → calcular → construir XML → firmar → comprimir → SOAP sendBill → leer CDR → clasificar → `ResultadoEnvio`.

`enviar` no lanza por respuestas de negocio ni de red: las devuelve en `ResultadoEnvio` con `estado` y `reintentable`. Solo lanza `ErrorValidacion` y `ErrorCertificado`, que son errores del programador o de configuración.

## Reglas SUNAT

- Precio con IGV: `importe = round(cant * precio) - desc; base = round(importe / (1 + f)); igv = importe - base`.
- Precio sin IGV: `base = round(cant * precio) - desc; igv = round(base * f)`; el IGV del documento se recalcula sobre el total y el céntimo de diferencia va a la línea gravada mayor.
- Afectación 10, 20, 30. ICBPER S/ 0.50 por unidad, código 7152. Monto en letras, leyenda 1000.
- Boleta: cliente sin documento solo hasta S/ 700. Factura exige RUC. Fecha: factura hasta 3 días atrás, boleta 7, nunca futura.
- Códigos: `0` aceptado, `>=4000` observado, `2000-3999` rechazado, `0100,0109,0130-0138,0200-0204` transitorios, `0101-0106,0110-0114` credenciales, `1033` duplicado.
- Beta: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService`. Producción: `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService`.
- QR: `RUC|TIPO|SERIE|NUMERO(6)|IGV|TOTAL|YYYY-MM-DD|TIPODOCCLI|NUMDOCCLI|HASH`.
- Usuario SOAP: RUC + usuario SOL. Hash: `ds:DigestValue` del XML firmado.
- Firma: el mismo algoritmo que Greenter, verificado en el código de `greenter/xmldsig`. Se inserta en `ext:ExtensionContent`.

## Secretos

Nunca en el repositorio. Los tests generan su certificado en tiempo de ejecución. Credenciales demo de beta por `SUNAT_DEMO_USUARIO` y `SUNAT_DEMO_CLAVE`.
