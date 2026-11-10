import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { ErrorCertificado } from '../errores.js';
import type { Certificado } from '../tipos.js';
import { cargarCertificado, firmarXml } from './index.js';

const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const ESPACIOS =
  'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ' +
  'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ' +
  'xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ' +
  'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"';
const EXTENSION = '<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>';
const XML = `<?xml version="1.0" encoding="UTF-8"?>\n<Invoice ${ESPACIOS}>${EXTENSION}<cbc:ID>F001-1</cbc:ID><cbc:Note><![CDATA[PEÑA & HIJOS]]></cbc:Note></Invoice>`;
const CLAVE = 'S3creta-Muy-Unica';

interface Generado {
  claves: forge.pki.rsa.KeyPair;
  cert: forge.pki.Certificate;
}

function generar(atributos: forge.pki.CertificateField[], claves = forge.pki.rsa.generateKeyPair(2048)): Generado {
  const cert = forge.pki.createCertificate();
  cert.publicKey = claves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  cert.setSubject(atributos);
  cert.setIssuer(atributos);
  cert.sign(claves.privateKey, forge.md.sha256.create());
  return { claves, cert };
}

function pfx(claves: forge.pki.rsa.KeyPair, certs: forge.pki.Certificate[], clave: string): Uint8Array {
  const asn1 = forge.pkcs12.toPkcs12Asn1(claves.privateKey, certs, clave, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

function pemDe(g: Generado): string {
  return forge.pki.privateKeyToPem(g.claves.privateKey) + forge.pki.certificateToPem(g.cert);
}

function verificar(xml: string, certificado: Certificado): boolean {
  const documento = new DOMParser().parseFromString(xml, 'text/xml');
  const firma = documento.getElementsByTagNameNS(NS_DS, 'Signature')[0];
  const verificador = new SignedXml({ publicCert: certificado.certificadoPem, getCertFromKeyInfo: () => null });
  verificador.loadSignature(firma as unknown as Parameters<SignedXml['loadSignature']>[0]);
  try {
    return verificador.checkSignature(xml);
  } catch {
    return false;
  }
}

function esperarError(accion: () => unknown, mensaje: RegExp): ErrorCertificado {
  try {
    accion();
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCertificado);
    expect((error as Error).message).toMatch(mensaje);
    return error as ErrorCertificado;
  }
  throw new Error('se esperaba ErrorCertificado');
}

let principal: Generado;
let certificado: Certificado;

beforeAll(() => {
  principal = generar([
    { shortName: 'CN', value: 'EMPRESA DEMO S.A.C.' },
    { name: 'serialNumber', type: '2.5.4.5', value: '20123456789' },
  ]);
  certificado = cargarCertificado(pemDe(principal));
});

describe('cargarCertificado', () => {
  it('lee un PFX por sus bytes con titular, ruc y fechas', () => {
    const c = cargarCertificado(pfx(principal.claves, [principal.cert], CLAVE), CLAVE);
    expect(c.titular).toBe('EMPRESA DEMO S.A.C.');
    expect(c.ruc).toBe('20123456789');
    expect(c.validoDesde.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(c.venceEn.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(c.certificadoPem).toContain('BEGIN CERTIFICATE');
    expect(c.clavePrivadaPem).toContain('PRIVATE KEY');
  });

  it('acepta el PFX en base64', () => {
    const base64 = Buffer.from(pfx(principal.claves, [principal.cert], CLAVE)).toString('base64');
    expect(cargarCertificado(base64, CLAVE).ruc).toBe('20123456789');
  });

  it('elige el certificado que corresponde a la clave aunque venga después de la cadena', () => {
    const ca = generar([{ shortName: 'CN', value: 'AUTORIDAD' }]);
    const c = cargarCertificado(pfx(principal.claves, [ca.cert, principal.cert], CLAVE), CLAVE);
    expect(c.titular).toBe('EMPRESA DEMO S.A.C.');
  });

  it('lee un PEM como texto y como bytes', () => {
    const pem = pemDe(principal);
    expect(cargarCertificado(pem).titular).toBe('EMPRESA DEMO S.A.C.');
    expect(cargarCertificado(new TextEncoder().encode(pem)).ruc).toBe('20123456789');
  });

  it('lee un PEM con clave cifrada', () => {
    const cifrada = forge.pki.encryptRsaPrivateKey(principal.claves.privateKey, CLAVE);
    const pem = cifrada + forge.pki.certificateToPem(principal.cert);
    expect(cargarCertificado(pem, CLAVE).titular).toBe('EMPRESA DEMO S.A.C.');
    esperarError(() => cargarCertificado(pem), /requiere una clave/);
    const error = esperarError(() => cargarCertificado(pem, 'Otra-Clave-Mala'), /incorrecta/);
    expect(error.message).not.toContain('Otra-Clave-Mala');
  });

  it('decodifica utf8 en el titular y saca el ruc del CN', () => {
    const utf8 = forge.asn1.Type.UTF8 as unknown as forge.asn1.Class;
    const g = generar([{ shortName: 'CN', value: 'PEÑA 20987654321', valueTagClass: utf8 }], principal.claves);
    const c = cargarCertificado(pemDe(g));
    expect(c.titular).toBe('PEÑA 20987654321');
    expect(c.ruc).toBe('20987654321');
  });

  it('devuelve ruc null cuando el subject no lo trae', () => {
    const g = generar([{ shortName: 'CN', value: 'SIN DATOS 123' }], principal.claves);
    expect(cargarCertificado(pemDe(g)).ruc).toBeNull();
  });

  it('rechaza una clave que no corresponde al certificado', () => {
    const otro = generar([{ shortName: 'CN', value: 'OTRO' }]);
    const pem = forge.pki.privateKeyToPem(otro.claves.privateKey) + forge.pki.certificateToPem(principal.cert);
    esperarError(() => cargarCertificado(pem), /no corresponde/);
  });

  it('informa clave incorrecta en PFX sin revelarla', () => {
    const contenido = pfx(principal.claves, [principal.cert], CLAVE);
    const error = esperarError(() => cargarCertificado(contenido, 'Clave-Equivocada-99'), /incorrecta/);
    expect(error.message).not.toContain('Clave-Equivocada-99');
    esperarError(() => cargarCertificado(contenido), /requiere una clave/);
  });

  it('rechaza contenido que no es certificado', () => {
    esperarError(() => cargarCertificado(new Uint8Array([1, 2, 3])), /no es un certificado/);
    esperarError(() => cargarCertificado(new Uint8Array([0x30, 0x82, 0xff])), /PFX/);
    esperarError(() => cargarCertificado(forge.pki.certificateToPem(principal.cert)), /clave privada/);
    esperarError(() => cargarCertificado(forge.pki.privateKeyToPem(principal.claves.privateKey)), /certificado/);
  });
});

describe('firmarXml', () => {
  it('produce una firma válida para xml-crypto', () => {
    expect(verificar(firmarXml(XML, certificado).xml, certificado)).toBe(true);
  });

  it('coloca la firma dentro de ExtensionContent con la estructura de Greenter', () => {
    const { xml } = firmarXml(XML, certificado);
    expect(xml).toContain('<ext:ExtensionContent><ds:Signature Id="GreenterSign"><ds:SignedInfo>');
    expect(xml).toContain('</ds:Signature></ext:ExtensionContent>');
    expect(xml).toContain('<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>');
    expect(xml).toContain('<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>');
    expect(xml).toContain(
      '<ds:Reference URI=""><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms>',
    );
    expect(xml).toContain('<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>');
    expect(xml).toMatch(/<ds:X509Certificate>[A-Za-z0-9+/=]+<\/ds:X509Certificate>/);
  });

  it('devuelve como hash el DigestValue', () => {
    const { xml, hash } = firmarXml(XML, certificado);
    expect(xml).toContain(`<ds:DigestValue>${hash}</ds:DigestValue>`);
  });

  it('conserva intacto el texto original fuera de la firma', () => {
    const entrada = XML.replace('F001-1', 'a &#13; b &#xE9;');
    const { xml } = firmarXml(entrada, certificado);
    expect(
      xml
        .replace(/<ds:Signature[\s\S]*<\/ds:Signature>/, '')
        .replace('<ext:ExtensionContent></ext:ExtensionContent>', '<ext:ExtensionContent/>'),
    ).toBe(entrada);
    expect(verificar(xml, certificado)).toBe(true);
  });

  it('elige el primer ExtensionContent vacío', () => {
    const entrada = `<Invoice ${ESPACIOS}><ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><cbc:ID>x</cbc:ID></ext:ExtensionContent></ext:UBLExtension><ext:UBLExtension><ext:ExtensionContent>\n</ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions></Invoice>`;
    const { xml } = firmarXml(entrada, certificado);
    expect(xml).toContain('<cbc:ID>x</cbc:ID></ext:ExtensionContent>');
    expect(xml).toContain('</ds:Signature></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>');
    expect(verificar(xml, certificado)).toBe(true);
  });

  it('firma en la raíz si no hay ExtensionContent', () => {
    const { xml } = firmarXml(`<Invoice ${ESPACIOS}><cbc:ID>1</cbc:ID></Invoice>`, certificado);
    expect(xml).toMatch(/<\/ds:Signature><\/Invoice>$/);
    expect(verificar(xml, certificado)).toBe(true);
  });

  it('tolera cdata vacío', () => {
    const { xml } = firmarXml(XML.replace('PEÑA & HIJOS', ''), certificado);
    expect(verificar(xml, certificado)).toBe(true);
  });

  it('detecta alteraciones del contenido, del digest y de la firma', () => {
    const { xml, hash } = firmarXml(XML, certificado);
    expect(verificar(xml.replace('F001-1', 'F001-2'), certificado)).toBe(false);
    expect(verificar(xml.replace(hash, Buffer.alloc(20, 7).toString('base64')), certificado)).toBe(false);
    const valor = /<ds:SignatureValue>([^<]+)</.exec(xml)?.[1] as string;
    const alterado = Buffer.from(valor, 'base64');
    alterado[0] = (alterado[0] as number) ^ 0xff;
    expect(verificar(xml.replace(valor, alterado.toString('base64')), certificado)).toBe(false);
  });

  it('lanza ErrorCertificado con XML mal formado o clave inválida', () => {
    esperarError(() => firmarXml('<Invoice><sin-cerrar></Invoice>', certificado), /mal formado/);
    esperarError(() => firmarXml(XML, { ...certificado, clavePrivadaPem: 'basura' }), /clave privada/);
  });
});
