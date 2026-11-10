import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import { ErrorSunat } from '../errores.js';
import type { Cdr, EstadoCdr } from '../tipos.js';
import { clasificarCodigo, normalizarCodigo } from './clasificar.js';

interface ApplicationResponse {
  Note?: unknown[];
  DocumentResponse?: { Response?: { ResponseCode?: unknown; Description?: unknown; ReferenceID?: unknown } }[];
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  htmlEntities: true,
  isArray: (nombre) => nombre === 'Note' || nombre === 'DocumentResponse',
});

const esXmlDeRespuesta = (ruta: string): boolean => /^R-.*\.xml$/i.test(ruta.split(/[\\/]/).pop() ?? '');

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

function extraerXml(zip: Uint8Array): string {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(zip, { filter: (archivo) => esXmlDeRespuesta(archivo.name) });
  } catch {
    throw new ErrorSunat('el CDR no es un zip válido', 'CDR_INVALIDO');
  }

  const bytes = Object.values(archivos)[0];
  if (!bytes) throw new ErrorSunat('el zip del CDR no contiene un archivo R-*.xml', 'CDR_INVALIDO');

  const declaracion = new TextDecoder('latin1').decode(bytes.subarray(0, 100));
  const esLatin1 = /encoding=["']iso-8859-1["']/i.test(declaracion);
  return new TextDecoder(esLatin1 ? 'latin1' : 'utf-8').decode(bytes);
}

function parsear(xml: string): ApplicationResponse | undefined {
  try {
    return (parser.parse(xml) as { ApplicationResponse?: ApplicationResponse }).ApplicationResponse;
  } catch {
    throw new ErrorSunat('el XML del CDR está mal formado', 'CDR_INVALIDO');
  }
}

const notaEsObservacion = (nota: string): boolean => {
  const codigo = /^(\d{4})\b/.exec(nota)?.[1];
  return codigo !== undefined && clasificarCodigo(codigo).tipo === 'observado';
};

function estadoDe(codigo: string, notas: string[]): EstadoCdr {
  const { tipo } = clasificarCodigo(codigo);
  // sunat acepta con ResponseCode 0 y deja las observaciones solo en las notas
  if (tipo === 'aceptado') return notas.some(notaEsObservacion) ? 'observado' : 'aceptado';
  return tipo === 'observado' ? 'observado' : 'rechazado';
}

export function leerCdr(zip: Uint8Array): Cdr {
  const raiz = parsear(extraerXml(zip));
  const respuesta = raiz?.DocumentResponse?.[0]?.Response;
  const codigoCrudo = texto(respuesta?.ResponseCode);
  if (!codigoCrudo) throw new ErrorSunat('el CDR no trae ResponseCode', 'CDR_INVALIDO');

  const codigo = normalizarCodigo(codigoCrudo) ?? codigoCrudo;
  const notas = (raiz?.Note ?? []).map(texto).filter(Boolean);

  return {
    codigo,
    descripcion: texto(respuesta?.Description),
    notas,
    estado: estadoDe(codigo, notas),
    referencia: texto(respuesta?.ReferenceID) || null,
  };
}
