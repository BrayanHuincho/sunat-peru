import type { CredencialesSol } from '../tipos.js';

const SOAP_ENV = 'http://schemas.xmlsoap.org/soap/envelope/';
const SERVICIO = 'http://service.sunat.gob.pe';
const WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const PASSWORD_TEXT = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText';

export function usuarioSoap(credenciales: CredencialesSol): string {
  return `${credenciales.ruc}${credenciales.usuario}`;
}

export function construirSobre(credenciales: CredencialesSol, nombreZip: string, zip: Uint8Array): string {
  const usuario = escaparXml(usuarioSoap(credenciales));
  const clave = escaparXml(credenciales.clave);
  const contenido = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength).toString('base64');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="${SOAP_ENV}" xmlns:ns1="${SERVICIO}" xmlns:ns2="${WSSE}">` +
    '<SOAP-ENV:Header><ns2:Security><ns2:UsernameToken>' +
    `<ns2:Username>${usuario}</ns2:Username>` +
    `<ns2:Password Type="${PASSWORD_TEXT}">${clave}</ns2:Password>` +
    '</ns2:UsernameToken></ns2:Security></SOAP-ENV:Header>' +
    '<SOAP-ENV:Body><ns1:sendBill>' +
    `<fileName>${escaparXml(nombreZip)}</fileName>` +
    `<contentFile>${contenido}</contentFile>` +
    '</ns1:sendBill></SOAP-ENV:Body></SOAP-ENV:Envelope>'
  );
}

function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
