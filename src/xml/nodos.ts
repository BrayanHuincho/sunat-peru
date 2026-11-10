type Atributos = Record<string, string>;
type Hijo = string | false | null | undefined;

const NO_VALIDOS_EN_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;

const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

export function escapar(valor: string): string {
  return valor.replace(NO_VALIDOS_EN_XML, '').replace(/[&<>"']/g, (c) => ENTIDADES[c] ?? c);
}

export function cdata(valor: string): string {
  // un "]]>" dentro del texto cerraría la sección antes de tiempo, hay que partirla
  const seguro = valor.replace(NO_VALIDOS_EN_XML, '').replaceAll(']]>', ']]]]><![CDATA[>');
  return `<![CDATA[${seguro}]]>`;
}

function atributosXml(atributos: Atributos): string {
  return Object.entries(atributos)
    .map(([nombre, valor]) => ` ${nombre}="${escapar(valor)}"`)
    .join('');
}

export function hoja(nombre: string, valor: string, atributos: Atributos = {}): string {
  return `<${nombre}${atributosXml(atributos)}>${escapar(valor)}</${nombre}>`;
}

export function hojaCdata(nombre: string, valor: string, atributos: Atributos = {}): string {
  return `<${nombre}${atributosXml(atributos)}>${cdata(valor)}</${nombre}>`;
}

export function nodo(nombre: string, ...hijos: Hijo[]): string {
  return `<${nombre}>${hijos.filter(Boolean).join('')}</${nombre}>`;
}
