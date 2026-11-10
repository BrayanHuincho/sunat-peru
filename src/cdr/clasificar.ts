import type { Clasificacion } from '../tipos.js';

const TRANSITORIOS = /^(0100|0109|013[0-8]|020[0-4])$/;
const CREDENCIALES = /^(010[1-6]|011[0-4])$/;

const EXPLICACIONES: Record<string, string> = {
  '0102': 'SUNAT no reconoce el usuario o la clave SOL. Revisa que el usuario sea RUC + usuario SOL.',
  '0104': 'La clave SOL es incorrecta.',
  '0105': 'El usuario SOL no está activo.',
  '0111': 'El usuario SOL no tiene el perfil para enviar comprobantes electrónicos.',
  '0127': 'SUNAT no encuentra el ticket.',
  '1033':
    'SUNAT ya tiene un comprobante con este número. Verifícalo en la consulta de comprobantes antes de volver a emitirlo.',
  '2335': 'El XML fue alterado después de firmarlo. Revisa que el certificado sea el del RUC emisor.',
  '2800': 'El tipo de documento del cliente no está permitido para este comprobante.',
};

const EXPLICACION_POR_TIPO: Record<Clasificacion['tipo'], string | null> = {
  aceptado: 'SUNAT aceptó el comprobante.',
  observado:
    'SUNAT aceptó el comprobante con observaciones. No hay que reenviarlo, pero conviene corregir el dato en los próximos.',
  rechazado: 'SUNAT rechazó el comprobante. Corrige el dato indicado y emite uno nuevo.',
  credenciales: 'SUNAT no aceptó el usuario o la clave SOL, o el usuario no tiene el perfil de emisor electrónico.',
  transitorio: 'SUNAT no pudo procesar el envío en este momento. Se puede reintentar.',
  duplicado: EXPLICACIONES['1033'] ?? null,
  desconocido: null,
};

// los faults llegan como soap-env:Client.0100, y el código real es lo último del texto
export function normalizarCodigo(codigo: string): string | null {
  const numero = /(?:^|\D)(\d{1,4})\s*$/.exec(codigo)?.[1];
  if (numero === undefined) return null;
  return Number(numero) === 0 ? '0' : numero.padStart(4, '0');
}

export function clasificarCodigo(codigo: string): Clasificacion {
  const limpio = normalizarCodigo(codigo);
  if (limpio === null) return { tipo: 'desconocido' };
  if (limpio === '0') return { tipo: 'aceptado' };
  if (limpio === '1033') return { tipo: 'duplicado' };
  if (TRANSITORIOS.test(limpio)) return { tipo: 'transitorio' };
  if (CREDENCIALES.test(limpio)) return { tipo: 'credenciales' };

  const numero = Number(limpio);
  if (numero >= 4000) return { tipo: 'observado' };
  if (numero >= 2000) return { tipo: 'rechazado' };
  return { tipo: 'desconocido' };
}

export function explicarCodigo(codigo: string): string | null {
  const limpio = normalizarCodigo(codigo);
  const propia = limpio === null ? undefined : EXPLICACIONES[limpio];
  return propia ?? EXPLICACION_POR_TIPO[clasificarCodigo(codigo).tipo];
}
