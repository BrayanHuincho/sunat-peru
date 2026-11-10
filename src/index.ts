/** Cliente para emitir comprobantes electrónicos a SUNAT. */
export { Sunat } from './cliente/index.js';
export type { ComprobantePreparado } from './cliente/index.js';

/** Errores que lanza la librería. */
export { ErrorSunat, ErrorValidacion, ErrorCertificado, ErrorTransporte } from './errores.js';
export type { ProblemaValidacion } from './errores.js';

/** Calcula importes, impuestos y leyendas de un comprobante sin hacer E/S. */
export { calcularComprobante } from './impuestos/index.js';

/** Valida un comprobante y lanza `ErrorValidacion` con todos los problemas. */
export { validarComprobante } from './validacion/index.js';

/** Convierte un importe a su texto legal en letras. */
export { montoEnLetras } from './letras/index.js';

/** Carga un certificado PFX o PEM y lanza `ErrorCertificado` si no es utilizable. */
export { cargarCertificado } from './firma/index.js';

/** Lee el CDR comprimido y clasifica los códigos de respuesta de SUNAT. */
export { leerCdr, clasificarCodigo } from './cdr/index.js';

/** Tipos públicos de entrada y resultado. */
export type {
  Afectacion,
  Cdr,
  Certificado,
  Clasificacion,
  Cliente,
  ComprobanteCalculado,
  ComprobanteEntrada,
  CredencialesSol,
  Cuota,
  Direccion,
  Emisor,
  Entorno,
  EstadoCdr,
  EstadoEnvio,
  FormaPago,
  ItemEntrada,
  Leyenda,
  LineaCalculada,
  Moneda,
  NumeroEntrada,
  OpcionesSunat,
  ResultadoEnvio,
  TipoComprobante,
  TipoDocumentoIdentidad,
  TotalesCalculados,
} from './tipos.js';
