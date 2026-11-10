import { DOMParser, type Element } from '@xmldom/xmldom';
import { Decimal } from 'decimal.js';

export interface XmlPlano {
  valores: Map<string, string>;
  ordenes: Map<string, string[]>;
}

const PREFIJOS: Record<string, string> = {
  'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2': 'cbc',
  'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2': 'cac',
  'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2': 'ext',
  'http://www.w3.org/2000/09/xmldsig#': 'ds',
  'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2': 'inv',
};

// lo que depende de la llave o del contenido firmado no puede coincidir entre dos certificados
const VALORES_DE_FIRMA = new Set(['ds:DigestValue', 'ds:SignatureValue', 'ds:X509Certificate', 'ds:X509SubjectName']);

const ES_NUMERICO = /^[+-]?\d+(\.\d+)?$/;
const ES_NOMBRE_DE_CANTIDAD = /(Amount|Quantity|Percent|Numeric)$/;

function nombre(elemento: Element): string {
  const prefijo = PREFIJOS[elemento.namespaceURI ?? ''] ?? elemento.namespaceURI ?? '';
  return `${prefijo}:${elemento.localName}`;
}

function hijos(elemento: Element): Element[] {
  const resultado: Element[] = [];
  for (let nodo = elemento.firstChild; nodo; nodo = nodo.nextSibling) {
    if (nodo.nodeType === 1) resultado.push(nodo as Element);
  }
  return resultado;
}

function textoPropio(elemento: Element): string {
  let texto = '';
  for (let nodo = elemento.firstChild; nodo; nodo = nodo.nextSibling) {
    if (nodo.nodeType === 3 || nodo.nodeType === 4) texto += nodo.nodeValue ?? '';
  }
  return texto.replace(/\s+/g, ' ').trim();
}

function valorNormalizado(elemento: Element, etiqueta: string): string {
  const texto = textoPropio(elemento);
  if (VALORES_DE_FIRMA.has(etiqueta)) return texto === '' ? '' : '<firma>';
  const esCantidad =
    elemento.hasAttribute('currencyID') || elemento.hasAttribute('unitCode') || ES_NOMBRE_DE_CANTIDAD.test(etiqueta);
  return esCantidad && ES_NUMERICO.test(texto) ? new Decimal(texto).toString() : texto;
}

function visitar(elemento: Element, ruta: string, plano: XmlPlano): void {
  const etiqueta = nombre(elemento);
  const texto = valorNormalizado(elemento, etiqueta);
  if (texto !== '') plano.valores.set(ruta, texto);

  for (const atributo of Array.from(elemento.attributes)) {
    if (atributo.name === 'xmlns' || atributo.name.startsWith('xmlns:')) continue;
    plano.valores.set(`${ruta}@${atributo.name}`, atributo.value);
  }

  const contador = new Map<string, number>();
  const orden: string[] = [];
  for (const hijo of hijos(elemento)) {
    const etiquetaHijo = nombre(hijo);
    const indice = contador.get(etiquetaHijo) ?? 0;
    contador.set(etiquetaHijo, indice + 1);
    orden.push(etiquetaHijo);
    visitar(hijo, `${ruta}/${etiquetaHijo}[${indice}]`, plano);
  }
  plano.ordenes.set(ruta, orden);
}

export function aplanarXml(xml: string): XmlPlano {
  const documento = new DOMParser().parseFromString(xml, 'text/xml');
  const raiz = documento.documentElement;
  if (!raiz) throw new Error('xml sin elemento raiz');
  const plano: XmlPlano = { valores: new Map(), ordenes: new Map() };
  visitar(raiz, nombre(raiz), plano);
  return plano;
}

export function compararXml(nuestro: string, referencia: string): string[] {
  const a = aplanarXml(nuestro);
  const b = aplanarXml(referencia);
  const diferencias: string[] = [];

  for (const [ruta, valor] of b.valores) {
    if (!a.valores.has(ruta)) diferencias.push(`FALTA ${ruta} = ${JSON.stringify(valor)}`);
    else if (a.valores.get(ruta) !== valor)
      diferencias.push(
        `DISTINTO ${ruta}: nuestro ${JSON.stringify(a.valores.get(ruta))} greenter ${JSON.stringify(valor)}`,
      );
  }
  for (const [ruta, valor] of a.valores) {
    if (!b.valores.has(ruta)) diferencias.push(`SOBRA ${ruta} = ${JSON.stringify(valor)}`);
  }
  for (const [ruta, orden] of b.ordenes) {
    const nuestroOrden = a.ordenes.get(ruta);
    if (nuestroOrden && nuestroOrden.join() !== orden.join()) {
      diferencias.push(`ORDEN ${ruta}: nuestro [${nuestroOrden.join(', ')}] greenter [${orden.join(', ')}]`);
    }
  }
  return diferencias;
}
