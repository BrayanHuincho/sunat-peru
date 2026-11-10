import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ErrorSunat } from '../errores.js';
import { leerCdr } from './index.js';

const NOMBRE = 'R-20000000001-01-F001-1.xml';

interface OpcionesXml {
  codigo?: string;
  descripcion?: string;
  notas?: string[];
  referencia?: string;
}

function xmlCdr({
  codigo = '0',
  descripcion = 'La Factura ha sido aceptada',
  notas = [],
  referencia = 'F001-1',
}: OpcionesXml = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
  <cbc:ID>123</cbc:ID>
  ${notas.map((nota) => `<cbc:Note>${nota}</cbc:Note>`).join('\n  ')}
  <cac:DocumentResponse>
    <cac:Response>
      <cbc:ReferenceID>${referencia}</cbc:ReferenceID>
      <cbc:ResponseCode listAgencyName="PE:SUNAT">${codigo}</cbc:ResponseCode>
      <cbc:Description>${descripcion}</cbc:Description>
    </cac:Response>
    <cac:DocumentReference><cbc:ID>F001-1</cbc:ID></cac:DocumentReference>
  </cac:DocumentResponse>
</ar:ApplicationResponse>`;
}

const zipDe = (xml: string, nombre = NOMBRE): Uint8Array =>
  zipSync({ 'dummy/': new Uint8Array(0), [nombre]: strToU8(xml) });

function codigoDeError(accion: () => unknown): string | undefined {
  try {
    accion();
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorSunat);
    return (error as ErrorSunat).codigo;
  }
  return undefined;
}

describe('leerCdr', () => {
  it('lee un CDR aceptado saltando la carpeta dummy', () => {
    expect(leerCdr(zipDe(xmlCdr()))).toEqual({
      codigo: '0',
      descripcion: 'La Factura ha sido aceptada',
      notas: [],
      estado: 'aceptado',
      referencia: 'F001-1',
    });
  });

  it('código 0 con notas 4000 queda observado y conserva el código', () => {
    const cdr = leerCdr(zipDe(xmlCdr({ notas: ['4252 - El dato no cumple el formato', '4287-Precio unitario'] })));
    expect(cdr.estado).toBe('observado');
    expect(cdr.codigo).toBe('0');
    expect(cdr.notas).toEqual(['4252 - El dato no cumple el formato', '4287-Precio unitario']);
  });

  it('código 0 con notas ajenas a la serie 4000 sigue aceptado', () => {
    const notas = ['Nota informativa', '2024 fue un buen año', '40 unidades'];
    expect(leerCdr(zipDe(xmlCdr({ notas }))).estado).toBe('aceptado');
  });

  it.each([
    ['4252', 'observado'],
    ['2800', 'rechazado'],
    ['1033', 'rechazado'],
    ['0100', 'rechazado'],
    ['1999', 'rechazado'],
  ])('ResponseCode %s deja el CDR %s', (codigo, estado) => {
    const cdr = leerCdr(zipDe(xmlCdr({ codigo })));
    expect(cdr.codigo).toBe(codigo);
    expect(cdr.estado).toBe(estado);
  });

  it('no asume aceptado si el código no es numérico', () => {
    const cdr = leerCdr(zipDe(xmlCdr({ codigo: 'ERROR' })));
    expect(cdr).toMatchObject({ codigo: 'ERROR', estado: 'rechazado' });
  });

  it('normaliza 0000 a 0 sin perder ceros de otros códigos', () => {
    expect(leerCdr(zipDe(xmlCdr({ codigo: '0000' }))).codigo).toBe('0');
    expect(leerCdr(zipDe(xmlCdr({ codigo: '0135' }))).codigo).toBe('0135');
  });

  it.each([
    ['sin prefijo en la raíz', (xml: string) => xml.replace(/ar:ApplicationResponse/g, 'ApplicationResponse')],
    ['otros prefijos', (xml: string) => xml.replace(/cbc:/g, 'b:').replace(/cac:/g, 'a:').replace(/ar:/g, 'x:')],
    ['sin ningún prefijo', (xml: string) => xml.replace(/<(\/?)(?:ar|cac|cbc):/g, '<$1')],
  ])('tolera variaciones de namespace: %s', (_nombre, transformar) => {
    const cdr = leerCdr(zipDe(transformar(xmlCdr({ codigo: '4252', notas: ['4252 - obs'] }))));
    expect(cdr).toEqual({
      codigo: '4252',
      descripcion: 'La Factura ha sido aceptada',
      notas: ['4252 - obs'],
      estado: 'observado',
      referencia: 'F001-1',
    });
  });

  it('decodifica entidades y CDATA', () => {
    const cdr = leerCdr(
      zipDe(xmlCdr({ descripcion: 'Facturaci&#243;n &amp; env&#xED;o', notas: ['<![CDATA[4252 - a < b]]>'] })),
    );
    expect(cdr.descripcion).toBe('Facturación & envío');
    expect(cdr.notas).toEqual(['4252 - a < b']);
    expect(cdr.estado).toBe('observado');
  });

  it('respeta la codificación ISO-8859-1 declarada', () => {
    const xml = xmlCdr({ descripcion: 'Facturación aceptada' }).replace('UTF-8', 'ISO-8859-1');
    const bytes = Uint8Array.from(xml, (caracter) => caracter.charCodeAt(0));
    const zip = zipSync({ [NOMBRE]: bytes });
    expect(leerCdr(zip).descripcion).toBe('Facturación aceptada');
  });

  it('encuentra el R-*.xml dentro de una carpeta e ignora otros archivos', () => {
    const zip = zipSync({
      'dummy/': new Uint8Array(0),
      'dummy/notas.txt': strToU8('x'),
      '__MACOSX/._R-1.xml': strToU8('basura'),
      'otro.xml': strToU8('<otro/>'),
      [`carpeta/${NOMBRE}`]: strToU8(xmlCdr({ codigo: '2335' })),
    });
    expect(leerCdr(zip).codigo).toBe('2335');
  });

  it('devuelve referencia null y descripción vacía si faltan', () => {
    const xml = xmlCdr()
      .replace(/<cbc:ReferenceID>.*<\/cbc:ReferenceID>/, '')
      .replace(/<cbc:Description>.*<\/cbc:Description>/, '');
    expect(leerCdr(zipDe(xml))).toMatchObject({ referencia: null, descripcion: '', estado: 'aceptado' });
  });

  it('falla con ErrorSunat si el contenido no sirve', () => {
    const sinCodigo = xmlCdr().replace(/<cbc:ResponseCode.*<\/cbc:ResponseCode>/, '');
    expect(codigoDeError(() => leerCdr(strToU8('esto no es un zip')))).toBe('CDR_INVALIDO');
    expect(codigoDeError(() => leerCdr(zipSync({ 'dummy/': new Uint8Array(0) })))).toBe('CDR_INVALIDO');
    expect(codigoDeError(() => leerCdr(zipDe(xmlCdr(), 'respuesta.xml')))).toBe('CDR_INVALIDO');
    expect(codigoDeError(() => leerCdr(zipDe(sinCodigo)))).toBe('CDR_INVALIDO');
    expect(codigoDeError(() => leerCdr(zipDe('<Otra><cosa>1</cosa></Otra>')))).toBe('CDR_INVALIDO');
  });
});
