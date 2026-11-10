import type { Afectacion, TipoDocumentoIdentidad } from '../tipos.js';

export const TIPOS_COMPROBANTE = {
  '01': 'FACTURA',
  '03': 'BOLETA DE VENTA',
  '07': 'NOTA DE CREDITO',
  '08': 'NOTA DE DEBITO',
  '09': 'GUIA DE REMISION REMITENTE',
} as const;

export interface Tributo {
  codigo: string;
  nombre: string;
  codigoInternacional: string;
}

export const TRIBUTOS = {
  '1000': { codigo: '1000', nombre: 'IGV', codigoInternacional: 'VAT' },
  '1016': { codigo: '1016', nombre: 'IVAP', codigoInternacional: 'VAT' },
  '2000': { codigo: '2000', nombre: 'ISC', codigoInternacional: 'EXC' },
  '7152': { codigo: '7152', nombre: 'ICBPER', codigoInternacional: 'OTH' },
  '9995': { codigo: '9995', nombre: 'EXP', codigoInternacional: 'FRE' },
  '9996': { codigo: '9996', nombre: 'GRA', codigoInternacional: 'FRE' },
  '9997': { codigo: '9997', nombre: 'EXO', codigoInternacional: 'VAT' },
  '9998': { codigo: '9998', nombre: 'INA', codigoInternacional: 'FRE' },
  '9999': { codigo: '9999', nombre: 'OTROS', codigoInternacional: 'OTH' },
} as const satisfies Record<string, Tributo>;

export type CodigoTributo = keyof typeof TRIBUTOS;

export const TIPOS_DOCUMENTO_IDENTIDAD = {
  '0': 'DOC.TRIB.NO.DOM.SIN.RUC',
  '1': 'DNI',
  '4': 'CARNET DE EXTRANJERIA',
  '6': 'RUC',
  '7': 'PASAPORTE',
  A: 'CEDULA DIPLOMATICA DE IDENTIDAD',
} as const satisfies Record<TipoDocumentoIdentidad, string>;

export interface DatosAfectacion {
  descripcion: string;
  tributo: CodigoTributo;
  categoria: 'S' | 'E' | 'O';
}

export const AFECTACIONES = {
  '10': { descripcion: 'GRAVADO - OPERACION ONEROSA', tributo: '1000', categoria: 'S' },
  '20': { descripcion: 'EXONERADO - OPERACION ONEROSA', tributo: '9997', categoria: 'E' },
  '30': { descripcion: 'INAFECTO - OPERACION ONEROSA', tributo: '9998', categoria: 'O' },
} as const satisfies Record<Afectacion, DatosAfectacion>;

export const TIPOS_PRECIO = {
  '01': 'PRECIO UNITARIO (INCLUYE EL IGV)',
  '02': 'VALOR REFERENCIAL UNITARIO EN OPERACIONES NO ONEROSAS',
} as const;

export const UNIDADES = {
  NIU: 'UNIDAD (BIENES)',
  ZZ: 'UNIDAD (SERVICIOS)',
  KGM: 'KILOGRAMO',
  GRM: 'GRAMO',
  TNE: 'TONELADA',
  LTR: 'LITRO',
  MLT: 'MILILITRO',
  GLL: 'GALON',
  MTR: 'METRO',
  CMT: 'CENTIMETRO',
  MTK: 'METRO CUADRADO',
  MTQ: 'METRO CUBICO',
  BX: 'CAJA',
  PK: 'PAQUETE',
  DZN: 'DOCENA',
  BO: 'BOTELLA',
  BJ: 'BALDE',
  HUR: 'HORA',
  DAY: 'DIA',
  MON: 'MES',
} as const;

export const UNIDAD_POR_DEFECTO = 'NIU';

export function esUnidad(codigo: string): codigo is keyof typeof UNIDADES {
  return Object.hasOwn(UNIDADES, codigo);
}
