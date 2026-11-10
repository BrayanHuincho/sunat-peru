import { describe, expect, it } from 'vitest';
import { compararXml } from './normalizar.js';

const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const DS = 'http://www.w3.org/2000/09/xmldsig#';

const envolver = (cuerpo: string, prefijo = 'cbc') =>
  `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:${prefijo}="${CBC}" xmlns:ds="${DS}">${cuerpo}</Invoice>`;

describe('compararXml', () => {
  it('ignora prefijos, espacios, cdata y ceros de importes', () => {
    const a = envolver('<x:Name>  HOLA   MUNDO </x:Name><x:Amount currencyID="PEN">10.50</x:Amount>', 'x');
    const b = envolver('<cbc:Name><![CDATA[HOLA MUNDO]]></cbc:Name><cbc:Amount currencyID="PEN">10.5000</cbc:Amount>');
    expect(compararXml(a, b)).toEqual([]);
  });

  it('no trata como numero un identificador con ceros', () => {
    expect(compararXml(envolver('<cbc:ID>0001</cbc:ID>'), envolver('<cbc:ID>1</cbc:ID>'))).toHaveLength(1);
  });

  it('detecta valores distintos, atributos, faltantes, sobrantes y orden', () => {
    const referencia = envolver('<cbc:A>1</cbc:A><cbc:B listID="x">2</cbc:B>');
    expect(compararXml(envolver('<cbc:A>9</cbc:A><cbc:B listID="x">2</cbc:B>'), referencia)[0]).toContain('DISTINTO');
    expect(compararXml(envolver('<cbc:A>1</cbc:A><cbc:B listID="y">2</cbc:B>'), referencia)[0]).toContain('@listID');
    expect(compararXml(envolver('<cbc:A>1</cbc:A>'), referencia)[0]).toContain('FALTA');
    expect(
      compararXml(envolver('<cbc:A>1</cbc:A><cbc:B listID="x">2</cbc:B><cbc:C>3</cbc:C>'), referencia)[0],
    ).toContain('SOBRA');
    expect(compararXml(envolver('<cbc:B listID="x">2</cbc:B><cbc:A>1</cbc:A>'), referencia).join()).toContain('ORDEN');
  });

  it('solo enmascara los valores propios de la firma', () => {
    const conFirma = (valor: string, metodo: string) =>
      envolver(`<ds:DigestValue>${valor}</ds:DigestValue><ds:SignatureMethod Algorithm="${metodo}"/>`);
    expect(compararXml(conFirma('aaa', 'rsa'), conFirma('bbb', 'rsa'))).toEqual([]);
    expect(compararXml(conFirma('aaa', 'rsa'), conFirma('aaa', 'sha1'))).toHaveLength(1);
  });
});
