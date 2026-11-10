import { XMLParser } from 'fast-xml-parser';
import type { RespuestaSoap } from '../tipos.js';

type Nodo = Record<string, unknown>;

// parseTagValue apagado: como número, el faultcode 0100 perdería el cero y sería otro código
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

export function interpretarRespuesta(estadoHttp: number, cuerpo: string): RespuestaSoap {
  const httpOk = estadoHttp >= 200 && estadoHttp < 300;
  const body = leerBody(cuerpo);

  if (!body) {
    return httpOk
      ? conFault('RESPUESTA_INVALIDA', 'SUNAT devolvió una respuesta que no es SOAP')
      : errorHttp(estadoHttp);
  }
  if ('Fault' in body) return leerFault(body.Fault);
  if (!httpOk) return errorHttp(estadoHttp);

  const respuesta = body.sendBillResponse;
  const base64 = esNodo(respuesta) ? texto(respuesta.applicationResponse) : '';
  if (!base64) return conFault('CDR_AUSENTE', 'SUNAT no devolvió el CDR');

  const cdrZip = decodificarZip(base64);
  if (!cdrZip) return conFault('CDR_INVALIDO', 'el CDR devuelto por SUNAT no es un zip válido');
  return { cdrZip, fault: null };
}

function leerBody(cuerpo: string): Nodo | null {
  try {
    const documento: unknown = parser.parse(cuerpo);
    if (!esNodo(documento) || !esNodo(documento.Envelope)) return null;
    const body = documento.Envelope.Body;
    return esNodo(body) ? body : null;
  } catch {
    return null;
  }
}

function leerFault(fault: unknown): RespuestaSoap {
  const nodo = esNodo(fault) ? fault : {};
  const faultcode = texto(nodo.faultcode);
  const faultstring = texto(nodo.faultstring);
  const detalle = esNodo(nodo.detail) ? texto(nodo.detail.message) : '';
  const local = faultcode.slice(faultcode.lastIndexOf(':') + 1);

  const numero = /\d+/.exec(local)?.[0] ?? /^(\d{3,4})\s*(?:$|[-:.])/.exec(faultstring)?.[1];
  return conFault(
    numero ? normalizarCodigo(numero) : faultcode || 'SOAP_FAULT',
    faultstring || detalle || 'SUNAT devolvió un fault sin descripción',
  );
}

function normalizarCodigo(numero: string): string {
  return Number(numero) === 0 ? '0' : numero.padStart(4, '0');
}

function decodificarZip(base64: string): Uint8Array | null {
  const compacto = base64.replace(/\s+/g, '');
  if (compacto.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compacto)) return null;
  const bytes = new Uint8Array(Buffer.from(compacto, 'base64'));
  return bytes[0] === 0x50 && bytes[1] === 0x4b ? bytes : null;
}

function errorHttp(estado: number): RespuestaSoap {
  return conFault(`HTTP_${estado}`, `SUNAT respondió HTTP ${estado}`);
}

function conFault(codigo: string, mensaje: string): RespuestaSoap {
  return { cdrZip: null, fault: { codigo, mensaje } };
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function esNodo(valor: unknown): valor is Nodo {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}
