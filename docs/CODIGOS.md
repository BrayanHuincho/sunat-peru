# Códigos frecuentes de SUNAT

Una guía rápida con los códigos que más aparecen al emitir. Las descripciones están resumidas. La fuente oficial es el catálogo de errores que publica SUNAT, y es la que manda si algo aquí no coincide o el texto cambió.

## Cómo los clasifica la librería

| Código                                   | Clasificación | `estado`    | `reintentable` |
| ---------------------------------------- | ------------- | ----------- | -------------- |
| `0`                                      | aceptado      | `aceptado`  | no             |
| `4000` o mayor                           | observado     | `observado` | no             |
| `2000` a `3999`                          | rechazado     | `rechazado` | no             |
| `0100`, `0109`, `0130-0138`, `0200-0204` | transitorio   | `error`     | sí             |
| `0101-0106`, `0110-0114`                 | credenciales  | `error`     | no             |
| `1033`                                   | duplicado     | `error`     | no             |
| cualquier otro                           | desconocido   | `error`     | no             |

Los fallos de red no traen código de SUNAT. Llegan con `estado: 'error'` y `reintentable` según el caso.

## Disponibilidad de SUNAT

| Código          | Qué pasó                                        | Qué hacer             |
| --------------- | ----------------------------------------------- | --------------------- |
| `0100`          | El servicio no pudo responder                   | Reintentar con espera |
| `0109`          | El servicio de autenticación no está disponible | Reintentar con espera |
| `0130` a `0138` | Falla interna al procesar o guardar el envío    | Reintentar con espera |
| `0200` a `0204` | Falla interna del proceso batch                 | Reintentar con espera |

## Credenciales y permisos

| Código | Qué pasó                                            | Qué hacer                            |
| ------ | --------------------------------------------------- | ------------------------------------ |
| `0102` | Usuario o contraseña incorrectos                    | Revisar RUC, usuario SOL y clave     |
| `0103` | El usuario no existe                                | Revisar el usuario secundario en SOL |
| `0104` | La clave es incorrecta                              | Revisar o restablecer la clave       |
| `0105` | El usuario no está activo                           | Activarlo en SOL                     |
| `0111` | El usuario no tiene perfil para enviar comprobantes | Darle el perfil de emisión en SOL    |

## Archivo enviado

La librería arma el nombre y el ZIP, así que estos no deberían salir en uso normal. Si aparecen, puede ser un error de la librería o un RUC que no corresponde.

| Código | Qué pasó                                         |
| ------ | ------------------------------------------------ |
| `0151` | Nombre del ZIP incorrecto                        |
| `0154` | El RUC del archivo no corresponde al del usuario |
| `0155` | ZIP vacío                                        |
| `0156` | ZIP corrupto                                     |
| `0159` | Nombre del XML incorrecto                        |
| `0160` | XML vacío                                        |
| `0161` | El nombre del XML no coincide con el del ZIP     |

## Comprobante

| Código | Qué pasó                                   | Qué hacer                                                                  |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------- |
| `1033` | El comprobante ya fue registrado           | No reemitir con otro número. Verificarlo en la consulta de SUNAT           |
| `2335` | El XML fue alterado después de firmarlo    | Revisar que el certificado sea del RUC emisor y que nadie modifique el XML |
| `2800` | Tipo de documento del cliente no permitido | Revisar el tipo de documento según el comprobante                          |

Un comprobante rechazado no tiene validez. Corrige el dato y emítelo de nuevo con otro correlativo, conservando la constancia del rechazo.

Los códigos `4000` en adelante son observaciones: el comprobante es válido, pero conviene corregir la causa en los siguientes. El detalle viene en `notas`.
