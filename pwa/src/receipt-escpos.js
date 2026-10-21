// ============================================================
// Monay Market POS — Boleta en comandos ESC/POS
//
// Arma la misma boleta que se ve en pantalla (showReceipt en app.js),
// lista para enviarla directo a una impresora térmica. El timbre SII
// (PDF417) se imprime como imagen raster: casi todas las térmicas
// imprimen imágenes, pocas generan PDF417 por sí mismas de forma fiable.
//
// Funciones puras: no tocan el DOM ni Bluetooth (fáciles de probar).
// ============================================================

var ESC = 0x1b;
var GS = 0x1d;
var FS = 0x1c;
var LF = 0x0a;

/** Ancho de impresión por tamaño de papel (fuente A estándar, 8 puntos/mm). */
export var PAPER = {
  58: { chars: 32, dots: 384 },
  80: { chars: 48, dots: 576 },
};

/** Filas por bloque de imagen: imágenes grandes en un solo comando saturan el buffer de impresoras baratas. */
var RASTER_BAND_ROWS = 64;

// Las térmicas usan páginas de códigos de 8 bits, no UTF-8. Se selecciona PC850
// (latín: tildes y ñ) y se traducen esos caracteres; el resto pierde la tilde.
var PC850 = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8, 'º': 0xa7, 'ª': 0xa6,
};

export function encodeText(str) {
  var out = [];
  var s = String(str == null ? '' : str);
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    var code = s.charCodeAt(i);
    if (code >= 32 && code < 127) out.push(code);
    else if (PC850[ch] != null) out.push(PC850[ch]);
    else {
      // Quita la tilde (ç → c); si aún no es ASCII imprimible, '?'
      var base = ch.normalize('NFD').charAt(0);
      var baseCode = base.charCodeAt(0);
      out.push(baseCode >= 32 && baseCode < 127 ? baseCode : 0x3f);
    }
  }
  return out;
}

/** "TOTAL" ............ "$3.000" en una línea del ancho dado. */
export function padColumns(left, right, width) {
  left = String(left);
  right = String(right);
  var space = width - left.length - right.length;
  if (space < 1) {
    // No cabe: se recorta la parte izquierda para no partir el monto
    left = left.slice(0, Math.max(0, width - right.length - 1));
    space = 1;
  }
  return left + new Array(space + 1).join(' ') + right;
}

/** Corta un texto en líneas de hasta `width` caracteres, respetando palabras. */
export function wrapText(text, width) {
  var words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
  var lines = [];
  var current = '';
  words.forEach(function (word) {
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!word) return;
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ' ' + word;
    else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Convierte una imagen (ImageData o equivalente {width, height, data RGBA}) a
 * mapa de bits de 1 bit por punto, centrado en `targetDots` de ancho.
 */
export function toMonochrome(image, targetDots) {
  var width = Math.min(image.width, targetDots);
  var offset = Math.max(0, Math.floor((targetDots - width) / 2));
  var bytesPerRow = Math.ceil(targetDots / 8);
  var bits = new Uint8Array(bytesPerRow * image.height);
  for (var y = 0; y < image.height; y++) {
    for (var x = 0; x < width; x++) {
      var i = (y * image.width + x) * 4;
      var alpha = image.data[i + 3];
      // Luminancia; lo transparente se considera blanco
      var lum = alpha < 128 ? 255 : 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      if (lum < 128) {
        var px = x + offset;
        bits[y * bytesPerRow + (px >> 3)] |= 0x80 >> (px & 7);
      }
    }
  }
  return { bytesPerRow: bytesPerRow, height: image.height, bits: bits };
}

/** Escala una imagen RGBA por vecino más cercano (sin suavizado: los módulos quedan nítidos). */
export function scaleNearest(image, factor) {
  var width = Math.max(1, Math.round(image.width * factor));
  var height = Math.max(1, Math.round(image.height * factor));
  var data = new Uint8ClampedArray(width * height * 4);
  for (var y = 0; y < height; y++) {
    var sy = Math.min(image.height - 1, Math.floor(y / factor));
    for (var x = 0; x < width; x++) {
      var sx = Math.min(image.width - 1, Math.floor(x / factor));
      var src = (sy * image.width + sx) * 4;
      var dst = (y * width + x) * 4;
      data[dst] = image.data[src];
      data[dst + 1] = image.data[src + 1];
      data[dst + 2] = image.data[src + 2];
      data[dst + 3] = image.data[src + 3];
    }
  }
  return { width: width, height: height, data: data };
}

/** Puntos por módulo máximos (2 = 0,25 mm): más grande no mejora la lectura, alarga el ticket y
 *  duplica los datos a enviar por Bluetooth (más lento). */
var MAX_MODULE_DOTS = 2;

/**
 * Elige el PDF417 más legible que cabe en `maxDots` de ancho y lo deja listo para imprimir.
 * @param render  render(columns) → imagen RGBA con 1 punto por módulo (lanza error si los
 *                datos no caben en esas columnas)
 *
 * Menos columnas = código más angosto = módulos más grandes. Se busca la menor cantidad de
 * columnas que admite el timbre; si el tamaño resultante es ≥ 2 se redondea a entero
 * (más nítido), si no se usa el tamaño fraccionario (como al imprimir desde el navegador).
 */
export function fitPdf417(render, maxDots) {
  var best = null;
  for (var columns = 1; columns <= 30; columns++) {
    var image;
    try {
      image = render(columns);
    } catch (e) {
      if (best) break;
      continue; // aún no caben los datos: probar con más columnas
    }
    var raw = Math.min(MAX_MODULE_DOTS, maxDots / image.width);
    var dots = raw >= 2 ? Math.floor(raw) : Math.floor(raw * 100) / 100;
    if (best && dots < best.dots) break; // más columnas solo achican el módulo
    // A igual tamaño de módulo, más columnas da un código más corto
    best = { image: image, dots: dots, columns: columns };
  }
  if (!best || best.dots < 1) throw new Error('El timbre no cabe en el ancho del papel');
  return { image: scaleNearest(best.image, best.dots), moduleDots: best.dots, columns: best.columns };
}

/** Comandos GS v 0 (imagen raster) en bloques de filas. */
export function rasterCommands(mono) {
  var out = [];
  for (var y = 0; y < mono.height; y += RASTER_BAND_ROWS) {
    var rows = Math.min(RASTER_BAND_ROWS, mono.height - y);
    out.push(GS, 0x76, 0x30, 0x00, mono.bytesPerRow & 0xff, mono.bytesPerRow >> 8, rows & 0xff, rows >> 8);
    var start = y * mono.bytesPerRow;
    var end = start + rows * mono.bytesPerRow;
    for (var i = start; i < end; i++) out.push(mono.bits[i]);
  }
  return out;
}

/**
 * Bytes de la boleta completa.
 * @param receipt  datos ya formateados (montos, fechas) — ver mapReceiptForThermalPrinter en app.js
 * @param options  { paper: 58 | 80, timbre: resultado de toMonochrome o null }
 */
export function buildReceipt(receipt, options) {
  options = options || {};
  var paper = PAPER[options.paper] || PAPER[58];
  var width = paper.chars;
  var bytes = [];

  function push() {
    for (var i = 0; i < arguments.length; i++) bytes.push(arguments[i]);
  }
  function append(list) {
    for (var i = 0; i < list.length; i++) bytes.push(list[i]);
  }
  function line(str) {
    append(encodeText(str));
    push(LF);
  }
  function align(mode) {
    push(ESC, 0x61, mode); // 0 izquierda, 1 centro
  }
  function bold(on) {
    push(ESC, 0x45, on ? 1 : 0);
  }
  function size(double) {
    push(GS, 0x21, double ? 0x11 : 0x00); // doble alto y ancho
  }
  function divider() {
    line(new Array(width + 1).join('-'));
  }

  push(ESC, 0x40); // reiniciar impresora
  push(FS, 0x2e); // salir del modo de caracteres chinos (muchas térmicas lo traen activo)
  push(ESC, 0x74, 0x02); // página de códigos PC850

  // Encabezado
  align(1);
  bold(true);
  size(true);
  line('Monay Market');
  size(false);
  line('BOLETA ELECTRONICA');
  bold(false);
  if (receipt.boleta_folio) line('NUMERO: ' + receipt.boleta_folio);
  if (receipt.store_name && String(receipt.store_name).toUpperCase() !== 'MONAY MARKET') {
    wrapText(receipt.store_name, width).forEach(line);
  }
  if (receipt.store_rut) line('R.U.T.: ' + receipt.store_rut);
  if (receipt.store_giro) wrapText('GIRO: ' + receipt.store_giro, width).forEach(line);
  if (receipt.store_address) wrapText(receipt.store_address, width).forEach(line);
  line('S.I.I. - CHILE');

  // Detalle
  align(0);
  divider();
  line(padColumns('EMISION', receipt.emitted_at_label || '', width));
  bold(true);
  line('DETALLE');
  bold(false);
  (receipt.items || []).forEach(function (item) {
    var amount = item.subtotal_label || '';
    var nameLines = wrapText(item.name, width - amount.length - 1);
    line(padColumns(nameLines[0], amount, width));
    nameLines.slice(1).forEach(line);
    line('  ' + item.quantity_label + ' x ' + item.unit_price_label);
  });
  divider();

  // Totales
  bold(true);
  push(GS, 0x21, 0x01); // doble alto: se lee de lejos sin achicar el ancho
  line(padColumns('TOTAL', receipt.total_label || '', width));
  size(false);
  bold(false);
  wrapText('El IVA incluido en esta boleta es de: ' + (receipt.iva_label || ''), width).forEach(line);

  // Timbre electrónico
  if (receipt.boleta_folio) {
    push(LF);
    align(1);
    if (options.timbre) {
      append(rasterCommands(options.timbre));
    } else {
      line('Timbre electronico no recibido');
    }
    line('Timbre Electronico SII');
    line('Res. 99 de 2014');
    line('Verifique documento en sii.cl');
    align(0);
  }

  push(ESC, 0x64, 4); // avanzar papel para cortar con la mano o la cuchilla
  push(GS, 0x56, 0x42, 0x00); // corte parcial (se ignora si la impresora no tiene cuchilla)
  return new Uint8Array(bytes);
}

/** Ticket corto para comprobar la vinculación. */
export function buildTestTicket(options) {
  var paper = PAPER[(options || {}).paper] || PAPER[58];
  var bytes = [ESC, 0x40, FS, 0x2e, ESC, 0x74, 0x02, ESC, 0x61, 0x01, ESC, 0x45, 1];
  bytes = bytes.concat(encodeText('Monay Market POS'), [LF, ESC, 0x45, 0]);
  bytes = bytes.concat(encodeText('Impresora vinculada'), [LF]);
  bytes = bytes.concat(encodeText('Papel ' + (options && options.paper === 80 ? '80' : '58') + ' mm - ' + paper.chars + ' caracteres'), [LF]);
  bytes = bytes.concat(encodeText(new Array(paper.chars + 1).join('-')), [LF, ESC, 0x64, 3, GS, 0x56, 0x42, 0x00]);
  return new Uint8Array(bytes);
}
