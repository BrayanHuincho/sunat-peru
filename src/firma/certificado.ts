import forge from 'node-forge';
import { ErrorCertificado } from '../errores.js';
import type { Certificado } from '../tipos.js';

type ClaveRsa = forge.pki.rsa.PrivateKey;
type Par = { clave: ClaveRsa; certificado: forge.pki.Certificate };

const OID_SERIAL_NUMBER = '2.5.4.5';
const OID_ORGANIZATION_IDENTIFIER = '2.5.4.97';
const LINEA_PEM = /^-----BEGIN [A-Z0-9 ]+-----\r?$/m;
const BLOQUE_PEM = /-----BEGIN ([A-Z0-9 ]+)-----[\s\S]*?-----END \1-----/g;
const RUC = /(?<!\d)(?:10|15|16|17|20)\d{9}(?!\d)/;

export function cargarCertificado(contenido: Uint8Array | string, clave?: string): Certificado {
  const bytes = aBytes(contenido);
  const texto = bytes.toString('latin1');
  if (LINEA_PEM.test(texto)) return armar(leerPem(texto, clave));
  if (bytes[0] === 0x30) return armar(leerPfx(bytes, clave));
  throw new ErrorCertificado('el contenido no es un certificado PFX, P12 ni PEM');
}

function aBytes(contenido: Uint8Array | string): Buffer {
  if (typeof contenido !== 'string') return Buffer.from(contenido);
  if (contenido.includes('-----BEGIN')) return Buffer.from(contenido, 'utf8');
  return Buffer.from(contenido.replace(/\s/g, ''), 'base64');
}

function leerPfx(bytes: Buffer, clave: string | undefined): Par {
  const pfx = abrirPfx(bytes, clave);
  const bolsas = (tipo: string) => pfx.getBags({ bagType: tipo })[tipo] ?? [];

  const claves = [...bolsas(forge.pki.oids.pkcs8ShroudedKeyBag!), ...bolsas(forge.pki.oids.keyBag!)]
    .map((b) => b.key as ClaveRsa | undefined)
    .filter((k): k is ClaveRsa => k != null);
  const certificados = bolsas(forge.pki.oids.certBag!)
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => c != null);

  if (claves.length === 0) throw new ErrorCertificado('el PFX no contiene una clave privada RSA');
  if (certificados.length === 0) throw new ErrorCertificado('el PFX no contiene un certificado');
  return emparejar(claves, certificados);
}

function abrirPfx(bytes: Buffer, clave: string | undefined): forge.pkcs12.Pkcs12Pfx {
  let asn1: forge.asn1.Asn1;
  try {
    asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytes.toString('binary')));
  } catch {
    throw new ErrorCertificado('el archivo no es un PFX o P12 válido');
  }
  try {
    return forge.pkcs12.pkcs12FromAsn1(asn1, false, clave ?? '');
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.message)) {
      throw new ErrorCertificado(
        clave ? 'la clave del certificado es incorrecta' : 'el certificado requiere una clave',
      );
    }
    throw new ErrorCertificado(
      'no se pudo leer el PFX: está dañado o usa un algoritmo no soportado, solo se admite RSA',
    );
  }
}

function leerPem(texto: string, clave: string | undefined): Par {
  const bloques = [...texto.matchAll(BLOQUE_PEM)].map(([pem, etiqueta]) => ({ pem, etiqueta: etiqueta as string }));

  const certificados = bloques
    .filter((b) => b.etiqueta === 'CERTIFICATE' || b.etiqueta === 'X509 CERTIFICATE')
    .map((b) => certificadoDePem(b.pem));
  const claves = bloques
    .filter((b) => b.etiqueta.endsWith('PRIVATE KEY'))
    .map((b) => claveDePem(b.pem, b.etiqueta, clave));

  if (certificados.length === 0) throw new ErrorCertificado('el PEM no contiene un certificado');
  if (claves.length === 0) throw new ErrorCertificado('el PEM no contiene una clave privada');
  return emparejar(claves, certificados);
}

function certificadoDePem(pem: string): forge.pki.Certificate {
  try {
    return forge.pki.certificateFromPem(pem);
  } catch {
    throw new ErrorCertificado('el certificado del PEM es inválido o no es RSA');
  }
}

function claveDePem(pem: string, etiqueta: string, clave: string | undefined): ClaveRsa {
  const cifrada = etiqueta === 'ENCRYPTED PRIVATE KEY' || pem.includes('Proc-Type: 4,ENCRYPTED');
  if (!cifrada) {
    try {
      return forge.pki.privateKeyFromPem(pem) as ClaveRsa;
    } catch {
      throw new ErrorCertificado('la clave privada del PEM es inválida o no es RSA');
    }
  }
  if (!clave) throw new ErrorCertificado('la clave privada está cifrada y requiere una clave');
  try {
    const descifrada = forge.pki.decryptRsaPrivateKey(pem, clave) as ClaveRsa | null;
    if (descifrada) return descifrada;
  } catch {
    // forge lanza o devuelve null según el formato, en ambos casos es la misma falla
  }
  throw new ErrorCertificado('la clave del certificado es incorrecta');
}

function emparejar(claves: ClaveRsa[], certificados: forge.pki.Certificate[]): Par {
  for (const clave of claves) {
    const certificado = certificados.find((c) => corresponde(clave, c));
    if (certificado) return { clave, certificado };
  }
  throw new ErrorCertificado('la clave privada no corresponde al certificado');
}

function corresponde(clave: ClaveRsa, certificado: forge.pki.Certificate): boolean {
  const publica = certificado.publicKey as forge.pki.rsa.PublicKey;
  return publica.n.equals(clave.n) && publica.e.equals(clave.e);
}

function armar({ clave, certificado }: Par): Certificado {
  const atributos = certificado.subject.attributes;
  return {
    clavePrivadaPem: conSaltosLf(forge.pki.privateKeyToPem(clave)),
    certificadoPem: conSaltosLf(forge.pki.certificateToPem(certificado)),
    titular: valorDe(atributos, 'CN') ?? valorDe(atributos, 'O') ?? '',
    ruc: rucDe(atributos),
    validoDesde: certificado.validity.notBefore,
    venceEn: certificado.validity.notAfter,
  };
}

function conSaltosLf(pem: string): string {
  return pem.replace(/\r\n/g, '\n');
}

function valorDe(atributos: forge.pki.CertificateField[], nombreCorto: string): string | undefined {
  const atributo = atributos.find((a) => a.shortName === nombreCorto);
  return atributo ? textoDe(atributo) : undefined;
}

function rucDe(atributos: forge.pki.CertificateField[]): string | null {
  const prioridad = (a: forge.pki.CertificateField) =>
    a.type === OID_SERIAL_NUMBER || a.type === OID_ORGANIZATION_IDENTIFIER ? 0 : 1;
  for (const atributo of [...atributos].sort((a, b) => prioridad(a) - prioridad(b))) {
    const encontrado = RUC.exec(textoDe(atributo));
    if (encontrado) return encontrado[0];
  }
  return null;
}

function textoDe(atributo: forge.pki.CertificateField): string {
  const valor = String(atributo.value ?? '');
  if ((atributo.valueTagClass as unknown) !== forge.asn1.Type.UTF8) return valor;
  try {
    return forge.util.decodeUtf8(valor);
  } catch {
    return valor;
  }
}
