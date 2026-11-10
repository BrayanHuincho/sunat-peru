export type Entorno = 'beta' | 'produccion';
export type Moneda = 'PEN' | 'USD';
export type NumeroEntrada = string | number;

export type TipoComprobante = '01' | '03';
export type TipoDocumentoIdentidad = '0' | '1' | '4' | '6' | '7' | 'A';
export type Afectacion = '10' | '20' | '30';

export interface Direccion {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  urbanizacion?: string;
  direccion: string;
  codigoLocal?: string;
}

export interface Emisor {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  domicilio: Direccion;
}

export interface Cliente {
  tipoDocumento: TipoDocumentoIdentidad;
  numeroDocumento: string;
  nombre: string;
  direccion?: string;
}

export interface ItemEntrada {
  codigo?: string;
  descripcion: string;
  unidad?: string;
  cantidad: NumeroEntrada;
  precioUnitario: NumeroEntrada;
  descuento?: NumeroEntrada;
  afectacion?: Afectacion;
  aplicaIcbper?: boolean;
}

export interface Cuota {
  monto: NumeroEntrada;
  vencimiento: string;
}

export type FormaPago = { tipo: 'contado' } | { tipo: 'credito'; cuotas: Cuota[] };

export interface ComprobanteEntrada {
  tipo: TipoComprobante;
  serie: string;
  correlativo: number;
  fechaEmision: string;
  horaEmision?: string;
  moneda?: Moneda;
  preciosIncluyenIgv?: boolean;
  porcentajeIgv?: NumeroEntrada;
  formaPago?: FormaPago;
  cliente: Cliente;
  items: ItemEntrada[];
}

export interface LineaCalculada {
  orden: number;
  codigo?: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  valorUnitario: string;
  precioUnitario: string;
  descuento: string;
  afectacion: Afectacion;
  base: string;
  igv: string;
  icbper: string;
  total: string;
}

export interface TotalesCalculados {
  gravadas: string;
  exoneradas: string;
  inafectas: string;
  descuentos: string;
  igv: string;
  icbper: string;
  totalImpuestos: string;
  valorVenta: string;
  total: string;
}

export interface Leyenda {
  codigo: string;
  valor: string;
}

export interface ComprobanteCalculado {
  tipo: TipoComprobante;
  serie: string;
  correlativo: number;
  numero: string;
  fechaEmision: string;
  horaEmision: string;
  moneda: Moneda;
  porcentajeIgv: string;
  formaPago: { tipo: 'contado' } | { tipo: 'credito'; cuotas: { monto: string; vencimiento: string }[] };
  cliente: Cliente;
  lineas: LineaCalculada[];
  totales: TotalesCalculados;
  leyendas: Leyenda[];
}

export interface Certificado {
  clavePrivadaPem: string;
  certificadoPem: string;
  titular: string;
  ruc: string | null;
  validoDesde: Date;
  venceEn: Date;
}

export interface XmlFirmado {
  xml: string;
  hash: string;
}

export interface CredencialesSol {
  ruc: string;
  usuario: string;
  clave: string;
}

export interface RespuestaSoap {
  cdrZip: Uint8Array | null;
  fault: { codigo: string; mensaje: string } | null;
}

export type EstadoCdr = 'aceptado' | 'observado' | 'rechazado';

export interface Cdr {
  codigo: string;
  descripcion: string;
  notas: string[];
  estado: EstadoCdr;
  referencia: string | null;
}

export type Clasificacion =
  | { tipo: 'aceptado' }
  | { tipo: 'observado' }
  | { tipo: 'rechazado' }
  | { tipo: 'credenciales' }
  | { tipo: 'transitorio' }
  | { tipo: 'duplicado' }
  | { tipo: 'desconocido' };

export type EstadoEnvio = EstadoCdr | 'error';

export interface ResultadoEnvio {
  estado: EstadoEnvio;
  reintentable: boolean;
  codigo: string | null;
  descripcion: string;
  notas: string[];
  numero: string;
  nombreArchivo: string;
  hash: string;
  qr: string;
  xml: string;
  cdrZip: Uint8Array | null;
}

export interface OpcionesSunat {
  entorno: Entorno;
  emisor: Emisor;
  usuarioSol: string;
  claveSol: string;
  certificado: Uint8Array | string;
  claveCertificado?: string;
  endpoint?: string;
  tiempoLimiteMs?: number;
  fetch?: typeof globalThis.fetch;
}
