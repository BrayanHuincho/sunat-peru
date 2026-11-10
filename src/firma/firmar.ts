import { createHash, createSign } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto';
import { ErrorCertificado } from '../errores.js';
import type { Certificado, XmlFirmado } from '../tipos.js';

type Documento = ReturnType<DOMParser['parseFromString']>;
type Elemento = NonNullable<Documento['documentElement']>;
type Espacio = { prefix: string; namespaceURI: string };
type DatosFirma = { digest: string; certificadoBase64: string; valor: string; declararDs: boolean };

const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const NS_EXT = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const NS_XMLNS = 'http://www.w3.org/2000/xmlns/';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SOLO_ESPACIOS_PHP = /^[ \t\n\r\0\x0B]*$/;
const MARCA_XML =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g;

const canonicalizador = new C14nCanonicalization();

export function firmarXml(xml: string, certificado: Certificado): XmlFirmado {
  const documento = parsear(xml);
  quitarCdataVacios(documento);

  const digest = createHash('sha1').update(canonizar(documento), 'utf8').digest('base64');
  const certificadoBase64 = base64DePem(certificado.certificadoPem);

  const contenedor = destino(documento);
  const declararDs = contenedor.lookupNamespaceURI('ds') !== NS_DS;
  const borrador = xmlFirma({ digest, certificadoBase64, valor: '', declararDs: true });
  const firma = documento.importNode(parsear(borrador).documentElement as Elemento, true) as Elemento;
  contenedor.appendChild(firma);

  const signedInfo = firma.getElementsByTagNameNS(NS_DS, 'SignedInfo')[0] as Elemento;
  const valor = firmarRsa(canonizar(signedInfo, espaciosHeredados(signedInfo)), certificado.clavePrivadaPem);

  const indice = Array.from(documento.getElementsByTagName(contenedor.tagName)).indexOf(contenedor);
  const firmaFinal = xmlFirma({ digest, certificadoBase64, valor, declararDs });
  return { xml: insertarAlFinal(xml, contenedor.tagName, indice, firmaFinal), hash: digest };
}

function canonizar(nodo: Documento | Elemento, ancestorNamespaces: Espacio[] = []): string {
  return canonicalizador.process(nodo as unknown as Parameters<C14nCanonicalization['process']>[0], {
    ancestorNamespaces,
  });
}

function parsear(xml: string): Documento {
  try {
    return new DOMParser({
      onError: (nivel, mensaje) => {
        if (nivel !== 'warning') throw new Error(mensaje);
      },
    }).parseFromString(xml, 'text/xml');
  } catch {
    throw new ErrorCertificado('no se puede firmar: el XML está mal formado');
  }
}

// xml-crypto revienta con un cdata vacío y en c14n no aporta nada
function quitarCdataVacios(nodo: Documento | Elemento): void {
  for (let actual = nodo.firstChild; actual;) {
    const siguiente = actual.nextSibling;
    if (actual.nodeType === actual.CDATA_SECTION_NODE && actual.nodeValue === '') {
      nodo.removeChild(actual);
    } else if (actual.nodeType === actual.ELEMENT_NODE) {
      quitarCdataVacios(actual as Elemento);
    }
    actual = siguiente;
  }
}

function destino(documento: Documento): Elemento {
  const candidatos = Array.from(documento.getElementsByTagNameNS(NS_EXT, 'ExtensionContent'));
  const libre = candidatos.find((e) => SOLO_ESPACIOS_PHP.test(e.textContent ?? ''));
  return libre ?? (documento.documentElement as Elemento);
}

function xmlFirma({ digest, certificadoBase64, valor, declararDs }: DatosFirma): string {
  const declaracion = declararDs ? ` xmlns:ds="${NS_DS}"` : '';
  return (
    `<ds:Signature${declaracion} Id="GreenterSign">` +
    `<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${C14N}"/><ds:SignatureMethod Algorithm="${RSA_SHA1}"/>` +
    `<ds:Reference URI=""><ds:Transforms><ds:Transform Algorithm="${ENVELOPED}"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA1}"/><ds:DigestValue>${digest}</ds:DigestValue></ds:Reference></ds:SignedInfo>` +
    `<ds:SignatureValue>${valor}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificadoBase64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `</ds:Signature>`
  );
}

// se inserta en el texto original porque el serializador de xmldom pierde referencias como &#13; y rompe el digest
function insertarAlFinal(xml: string, etiqueta: string, indice: number, firma: string): string {
  let vistos = -1;
  let profundidad = 0;
  for (const marca of xml.matchAll(MARCA_XML)) {
    const [texto, cierre, apertura, vacia] = marca;
    if (apertura === etiqueta) {
      if (profundidad > 0) {
        if (!vacia) profundidad++;
      } else if (++vistos === indice) {
        if (vacia) {
          const antes = xml.slice(0, marca.index) + texto.slice(0, -2) + '>';
          return antes + firma + `</${etiqueta}>` + xml.slice(marca.index + texto.length);
        }
        profundidad = 1;
      }
    } else if (cierre === etiqueta && profundidad > 0 && --profundidad === 0) {
      return xml.slice(0, marca.index) + firma + xml.slice(marca.index);
    }
  }
  throw new ErrorCertificado('no se puede firmar: no se ubicó el nodo de la firma en el XML');
}

function base64DePem(pem: string): string {
  return pem.replace(/-----(BEGIN|END) [A-Z0-9 ]+-----/g, '').replace(/\s/g, '');
}

function espaciosHeredados(elemento: Elemento): Espacio[] {
  const espacios = new Map<string, string>();
  for (
    let actual = elemento.parentNode as Elemento | null;
    actual?.attributes;
    actual = actual.parentNode as Elemento | null
  ) {
    for (const atributo of Array.from(actual.attributes)) {
      if (atributo.namespaceURI !== NS_XMLNS) continue;
      const prefijo = atributo.prefix ? (atributo.localName as string) : '';
      if (!espacios.has(prefijo)) espacios.set(prefijo, atributo.value);
    }
  }
  return [...espacios]
    .filter(([, namespaceURI]) => namespaceURI !== '')
    .map(([prefix, namespaceURI]) => ({ prefix, namespaceURI }));
}

function firmarRsa(datos: string, clavePrivadaPem: string): string {
  try {
    return createSign('RSA-SHA1').update(datos, 'utf8').sign(clavePrivadaPem, 'base64');
  } catch {
    throw new ErrorCertificado('no se pudo firmar con la clave privada del certificado');
  }
}
