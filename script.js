/* ============================================================
Cerca de ti · script.js
· Cuentas de vendedor (registro / entrada / salida)
· Perfil editable: negocio, descripción, dirección, foto/emoji
· Publicación de productos con carrusel de hasta 6 fotos
· Vitrina dinámica en la portada, enlazada a cada perfil
Todo guardado en Supabase (Auth + Postgres + Storage).
============================================================ */
(() => {
'use strict';

/* 👉 Tus claves (Supabase → Settings → API) */
const SUPABASE_URL = 'https://nbnsgovzdzknrwbdldtl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bfNRZKhfM-deggZHlLALUQ_dWlcGk20';
const ADMIN_EMAIL = 'info.vitrinasanmarcos@gmail.com';
const ADMIN_PASSWORD = 'admin2026';
const ADMIN_WHATSAPP = '51940771593';
const CONTACTO_WHATSAPP = ADMIN_WHATSAPP;
const PLANES_DESTACADO = {
  '7': { dias: 7, precio: 10 },
  '15': { dias: 15, precio: 18 },
  '30': { dias: 30, precio: 30 }
};
const LOCAL_APP_KEY = 'de_nuestra_tierra_state_v1';
const VERSION_PROMOCIONES_DEMO = 3;
const BUSQUEDAS_POPULARES_KEY = 'cerca_de_ti_busquedas_v1';
const INTERACCIONES_PRODUCTO_KEY = 'cerca_de_ti_interacciones_v1';
const PESO_CONTACTO_WHATSAPP = 10;
const VERSION_CATALOGO_DEMO = 5;
const IDS_DEMO = new Set(['v-1', 'v-2', 'v-3']);
const esDatoDemo = dato => {
  const id = dato?.id;
  if (!id || typeof id !== 'string') return false;
  return id.startsWith('demo-') || IDS_DEMO.has(id) || ['p-1', 'p-2', 'p-3', 'p-4'].includes(id);
};

/* ---------- Utilidades ---------- */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const normalizar = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const palabrasBusqueda = texto => normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
function distanciaEdicion(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let anteriorAnterior = null;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
        anterior[j] + 1,
        actual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        actual[j] = Math.min(actual[j], anteriorAnterior[j - 2] + 1);
      }
    }
    anteriorAnterior = anterior;
    anterior = actual;
  }
  return anterior[b.length];
}
function coincideBusqueda(termino, palabras) {
  const maxErrores = termino.length >= 8 ? 2 : termino.length >= 4 ? 1 : 0;
  return palabras.some(palabra =>
    palabra.includes(termino) ||
    (maxErrores > 0 && distanciaEdicion(termino, palabra) <= maxErrores)
  );
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const urlImagen = valor => {
  if (!valor) return '';
  if (/^(blob:|data:image\/(?:jpeg|png|webp|gif);)/i.test(valor)) return valor;
  try {
    const url = new URL(valor, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};
const soloDigitos = s => (s || '').replace(/\D/g, '');
$('#p-codigo-pais').innerHTML = $('#c-codigo-pais').innerHTML;
function separarCodigoPais(whatsapp) {
  const numero = soloDigitos(whatsapp);
  const opciones = [...$('#p-codigo-pais').options]
    .map(opcion => opcion.value)
    .sort((a, b) => b.length - a.length);
  const codigo = opciones.find(prefijo => numero.startsWith(prefijo) && numero.length > prefijo.length);
  $('#p-codigo-pais').value = codigo || '51';
  return codigo ? numero.slice(codigo.length) : numero;
}
const fmtPrecio = n => (+n).toFixed(2).replace(/\.00$/, '');
const categoriaFiltro = categoria => {
  const clave = categoriaClase(categoria);
  return {
    'panaderia-y-reposteria': 'panaderia',
    'textiles-y-ropa': 'textiles',
    'belleza-y-cuidado': 'belleza'
  }[clave] || clave;
};
const fechaCorta = fecha => new Date(fecha).toLocaleDateString('es-PE');
const destacadoVigente = p => Boolean(p.destacado && (!p.destacado_hasta || new Date(p.destacado_hasta) > new Date()));
const fechaParaCampo = fecha => {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const pad = valor => String(valor).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const categoriaClase = categoria => normalizar(categoria || 'otro').replace(/[^a-z0-9]+/g, '-');
const etiquetasProducto = producto => Array.isArray(producto?.tags)
  ? producto.tags.filter(Boolean).map(String).slice(0, 5)
  : [];
function descuentoVigente(producto) {
  const porcentaje = Number(producto?.descuento_porcentaje) || 0;
  if (!Number.isInteger(porcentaje) || porcentaje < 1 || porcentaje > 90) return false;
  if (!producto.descuento_hasta) return true;
  const vence = new Date(producto.descuento_hasta).getTime();
  return Number.isFinite(vence) && vence > Date.now();
}
function precioConDescuento(producto) {
  const precio = Number(producto?.precio) || 0;
  return descuentoVigente(producto)
    ? Number((precio * (1 - Number(producto.descuento_porcentaje) / 100)).toFixed(2))
    : precio;
}
function vistaPrecioProducto(producto, clase = 'producto-precio') {
  if (!descuentoVigente(producto)) return `<span class="${clase}">S/ ${fmtPrecio(producto.precio)}</span>`;
  return `<span class="${clase} precio-oferta"><del>S/ ${fmtPrecio(producto.precio)}</del><strong>S/ ${fmtPrecio(precioConDescuento(producto))}</strong></span>`;
}
function guardarProductoLocal(producto) {
  const state = readLocalState();
  state.productos = [...state.productos.filter(item => item.id !== producto.id), { ...producto }];
  writeLocalState(state);
}
function leerContadoresLocales(clave) {
  const guardado = localStorage.getItem(clave);
  if (!guardado) return {};
  try {
    const contadores = JSON.parse(guardado);
    return contadores && typeof contadores === 'object' && !Array.isArray(contadores) ? contadores : {};
  } catch (error) {
    console.warn(`No se pudieron leer los contadores locales de ${clave}:`, error);
    return {};
  }
}
function registrarBusquedaPopular(texto) {
  const consulta = texto.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (consulta.length < 2) return;
  const clave = normalizar(consulta);
  const busquedas = leerContadoresLocales(BUSQUEDAS_POPULARES_KEY);
  busquedas[clave] = { texto: consulta, cantidad: Math.min(1000000, (Number(busquedas[clave]?.cantidad) || 0) + 1) };
  const masBuscadas = Object.entries(busquedas)
    .sort(([, a], [, b]) => Number(b.cantidad) - Number(a.cantidad))
    .slice(0, 20);
  localStorage.setItem(BUSQUEDAS_POPULARES_KEY, JSON.stringify(Object.fromEntries(masBuscadas)));
pintarBusquedasPopulares();
}
function registrarInteraccionProducto(id, tipo) {
  if (esDatoDemo({ id })) return;
  const interacciones = leerContadoresLocales(INTERACCIONES_PRODUCTO_KEY);
  const registro = interacciones[id] || { detalle: 0, whatsapp: 0 };
  registro[tipo] = Math.min(1000000, (Number(registro[tipo]) || 0) + 1);
  interacciones[id] = registro;
  localStorage.setItem(INTERACCIONES_PRODUCTO_KEY, JSON.stringify(interacciones));
}
function puntuacionInteraccionProducto(producto, interacciones) {
  const registro = interacciones[producto.id] || {};
  return (Number(registro.detalle) || 0) + PESO_CONTACTO_WHATSAPP * (Number(registro.whatsapp) || 0);
}
function pintarBusquedasPopulares() {
  const busquedas = Object.values(leerContadoresLocales(BUSQUEDAS_POPULARES_KEY))
    .filter(busqueda => busqueda && typeof busqueda.texto === 'string' && Number(busqueda.cantidad) > 0)
    .sort((a, b) => Number(b.cantidad) - Number(a.cantidad))
    .slice(0, 3);
  const sugerencias = busquedas.length
    ? busquedas.map(busqueda => busqueda.texto)
    : ['queso fresco', 'pan de hogar', 'miel'];
  $('#busquedas-populares').innerHTML = sugerencias
    .map(consulta => `<button type="button" data-busqueda-popular="${esc(consulta)}">${esc(consulta)}</button>`)
    .join('');
}
async function guardarDestacado(tabla, id, destacado, hasta) {
  if (esDatoDemo({ id })) {
    const state = readLocalState();
    const registro = tabla === 'vendedores'
      ? state.vendedores[id]
      : state.productos.find(producto => producto.id === id);
    if (!registro) throw new Error('El elemento de demostración ya no existe.');
    registro.destacado = destacado;
    registro.destacado_hasta = hasta;
    writeLocalState(state);
    return;
  }
  const completo = await db.from(tabla).update({ destacado, destacado_hasta: hasta }).eq('id', id);
  if (completo.error) throw completo.error;
  const verificado = await db.from(tabla).select('id, destacado, destacado_hasta').eq('id', id).maybeSingle();
  if (verificado.error) throw verificado.error;
  if (!verificado.data || Boolean(verificado.data.destacado) !== Boolean(destacado)) {
    throw new Error('El destacado no pudo guardarse. Verifica los permisos de Supabase.');
  }
  if (hasta && (!verificado.data.destacado_hasta || new Date(verificado.data.destacado_hasta).getTime() !== new Date(hasta).getTime())) {
    throw new Error('La fecha guardada no coincide con la fecha seleccionada.');
  }
}

async function actualizarRegistroAdmin(tabla, id, cambios) {
  if (esDatoDemo({ id })) {
    const state = readLocalState();
    const registro = tabla === 'vendedores'
      ? state.vendedores[id]
      : state.productos.find(producto => producto.id === id);
    if (!registro) throw new Error('El elemento de demostración ya no existe.');
    Object.assign(registro, cambios);
    writeLocalState(state);
    return { ...registro };
  }
  const actualizado = await db.from(tabla).update(cambios).eq('id', id);
  if (actualizado.error) throw actualizado.error;
  const verificado = await db.from(tabla).select('*').eq('id', id).maybeSingle();
  if (verificado.error) throw verificado.error;
  if (!verificado.data || Object.entries(cambios).some(([campo, valor]) => {
    const actual = verificado.data[campo];
    if (typeof valor === 'number') return Number(actual) !== valor;
    return JSON.stringify(actual) !== JSON.stringify(valor);
  })) {
    throw new Error('No se guardaron todos los cambios. Verifica los permisos y la conexión.');
  }
  return verificado.data;
}

const DIAS_MAX_DESTACADO = 365;
const MILISEGUNDOS_DIA = 24 * 60 * 60 * 1000;
const vencimientoDestacado = dias => new Date(Date.now() + dias * MILISEGUNDOS_DIA);
const textoVencimiento = dias => vencimientoDestacado(dias).toLocaleString('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short'
});
const diasRestantesDestacado = item => {
  const vencimiento = item.destacado_hasta ? new Date(item.destacado_hasta).getTime() : NaN;
  const restante = vencimiento - Date.now();
  return Number.isFinite(vencimiento) && restante > 0
    ? Math.min(DIAS_MAX_DESTACADO, Math.max(1, Math.ceil(restante / MILISEGUNDOS_DIA)))
    : 30;
};
function controlesDestacado(tipo, item) {
  const activo = destacadoVigente(item);
  const identificador = tipo === 'tienda' ? 'tienda' : 'producto';
  const id = esc(item.id);
  const dias = Math.min(DIAS_MAX_DESTACADO, diasRestantesDestacado(item));
  const tieneVencimiento = activo && Boolean(item.destacado_hasta);
  const vencimiento = tieneVencimiento
    ? new Date(item.destacado_hasta)
    : vencimientoDestacado(dias);
  return `<div class="admin-destacado ${activo ? 'admin-destacado--activo' : 'admin-destacado--inactivo'}">
    <span class="admin-destacado-estado">${activo ? '★ Destacado activo' : 'Sin destacar'}</span>
    <label for="dias-${identificador}-${id}">Duración (días)
      <input id="dias-${identificador}-${id}" type="number" min="1" max="${DIAS_MAX_DESTACADO}" step="1" value="${dias}" aria-label="Duración del destacado en días" data-dias-destacado="${identificador}" data-id="${id}">
    </label>
    <small>${tieneVencimiento ? 'Vence:' : 'Finaliza al activar:'} <time datetime="${vencimiento.toISOString()}" data-vencimiento-destacado="${identificador}" data-id="${id}">${esc(vencimiento.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }))}</time></small>
    <div class="admin-actions">
      <button type="button" class="boton-destacar" data-activar-destacado="${identificador}" data-id="${id}">${activo ? 'Renovar' : 'Destacar ahora'}</button>
      ${activo ? `<button type="button" class="boton-peligro" data-quitar-destacado="${identificador}" data-id="${id}">Quitar destacado</button>` : ''}
    </div>
  </div>`;
}

function opcionesCategoriaAdmin(categoria) {
  return CATEGORIAS_DEMO.map(opcion => `<option value="${esc(opcion)}"${opcion === categoria ? ' selected' : ''}>${esc(opcion)}</option>`).join('');
}

async function eliminarRegistros(tabla, filtros = []) {
  let consulta = db.from(tabla).delete();
  filtros.forEach(([campo, valor]) => { consulta = consulta.eq(campo, valor); });
  const resultado = await consulta;
  if (resultado.error) throw resultado.error;
}
async function eliminarRegistro(tabla, id, filtros = []) {
  if (esDatoDemo({ id })) {
    const state = readLocalState();
    if (tabla === 'productos') state.productos = state.productos.filter(producto => producto.id !== id);
    if (tabla === 'vendedores') delete state.vendedores[id];
    if (tabla === 'promociones') state.promociones = state.promociones.filter(promocion => promocion.id !== id);
    writeLocalState(state);
    return;
  }
  await eliminarRegistros(tabla, [['id', id], ...filtros]);
  const verificado = await db.from(tabla).select('id').eq('id', id).maybeSingle();
  if (verificado.error) throw verificado.error;
  if (verificado.data) throw new Error('El registro sigue publicado. Verifica los permisos y vuelve a intentarlo.');
}

async function eliminarTienda(id) {
  const idsProductos = productos.filter(producto => producto.vendedor_id === id).map(producto => producto.id);
  if (!usaSupabase || esDatoDemo({ id })) {
    const state = readLocalState();
    state.productos = state.productos.filter(producto => producto.vendedor_id !== id);
    delete state.vendedores[id];
    writeLocalState(state);
    return idsProductos;
  }
  await eliminarRegistro('vendedores', id);
  return idsProductos;
}
async function eliminarFotosProductos(registros) {
  const rutas = [...new Set(registros.flatMap(producto => {
    const fotos = Array.isArray(producto.fotos) ? producto.fotos : [];
    return fotos.map(foto => {
      const marcador = '/fotos/';
      const indice = String(foto).indexOf(marcador);
      if (indice < 0) return '';
      try {
        return decodeURIComponent(String(foto).slice(indice + marcador.length));
      } catch {
        return '';
      }
    }).filter(Boolean);
  }))];
  if (!rutas.length) return;
  const { error } = await db.storage.from('fotos').remove(rutas);
  if (error) throw new Error(`La publicación ya se eliminó, pero no se pudieron retirar sus fotos: ${error.message}`);
}
async function leerTablaCompleta(tabla, ordenes = []) {
  const limitePagina = 500;
  const registros = [];
  for (let desde = 0; ; desde += limitePagina) {
    let consulta = db.from(tabla).select('*');
    ordenes.forEach(([campo, ascending]) => { consulta = consulta.order(campo, { ascending }); });
    const { data, error } = await consulta.range(desde, desde + limitePagina - 1);
    if (error) throw error;
    registros.push(...(data || []));
    if (!data || data.length < limitePagina) return registros;
  }
}
const espera = (fn, ms = 220) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

const defaultState = {
  productos: [],
  vendedores: {},
  promociones: [],
  reseñas: [],
  solicitudesDestacado: []
};

const CATEGORIAS_DEMO = [
  'Alimentos', 'Lácteos', 'Carnes', 'Frutas y verduras', 'Abarrotes', 'Bebidas',
  'Panadería y repostería', 'Agro', 'Plantas y semillas', 'Artesanía', 'Textiles y ropa',
  'Belleza y cuidado', 'Hogar', 'Salud', 'Ferretería', 'Construcción', 'Automotriz',
  'Servicios', 'Mascotas', 'Tecnología', 'Otro'
];

const NOMBRES_DEMO = {
  Alimentos: ['Humitas de choclo', 'Tamal cajamarquino', 'Cuy frito preparado', 'Choclo con queso', 'Mote pelado cocido', 'Caldo de gallina', 'Trucha frita', 'Patarashca de pescado', 'Papas con ají', 'Mazamorra de maíz'],
  'Lácteos': ['Queso mantecoso cajamarquino', 'Quesillo fresco', 'Queso fresco de vaca', 'Yogur natural', 'Leche fresca pasteurizada', 'Manjar blanco', 'Mantequilla artesanal', 'Cuajada de leche', 'Queso con hierbas', 'Yogur de fresa'],
  Carnes: ['Carne de res para guiso', 'Bistec de res', 'Costilla de cerdo', 'Chuleta de cerdo', 'Pollo entero fresco', 'Pechuga de pollo', 'Carne molida de res', 'Carne de cordero', 'Chorizo de cerdo', 'Cecina de res'],
  'Frutas y verduras': ['Papa amarilla', 'Choclo fresco', 'Tomate de huerto', 'Palta de temporada', 'Zanahoria fresca', 'Lechuga recién cosechada', 'Cebolla roja', 'Limón sutil', 'Plátano de seda', 'Rocoto fresco'],
  Abarrotes: ['Arroz extra', 'Azúcar rubia', 'Aceite vegetal', 'Lenteja seca', 'Frijol canario', 'Harina de trigo', 'Fideos tallarín', 'Sal yodada', 'Avena en hojuelas', 'Café molido de Cajamarca'],
  Bebidas: ['Chicha morada', 'Refresco de cebada', 'Jugo de granadilla', 'Limonada natural', 'Café pasado', 'Agua de hierbaluisa', 'Emoliente tradicional', 'Jugo de naranja', 'Bebida de maracuyá', 'Agua de mesa'],
  'Panadería y repostería': ['Pan de trigo', 'Pan de maíz', 'Pan de yema', 'Rosquitas cajamarquinas', 'Torta de chocolate', 'Queque de naranja', 'Empanada de queso', 'Bizcocho casero', 'Alfajores artesanales', 'Galletas de mantequilla'],
  Agro: ['Abono orgánico compostado', 'Fertilizante para papa', 'Semilla certificada de maíz', 'Semilla de pasto para ganado', 'Alimento balanceado para cuyes', 'Cal agrícola para cultivo', 'Sustrato para almácigos', 'Compost para chacra', 'Manguera para riego agrícola', 'Herramienta manual para cultivo'],
  'Plantas y semillas': ['Planta de hierbabuena', 'Planta de romero', 'Plantón de palta', 'Planta de sábila', 'Semillas de lechuga', 'Semillas de tomate', 'Semillas de culantro', 'Plantón de rocoto', 'Planta ornamental de geranio', 'Semillas de zapallo'],
  Artesanía: ['Canasta de carrizo', 'Olla de barro hecha a mano', 'Taza de cerámica artesanal', 'Tallado de madera decorativo', 'Jarrón de arcilla', 'Cesto tejido de mimbre', 'Máscara artesanal de madera', 'Adorno de piedra tallada', 'Portavelas de cerámica', 'Muñeca artesanal de tela'],
  'Textiles y ropa': ['Chompa de lana tejida', 'Poncho cajamarquino', 'Chalina de lana', 'Gorro tejido a mano', 'Manta de algodón', 'Medias de lana', 'Blusa bordada', 'Delantal de cocina', 'Bolso de tela', 'Ropa infantil de algodón'],
  'Belleza y cuidado': ['Jabón artesanal de avena', 'Champú de uso diario', 'Acondicionador para cabello', 'Crema humectante para manos', 'Protector solar', 'Bálsamo labial', 'Peine de madera', 'Aceite corporal', 'Esponja de baño', 'Kit de cuidado personal'],
  Hogar: ['Olla de cocina', 'Sartén antiadherente', 'Juego de platos', 'Vaso de vidrio', 'Escoba para el hogar', 'Balde plástico', 'Mantel de mesa', 'Cortina para ventana', 'Frazada de cama', 'Organizador de cocina'],
  Salud: ['Termómetro digital', 'Botiquín de primeros auxilios', 'Venda elástica', 'Gasas estériles', 'Mascarillas descartables', 'Alcohol antiséptico', 'Curitas adhesivas', 'Guantes descartables', 'Compresa fría reutilizable', 'Pastillero semanal'],
  Ferretería: ['Martillo de acero', 'Destornillador plano', 'Alicate universal', 'Llave inglesa ajustable', 'Taladro eléctrico', 'Cinta métrica de 5 metros', 'Juego de tornillos', 'Candado de seguridad', 'Serrucho para madera', 'Extensión eléctrica'],
  'Construcción': ['Bolsa de cemento', 'Ladrillo para muro', 'Bloque de concreto', 'Arena gruesa por metro', 'Piedra chancada', 'Varilla de acero', 'Ladrillo pastelero', 'Cal para construcción', 'Lámina de calamina', 'Cerámico para piso'],
  Automotriz: ['Aceite para motor', 'Filtro de aceite', 'Filtro de aire para auto', 'Batería para automóvil', 'Pastillas de freno', 'Bujía para motor', 'Refrigerante para radiador', 'Plumillas limpiaparabrisas', 'Cámara para motocicleta', 'Foco para faro de vehículo'],
  Servicios: ['Reparación de calzado', 'Corte de cabello', 'Servicio de costura', 'Reparación de electrodomésticos', 'Mantenimiento de motocicleta', 'Instalación de gasfitería', 'Servicio de jardinería', 'Pintura de vivienda', 'Transporte de carga local', 'Limpieza de hogar'],
  Mascotas: ['Alimento para perro adulto', 'Alimento para gato', 'Correa para perro', 'Collar para mascota', 'Cama para perro', 'Plato para alimento', 'Arena sanitaria para gato', 'Juguete para mascota', 'Cepillo para perro', 'Transportadora para gato'],
  Tecnología: ['Cargador USB-C', 'Cable USB-C', 'Audífonos con cable', 'Parlante Bluetooth', 'Mouse inalámbrico', 'Teclado USB', 'Memoria USB de 32 GB', 'Power bank portátil', 'Foco LED inteligente', 'Soporte para celular'],
  Otro: ['Canasta de regalo local', 'Tarjeta de felicitación', 'Papel de regalo', 'Llaveros variados', 'Calendario de pared', 'Vela decorativa', 'Bolsa reutilizable', 'Souvenir de San Marcos', 'Caja organizadora', 'Artículo de temporada']
};

const FOTOS_DEMO = {
  Alimentos: 'photo-1547592180-85f173990554',
  'Lácteos': 'photo-1550583724-b2692b85b150',
  Carnes: 'photo-1607623814075-e51df1bdc82f',
  'Frutas y verduras': 'photo-1542838132-92c53300491e',
  Abarrotes: 'photo-1586201375761-83865001e31c',
  Bebidas: 'photo-1544145945-f90425340c7e',
  'Panadería y repostería': 'photo-1509440159596-0249088772ff',
  Agro: 'photo-1500382017468-9049fed747ef',
  'Plantas y semillas': 'photo-1416879595882-3373a0480b5b',
  Artesanía: 'photo-1452860606245-08befc0ff44b',
  'Textiles y ropa': 'photo-1558618666-fcd25c85cd64',
  'Belleza y cuidado': 'photo-1608248543803-ba4f8c70ae0b',
  Hogar: 'photo-1555041469-a586c61ea9bc',
  Salud: 'photo-1603398938378-e54eab446dde',
  Ferretería: 'photo-1530124566582-a618bc2615dc',
  'Construcción': 'photo-1504307651254-35680f356dfd',
  Automotriz: 'photo-1486262715619-67b85e0b08d3',
  Servicios: 'photo-1521737711867-e3b97375f902',
  Mascotas: 'photo-1450778869180-41d0601e046e',
  Tecnología: 'photo-1518770660439-4636190af475',
  Otro: 'photo-1513519245088-0e12902e5a38'
};

const DESCRIPCIONES_DEMO = {
  Alimentos: 'Preparación de inspiración cajamarquina. Precio referencial por porción; consulta disponibilidad y recojo.',
  'Lácteos': 'Producto lácteo de muestra. Mantener refrigerado y confirmar presentación antes de coordinar el pedido.',
  Carnes: 'Corte de muestra vendido por peso. Consulta disponibilidad, conservación y presentación al vendedor.',
  'Frutas y verduras': 'Producto de temporada de muestra. El tamaño y el precio pueden variar según la cosecha.',
  Abarrotes: 'Producto básico de despensa en presentación referencial. Consulta el peso o contenido del empaque.',
  Bebidas: 'Bebida de muestra preparada o envasada. Consulta el tamaño de la presentación y su disponibilidad.',
  'Panadería y repostería': 'Horneado de muestra preparado para compartir. Consulta tamaño, sabores disponibles y horario de recojo.',
  Agro: 'Insumo de muestra para labores agrícolas. Verifica composición, presentación e indicaciones de uso.',
  'Plantas y semillas': 'Planta o semilla de muestra para huerto y jardín. Consulta temporada, cuidados y tamaño disponible.',
  Artesanía: 'Pieza de muestra elaborada a mano. Cada unidad puede tener variaciones de acabado y medidas.',
  'Textiles y ropa': 'Prenda o accesorio de muestra. Consulta tallas, medidas, material y colores disponibles.',
  'Belleza y cuidado': 'Artículo de cuidado personal de muestra. Revisa ingredientes, contenido y recomendaciones del fabricante.',
  Hogar: 'Artículo de muestra para uso cotidiano. Consulta medidas, material y disponibilidad antes de coordinar.',
  Salud: 'Artículo de botiquín de muestra. Verifica empaque, registro e indicaciones del fabricante antes de adquirirlo.',
  Ferretería: 'Herramienta o accesorio de muestra. Consulta medidas, material y compatibilidad con el trabajo que realizarás.',
  'Construcción': 'Material de construcción de muestra. Precio referencial; confirma unidad, cantidad y entrega.',
  Automotriz: 'Repuesto o accesorio de muestra. Confirma marca, modelo y compatibilidad con tu vehículo antes de comprar.',
  Servicios: 'Servicio de muestra disponible para coordinar en San Marcos. Consulta alcance, horario y cotización.',
  Mascotas: 'Producto de muestra para mascotas. Revisa talla, contenido y recomendaciones según el animal.',
  Tecnología: 'Accesorio tecnológico de muestra. Confirma modelo, conexión, compatibilidad y garantía.',
  Otro: 'Artículo de muestra de un emprendimiento local. Consulta detalles, medidas y disponibilidad.'
};

const PRECIOS_DEMO = {
  Alimentos: [7, 2], 'Lácteos': [5, 2], Carnes: [12, 4], 'Frutas y verduras': [2, 1.5],
  Abarrotes: [2.5, 2], Bebidas: [3, 1.5], 'Panadería y repostería': [1.5, 2],
  Agro: [8, 7], 'Plantas y semillas': [3, 4], Artesanía: [12, 8], 'Textiles y ropa': [15, 8],
  'Belleza y cuidado': [5, 4], Hogar: [4, 8], Salud: [2, 5], Ferretería: [3, 8],
  'Construcción': [4, 8], Automotriz: [8, 20], Servicios: [15, 10], Mascotas: [4, 8],
  Tecnología: [5, 12], Otro: [3, 6]
};

function generarCatalogoDemo() {
  const nombresVendedores = [
    'Sabores de San Marcos', 'Quesos Rosita', 'Carnicería La Granja', 'Frutas del Valle', 'Bodega Central',
    'Bebidas del Valle', 'La Espiga', 'Semillas y Campo', 'Jardín de la Casa', 'Casa de Artesanía',
    'Tejidos San Marcos', 'Cuidado Natural', 'Hogar y Más', 'Botiquín del Barrio', 'Ferretería Central',
    'Materiales San Marcos', 'Repuestos El Volante', 'Servicios del Barrio', 'Patitas Felices',
    'Tecnología Central', 'Regalos de Aquí'
  ];
  const vendedores = CATEGORIAS_DEMO.map((categoria, idx) => ({
    id: `demo-v-${idx + 1}`,
    negocio: nombresVendedores[idx],
    responsable: `Emprendedor ${idx + 1}`,
    whatsapp: `51987654${String(idx + 1).padStart(3, '0')}`,
    categoria,
    descripcion: `Ejemplos de ${categoria.toLowerCase()} para probar la vitrina.`,
    avatar_emoji: EMOJI_CAT[categoria] || '🏪',
    direccion: 'San Marcos, Cajamarca'
  }));

  const productos = [];
  const ofertasDemo = {
    'Lácteos': { porcentaje: 15, dias: 6 },
    'Frutas y verduras': { porcentaje: 20, dias: 3 },
    'Panadería y repostería': { porcentaje: 10, dias: 5 },
    'Artesanía': { porcentaje: 25, dias: 0 },
    'Bebidas': { porcentaje: 30, dias: 4 },
    'Plantas y semillas': { porcentaje: 12, dias: 7 }
  };
  CATEGORIAS_DEMO.forEach((categoria, idx) => {
    const vendedor = vendedores[idx];
    const nombreBase = NOMBRES_DEMO[categoria];
    nombreBase.forEach((nombre, i) => {
      const [precioInicial, incremento] = PRECIOS_DEMO[categoria];
      const precio = precioInicial + (i * incremento);
      const slug = `${categoriaClase(categoria)}-${i + 1}`;
      const oferta = i === 1 ? ofertasDemo[categoria] : null;
      productos.push({
        id: `demo-p-${slug}`,
        nombre,
        detalle: DESCRIPCIONES_DEMO[categoria],
        precio: Number(precio.toFixed(2)),
        descuento_porcentaje: oferta?.porcentaje || 0,
        descuento_hasta: oferta?.dias ? new Date(Date.now() + oferta.dias * MILISEGUNDOS_DIA).toISOString() : null,
        categoria,
        vendedor_id: vendedor.id,
        fotos: [`https://images.unsplash.com/${FOTOS_DEMO[categoria]}?auto=format&fit=crop&w=900&q=80`],
        emoji: EMOJI_CAT[categoria] || '🛍️',
        tags: [],
        creado_en: new Date(Date.now() - (i + idx) * 600000).toISOString(),
        destacado: i === 0,
        destacado_hasta: i === 0 ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString() : null,
        stock: 10 + i,
        activo: true,
        vendedor: vendedor.negocio,
        origen: 'demo'
      });
    });
  });

  return { vendedores: Object.fromEntries(vendedores.map(v => [v.id, v])), productos };
}

function generarPromocionesDemo() {
  const ahora = Date.now();
  return [
    {
      id: 'demo-promo-verano',
      vendedor_id: 'demo-v-2',
      producto_id: 'demo-p-lacteos-1',
      titulo: 'Verano fresco · Queso mantecoso',
      descripcion: 'Disfruta el sabor de Cajamarca con precio especial por temporada. Pregunta por presentaciones y disponibilidad.',
      imagen_url: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=1400&q=85',
      duracion_dias: 4,
      estado: 'aprobada',
      creado_en: new Date(ahora).toISOString(),
      vence_en: new Date(ahora + 4 * MILISEGUNDOS_DIA).toISOString(),
      origen: 'demo'
    },
    {
      id: 'demo-promo-invierno',
      vendedor_id: 'demo-v-7',
      producto_id: 'demo-p-panaderia-y-reposteria-1',
      titulo: 'Invierno calientito · Pan recién horneado',
      descripcion: 'Acompaña tus tardes con pan artesanal recién hecho. Oferta de temporada hasta agotar stock.',
      imagen_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1400&q=85',
      duracion_dias: 6,
      estado: 'aprobada',
      creado_en: new Date(ahora).toISOString(),
      vence_en: new Date(ahora + 6 * MILISEGUNDOS_DIA).toISOString(),
      origen: 'demo'
    },
    {
      id: 'demo-promo-cosecha',
      vendedor_id: 'demo-v-4',
      producto_id: 'demo-p-frutas-y-verduras-1',
      titulo: 'Cosecha del valle · Frutas frescas',
      descripcion: 'Lleva frutas de temporada recién seleccionadas, directo de productores locales. Consulta por cajas y variedades.',
      imagen_url: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=1400&q=85',
      duracion_dias: 8,
      estado: 'aprobada',
      creado_en: new Date(ahora).toISOString(),
      vence_en: new Date(ahora + 8 * MILISEGUNDOS_DIA).toISOString(),
      origen: 'demo'
    },
    {
      id: 'demo-promo-artesania',
      vendedor_id: 'demo-v-10',
      producto_id: 'demo-p-artesania-1',
      titulo: 'Hecho a mano · Artesanía local',
      descripcion: 'Piezas únicas elaboradas por artesanos de San Marcos. Encuentra un detalle especial y apoya el trabajo local.',
      imagen_url: 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=1400&q=85',
      duracion_dias: 10,
      estado: 'aprobada',
      creado_en: new Date(ahora).toISOString(),
      vence_en: new Date(ahora + 10 * MILISEGUNDOS_DIA).toISOString(),
      origen: 'demo'
    },
    {
      id: 'demo-promo-plantas',
      vendedor_id: 'demo-v-9',
      producto_id: 'demo-p-plantas-y-semillas-1',
      titulo: 'Renueva tu jardín · Plantas de temporada',
      descripcion: 'Dale vida a tus espacios con plantas y semillas seleccionadas. Pregunta por cuidados y disponibilidad.',
      imagen_url: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1400&q=85',
      duracion_dias: 9,
      estado: 'aprobada',
      creado_en: new Date(ahora).toISOString(),
      vence_en: new Date(ahora + 9 * MILISEGUNDOS_DIA).toISOString(),
      origen: 'demo'
    },
    {
      id: 'demo-promo-campo',
      vendedor_id: 'demo-v-8',
      producto_id: 'demo-p-agro-1',
      titulo: 'Del campo a tu mesa · Productos de chacra',
      descripcion: 'Aprovecha esta selección de productos del campo, cultivados con dedicación por pequeños productores de la zona.',
      imagen_url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1400&q=85',
      duracion_dias: 5,
      estado: 'aprobada',
      creado_en: new Date(ahora).toISOString(),
      vence_en: new Date(ahora + 5 * MILISEGUNDOS_DIA).toISOString(),
      origen: 'demo'
    },
    {
      id: 'demo-promo-bebidas',
      vendedor_id: 'demo-v-6',
      producto_id: 'demo-p-bebidas-1',
      titulo: 'Sabor de temporada · Bebidas locales',
      descripcion: 'Prueba bebidas preparadas con ingredientes de nuestra tierra. Consulta sabores disponibles y haz tu pedido directo.',
      imagen_url: 'https://images.unsplash.com/photo-1536935338788846bb9981813?auto=format&fit=crop&w=1400&q=85',
      duracion_dias: 7,
      estado: 'aprobada',
      creado_en: new Date(ahora).toISOString(),
      vence_en: new Date(ahora + 7 * MILISEGUNDOS_DIA).toISOString(),
      origen: 'demo'
    }
  ];
}

const readLocalState = () => {
  try {
    const item = localStorage.getItem(LOCAL_APP_KEY);
    const parsed = item ? JSON.parse(item) : {};
    const catalogoDemoGuardado = parsed.versionCatalogoDemo === VERSION_CATALOGO_DEMO;
    const demo = catalogoDemoGuardado
      ? {
        vendedores: Object.fromEntries(Object.entries(parsed.vendedores || {}).filter(([, vendedor]) => esDatoDemo(vendedor))),
        productos: (parsed.productos || []).filter(producto => esDatoDemo(producto))
      }
      : generarCatalogoDemo();
    const promocionesDemo = parsed.versionPromocionesDemo === VERSION_PROMOCIONES_DEMO
      ? (parsed.promociones || []).filter(promocion => esDatoDemo(promocion))
      : generarPromocionesDemo();
    const vendedoresReales = Object.fromEntries(Object.entries(parsed.vendedores || {}).filter(([, vendedor]) => !esDatoDemo(vendedor)));
    const productosReales = (parsed.productos || []).filter(producto => !esDatoDemo(producto));
    const promocionesReales = (parsed.promociones || []).filter(promocion => !esDatoDemo(promocion));
    const actualizado = {
      ...JSON.parse(JSON.stringify(defaultState)),
      ...parsed,
      ...demo,
      vendedores: { ...demo.vendedores, ...vendedoresReales },
      productos: [...demo.productos, ...productosReales],
      promociones: [...promocionesDemo, ...promocionesReales],
      versionCatalogoDemo: VERSION_CATALOGO_DEMO,
      versionPromocionesDemo: VERSION_PROMOCIONES_DEMO,
      reseñas: parsed.reseñas || [],
      solicitudesDestacado: parsed.solicitudesDestacado || []
    };
    writeLocalState(actualizado);
    return actualizado;
  } catch {
    const demo = generarCatalogoDemo();
    const base = {
      ...JSON.parse(JSON.stringify(defaultState)),
      ...demo,
      promociones: generarPromocionesDemo(),
      versionCatalogoDemo: VERSION_CATALOGO_DEMO,
      versionPromocionesDemo: VERSION_PROMOCIONES_DEMO
    };
    writeLocalState(base);
    return base;
  }
};

const writeLocalState = (state) => localStorage.setItem(LOCAL_APP_KEY, JSON.stringify(state));

const makeLocalDb = () => {
  const getState = () => readLocalState();
  const save = state => writeLocalState(state);
  const normalizeUser = user => user ? { id: user.id, email: user.email, user_metadata: user.user_metadata || {} } : null;

  const tableQuery = (table) => {
    const snapshot = getState();
    const rows = table === 'productos'
      ? snapshot.productos
      : table === 'vendedores'
        ? Object.values(snapshot.vendedores)
        : table === 'reseñas'
          ? snapshot.reseñas
          : table === 'promociones'
            ? snapshot.promociones
            : table === 'solicitudes_destacado'
              ? snapshot.solicitudesDestacado
            : [];

    const api = {
      _table: table,
      _filters: [],
      _orders: [],
      _range: null,
      select: () => api,
      order: (field, options = {}) => {
        api._orders.push({ field, ascending: options.ascending !== false });
        return api;
      },
      range: (from, to) => {
        api._range = [from, to];
        return api;
      },
      eq: (field, value) => {
        api._filters.push([field, value]);
        return api;
      },
      then: resolve => {
        let data = rows.filter(row => api._filters.every(([field, value]) => String(row[field]) === String(value)));
        if (api._orders.length) {
          data = [...data].sort((a, b) => {
            for (const { field, ascending } of api._orders) {
              const comparison = a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0;
              if (comparison) return ascending ? comparison : -comparison;
            }
            return 0;
          });
        }
        if (api._range) data = data.slice(api._range[0], api._range[1] + 1);
        resolve({ data, error: null });
      },
      maybeSingle: async () => {
        let data = rows;
        for (const [field, value] of api._filters) {
          data = data.filter(row => String(row[field]) === String(value));
        }
        return { data: data[0] || null };
      },
      update: record => {
        const modification = {
          filters: [],
          eq: (field, value) => { modification.filters.push([field, value]); return modification; },
          then: resolve => {
            const coincide = row => modification.filters.every(([field, value]) => String(row[field]) === String(value));
            rows.forEach(row => {
              if (coincide(row)) Object.assign(row, record);
            });
            save(snapshot);
            resolve({ error: null, data: rows.filter(coincide) });
          }
        };
        return modification;
      },
      delete: () => {
        const deletion = {
          filters: [],
          eq: (field, value) => { deletion.filters.push([field, value]); return deletion; },
          then: resolve => {
            const filtered = rows.filter(row => !deletion.filters.every(([field, value]) => String(row[field]) === String(value)));
            if (table === 'productos') snapshot.productos = filtered;
            if (table === 'vendedores') snapshot.vendedores = Object.fromEntries(filtered.map(row => [row.id, row]));
            if (table === 'promociones') snapshot.promociones = filtered;
            if (table === 'solicitudes_destacado') snapshot.solicitudesDestacado = filtered;
            save(snapshot);
            resolve({ error: null, data: filtered });
          }
        };
        return deletion;
      },
      insert: async (record) => {
        if (table === 'productos') {
          const producto = { id: `p-${Date.now()}`, ...record, creado_en: new Date().toISOString() };
          snapshot.productos.unshift(producto);
          save(snapshot);
          return { error: null, data: producto };
        }
        if (table === 'vendedores') {
          snapshot.vendedores[record.id] = { ...(snapshot.vendedores[record.id] || {}), ...record };
          save(snapshot);
        }
        if (table === 'reseñas') {
          snapshot.reseñas.unshift({ id: `r-${Date.now()}`, ...record, aprobado: false });
          save(snapshot);
        }
        if (table === 'promociones') {
          const promocion = { id: `promo-${Date.now()}`, ...record, creado_en: new Date().toISOString() };
          snapshot.promociones.unshift(promocion);
          save(snapshot);
          return { error: null, data: promocion };
        }
        if (table === 'solicitudes_destacado') {
          const solicitud = { id: `sd-${Date.now()}`, ...record, creado_en: new Date().toISOString() };
          snapshot.solicitudesDestacado.unshift(solicitud);
          save(snapshot);
          return { error: null, data: solicitud };
        }
        return { error: null, data: record };
      },
      upsert: async (record) => {
        if (table === 'vendedores') {
          snapshot.vendedores[record.id] = { ...(snapshot.vendedores[record.id] || {}), ...record };
          save(snapshot);
        }
        if (table === 'productos') {
          const index = snapshot.productos.findIndex(p => p.id === record.id);
          if (index >= 0) snapshot.productos[index] = { ...snapshot.productos[index], ...record };
          else snapshot.productos.unshift({ id: record.id || `p-${Date.now()}`, ...record, creado_en: new Date().toISOString() });
          save(snapshot);
        }
        return { error: null };
      }
    };

    return api;
  };

  return {
    auth: {
      getSession: async () => {
        const user = JSON.parse(localStorage.getItem('de_nuestra_tierra_user') || 'null');
        return { data: { session: user ? { user: normalizeUser(user) } : null } };
      },
      signInWithPassword: async ({ email, password }) => {
        const normalizedEmail = (email || '').trim().toLowerCase();
        if (normalizedEmail === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
          const user = { id: 'admin', email: ADMIN_EMAIL, user_metadata: { negocio: 'Administración' } };
          localStorage.setItem('de_nuestra_tierra_user', JSON.stringify(user));
          return { data: { user: normalizeUser(user) }, error: null };
        }
        const sessionUser = JSON.parse(localStorage.getItem('de_nuestra_tierra_users') || '{}');
        const found = Object.values(sessionUser).find(item => String(item.email).toLowerCase() === normalizedEmail && String(item.password) === String(password));
        if (found) {
          const user = { id: found.id, email: found.email, user_metadata: found.user_metadata || {} };
          localStorage.setItem('de_nuestra_tierra_user', JSON.stringify(user));
          return { data: { user: normalizeUser(user) }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid login credentials' } };
      },
      signUp: async ({ email, password, options }) => {
        const normalizedEmail = (email || '').trim().toLowerCase();
        const users = JSON.parse(localStorage.getItem('de_nuestra_tierra_users') || '{}');
        if (users[normalizedEmail]) {
          return { data: { session: null, user: null }, error: { message: 'User already registered' } };
        }
        const user = {
          id: `local-${Date.now()}`,
          email: normalizedEmail,
          password,
          user_metadata: options?.data || {}
        };
        users[normalizedEmail] = user;
        localStorage.setItem('de_nuestra_tierra_users', JSON.stringify(users));
        const userSession = { id: user.id, email: user.email, user_metadata: user.user_metadata };
        localStorage.setItem('de_nuestra_tierra_user', JSON.stringify(userSession));
        return { data: { session: { user: normalizeUser(userSession) }, user: normalizeUser(userSession) }, error: null };
      },
      signOut: async () => {
        localStorage.removeItem('de_nuestra_tierra_user');
        return { error: null };
      },
      onAuthStateChange: (callback) => {
        const user = JSON.parse(localStorage.getItem('de_nuestra_tierra_user') || 'null');
        callback('INITIAL_SESSION', user ? { user: normalizeUser(user) } : null);
        return () => {};
      }
    },
    from: (table) => tableQuery(table),
    storage: (() => {
      const archivos = {};
      return {
        from: () => {
        const blobComoDataUrl = blob => new Promise((resolve, reject) => {
          const lector = new FileReader();
          lector.onload = () => resolve(lector.result);
          lector.onerror = reject;
          lector.readAsDataURL(blob);
        });
        return {
          upload: async (ruta, blob) => {
            archivos[ruta] = await blobComoDataUrl(blob);
            return { error: null };
          },
          getPublicUrl: ruta => ({ data: { publicUrl: archivos[ruta] || '' } }),
          remove: async rutas => {
            (Array.isArray(rutas) ? rutas : [rutas]).forEach(ruta => delete archivos[ruta]);
            return { error: null };
          }
        };
        }
      };
    })()
  };
};

document.head.insertAdjacentHTML('beforeend', '<style>[hidden]{display:none!important}</style>');

const navegacion = performance.getEntriesByType('navigation')[0];
if (navegacion?.type === 'reload' && 'scrollRestoration' in history) {
  const restauracionScrollAnterior = history.scrollRestoration;
  history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', () => {
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    history.scrollRestoration = restauracionScrollAnterior;
  }, { once: true });
}

const modoDemo = new URLSearchParams(window.location.search).get('demo') === '1';
const usaSupabase = Boolean(window.supabase && !SUPABASE_URL.includes('TU-PROYECTO') && !modoDemo);
const db = usaSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : makeLocalDb();
const URL_REDIRECCION_AUTH = `${window.location.origin}${window.location.pathname}`;
const retornoConfirmacion = new URLSearchParams(window.location.hash.slice(1));
let vieneDeConfirmacion = retornoConfirmacion.get('type') === 'signup';

/* ---------- Estado ---------- */
let productos = [], vendedores = {}, promociones = [], usuario = null, miPerfil = null;
let solicitudesDestacado = [];
let errorCargaSolicitudes = null;
let fotosNuevas = [];
let carruselFotos = [], carruselIndex = 0, detalleEmoji = '🛒';
let revisandoExpiraciones = false;
let ultimoErrorCargaDatos = null;
const erroresExpiracionDestacados = new Map();
const MAX_FOTOS = 6;
const estado = { filtro: 'todos', busqueda: '', orden: 'recientes' };
let ignorarClickCarruselHasta = 0;
const EMOJI_CAT = {
  Alimentos: '🛒', 'Lácteos': '🧀', 'Panadería': '🥖',
  'Panadería y repostería': '🥖', Carnes: '🥩', 'Frutas y verduras': '🥬',
  Abarrotes: '🛒', Bebidas: '🧃', Agro: '🥔', 'Plantas y semillas': '🌱',
  Artesanía: '🧺', Textiles: '🧶', 'Textiles y ropa': '👕',
  'Belleza y cuidado': '🧴', Hogar: '🏠', Salud: '🩺', Ferretería: '🔧',
  'Construcción': '🧱', Automotriz: '🚗', Servicios: '🛠️', Mascotas: '🐾',
  Tecnología: '📱', Otro: '🛍️'
};
const ETIQUETAS_DISPONIBLES = [
  'artesanal', 'fresco', 'casero', 'natural', 'local', 'dulce', 'salado', 'hecho a mano',
  'premium', 'economico', 'oferta', 'por encargo', 'temporada', 'sin conservantes', 'organico',
  'sin azucar', 'sin gluten', 'sin lactosa', 'vegano', 'vegetariano', 'articulo nuevo',
  'segunda mano', 'entrega disponible', 'servicio a domicilio', 'familiar', 'tradicional',
  'recien hecho', 'recien cosechado', 'hecho en san marcos', 'pequeno productor', 'mayoreo',
  'menudeo', 'regalo', 'personalizado', 'resistente', 'manual', 'ecologico', 'reutilizable',
  'biodegradable', 'sin quimicos', 'bajo en sal', 'alto en fibra', 'con garantia', 'reparacion',
  'instalacion', 'mantenimiento', 'delivery', 'disponible hoy', 'reserva', 'temporada escolar'
];

const listaProductos = $('#lista-productos');
const tiendaProductos = $('#tienda-productos');
const listaVendedores = $('#lista-vendedores');
const conteo = $('#conteo-productos');
const sinResultados = $('#sin-resultados');
const buscador = $('#buscador');
const zona = $('#zona-usuario');
const modalAuth = $('#modal-auth');
const modalPanel = $('#modal-panel');
const modalPublicar = $('#modal-publicar');
const modalAdmin = $('#modal-admin');
const modalDetalle = $('#modal-producto');
const modalTienda = $('#modal-tienda');
const modalPromocion = $('#modal-promocion');
let indicePromocion = 0;
let intervaloPromociones = null;
let vencimientoIntervaloPromociones = null;
let vistaPreviaPromocionUrl = null;
let scrollDetalleOrigen = null;
$('#publicar-contenedor').append($('#seccion-publicar'));
const INTERVALO_TESTIMONIO = 5 * 60 * 1000;
let intervaloTestimonios = null;

/* ---------- Carga de datos ---------- */
async function cargarDatos() {
  try {
    $('#conteo-productos').textContent = 'Cargando productos…';
    const [productosCargados, vendedoresCargados] = await Promise.all([
      leerTablaCompleta('productos', [['creado_en', false], ['id', true]]),
      leerTablaCompleta('vendedores', [['id', true]])
    ]);
    ultimoErrorCargaDatos = null;
    const local = readLocalState();
    const productosRemotos = productosCargados;
    const vendedoresRemotos = vendedoresCargados;
    const productosDemo = local.productos.filter(esDatoDemo);
    const vendedoresDemo = Object.values(local.vendedores).filter(esDatoDemo);
    const incluirDatosDemo = modoDemo || !usaSupabase || productosDemo.length > 0;
    const productosReales = productosRemotos.map(producto => {
      const localProducto = local.productos.find(item => item.id === producto.id);
      return {
        ...producto,
        ...(localProducto && !Array.isArray(producto.tags) ? { tags: localProducto.tags } : {})
      };
    });
    productos = [...(incluirDatosDemo ? productosDemo : []), ...productosReales];
    vendedores = {
      ...(incluirDatosDemo ? Object.fromEntries(vendedoresDemo.map(vendedor => [vendedor.id, vendedor])) : {}),
      ...Object.fromEntries(vendedoresRemotos.map(vendedor => [vendedor.id, vendedor]))
    };
    await cargarPromociones();
    const idsDestacadosVencidos = new Set([
      ...productos.filter(producto => producto.destacado && !destacadoVigente(producto)).map(producto => producto.id),
      ...Object.values(vendedores).filter(tienda => tienda.destacado && !destacadoVigente(tienda)).map(tienda => tienda.id)
    ]);
    erroresExpiracionDestacados.forEach((_, id) => {
      if (!idsDestacadosVencidos.has(id)) erroresExpiracionDestacados.delete(id);
    });
    await limpiarDestacadosVencidos();
    pintarVitrina();
    pintarVendedores();
    pintarMetricas();
    $('[data-reintentar]').hidden = true;
    if (usuario) pintarMisProductos();
  } catch (error) {
    ultimoErrorCargaDatos = error.message;
    const local = readLocalState();
    productos = local.productos || [];
    vendedores = local.vendedores || {};
    promociones = local.promociones || [];
    pintarPromociones();
    pintarVitrina();
    pintarVendedores();
    pintarMetricas();
    sinResultados.querySelector('.sin-resultados-titulo').textContent = productos.length ? 'Modo local activo.' : 'No pudimos cargar la vitrina.';
    sinResultados.querySelector('p:not(.sin-resultados-titulo)').textContent = productos.length ? 'Mostramos los datos guardados en este dispositivo.' : 'Revisa tu conexión e inténtalo nuevamente.';
    sinResultados.hidden = false;
    $('[data-reintentar]').hidden = false;
    console.error('Error al cargar la vitrina:', error);
  }
}

async function cargarPromociones() {
  const aviso = $('#aviso-promociones');
  try {
    if (modoDemo || !usaSupabase) {
      const state = readLocalState();
      const vencidas = new Set(state.promociones
        .filter(promocion => promocion.estado === 'aprobada' && new Date(promocion.vence_en).getTime() <= Date.now())
        .map(promocion => promocion.id));
      if (vencidas.size) {
        state.promociones = state.promociones.filter(promocion => !vencidas.has(promocion.id));
        writeLocalState(state);
      }

      promociones = state.promociones;
    } else {
      const { data, error } = await db.from('promociones').select('*').order('creado_en', { ascending: false });
      if (error) throw error;
      promociones = data?.length
        ? data
        : readLocalState().promociones.filter(esDatoDemo);
    }
    aviso.hidden = true;
    aviso.textContent = '';
  } catch (error) {
    promociones = readLocalState().promociones;
    aviso.hidden = false;
    aviso.textContent = 'No se pudieron cargar las promociones compartidas. Verifica que la tabla promociones esté creada en Supabase y vuelve a intentarlo.';
    aviso.classList.add('promocion-aviso--error');
    console.error('Error al cargar promociones:', error);
  }
  indicePromocion = promocionesVisibles().length ? indicePromocion % promocionesVisibles().length : 0;
  pintarPromociones();
}

async function cargarSolicitudesDestacado() {
  if (usaSupabase) {
    const remotas = await leerTablaCompleta('solicitudes_destacado', [['creado_en', false], ['id', true]]);
    const idsRemotos = new Set(remotas.map(solicitud => solicitud.id));
    const locales = (readLocalState().solicitudesDestacado || [])
      .filter(solicitud => !idsRemotos.has(solicitud.id))
      .map(solicitud => ({ ...solicitud, _local: true }));
    solicitudesDestacado = [...remotas, ...locales];
  } else {
    solicitudesDestacado = readLocalState().solicitudesDestacado || [];
  }
  errorCargaSolicitudes = null;
}

async function actualizarSolicitudDestacado(id, cambios) {
  if (!usaSupabase || id.startsWith('sd-')) {
    const state = readLocalState();
    const solicitud = (state.solicitudesDestacado || []).find(item => item.id === id);
    if (!solicitud) throw new Error('La solicitud ya no está disponible. Actualiza el panel.');
    Object.assign(solicitud, cambios);
    writeLocalState(state);
    return;
  }
  const { error } = await db.from('solicitudes_destacado').update(cambios).eq('id', id);
  if (error) throw error;
  const { data, error: errorLectura } = await db.from('solicitudes_destacado').select('*').eq('id', id).maybeSingle();
  if (errorLectura) throw errorLectura;
  const cambiosVerificados = data && Object.entries(cambios).every(([campo, valor]) => {
    if (campo === 'aprobada_en' && valor && data[campo]) {
      return new Date(data[campo]).getTime() === new Date(valor).getTime();
    }
    return data[campo] === valor;
  });
  if (!cambiosVerificados) {
    throw new Error('No se guardó el cambio de estado. Verifica los permisos de administración y la conexión.');
  }
}

function promocionesVisibles() {
  return promociones.filter(promocion =>
    promocion.estado === 'aprobada' && new Date(promocion.vence_en).getTime() > Date.now()
  );
}

function pintarPromociones() {
  const contenedor = $('#promocion-carrusel');
  if (!contenedor) return;
  const visibles = promocionesVisibles();
  const promocion = visibles[indicePromocion];
  if (!promocion) {
    contenedor.innerHTML = '<div class="promocion-vacia"><span aria-hidden="true">✨</span><div><strong>Pronto habrá nuevas promociones</strong><p>Vuelve a visitar la vitrina para descubrir ofertas de temporada.</p></div></div>';
    return;
  }
  const vendedor = vendedores[promocion.vendedor_id] || {};
  const foto = urlImagen(promocion.imagen_url);
  const whatsapp = soloDigitos(vendedor.whatsapp);
  const mensaje = encodeURIComponent(`Hola, vi tu promoción "${promocion.titulo}" en Cerca de ti. ¿Me das más información?`);
  const contacto = whatsapp
    ? `<a class="boton boton--verde promocion-contacto" href="https://wa.me/${whatsapp}?text=${mensaje}" target="_blank" rel="noopener noreferrer">Consultar por WhatsApp <span aria-hidden="true">↗</span></a>`
    : '';
  contenedor.innerHTML = `
    <article class="promocion-card">
      <div class="promocion-foto">${foto ? `<img src="${esc(foto)}" alt="${esc(promocion.titulo)}" loading="lazy">` : '<span aria-hidden="true">🌟</span>'}</div>
      <div class="promocion-contenido">
        <div class="promocion-etiquetas"><span>OFERTA DE TEMPORADA</span></div>
        <h3>${esc(promocion.titulo)}</h3>
        <p>${esc(promocion.descripcion)}</p>
        <div class="promocion-pie">
          <span class="promocion-tienda">${esc(vendedor.negocio || 'Vendedor local')}</span>
          ${contacto}
        </div>
      </div>
      <div class="promocion-contador" data-promo-countdown="${esc(promocion.id)}" aria-label="Tiempo restante"></div>
    </article>
    ${visibles.length > 1 ? `<div class="promocion-controles">
      <button type="button" data-promo-direccion="-1" aria-label="Promoción anterior">←</button>
      <span>${indicePromocion + 1} / ${visibles.length}</span>
      <button type="button" data-promo-direccion="1" aria-label="Siguiente promoción">→</button>
    </div>` : ''}
  `;
  actualizarContadorPromocion();
  if (!vencimientoIntervaloPromociones) vencimientoIntervaloPromociones = setInterval(actualizarContadorPromocion, 1000);
  if (!intervaloPromociones) {
    intervaloPromociones = setInterval(() => {
      const cantidad = promocionesVisibles().length;
      if (cantidad > 1) {
        indicePromocion = (indicePromocion + 1) % cantidad;
        pintarPromociones();
      }
    }, 5 * 60 * 1000);
  }
}

function actualizarContadorPromocion() {
  const vencidas = promociones.filter(promocion =>
    promocion.estado === 'aprobada' && new Date(promocion.vence_en).getTime() <= Date.now()
  );
  if (vencidas.length) {
    promociones = promociones.filter(promocion => !vencidas.includes(promocion));
    indicePromocion = promocionesVisibles().length ? indicePromocion % promocionesVisibles().length : 0;
    if (modoDemo || !usaSupabase) {
      const state = readLocalState();
      const idsVencidas = new Set(vencidas.map(promocion => promocion.id));
      state.promociones = state.promociones.filter(promocion => !idsVencidas.has(promocion.id));
      writeLocalState(state);
    }
    pintarPromociones();
    if (modalAdmin.open) renderAdminPanel();
    return;
  }
  const contador = $('#promocion-carrusel [data-promo-countdown]');
  if (!contador) return;
  const promocion = promociones.find(item => item.id === contador.dataset.promoCountdown);
  if (!promocion) return;
  const restante = Math.max(0, new Date(promocion.vence_en).getTime() - Date.now());
  const dias = Math.floor(restante / MILISEGUNDOS_DIA);
  const horas = Math.floor((restante % MILISEGUNDOS_DIA) / 3600000);
  const minutos = Math.floor((restante % 3600000) / 60000);
  const segundos = Math.floor((restante % 60000) / 1000);
  contador.innerHTML = `<span>TIEMPO RESTANTE</span><div class="promocion-tiempo-unidades">
    <strong><b>${dias}</b><small>días</small></strong>
    <strong><b>${String(horas).padStart(2, '0')}</b><small>horas</small></strong>
    <strong><b>${String(minutos).padStart(2, '0')}</b><small>min</small></strong>
    <strong><b>${String(segundos).padStart(2, '0')}</b><small>seg</small></strong>
  </div>`;
}

listaProductos.addEventListener('click', e => {
  const control = e.target.closest('[data-promo-direccion]');
  const cantidad = promocionesVisibles().length;
  if (!control || cantidad < 2) return;
  indicePromocion = (indicePromocion + Number(control.dataset.promoDireccion) + cantidad) % cantidad;
  pintarPromociones();
});

async function limpiarDestacadosVencidos() {
  const vencidos = productos.filter(p => p.destacado && !destacadoVigente(p));
  const tiendasVencidas = Object.values(vendedores).filter(v => v.destacado && !destacadoVigente(v));
  if (!vencidos.length && !tiendasVencidas.length) return false;
  const local = readLocalState();
  vencidos.forEach(producto => {
    producto.destacado = false;
    producto.destacado_hasta = null;
    const guardado = local.productos.find(item => item.id === producto.id);
    if (guardado) {
      guardado.destacado = false;
      guardado.destacado_hasta = null;
    }
  });
  tiendasVencidas.forEach(tienda => {
    tienda.destacado = false;
    tienda.destacado_hasta = null;
    const guardado = local.vendedores[tienda.id];
    if (guardado) {
      guardado.destacado = false;
      guardado.destacado_hasta = null;
    }
  });
  writeLocalState(local);
  const pendientes = [
    ...vencidos.map(producto => ['productos', producto.id]),
    ...tiendasVencidas.map(tienda => ['vendedores', tienda.id])
  ];
  await Promise.all(pendientes.map(async ([tabla, id]) => {
    try {
      await guardarDestacado(tabla, id, false, null);
      erroresExpiracionDestacados.delete(id);
    } catch (error) {
      erroresExpiracionDestacados.set(id, error.message);
      console.error(`El destacado vencido ${id} ya no se muestra, pero falta sincronizar su expiración:`, error);
    }
  }));
  return true;
}

async function revisarExpiraciones() {
  if (revisandoExpiraciones) return;
  revisandoExpiraciones = true;
  try {
    const cambioDescuento = limpiarDescuentosVencidos();
    const cambio = await limpiarDestacadosVencidos();
    if (!cambio && !cambioDescuento) return;
    pintarVitrina();
    pintarVendedores();
    if (usuario) pintarMisProductos();
    if (modalAdmin.open) renderAdminPanel();
  } catch (error) {
    console.error('No se pudieron revisar los destacados vencidos:', error);
  } finally {
    revisandoExpiraciones = false;
  }
}

function limpiarDescuentosVencidos() {
  const ahora = Date.now();
  const vencidos = productos.filter(producto =>
    Number(producto.descuento_porcentaje) > 0
    && producto.descuento_hasta
    && new Date(producto.descuento_hasta).getTime() <= ahora
  );
  if (!vencidos.length) return false;
  const ids = new Set(vencidos.map(producto => producto.id));
  vencidos.forEach(producto => {
    producto.descuento_porcentaje = 0;
    producto.descuento_hasta = null;
  });
  if (!usaSupabase) {
    const state = readLocalState();
    state.productos.forEach(producto => {
      if (ids.has(producto.id)) {
        producto.descuento_porcentaje = 0;
        producto.descuento_hasta = null;
      }
    });
    writeLocalState(state);
  }
  return true;
}

/* ---------- Tarjeta de producto ---------- */
function tarjetaProducto(p) {
  const v = vendedores[p.vendedor_id] || {};
  const fotos = (Array.isArray(p.fotos) ? p.fotos : []).map(urlImagen).filter(Boolean);
  const imagen = fotos.length
    ? `<img data-producto-foto src="${esc(fotos[0])}" alt="${esc(p.nombre)}" loading="lazy">`
    : `<span class="producto-emoji" aria-hidden="true">${p.emoji || EMOJI_CAT[p.categoria] || '🛒'}</span>`;
  const controlesCarrusel = fotos.length > 1
    ? `<button type="button" class="producto-carrusel-control producto-carrusel-anterior" data-producto-slide="${esc(p.id)}" data-direccion="-1" aria-label="Foto anterior de ${esc(p.nombre)}">‹</button>
      <span class="producto-carrusel-contador" data-producto-contador="${esc(p.id)}" aria-live="polite">1 / ${fotos.length}</span>
      <button type="button" class="producto-carrusel-control producto-carrusel-siguiente" data-producto-slide="${esc(p.id)}" data-direccion="1" aria-label="Siguiente foto de ${esc(p.nombre)}">›</button>`
    : '';
  const badgeFotos = fotos.length ? `<span class="producto-fotos">📷 ${fotos.length}</span>` : '';
  const destacadoActivo = destacadoVigente(p);
  const categoria = categoriaFiltro(p.categoria);
  const ofertaActiva = descuentoVigente(p);
  return `<article class="producto ${destacadoActivo ? 'producto--destacado' : ''}${ofertaActiva ? ' producto--oferta' : ''}" data-id="${esc(p.id)}" data-categoria="${categoria}" data-fotos="${esc(JSON.stringify(fotos))}" data-foto-actual="0" tabindex="0" role="group" aria-label="${esc(p.nombre)}, S/ ${fmtPrecio(precioConDescuento(p))}${ofertaActiva ? `, ${p.descuento_porcentaje}% de descuento` : ''}, de ${esc(v.negocio || 'Vendedor local')}${destacadoActivo ? ', producto destacado' : ''}. Presiona Enter para ver detalles">
    <div class="producto-imagen">
      <span class="producto-etiqueta">${esc(p.categoria || 'Varios')}</span>
      ${destacadoActivo ? '<span class="producto-sello-destacado"><span aria-hidden="true">★</span> Destacado</span>' : ''}
      ${ofertaActiva ? `<span class="producto-sello-oferta" aria-label="Descuento del ${Number(p.descuento_porcentaje)} por ciento"><strong>-${Number(p.descuento_porcentaje)}%</strong><small>OFERTA</small></span>` : ''}
      ${badgeFotos}${imagen}${controlesCarrusel}
    </div>
    <div class="producto-cuerpo">
      <h3>${esc(p.nombre)}</h3>
      ${vistaPrecioProducto(p)}
      <span class="producto-vendedor">🏪 ${esc(v.negocio || 'Vendedor local')}</span>
    </div>
  </article>`;
}

function cambiarFotoTarjeta(boton) {
  const tarjeta = boton.closest('.producto[data-id]');
  if (!tarjeta || tarjeta.dataset.id !== boton.dataset.productoSlide) return;
  let fotos;
  try {
    fotos = JSON.parse(tarjeta.dataset.fotos || '[]');
  } catch (error) {
    console.error('No se pudieron leer las fotos del producto:', error);
    return;
  }
  if (!Array.isArray(fotos) || fotos.length < 2) return;
  const direccion = Number(boton.dataset.direccion);
  const indice = (Number(tarjeta.dataset.fotoActual) + direccion + fotos.length) % fotos.length;
  tarjeta.dataset.fotoActual = String(indice);
  const imagen = $('[data-producto-foto]', tarjeta);
  if (imagen) {
    imagen.classList.remove('producto-foto-entrada--siguiente', 'producto-foto-entrada--anterior');
    void imagen.offsetWidth;
    imagen.src = fotos[indice];
    imagen.classList.add(direccion > 0 ? 'producto-foto-entrada--siguiente' : 'producto-foto-entrada--anterior');
  }
  const contador = $('[data-producto-contador]', tarjeta);
  if (contador) contador.textContent = `${indice + 1} / ${fotos.length}`;
}

/* ---------- Vitrina principal ---------- */
function pintarVitrina() {
  const terminos = palabrasBusqueda(estado.busqueda.trim());
  const lista = productos.filter(p => {
    const v = vendedores[p.vendedor_id] || {};
    const porFiltro = estado.filtro === 'todos' || categoriaFiltro(p.categoria) === estado.filtro;
    const palabras = palabrasBusqueda(`${p.nombre} ${p.detalle || ''} ${p.categoria || ''} ${v.negocio || ''} ${etiquetasProducto(p).join(' ')}`);
    return porFiltro && terminos.every(termino => coincideBusqueda(termino, palabras));
  });
  const ord = {
    'recientes': (a, b) => new Date(b.creado_en) - new Date(a.creado_en),
    'precio-asc': (a, b) => precioConDescuento(a) - precioConDescuento(b),
    'precio-desc': (a, b) => precioConDescuento(b) - precioConDescuento(a),
    'nombre': (a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')
  }[estado.orden];
  const interacciones = leerContadoresLocales(INTERACCIONES_PRODUCTO_KEY);
  const popularidad = estado.orden === 'recientes'
    ? (a, b) => puntuacionInteraccionProducto(b, interacciones) - puntuacionInteraccionProducto(a, interacciones)
    : () => 0;
  lista.sort((a, b) => Number(destacadoVigente(b)) - Number(destacadoVigente(a)) || popularidad(a, b) || ord(a, b));
  const tarjetas = lista.map(tarjetaProducto);
  if (tarjetas.length > 1 && promocionesVisibles().length) {
    const posicionPromocion = Math.ceil(tarjetas.length / 2);
    tarjetas.splice(posicionPromocion, 0, '<div class="promocion-grid-item"><div class="promocion-grid-etiqueta">Ofertas especiales de temporada</div><div class="promocion-carrusel" id="promocion-carrusel" role="region" aria-label="Promociones aprobadas"></div></div>');
  }
  listaProductos.innerHTML = tarjetas.join('');
  pintarPromociones();
  const idsProductos = new Set(productos.map(producto => producto.id));
  const interaccionesVigentes = Object.fromEntries(Object.entries(interacciones).filter(([id]) => idsProductos.has(id)));
  if (Object.keys(interaccionesVigentes).length !== Object.keys(interacciones).length) {
    localStorage.setItem(INTERACCIONES_PRODUCTO_KEY, JSON.stringify(interaccionesVigentes));
  }
  conteo.textContent = lista.length === 1
    ? '1 producto disponible, recién salido.'
    : `${lista.length} productos disponibles, recién salidos.`;
  sinResultados.hidden = lista.length > 0;
}

/* ---------- Vendedores ---------- */
function pintarVendedores() {
  const iniciales = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const lista = Object.values(vendedores).sort((a, b) => Number(destacadoVigente(b)) - Number(destacadoVigente(a)) || (a.negocio || '').localeCompare(b.negocio || '', 'es'));
  listaVendedores.innerHTML = lista.map(v => {
    const n = productos.filter(p => p.vendedor_id === v.id).length;
    const av = urlImagen(v.avatar_url) ? `<img src="${esc(urlImagen(v.avatar_url))}" alt="">` : esc(v.avatar_emoji || iniciales(v.negocio));
    const num = soloDigitos(v.whatsapp);
    const destacado = destacadoVigente(v);
    return `<article class="vendedor${destacado ? ' vendedor--destacado' : ''}" data-categoria="${categoriaFiltro(v.categoria)}">
      ${destacado ? '<span class="vendedor-sello-destacado"><span aria-hidden="true">★</span> Tienda destacada</span>' : ''}
      <span class="vendedor-avatar" aria-hidden="true">${av}</span>
      <div class="vendedor-datos">
        <h3>${esc(v.negocio)}</h3>
        <p>${esc(v.responsable || 'Vendedor local')} · ${esc(v.categoria || 'Varios')}</p>
        ${v.direccion ? `<p class="vendedor-direccion">📍 ${esc(v.direccion)}</p>` : ''}
        <small>${n} producto(s) en vitrina</small>
      </div>
      <div class="vendedor-acciones">
        <button type="button" class="boton boton--linea" data-tienda="${v.id}">Ver tienda</button>
        <button type="button" class="boton boton--linea" data-compartir-tienda="${esc(v.id)}" aria-label="Compartir enlace de ${esc(v.negocio)}">Compartir</button>
        <button type="button" class="boton boton--linea" data-qr-tienda="${esc(v.id)}" aria-label="Ver código QR de ${esc(v.negocio)}">Ver QR</button>
        <a class="boton-wsp vendedor-accion-wsp" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp a ${esc(v.negocio)}" href="https://wa.me/${num}?text=${encodeURIComponent(`Hola ${v.negocio}, vi tu tienda en Cerca de ti.`)}">
          <svg class="icono" aria-hidden="true"><use href="#i-whatsapp"/></svg><span>WhatsApp</span>
        </a>
      </div>
    </article>`;
  }).join('') || '<p class="producto-detalle">Aún no hay tiendas registradas. ¡Sé la primera! 🌿</p>';
}

function pintarMetricas() {
  const cats = new Set(productos.map(p => p.categoria));
  $('[data-contador="productos"]').textContent = productos.length;
  $('[data-contador="vendedores"]').textContent = Object.keys(vendedores).length;
  $('[data-contador="categorias"]').textContent = cats.size;
}

/* ---------- Interacción con tarjetas ---------- */
function abrirWhatsAppProducto(id) {
  const p = productos.find(x => x.id === id); if (!p) return;
  registrarInteraccionProducto(id, 'whatsapp');
  pintarVitrina();
  const v = vendedores[p.vendedor_id] || {};
  const num = soloDigitos(v.whatsapp);
  const msg = encodeURIComponent(`Hola ${v.negocio || ''}, vi "${p.nombre}" en Cerca de ti y quiero hacer un pedido.`);
  window.open(`https://wa.me/${num}?text=${msg}`, '_blank', 'noopener');
}

document.addEventListener('click', e => {
  const compartirTienda = e.target.closest('[data-compartir-tienda]');
  if (compartirTienda) {
    const id = compartirTienda.dataset.compartirTienda;
    const vendedor = vendedores[id];
    if (!vendedor) return;
    abrirTienda(id);
    compartirEnlaceTienda(vendedor, 'tienda-publica-enlace', 'tienda-publica-mensaje');
    return;
  }
  const qrTienda = e.target.closest('[data-qr-tienda]');
  if (qrTienda) {
    abrirTienda(qrTienda.dataset.qrTienda);
    $('#tienda-qr-panel').hidden = false;
    $('#btn-ver-qr-publico').setAttribute('aria-expanded', 'true');
    return;
  }
  const contactarProducto = e.target.closest('[data-contactar-producto]');
  if (contactarProducto && !contactarProducto.hasAttribute('aria-disabled')) {
    registrarInteraccionProducto(contactarProducto.dataset.contactarProducto, 'whatsapp');
    pintarVitrina();
  }
  const pedir = e.target.closest('[data-pedir]');
  if (pedir) { abrirWhatsAppProducto(pedir.dataset.pedir); return; }
  const tienda = e.target.closest('[data-tienda]');
  if (tienda) { abrirTienda(tienda.dataset.tienda); }
});

[listaProductos, tiendaProductos].forEach(grid => {
  grid.addEventListener('click', e => {
    const controlCarrusel = e.target.closest('[data-producto-slide]');
    if (controlCarrusel) {
      e.preventDefault();
      e.stopPropagation();
      cambiarFotoTarjeta(controlCarrusel);
      return;
    }
    if (Date.now() < ignorarClickCarruselHasta) return;
    const card = e.target.closest('.producto');
    if (!card || e.target.closest('[data-tienda],[data-pedir]')) return;
    abrirDetalle(card.dataset.id);
  });
  grid.addEventListener('pointerdown', e => {
    const imagen = e.target.closest('.producto-imagen');
    if (imagen && e.isPrimary) {
      imagen.dataset.inicioX = String(e.clientX);
      imagen.dataset.inicioY = String(e.clientY);
    }
  });
  grid.addEventListener('pointerup', e => {
    const imagen = e.target.closest('.producto-imagen');
    if (!imagen || imagen.dataset.inicioX === undefined || !e.isPrimary) return;
    const deltaX = e.clientX - Number(imagen.dataset.inicioX);
    const deltaY = e.clientY - Number(imagen.dataset.inicioY);
    delete imagen.dataset.inicioX;
    delete imagen.dataset.inicioY;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    const tarjeta = imagen.closest('.producto');
    const direccion = deltaX < 0 ? 1 : -1;
    const boton = $(`[data-producto-slide][data-direccion="${direccion}"]`, tarjeta);
    if (boton) {
      cambiarFotoTarjeta(boton);
      ignorarClickCarruselHasta = Date.now() + 500;
    }
  });
  grid.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('producto')) {
      e.preventDefault(); abrirDetalle(e.target.dataset.id);
    }
  });
});

/* ---------- Detalle de producto + carrusel ---------- */
function abrirDetalle(id) {
  const p = productos.find(x => x.id === id); if (!p) return;
  registrarInteraccionProducto(id, 'detalle');
  scrollDetalleOrigen = window.scrollY;
  const v = vendedores[p.vendedor_id] || {};
  $('#detalle-categoria').textContent = p.categoria || 'Varios';
  $('#detalle-nombre').textContent = p.nombre;
  $('#detalle-detalle').textContent = p.detalle || 'Escríbele al vendedor por WhatsApp para más detalles.';
  $('#detalle-precio').innerHTML = vistaPrecioProducto(p, 'detalle-precio-valor');
  const tags = etiquetasProducto(p).length ? ` · ${etiquetasProducto(p).join(', ')}` : '';
  $('#detalle-detalle').textContent = `${p.detalle || 'Escríbele al vendedor por WhatsApp para más detalles.'}${tags}`;
  const contactoWhatsApp = $('#detalle-wsp');
  const num = soloDigitos(v.whatsapp);
  contactoWhatsApp.href = `https://wa.me/${num}?text=${encodeURIComponent(`Hola ${v.negocio || ''}, vi "${p.nombre}" en Cerca de ti y quiero hacer un pedido.`)}`;
  contactoWhatsApp.dataset.contactarProducto = p.id;
  $('#detalle-vendedor-avatar').innerHTML = urlImagen(v.avatar_url) ? `<img src="${esc(urlImagen(v.avatar_url))}" alt="">` : esc(v.avatar_emoji || '🏪');
  $('#detalle-vendedor-nombre').textContent = v.negocio || 'Vendedor local';
  $('#detalle-vendedor').dataset.tienda = p.vendedor_id;
  carruselFotos = Array.isArray(p.fotos) ? p.fotos : [];
  carruselIndex = 0;
  detalleEmoji = p.emoji || EMOJI_CAT[p.categoria] || '🛒';
  pintarCarrusel();
  modalDetalle.showModal();
  restaurarScrollDetalle();
}

function restaurarScrollDetalle() {
  if (scrollDetalleOrigen === null) return;
  window.scrollTo({ left: 0, top: scrollDetalleOrigen, behavior: 'instant' });
}

modalDetalle.addEventListener('close', () => {
  restaurarScrollDetalle();
  scrollDetalleOrigen = null;
  pintarVitrina();
});

function pintarCarrusel() {
  const pista = $('#carrusel-pista'), puntos = $('#carrusel-puntos');
  const hayFotos = carruselFotos.length > 0;
  if (!hayFotos) {
    pista.innerHTML = `<div class="carrusel-slide carrusel-slide--emoji"><span>${detalleEmoji}</span></div>`;
    puntos.innerHTML = '';
  } else {
    pista.innerHTML = carruselFotos.map(f =>
      `<div class="carrusel-slide"><img src="${esc(urlImagen(f))}" alt="Foto del producto" loading="lazy"></div>`).join('');
    puntos.innerHTML = carruselFotos.map((_, i) =>
      `<button type="button" data-slide="${i}" aria-label="Ir a la foto ${i + 1}"></button>`).join('');
  }
  const una = carruselFotos.length < 2;
  $('#carrusel-prev').hidden = !hayFotos || una;
  $('#carrusel-next').hidden = !hayFotos || una;
  moverCarrusel();
}

function moverCarrusel() {
  $('#carrusel-pista').style.transform = `translateX(-${carruselIndex * 100}%)`;
  $$('#carrusel-puntos button').forEach((b, i) => b.classList.toggle('activo', i === carruselIndex));
}

$('#carrusel-prev').addEventListener('click', () => {
  carruselIndex = (carruselIndex - 1 + carruselFotos.length) % carruselFotos.length; moverCarrusel();
});
$('#carrusel-next').addEventListener('click', () => {
  carruselIndex = (carruselIndex + 1) % carruselFotos.length; moverCarrusel();
});
$('#carrusel-puntos').addEventListener('click', e => {
  const b = e.target.closest('[data-slide]'); if (!b) return;
  carruselIndex = +b.dataset.slide; moverCarrusel();
});

let toqueX = null;
const carruselEl = $('#detalle-carrusel');
carruselEl.addEventListener('touchstart', e => { toqueX = e.touches[0].clientX; }, { passive: true });
carruselEl.addEventListener('touchend', e => {
  if (toqueX === null || carruselFotos.length < 2) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  if (Math.abs(dx) > 40) (dx < 0 ? $('#carrusel-next') : $('#carrusel-prev')).click();
  toqueX = null;
}, { passive: true });

/* ---------- Perfil público de tienda ---------- */
function abrirTienda(id) {
  const v = vendedores[id]; if (!v) return;
  if (modalDetalle.open) modalDetalle.close();
  modalTienda.dataset.tiendaId = id;
  $('#tienda-avatar').innerHTML = urlImagen(v.avatar_url) ? `<img src="${esc(urlImagen(v.avatar_url))}" alt="">` : esc(v.avatar_emoji || '🏪');
  $('#tienda-nombre').textContent = v.negocio;
  $('#tienda-responsable').textContent = v.responsable ? `Atiende: ${v.responsable}` : '';
  $('#tienda-direccion').textContent = v.direccion ? `📍 ${v.direccion}` : '📍 San Marcos, Cajamarca';
  $('#tienda-descripcion').textContent = v.descripcion || 'Este vendedor aún no agregó una descripción.';
  $('#tienda-categoria').textContent = v.categoria || 'Varios';
  $('#tienda-qr-panel').hidden = true;
  $('#btn-ver-qr-publico').setAttribute('aria-expanded', 'false');
  const deTienda = productos.filter(p => p.vendedor_id === id).sort((a, b) => Number(destacadoVigente(b)) - Number(destacadoVigente(a)) || new Date(b.creado_en || 0) - new Date(a.creado_en || 0));
  $('#tienda-conteo').textContent = `${deTienda.length} producto(s) en vitrina`;
  $('#tienda-wsp').href = `https://wa.me/${soloDigitos(v.whatsapp)}?text=${encodeURIComponent(`Hola ${v.negocio}, vi tu tienda en Cerca de ti.`)}`;
  tiendaProductos.innerHTML = deTienda.map(tarjetaProducto).join('') || '<p class="producto-detalle">Aún no hay productos publicados.</p>';
  const enlace = urlPublicaTienda(id);
  $('#tienda-publica-enlace').value = enlace;
  $('#tienda-publica-mensaje').hidden = true;
  try {
    generarCodigoQR($('#tienda-publica-qr'), enlace);
  } catch (error) {
    mostrarMensajeCompartir(`${error.message} Puedes compartir el enlace de la tienda.`, true, 'tienda-publica-mensaje');
  }
  if (!modalTienda.open) modalTienda.showModal();
}

async function abrirTiendaCompartida(id) {
  let vendedor = vendedores[id];
  if (!vendedor && usaSupabase) {
    const { data, error } = await db.from('vendedores').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    vendedor = data;
    if (vendedor) vendedores[id] = vendedor;
  }
  if (!vendedor) {
    const aviso = $('#aviso');
    aviso.hidden = false;
    aviso.setAttribute('role', 'alert');
    aviso.textContent = 'No encontramos esta tienda. Es posible que el enlace sea incorrecto o que la tienda ya no esté publicada.';
    return;
  }
  abrirTienda(vendedor.id);
}

/* ---------- Filtros, búsqueda y orden ---------- */
const chips = $$('.chip[data-filtro]');
const categoriaCards = $$('.categoria-tarjeta[data-filtro]');
const aplicarFiltro = (filtro) => {
  estado.filtro = filtro;
  chips.forEach(c => { const activo = c.dataset.filtro === filtro; c.classList.toggle('chip--activo', activo); c.setAttribute('aria-pressed', String(activo)); });
  categoriaCards.forEach(c => {
    const activo = c.dataset.filtro === filtro;
    c.classList.toggle('categoria-tarjeta--active', activo);
    c.setAttribute('aria-pressed', String(activo));
  });
  pintarVitrina();
};
chips.forEach(chip => chip.addEventListener('click', () => aplicarFiltro(chip.dataset.filtro)));
categoriaCards.forEach(card => card.addEventListener('click', () => {
  aplicarFiltro(card.dataset.filtro);
  $('#productos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
$('[data-ver-todas-categorias]').addEventListener('click', e => {
  e.preventDefault();
  aplicarFiltro('todos');
  $('#productos').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

const ejecutarBusqueda = (valor, desplazar = false) => {
  estado.busqueda = valor;
  if (valor.trim() && estado.filtro !== 'todos') aplicarFiltro('todos');
  else pintarVitrina();
  if (desplazar) $('#productos').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
buscador.addEventListener('input', espera(() => ejecutarBusqueda(buscador.value)));
$('#busquedas-populares').addEventListener('click', e => {
  const boton = e.target.closest('[data-busqueda-popular]');
  if (!boton) return;
  const consulta = boton.dataset.busquedaPopular;
  buscador.value = consulta;
  registrarBusquedaPopular(consulta);
  ejecutarBusqueda(consulta, true);
});
$('#form-busqueda').addEventListener('submit', e => {
  e.preventDefault();
  registrarBusquedaPopular(buscador.value);
  ejecutarBusqueda(buscador.value, true);
});
$('[data-reintentar]').addEventListener('click', () => { $('[data-reintentar]').hidden = true; cargarDatos(); });
$$('[data-buscar]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  registrarBusquedaPopular(a.dataset.buscar);
  buscador.value = a.dataset.buscar;
  ejecutarBusqueda(a.dataset.buscar, true);
}));
 pintarBusquedasPopulares();
$('#ordenar').addEventListener('change', e => { estado.orden = e.target.value; pintarVitrina(); });
$('[data-limpiar-filtros]').addEventListener('click', () => {
  estado.filtro = 'todos'; estado.busqueda = ''; buscador.value = '';
  chips.forEach(c => { const t = c.dataset.filtro === 'todos'; c.classList.toggle('chip--activo', t); c.setAttribute('aria-pressed', String(t)); });
categoriaCards.forEach(c => {
  c.classList.remove('categoria-tarjeta--active');
  c.setAttribute('aria-pressed', 'false');
});
pintarVitrina();
});

/* ---------- Menú móvil ---------- */
const cabecera = $('.cabecera'), botonMenu = $('#boton-menu');
const cerrarMenu = () => { cabecera.classList.remove('abierta'); botonMenu.setAttribute('aria-expanded', 'false'); };
botonMenu.addEventListener('click', e => {
  e.stopPropagation();
  botonMenu.setAttribute('aria-expanded', cabecera.classList.toggle('abierta'));
});
$('#navegacion').addEventListener('click', e => { if (e.target.matches('a')) cerrarMenu(); });
document.addEventListener('click', e => { if (cabecera.classList.contains('abierta') && !cabecera.contains(e.target)) cerrarMenu(); });

/* ---------- Sesión y zona de usuario ---------- */
async function cargarPerfil() {
  if (!usuario) { miPerfil = null; return; }
  const r = await db.from('vendedores').select('*').eq('id', usuario.id).maybeSingle();
  if (r.error) throw r.error;
  miPerfil = r.data;
}

async function completarPerfilTrasConfirmacion() {
  if (!usuario || usuario.email === ADMIN_EMAIL || miPerfil || !usuario.user_metadata?.negocio) return;
  const metadata = usuario.user_metadata;
  const { error } = await db.from('vendedores').upsert({
    id: usuario.id,
    negocio: metadata.negocio,
    responsable: metadata.responsable || '',
    whatsapp: metadata.whatsapp || '',
    categoria: metadata.categoria || 'Otro',
    descripcion: 'Tienda creada desde Cerca de ti.'
  });
  if (error) throw error;
  await cargarPerfil();
}

function limpiarRetornoAuth() {
  if (!window.location.hash) return;
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}

function pintarZonaUsuario() {
  if (usuario && usuario.email === ADMIN_EMAIL) {
    zona.innerHTML = `<button type="button" class="chip chip-avatar chip--activo" data-accion="admin" title="Panel de administración"> <span class="admin-logo"><img src="Logo%20cerca%20de%20ti%20encabezado.png" alt=""></span>Administración</button> <button type="button" class="boton boton--linea" data-accion="salir">Salir</button>`;
  } else if (usuario && miPerfil) {
    const av = urlImagen(miPerfil.avatar_url) ? `<img src="${esc(urlImagen(miPerfil.avatar_url))}" alt="">` : esc(miPerfil.avatar_emoji || '🏪');
    zona.innerHTML = `<button type="button" class="boton boton--ambar boton-publicar-rapido" data-accion="publicar" title="Publicar un producto">＋ Publicar</button> <button type="button" class="chip chip-avatar chip--activo" data-accion="panel" title="Administrar mi tienda"> <span>${av}</span>${esc(miPerfil.negocio || 'Mi tienda')}</button> <button type="button" class="boton boton--linea" data-accion="salir">Salir</button>`;
  } else if (usuario) {
    zona.innerHTML = `<button type="button" class="boton boton--ambar" data-accion="panel">Completar mi perfil</button>`;
  } else {
    zona.innerHTML = `<button type="button" class="boton boton--linea" data-accion="entrar">Entrar</button> <button type="button" class="boton boton--ambar" data-accion="crear">Vender aquí</button>`;
  }
}

zona.addEventListener('click', e => {
  const a = e.target.closest('[data-accion]'); if (!a) return;
  const acc = a.dataset.accion;
  if (acc === 'entrar') abrirAuth('entrar');
  if (acc === 'crear') abrirAuth('crear');
  if (acc === 'salir') db.auth.signOut();
  if (acc === 'panel') abrirPanel();
  if (acc === 'publicar') abrirPublicador();
  if (acc === 'admin') abrirAdmin();
});

db.auth.onAuthStateChange((_ev, ses) => {
  usuario = ses?.user || null;
  cargarPerfil()
    .then(completarPerfilTrasConfirmacion)
    .then(() => {
      pintarZonaUsuario();
      if (usuario) pintarMisProductos();
      if (vieneDeConfirmacion && usuario) {
        limpiarRetornoAuth();
        vieneDeConfirmacion = false;
        abrirPanel();
      }
    })
    .catch(error => console.error('No se pudo completar el perfil:', error));
});

/* ---------- Modal auth ---------- */
function abrirAuth(tab) {
  $('#auth-error').hidden = true;
  cambiarTab(tab);
  modalAuth.showModal();
}

function cambiarTab(tab) {
  $$('.auth-tabs [data-tab]').forEach(b => b.classList.toggle('chip--activo', b.dataset.tab === tab));
  $('#form-entrar').hidden = tab !== 'entrar';
  $('#form-crear').hidden = tab !== 'crear';
}

$$('.auth-tabs [data-tab]').forEach(b => b.addEventListener('click', () => cambiarTab(b.dataset.tab)));
$$('[data-abrir-auth]').forEach(b => b.addEventListener('click', () => abrirAuth(b.dataset.abrirAuth)));

const errAuth = (msg, ok) => {
  const el = $('#auth-error');
  el.hidden = false; el.textContent = msg;
  el.className = 'modal-nota ' + (ok ? 'msg-ok' : 'msg-error');
};

const traducir = m => ({
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'User already registered': 'Ese correo ya está registrado. Prueba entrando.',
  'Email not confirmed': 'Confirma tu correo antes de entrar.'
}[m] || m);

$('#c-pass-mostrar').addEventListener('click', e => {
  const campo = $('#c-pass');
  const visible = campo.type === 'text';
  campo.type = visible ? 'password' : 'text';
  e.currentTarget.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  e.currentTarget.setAttribute('aria-pressed', String(!visible));
});

$('#form-entrar').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
  const email = $('#e-email').value.trim();
  const password = $('#e-pass').value;
  try {
    if (email.toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      if (usaSupabase) {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) return errAuth(traducir(error.message));
        modalAuth.close(); e.target.reset();
        return;
      }
      usuario = { id: 'admin', email: ADMIN_EMAIL, user_metadata: { negocio: 'Administración' } };
      miPerfil = { id: 'admin', negocio: 'Administración', responsable: 'Admin', whatsapp: CONTACTO_WHATSAPP, categoria: 'General', descripcion: 'Panel de administración', avatar_emoji: '🏞️', avatar_url: '' };
      localStorage.setItem('de_nuestra_tierra_user', JSON.stringify(usuario));
      pintarZonaUsuario();
      modalAuth.close(); e.target.reset();
      abrirAdmin();
      return;
    }
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return errAuth(traducir(error.message));
    modalAuth.close(); e.target.reset();
  } catch (error) {
    errAuth('No se pudo iniciar sesión. Revisa tu conexión e inténtalo nuevamente.');
    console.error('Error de inicio de sesión:', error);
  } finally {
    btn.disabled = false;
  }
});

$('#form-crear').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
  $('#auth-error').hidden = true;
  try {
    const negocio = $('#c-negocio').value.trim();
    const responsable = $('#c-responsable').value.trim();
    const email = $('#c-email').value.trim();
    const password = $('#c-pass').value;
    const passwordConfirmada = $('#c-pass-confirmar').value;
    const numeroWhatsApp = soloDigitos($('#c-whats').value);
    const whatsapp = `${$('#c-codigo-pais').value}${numeroWhatsApp}`;
    if (password !== passwordConfirmada) {
      errAuth('Las contraseñas no coinciden. Escríbelas nuevamente.', false);
      btn.disabled = false;
      return;
    }
    if (whatsapp.length < 8 || whatsapp.length > 15) {
      errAuth('Revisa el número de WhatsApp y el código de país. Debe tener entre 8 y 15 dígitos en total.', false);
      btn.disabled = false;
      return;
    }
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: URL_REDIRECCION_AUTH,
        data: {
          negocio,
          responsable,
          whatsapp,
          categoria: $('#c-categoria').value
        }
      }
    });
    if (error) throw new Error(traducir(error.message));
    if (!data.session) {
      errAuth('Cuenta creada ✅ Abre el enlace del correo para confirmar. Volverás aquí con tu sesión iniciada automáticamente.', true);
      btn.disabled = false; return;
    }
    usuario = data.session.user;
    const { error: errorPerfil } = await db.from('vendedores').upsert({
      id: usuario.id,
      negocio,
      responsable,
      whatsapp,
      categoria: $('#c-categoria').value,
      descripcion: 'Tienda creada desde Cerca de ti.'
    });
    if (errorPerfil) throw errorPerfil;
    await cargarPerfil();
    if (!miPerfil) throw new Error('La cuenta se creó, pero no se pudo cargar el perfil de la tienda.');
    pintarZonaUsuario();
    modalAuth.close(); e.target.reset();
    abrirPanel();
  } catch (er) { errAuth(er.message); }
  btn.disabled = false;
});

/* ---------- Imágenes: redimensionar y subir ---------- */
function procesarImagen(file, max = 900) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(url); res(b); }, 'image/jpeg', .82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Formato de imagen no compatible. Usa JPG, PNG o WebP.')); };
    img.src = url;
  });
}

async function subirFoto(blob, ruta) {
  const { error } = await db.storage.from('fotos').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const url = new URL(db.storage.from('fotos').getPublicUrl(ruta).data.publicUrl);
  url.searchParams.set('v', String(Date.now()));
  return url.href;
}

function abrirFormularioPromocion() {
  if (!usuario) return abrirAuth('entrar');
  if (usuario.email === ADMIN_EMAIL) return abrirAdmin();
  if (!miPerfil) return abrirPanel();
  const selector = $('#promo-producto');
  const propios = productos.filter(producto => producto.vendedor_id === usuario.id);
  selector.innerHTML = '<option value="">Promoción personalizada</option>' + propios.map(producto =>
    `<option value="${esc(producto.id)}">${esc(producto.nombre)}</option>`
  ).join('');
  if (vistaPreviaPromocionUrl) URL.revokeObjectURL(vistaPreviaPromocionUrl);
  vistaPreviaPromocionUrl = null;
  $('#form-promocion').reset();
  $('#promo-dias').value = '7';
  $('#promo-imagen').value = '';
  $('#promo-imagen-label').textContent = '📷 Elegir imagen de la promoción';
  $('#promo-imagen-preview').innerHTML = '';
  $('#promocion-msg').hidden = true;
  modalPromocion.showModal();
}

$('#btn-crear-promocion').addEventListener('click', abrirFormularioPromocion);
$('#btn-panel-publicar').addEventListener('click', () => {
  modalPanel.close();
  abrirPublicador();
});

$('#promo-producto').addEventListener('change', e => {
  const producto = productos.find(item => item.id === e.target.value && item.vendedor_id === usuario?.id);
  if ($('#promo-imagen').files[0]) return;
  if (!producto) {
    $('#promo-imagen-preview').innerHTML = '';
    return;
  }
  $('#promo-titulo').value = producto.nombre;
  $('#promo-descripcion').value = producto.detalle || '';
  const foto = Array.isArray(producto.fotos) ? urlImagen(producto.fotos[0]) : '';
  $('#promo-imagen-preview').innerHTML = foto ? `<img src="${esc(foto)}" alt="Imagen del producto seleccionado">` : '';
});

$('#promo-imagen').addEventListener('change', e => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type) || archivo.size > 6 * 1024 * 1024) {
    e.target.value = '';
    $('#promo-imagen-preview').innerHTML = '';
    $('#promocion-msg').hidden = false;
    $('#promocion-msg').className = 'modal-nota msg-error';
    $('#promocion-msg').textContent = 'Elige una imagen JPG, PNG o WebP de hasta 6 MB.';
    return;
  }
  $('#promo-imagen-label').textContent = `📷 ${archivo.name}`;
  if (vistaPreviaPromocionUrl) URL.revokeObjectURL(vistaPreviaPromocionUrl);
  vistaPreviaPromocionUrl = URL.createObjectURL(archivo);
  $('#promo-imagen-preview').innerHTML = `<img src="${esc(vistaPreviaPromocionUrl)}" alt="Vista previa de la promoción">`;
  $('#promocion-msg').hidden = true;
});

function blobADataUrl(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => typeof lector.result === 'string' ? resolve(lector.result) : reject(new Error('No se pudo preparar la imagen.'));
    lector.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    lector.readAsDataURL(blob);
  });
}

$('#form-promocion').addEventListener('submit', async e => {
  e.preventDefault();
  const boton = $('#btn-enviar-promocion');
  const msg = $('#promocion-msg');
  let rutaFotoSubida = null;
  boton.disabled = true;
  try {
    const producto = productos.find(item => item.id === $('#promo-producto').value && item.vendedor_id === usuario?.id);
    const titulo = $('#promo-titulo').value.trim();
    const descripcion = $('#promo-descripcion').value.trim();
    const duracion = Number($('#promo-dias').value);
    if (titulo.length < 3 || descripcion.length < 10) throw new Error('Escribe un título de al menos 3 caracteres y una descripción de al menos 10.');
    if (!Number.isInteger(duracion) || duracion < 1 || duracion > 30) throw new Error('La duración debe ser de 1 a 30 días.');
    const archivo = $('#promo-imagen').files[0];
    let imagenUrl = producto && Array.isArray(producto.fotos) ? urlImagen(producto.fotos[0]) : '';
    if (archivo) {
      const blob = await procesarImagen(archivo, 1400);
      if (!blob) throw new Error('No se pudo procesar la imagen seleccionada.');
      if (usaSupabase && !modoDemo) {
        rutaFotoSubida = `promociones/${usuario.id}/${Date.now()}.jpg`;
        imagenUrl = await subirFoto(blob, rutaFotoSubida);
      } else {
        imagenUrl = await blobADataUrl(blob);
      }
    }
    if (!imagenUrl) throw new Error('Elige una imagen o selecciona un producto que ya tenga foto.');
    const registro = {
      vendedor_id: usuario.id,
      producto_id: producto?.id || null,
      titulo,
      descripcion,
      imagen_url: imagenUrl,
      duracion_dias: duracion,
      estado: 'pendiente',
      vence_en: null
    };
    const { error } = await db.from('promociones').insert(registro);
    if (error) throw error;
    await cargarPromociones();
    renderAdminPanel();
    modalPromocion.close();
    e.target.reset();
    $('#promo-imagen-preview').innerHTML = '';
    if (vistaPreviaPromocionUrl) URL.revokeObjectURL(vistaPreviaPromocionUrl);
    vistaPreviaPromocionUrl = null;
    alert('Promoción enviada. Aparecerá en la vitrina cuando administración la apruebe.');
  } catch (error) {
    msg.hidden = false;
    msg.className = 'modal-nota msg-error';
    msg.textContent = `No se pudo enviar la promoción: ${error.message}`;
    if (rutaFotoSubida && usaSupabase && !modoDemo) {
      try {
        const { error: errorLimpieza } = await db.storage.from('fotos').remove([rutaFotoSubida]);
        if (errorLimpieza) throw errorLimpieza;
      } catch (errorLimpieza) {
        console.error('No se pudo eliminar la imagen de una promoción que no se guardó:', errorLimpieza);
        msg.textContent += ' Además, no se pudo limpiar la imagen subida; contacta con administración.';
      }
    }
  } finally {
    boton.disabled = false;
  }
});

/* ---------- Panel: abrir y cargar perfil ---------- */
function abrirPanel() {
  if (!usuario) return abrirAuth('entrar');
  if (usuario.email === ADMIN_EMAIL) return abrirAdmin();
  if (miPerfil) {
    $('#p-negocio').value = miPerfil.negocio || '';
    $('#p-responsable').value = miPerfil.responsable || '';
    $('#p-descripcion').value = miPerfil.descripcion || '';
    $('#p-whats').value = separarCodigoPais(miPerfil.whatsapp || '');
    $('#p-categoria').value = miPerfil.categoria || 'Alimentos';
    $('#p-direccion').value = miPerfil.direccion || '';
    $('#p-emoji').value = miPerfil.avatar_emoji || '';
    $('#avatar-preview').innerHTML = urlImagen(miPerfil.avatar_url)
      ? `<img src="${esc(urlImagen(miPerfil.avatar_url))}" alt="">`
      : esc(miPerfil.avatar_emoji || '🏪');
    $('#p-avatar').value = '';
  }
  prepararCompartirTienda();
  pintarMisProductos();
  modalPanel.showModal();
}

function urlPublicaTienda(id) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('tienda', id);
  return url.href;
}

function mostrarMensajeCompartir(mensaje, esError = false, idMensaje = 'compartir-mensaje') {
  const estadoCompartir = $(`#${idMensaje}`);
  estadoCompartir.hidden = false;
  estadoCompartir.textContent = mensaje;
  estadoCompartir.classList.toggle('compartir-mensaje--error', esError);
}

function generarCodigoQR(contenedor, url) {
  contenedor.replaceChildren();
  if (typeof QRCode !== 'function') throw new Error('No se pudo cargar el generador de códigos QR.');
  new QRCode(contenedor, {
    text: url,
    width: 220,
    height: 220,
    colorDark: '#183326',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

function prepararCompartirTienda() {
  if (!miPerfil?.id) {
    $('#tienda-enlace').value = '';
    $('#tienda-qr').replaceChildren();
    mostrarMensajeCompartir('Guarda primero los datos de tu tienda para generar su enlace y código QR únicos.', true);
    return;
  }
  const url = urlPublicaTienda(miPerfil.id);
  $('#tienda-enlace').value = url;
  $('#compartir-mensaje').hidden = true;
  try {
    generarCodigoQR($('#tienda-qr'), url);
  } catch (error) {
    mostrarMensajeCompartir(`${error.message} Puedes compartir el enlace de tu tienda.`, true);
  }
}

async function copiarEnlaceTienda(idCampo, idMensaje) {
  const enlace = $(`#${idCampo}`).value;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(enlace);
    } else {
      const campo = $(`#${idCampo}`);
      campo.focus();
      campo.select();
      if (!document.execCommand('copy')) throw new Error('El navegador no permitió copiar el enlace.');
    }
    mostrarMensajeCompartir('Enlace copiado. Ya puedes enviarlo a tus clientes.', false, idMensaje);
    return true;
  } catch (error) {
    mostrarMensajeCompartir(`No se pudo copiar el enlace: ${error.message}`, true, idMensaje);
    return false;
  }
}

async function compartirEnlaceTienda(vendedor, idCampo, idMensaje) {
  const enlace = $(`#${idCampo}`).value;
  try {
    if (navigator.share) {
      await navigator.share({ title: vendedor.negocio, text: `Visita ${vendedor.negocio} en Cerca de ti`, url: enlace });
    } else {
      const copiado = await copiarEnlaceTienda(idCampo, idMensaje);
      if (copiado) mostrarMensajeCompartir('Este navegador no ofrece el menú de aplicaciones. Copiamos el enlace para que puedas compartirlo.', false, idMensaje);
    }
  } catch (error) {
    if (error.name !== 'AbortError') mostrarMensajeCompartir(`No se pudo compartir el enlace: ${error.message}`, true, idMensaje);
  }
}

function obtenerImagenQR(idContenedor) {
  const canvas = $(`#${idContenedor} canvas`);
  if (!canvas) throw new Error('El código QR aún no está disponible. Vuelve a abrir esta sección e inténtalo otra vez.');
  return canvas;
}

function ajustarTextoCanvas(contexto, texto, anchoMaximo, lineasMaximas) {
  const palabras = texto.split(/\s+/);
  const lineas = [];
  let linea = '';
  for (const palabra of palabras) {
    const candidata = linea ? `${linea} ${palabra}` : palabra;
    if (linea && contexto.measureText(candidata).width > anchoMaximo) {
      lineas.push(linea);
      linea = '';
    }
    if (contexto.measureText(palabra).width > anchoMaximo) {
      let fragmento = '';
      for (const caracter of palabra) {
        if (fragmento && contexto.measureText(fragmento + caracter).width > anchoMaximo) {
          lineas.push(fragmento);
          fragmento = caracter;
        } else {
          fragmento += caracter;
        }
      }
      linea = fragmento;
    } else {
      linea = linea ? `${linea} ${palabra}` : palabra;
    }
  }
  if (linea) lineas.push(linea);
  if (lineas.length > lineasMaximas) {
    lineas.length = lineasMaximas;
    let ultima = lineas[lineasMaximas - 1];
    while (ultima && contexto.measureText(`${ultima}…`).width > anchoMaximo) ultima = ultima.slice(0, -1);
    lineas[lineasMaximas - 1] = `${ultima}…`;
  }
  return lineas;
}

async function crearPDFCodigoQR(canvasQR, vendedor, url) {
  const hoja = document.createElement('canvas');
  hoja.width = 1240;
  hoja.height = 1754;
  const contexto = hoja.getContext('2d');
  if (!contexto) throw new Error('No se pudo preparar el PDF del código QR.');
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, hoja.width, hoja.height);
  contexto.fillStyle = '#183326';
  contexto.textAlign = 'center';
  contexto.textBaseline = 'middle';
  contexto.font = 'bold 64px Arial, sans-serif';
  const nombre = ajustarTextoCanvas(contexto, vendedor.negocio || 'Tienda', 1040, 2);
  nombre.forEach((linea, indice) => contexto.fillText(linea, 620, 205 + indice * 80));
  contexto.fillStyle = '#526258';
  contexto.font = '36px Arial, sans-serif';
  contexto.fillText('Escanea el código para ver nuestra tienda y productos', 620, 390);
  contexto.imageSmoothingEnabled = false;
  contexto.drawImage(canvasQR, 220, 470, 800, 800);
  contexto.fillStyle = '#183326';
  contexto.font = 'bold 36px Arial, sans-serif';
  contexto.fillText('Encuéntranos en Cerca de ti', 620, 1380);
  contexto.fillStyle = '#526258';
  contexto.font = '24px Arial, sans-serif';
  const urlLineas = ajustarTextoCanvas(contexto, url, 1040, 3);
  urlLineas.forEach((linea, indice) => contexto.fillText(linea, 620, 1440 + indice * 38));

  const jpeg = await new Promise((resolve, reject) => hoja.toBlob(
    imagen => imagen ? resolve(imagen) : reject(new Error('No se pudo generar la imagen para el PDF.')),
    'image/jpeg',
    0.94
  ));
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  const codificar = texto => new TextEncoder().encode(texto);
  const unirBytes = partes => {
    const resultado = new Uint8Array(partes.reduce((total, parte) => total + parte.length, 0));
    let desplazamiento = 0;
    partes.forEach(parte => {
      resultado.set(parte, desplazamiento);
      desplazamiento += parte.length;
    });
    return resultado;
  };
  const contenido = codificar('q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n');
  const objetoImagen = unirBytes([
    codificar(`<< /Type /XObject /Subtype /Image /Width ${hoja.width} /Height ${hoja.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
    jpegBytes,
    codificar('\nendstream')
  ]);
  const objetos = [
    codificar('<< /Type /Catalog /Pages 2 0 R >>'),
    codificar('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    codificar('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
    objetoImagen,
    unirBytes([
      codificar(`<< /Length ${contenido.length} >>\nstream\n`),
      contenido,
      codificar('endstream')
    ])
  ];
  const cabecera = codificar('%PDF-1.4\n');
  const partes = [cabecera];
  const offsets = [0];
  let longitud = cabecera.length;
  objetos.forEach((objeto, indice) => {
    offsets.push(longitud);
    const inicio = codificar(`${indice + 1} 0 obj\n`);
    const fin = codificar('\nendobj\n');
    partes.push(inicio, objeto, fin);
    longitud += inicio.length + objeto.length + fin.length;
  });
  const inicioXref = longitud;
  const tablaXref = [
    codificar(`xref\n0 ${objetos.length + 1}\n`),
    codificar('0000000000 65535 f \n'),
    ...offsets.slice(1).map(offset => codificar(`${String(offset).padStart(10, '0')} 00000 n \n`))
  ];
  const trailer = codificar(`trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`);
  return new Blob([...partes, ...tablaXref, trailer], { type: 'application/pdf' });
}

async function descargarPDFCodigoQR(idContenedor, vendedor, url, idMensaje) {
  try {
    const canvas = obtenerImagenQR(idContenedor);
    const pdf = await crearPDFCodigoQR(canvas, vendedor, url);
    const descarga = document.createElement('a');
    const archivoUrl = URL.createObjectURL(pdf);
    descarga.href = archivoUrl;
    descarga.download = `codigo-qr-${vendedor.id}.pdf`;
    descarga.click();
    setTimeout(() => URL.revokeObjectURL(archivoUrl), 1000);
    mostrarMensajeCompartir('PDF del código QR descargado. Ya puedes imprimirlo desde el archivo.', false, idMensaje);
  } catch (error) {
    mostrarMensajeCompartir(`No se pudo descargar el PDF: ${error.message}`, true, idMensaje);
  }
}

async function compartirImagenQR(vendedor, idContenedor, idCampo, idMensaje) {
  try {
    const canvas = obtenerImagenQR(idContenedor);
    const datosQR = canvas.toDataURL('image/png').split(',')[1];
    const bytesQR = Uint8Array.from(atob(datosQR), caracter => caracter.charCodeAt(0));
    const archivo = new File([bytesQR], `codigo-qr-${vendedor.id}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({ title: `Código QR de ${vendedor.negocio}`, files: [archivo] });
      mostrarMensajeCompartir('Código QR compartido con las aplicaciones disponibles.', false, idMensaje);
    } else if (navigator.share) {
      await navigator.share({
        title: `Código QR de ${vendedor.negocio}`,
        text: `Abre la tienda ${vendedor.negocio}:`,
        url: $(`#${idCampo}`).value
      });
      mostrarMensajeCompartir('Se abrió el menú de aplicaciones para compartir el enlace. Este navegador no permite adjuntar la imagen del QR.', false, idMensaje);
    } else {
      mostrarMensajeCompartir('Este navegador no ofrece el menú de aplicaciones para compartir. Descarga el PDF del QR y compártelo desde tu dispositivo.', true, idMensaje);
    }
  } catch (error) {
    if (error.name !== 'AbortError') mostrarMensajeCompartir(`No se pudo compartir el QR: ${error.message}`, true, idMensaje);
  }
}

function abrirPublicador() {
  if (!usuario) return abrirAuth('entrar');
  if (usuario.email === ADMIN_EMAIL) return abrirAdmin();
  if (!miPerfil) return abrirPanel();
  modalPublicar.showModal();
  requestAnimationFrame(() => {
    $('#g-nombre').focus();
  });
}

function actualizarAvisoAdmin() {
  const aviso = $('#admin-aviso');
  let mensaje = !usaSupabase
    ? 'Modo de demostración o local: los cambios se guardan solo en este navegador y no modifican datos compartidos.'
    : 'Los cambios se guardan en la base de datos y se reflejan en la vitrina pública.';
  const pendientes = erroresExpiracionDestacados.size;
  if (pendientes) {
    mensaje += ` ${pendientes} destacado(s) vencido(s) ya no se muestran, pero no se pudo sincronizar su estado en Supabase. Revisa la conexión, la columna destacado_hasta y los permisos de administración.`;
  }
  if (ultimoErrorCargaDatos) {
    mensaje += ` No se pudieron cargar los datos compartidos: ${ultimoErrorCargaDatos}.`;
  }
  aviso.textContent = mensaje;
  const hayError = pendientes > 0 || Boolean(ultimoErrorCargaDatos);
  aviso.classList.toggle('admin-aviso--error', hayError);
  aviso.setAttribute('role', hayError ? 'alert' : 'status');
}

function filtrarRegistrosAdmin(tipo, valor) {
  const contenedor = tipo === 'tienda' ? $('#admin-tiendas') : $('#admin-productos');
  const consulta = normalizar(valor.trim());
  const filtro = $(`[data-admin-filtro-destacado="${tipo}"]`).value;
  const elementos = [...contenedor.querySelectorAll('.admin-item[data-admin-texto]')];
  elementos.forEach(item => {
    const coincideBusqueda = !consulta || item.dataset.adminTexto.includes(consulta);
    const coincideDestacado = filtro === 'todos'
      || (filtro === 'destacados' && item.dataset.destacado === 'true')
      || (filtro === 'sin-destacar' && item.dataset.destacado !== 'true');
    item.hidden = !(coincideBusqueda && coincideDestacado);
  });
  const visibles = elementos.filter(item => !item.hidden).length;
  $(`#admin-${tipo === 'tienda' ? 'tiendas' : 'productos'}-conteo`).textContent =
    `${visibles} de ${elementos.length}`;
}

function renderAdminPanel() {
  const adminResenas = $('#admin-reseñas');
  const adminTiendas = $('#admin-tiendas');
  const adminProductos = $('#admin-productos');
  const adminPromociones = $('#admin-promociones');
  const adminSolicitudes = $('#admin-solicitudes');
  const state = readLocalState();
  const filtrosActuales = Object.fromEntries(['tienda', 'producto'].map(tipo => [
    tipo,
    {
      busqueda: $(`[data-admin-buscar="${tipo}"]`).value,
      destacado: $(`[data-admin-filtro-destacado="${tipo}"]`).value
    }
  ]));
  const tiendasActuales = Object.values(vendedores).sort((a, b) =>
    Number(destacadoVigente(b)) - Number(destacadoVigente(a))
    || (a.negocio || '').localeCompare(b.negocio || '', 'es')
  );
  const productosActuales = [...productos].sort((a, b) =>
    Number(destacadoVigente(b)) - Number(destacadoVigente(a))
    || (a.nombre || '').localeCompare(b.nombre || '', 'es')
  );
  actualizarAvisoAdmin();

  const reseñas = state.reseñas || [];
  adminResenas.innerHTML = reseñas.length
    ? reseñas.map(r => `
        <div class="admin-item">
          <strong>${esc(r.nombre)} · ${esc(r.negocio)}</strong>
          <small>${esc(r.texto)}</small>
          <small>Estado: ${r.aprobado ? 'Aprobada' : 'Pendiente de revisión'}</small>
          <div class="admin-actions">
            ${r.aprobado ? '' : `<button type="button" class="boton-ok" data-reseña-aprobar="${r.id}">Aprobar</button>`}
            <button type="button" class="boton-peligro" data-reseña-eliminar="${r.id}">Eliminar</button>
          </div>
        </div>
      `).join('')
    : '<p class="producto-detalle">No hay reseñas para revisar.</p>';

  adminTiendas.innerHTML = tiendasActuales.map(v => `
    <div class="admin-item" data-destacado="${destacadoVigente(v)}" data-admin-texto="${esc(normalizar(`${v.negocio || ''} ${v.responsable || ''} ${v.categoria || ''} ${v.whatsapp || ''}`))}">
      <strong>${esc(v.negocio || 'Tienda sin nombre')}</strong>
      <small>${esc(v.responsable || 'Sin responsable')} · ${esc(v.categoria || 'General')}</small>
      ${controlesDestacado('tienda', v)}
      <details class="admin-editor">
        <summary>Editar datos de la tienda</summary>
        <form class="admin-editor-form" data-admin-editar-tienda="${esc(v.id)}">
          <label>Nombre del negocio<input name="negocio" value="${esc(v.negocio)}" maxlength="120" required></label>
          <label>Responsable<input name="responsable" value="${esc(v.responsable)}" maxlength="120"></label>
          <label>WhatsApp<input name="whatsapp" type="tel" value="${esc(v.whatsapp)}" maxlength="20"></label>
          <label>Categoría principal<select name="categoria" required>${opcionesCategoriaAdmin(v.categoria)}</select></label>
          <label>Dirección<input name="direccion" value="${esc(v.direccion)}" maxlength="180"></label>
          <label>Emoji<input name="avatar_emoji" value="${esc(v.avatar_emoji)}" maxlength="8"></label>
          <label class="admin-editor-ancho">Descripción<textarea name="descripcion" rows="3" maxlength="800">${esc(v.descripcion)}</textarea></label>
          <label class="admin-editor-ancho">URL de la foto de perfil<input name="avatar_url" type="url" value="${esc(v.avatar_url)}" placeholder="https://"></label>
          <div class="admin-actions admin-editor-ancho">
            <button type="submit" class="boton-ok">Guardar cambios</button>
            <button type="button" class="boton-peligro" data-tienda-eliminar="${esc(v.id)}">Eliminar tienda y sus productos</button>
          </div>
        </form>
      </details>
    </div>
  `).join('') || '<p class="producto-detalle">No hay tiendas registradas.</p>';

  adminProductos.innerHTML = productosActuales.map(p => `
    <div class="admin-item" data-destacado="${destacadoVigente(p)}" data-admin-texto="${esc(normalizar(`${p.nombre || ''} ${p.categoria || ''} ${vendedores[p.vendedor_id]?.negocio || ''} ${p.detalle || ''}`))}">
      <strong>${esc(p.nombre)}</strong>
      <small>${esc(p.categoria || 'General')} · S/ ${fmtPrecio(p.precio)} · ${esc(vendedores[p.vendedor_id]?.negocio || 'Tienda no encontrada')}</small>
      ${controlesDestacado('producto', p)}
      <details class="admin-editor">
        <summary>Editar datos del producto</summary>
        <form class="admin-editor-form" data-admin-editar-producto="${esc(p.id)}">
          <label>Nombre<input name="nombre" value="${esc(p.nombre)}" maxlength="120" required></label>
          <label>Categoría<select name="categoria" required>${opcionesCategoriaAdmin(p.categoria)}</select></label>
          <label>Precio (S/)<input name="precio" type="number" min="0" step="0.01" value="${esc(p.precio)}" required></label>
          <label class="admin-editor-ancho">Descripción<textarea name="detalle" rows="3" maxlength="1200">${esc(p.detalle)}</textarea></label>
          <label class="admin-editor-ancho">Etiquetas (separadas por coma, máximo 5)<input name="tags" value="${esc(etiquetasProducto(p).join(', '))}" maxlength="300"></label>
          <label class="admin-editor-ancho">Fotos (una URL https:// por línea, máximo 6)<textarea name="fotos" rows="3">${esc((Array.isArray(p.fotos) ? p.fotos : []).join('\n'))}</textarea></label>
          <div class="admin-actions admin-editor-ancho">
            <button type="submit" class="boton-ok">Guardar cambios</button>
            <button type="button" class="boton-peligro" data-producto-eliminar="${esc(p.id)}">Eliminar producto</button>
          </div>
        </form>
      </details>
    </div>
  `).join('') || '<p class="producto-detalle">No hay productos en la vitrina.</p>';

  adminPromociones.innerHTML = promociones.length
    ? promociones.map(promocion => {
      const vendedor = vendedores[promocion.vendedor_id] || {};
      const vencimiento = promocion.vence_en ? ` · vence ${fechaCorta(promocion.vence_en)}` : '';
      const estado = promocion.estado === 'aprobada' ? 'Aprobada' : promocion.estado === 'rechazada' ? 'Rechazada' : 'Pendiente';
      const foto = urlImagen(promocion.imagen_url);
      return `<div class="admin-item">
        <strong>${esc(promocion.titulo)}</strong>
        <small>${esc(vendedor.negocio || 'Tienda no encontrada')} · ${promocion.duracion_dias} días · ${estado}${vencimiento}</small>
        <small>${esc(promocion.descripcion)}</small>
        ${foto ? `<img class="admin-promocion-imagen" src="${esc(foto)}" alt="" loading="lazy">` : ''}
        <div class="admin-actions">
          ${promocion.estado === 'pendiente' ? `<button type="button" class="boton-ok" data-promo-admin-aprobar="${esc(promocion.id)}">Aprobar e iniciar contador</button><button type="button" class="boton-peligro" data-promo-admin-rechazar="${esc(promocion.id)}">Rechazar</button>` : ''}
          <button type="button" class="boton-peligro" data-promo-admin-eliminar="${esc(promocion.id)}">Eliminar</button>
        </div>
      </div>`;
    }).join('')
    : '<p class="producto-detalle">No hay promociones pendientes ni publicadas.</p>';

  const solicitudesOrdenadas = [...solicitudesDestacado].sort((a, b) =>
    (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1)
    || new Date(b.creado_en || 0) - new Date(a.creado_en || 0)
  );
  const solicitudesPendientes = solicitudesDestacado.filter(solicitud => solicitud.estado === 'pendiente').length;
  $('#admin-solicitudes-pendientes').textContent = String(solicitudesPendientes);
  $('#admin-solicitudes-conteo').textContent =
    `${solicitudesPendientes} pendiente(s) · ${solicitudesDestacado.length} total`;
  const avisoSolicitudes = $('#admin-solicitudes-aviso');
  avisoSolicitudes.hidden = !errorCargaSolicitudes;
  avisoSolicitudes.textContent = errorCargaSolicitudes
    ? `No se pudieron cargar las solicitudes: ${errorCargaSolicitudes}. En Supabase, ejecuta la actualización de solicitudes_destacado incluida en supabase.sql y vuelve a actualizar los datos.`
    : '';
  adminSolicitudes.innerHTML = !errorCargaSolicitudes && solicitudesOrdenadas.length
    ? solicitudesOrdenadas.map(s => {
        const producto = productos.find(item => item.id === s.producto_id)
          || state.productos.find(item => item.id === s.producto_id);
        const vendedor = vendedores[s.vendedor_id] || state.vendedores[s.vendedor_id] || {};
        const estadoSolicitud = s.estado === 'pendiente'
          ? 'Pendiente de pago'
          : s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada';
        const whatsapp = soloDigitos(vendedor.whatsapp);
        const contacto = whatsapp
          ? `<a class="boton-ok" href="https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola ${vendedor.negocio || ''}, revisamos tu solicitud de destacado para ${producto?.nombre || 'tu producto'}.`)}" target="_blank" rel="noopener">Contactar al vendedor</a>`
          : '';
        return `<div class="admin-item admin-solicitud admin-solicitud--${esc(s.estado)}">
          <div class="admin-solicitud-cabecera">
            <strong>${esc(producto?.nombre || 'Producto eliminado')}</strong>
            <span class="admin-solicitud-estado">${estadoSolicitud}</span>
          </div>
          <small>${esc(vendedor.negocio || 'Tienda no encontrada')} · ${Number(s.dias)} días · S/ ${fmtPrecio(s.precio)}</small>
          <small>Solicitado: ${s.creado_en ? esc(fechaCorta(s.creado_en)) : 'Fecha no disponible'}</small>
          <div class="admin-actions">
            ${contacto}
            ${s.estado === 'pendiente' ? `<button type="button" class="boton-ok" data-solicitud-aprobar="${esc(s.id)}">Confirmar pago y destacar</button><button type="button" class="boton-peligro" data-solicitud-rechazar="${esc(s.id)}">Rechazar</button>` : ''}
            ${s.estado === 'rechazada' ? `<button type="button" class="boton-peligro" data-solicitud-eliminar="${esc(s.id)}">Eliminar solicitud rechazada</button>` : ''}
          </div>
        </div>`;
      }).join('')
    : errorCargaSolicitudes
      ? ''
      : '<p class="producto-detalle">No hay solicitudes de destacado.</p>';

  $$('[data-admin-buscar]').forEach(input => {
    const filtro = filtrosActuales[input.dataset.adminBuscar];
    input.value = filtro.busqueda;
    $(`[data-admin-filtro-destacado="${input.dataset.adminBuscar}"]`).value = filtro.destacado;
    filtrarRegistrosAdmin(input.dataset.adminBuscar, input.value);
  });
}

$$('[data-admin-buscar]').forEach(input => input.addEventListener('input', () => {
  filtrarRegistrosAdmin(input.dataset.adminBuscar, input.value);
}));
$$('[data-admin-filtro-destacado]').forEach(select => select.addEventListener('change', () => {
  filtrarRegistrosAdmin(select.dataset.adminFiltroDestacado, $(`[data-admin-buscar="${select.dataset.adminFiltroDestacado}"]`).value);
}));

$('#admin-recargar').addEventListener('click', async e => {
  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    await cargarDatos();
    try {
      await cargarSolicitudesDestacado();
    } catch (error) {
      errorCargaSolicitudes = error.message;
      console.error('No se pudieron actualizar las solicitudes de destacado:', error);
    }
    renderAdminPanel();
  } catch (error) {
    alert(`No se pudieron actualizar los datos de administración: ${error.message}`);
  } finally {
    boton.disabled = false;
  }
});

async function abrirAdmin() {
  if (!usuario) return abrirAuth('entrar');
  if (usuario.email !== ADMIN_EMAIL) {
    errAuth('Este panel es solo para administración.', false);
    return;
  }
  await cargarDatos();
  try {
    await cargarSolicitudesDestacado();
  } catch (error) {
    errorCargaSolicitudes = error.message;
    console.error('No se pudieron cargar las solicitudes de destacado:', error);
  }
  renderAdminPanel();
  modalAdmin.showModal();
}

async function solicitarDestacado(productoId, vendedorId, dias) {
  const plan = PLANES_DESTACADO[dias];
  if (!plan) return;
  const state = readLocalState();
  const producto = productos.find(p => p.id === productoId)
    || state.productos.find(p => p.id === productoId);
  if (!producto) return;
  const existente = (state.solicitudesDestacado || []).find(s => s.producto_id === productoId && s.estado === 'pendiente');
  if (existente) return alert('Este producto ya tiene una solicitud pendiente de confirmación.');
  const solicitud = {
    producto_id: productoId,
    vendedor_id: vendedorId,
    dias: plan.dias,
    precio: plan.precio,
    estado: 'pendiente'
  };
  const ventanaWhatsApp = window.open('', '_blank');
  const mensaje = `Hola, quiero destacar "${producto.nombre}" por ${plan.dias} días. El monto es S/ ${plan.precio}. Adjunto mi comprobante de pago.`;
  try {
    if (usaSupabase) {
      const { error } = await db.from('solicitudes_destacado').insert(solicitud);
      if (error) {
        if (error.code === '23505') throw new Error('Ya tienes una solicitud pendiente para este producto.');
        if (error.code === 'PGRST205' || /solicitudes_destacado/i.test(error.message || '')) {
          throw new Error('Falta configurar las solicitudes en Supabase. Ejecuta la actualización de solicitudes_destacado incluida en supabase.sql.');
        }
        throw error;
      }
    } else {
      state.solicitudesDestacado = [{
        id: `sd-${Date.now()}`,
        ...solicitud,
        creado_en: new Date().toISOString()
      }, ...(state.solicitudesDestacado || [])];
      writeLocalState(state);
    }
    const urlWhatsApp = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
    if (ventanaWhatsApp) {
      ventanaWhatsApp.opener = null;
      ventanaWhatsApp.location.href = urlWhatsApp;
    }
    pintarMisProductos();
    alert(ventanaWhatsApp
      ? 'Solicitud registrada. Envía tu comprobante por WhatsApp; administración activará el destacado al confirmar el pago.'
      : 'Solicitud registrada, pero el navegador bloqueó la ventana de WhatsApp. Escríbenos al 940 771 593 y envía tu comprobante.');
  } catch (error) {
    ventanaWhatsApp?.close();
    alert(`No se pudo registrar la solicitud de destacado: ${error.message}`);
  }
}

$('#admin-reseñas').addEventListener('click', e => {
  const aprobar = e.target.closest('[data-reseña-aprobar]');
  const eliminar = e.target.closest('[data-reseña-eliminar]');
  const state = readLocalState();
  if (aprobar) {
    const item = state.reseñas.find(r => r.id === aprobar.dataset.reseñaAprobar);
    if (item) item.aprobado = true;
    writeLocalState(state);
    renderAdminPanel();
    renderizarReseñas();
  }
  if (eliminar) {
    if (!confirm('¿Eliminar esta reseña?')) return;
    state.reseñas = state.reseñas.filter(r => r.id !== eliminar.dataset.reseñaEliminar);
    writeLocalState(state);
    renderAdminPanel();
    renderizarReseñas();
  }
});

$('#admin-promociones').addEventListener('click', async e => {
  const aprobar = e.target.closest('[data-promo-admin-aprobar]');
  const rechazar = e.target.closest('[data-promo-admin-rechazar]');
  const eliminar = e.target.closest('[data-promo-admin-eliminar]');
  const id = aprobar?.dataset.promoAdminAprobar || rechazar?.dataset.promoAdminRechazar || eliminar?.dataset.promoAdminEliminar;
  if (!id) return;
  const boton = aprobar || rechazar || eliminar;
  if (eliminar && !confirm('¿Eliminar esta promoción? Esta acción no se puede deshacer.')) return;
  boton.disabled = true;
  try {
    if (eliminar) {
      await eliminarRegistro('promociones', id);
    } else {
      const registro = promociones.find(promocion => promocion.id === id);
      if (!registro) throw new Error('La promoción ya no está disponible. Actualiza los datos.');
      const estado = aprobar ? 'aprobada' : 'rechazada';
      const cambios = {
        estado,
        vence_en: aprobar
          ? new Date(Date.now() + Number(registro.duracion_dias) * MILISEGUNDOS_DIA).toISOString()
          : null
      };
      if (modoDemo || !usaSupabase || esDatoDemo(registro)) {
        const state = readLocalState();
        const guardado = state.promociones.find(item => item.id === id);
        if (!guardado) throw new Error('La promoción no existe en los datos locales.');
        Object.assign(guardado, cambios);
        writeLocalState(state);
      } else {
        const { error } = await db.from('promociones').update(cambios).eq('id', id);
        if (error) throw error;
        const { data, error: errorVerificacion } = await db.from('promociones').select('*').eq('id', id).maybeSingle();
        if (errorVerificacion) throw errorVerificacion;
        if (!data || data.estado !== estado || (aprobar && new Date(data.vence_en).getTime() !== new Date(cambios.vence_en).getTime())) {
          throw new Error('No se guardó la decisión. Verifica los permisos de administración y la conexión.');
        }
      }
    }
    await cargarPromociones();
    renderAdminPanel();
  } catch (error) {
    alert(`No se pudo procesar la promoción: ${error.message}`);
    boton.disabled = false;
  }
});

async function guardarDestacadoAdmin(tipo, id, activo, dias) {
  const tabla = tipo === 'tienda' ? 'vendedores' : 'productos';
  const elemento = tipo === 'tienda' ? vendedores[id] : productos.find(producto => producto.id === id);
  if (!elemento) throw new Error('El registro ya no está disponible. Actualiza el panel e inténtalo nuevamente.');
  const hasta = activo ? vencimientoDestacado(dias).toISOString() : null;
  await guardarDestacado(tabla, id, activo, hasta);
  elemento.destacado = activo;
  elemento.destacado_hasta = hasta;
  const state = readLocalState();
  if (tipo === 'tienda') state.vendedores[id] = { ...(state.vendedores[id] || {}), ...elemento };
  else state.productos = [...state.productos.filter(item => item.id !== id), { ...elemento }];
  writeLocalState(state);
  await cargarDatos();
  renderAdminPanel();
}

function conectarControlesDestacado(contenedor, tipo) {
  contenedor.addEventListener('input', e => {
    const campo = e.target.closest('[data-dias-destacado]');
    if (!campo || campo.dataset.diasDestacado !== tipo) return;
    const fecha = contenedor.querySelector(`[data-vencimiento-destacado="${tipo}"][data-id="${campo.dataset.id}"]`);
    const dias = Number(campo.value);
    if (fecha) fecha.textContent = Number.isInteger(dias) && dias >= 1 && dias <= DIAS_MAX_DESTACADO
      ? textoVencimiento(dias)
      : 'Ingresa entre 1 y 365 días';
  });
  contenedor.addEventListener('click', async e => {
    const activar = e.target.closest('[data-activar-destacado]');
    const quitar = e.target.closest('[data-quitar-destacado]');
    const boton = activar || quitar;
    if (!boton || boton.dataset[activar ? 'activarDestacado' : 'quitarDestacado'] !== tipo) return;
    const campo = [...contenedor.querySelectorAll('[data-dias-destacado]')]
      .find(input => input.dataset.diasDestacado === tipo && input.dataset.id === boton.dataset.id);
    const dias = Number(campo?.value);
    if (activar && (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAX_DESTACADO)) {
      campo?.reportValidity();
      return;
    }
    boton.disabled = true;
    try {
      await guardarDestacadoAdmin(tipo, boton.dataset.id, Boolean(activar), activar ? dias : null);
    } catch (error) {
      alert(`No se pudo actualizar el destacado: ${error.message}`);
      boton.disabled = false;
    }
  });
}

conectarControlesDestacado($('#admin-tiendas'), 'tienda');
conectarControlesDestacado($('#admin-productos'), 'producto');

function mostrarErrorEdicionAdmin(form, error) {
  let mensaje = form.querySelector('[data-admin-mensaje]');
  if (!mensaje) {
    mensaje = document.createElement('p');
    mensaje.className = 'admin-editor-mensaje';
    mensaje.setAttribute('role', 'alert');
    mensaje.dataset.adminMensaje = '';
    form.prepend(mensaje);
  }
  mensaje.textContent = `No se pudieron guardar los cambios: ${error.message}`;
}

function valorFormulario(form, nombre) {
  return String(new FormData(form).get(nombre) || '').trim();
}

function urlAdminSegura(valor, etiqueta) {
  if (!valor) return null;
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`${etiqueta}: introduce una URL válida.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${etiqueta}: solo se permiten enlaces HTTP o HTTPS.`);
  return url.href;
}

async function guardarEdicionAdmin(form, tipo) {
  const id = tipo === 'tienda' ? form.dataset.adminEditarTienda : form.dataset.adminEditarProducto;
  const tabla = tipo === 'tienda' ? 'vendedores' : 'productos';
  if (tipo === 'tienda' && !vendedores[id]) throw new Error('La tienda ya no existe.');
  if (tipo === 'producto' && !productos.some(producto => producto.id === id)) throw new Error('El producto ya no existe.');
  const cambios = tipo === 'tienda'
    ? {
      negocio: valorFormulario(form, 'negocio'),
      responsable: valorFormulario(form, 'responsable'),
      whatsapp: soloDigitos(valorFormulario(form, 'whatsapp')),
      categoria: valorFormulario(form, 'categoria'),
      direccion: valorFormulario(form, 'direccion') || null,
      descripcion: valorFormulario(form, 'descripcion') || null,
      avatar_emoji: valorFormulario(form, 'avatar_emoji') || '🏪',
      avatar_url: urlAdminSegura(valorFormulario(form, 'avatar_url'), 'Foto de perfil')
    }
    : {
      nombre: valorFormulario(form, 'nombre'),
      categoria: valorFormulario(form, 'categoria'),
      precio: Number(valorFormulario(form, 'precio')),
      detalle: valorFormulario(form, 'detalle') || null,
      tags: [...new Set(valorFormulario(form, 'tags').split(',').map(tag => tag.trim()).filter(Boolean))],
      fotos: valorFormulario(form, 'fotos').split(/\r?\n/).map(url => url.trim()).filter(Boolean)
        .map(url => urlAdminSegura(url, 'Foto del producto'))
    };
  if (!cambios.negocio && tipo === 'tienda') throw new Error('El nombre de la tienda es obligatorio.');
  if (!cambios.nombre && tipo === 'producto') throw new Error('El nombre del producto es obligatorio.');
  if (tipo === 'tienda' && cambios.whatsapp && (cambios.whatsapp.length < 8 || cambios.whatsapp.length > 15)) {
    throw new Error('El WhatsApp debe tener entre 8 y 15 dígitos.');
  }
  if (!CATEGORIAS_DEMO.includes(cambios.categoria)) throw new Error('Selecciona una categoría válida.');
  if (tipo === 'producto') {
    if (!Number.isFinite(cambios.precio) || cambios.precio < 0) throw new Error('El precio debe ser un número igual o mayor que cero.');
    if (cambios.tags.length > MAX_ETIQUETAS) throw new Error(`Usa como máximo ${MAX_ETIQUETAS} etiquetas.`);
    const urlsFotos = valorFormulario(form, 'fotos').split(/\r?\n/).map(url => url.trim()).filter(Boolean);
    if (urlsFotos.length > MAX_FOTOS) throw new Error(`Usa como máximo ${MAX_FOTOS} fotos.`);
    cambios.emoji = EMOJI_CAT[cambios.categoria] || '🛒';
  }
  const guardado = await actualizarRegistroAdmin(tabla, id, cambios);
  const state = readLocalState();
  if (tipo === 'tienda') {
    vendedores[id] = { ...vendedores[id], ...guardado };
    state.vendedores[id] = { ...(state.vendedores[id] || {}), ...guardado };
    writeLocalState(state);
  } else {
    guardarProductoLocal({ ...productos.find(producto => producto.id === id), ...guardado });
  }
  await cargarDatos();
  renderAdminPanel();
}

$('#admin-tiendas').addEventListener('submit', async e => {
  const form = e.target.closest('[data-admin-editar-tienda]');
  if (!form) return;
  e.preventDefault();
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await guardarEdicionAdmin(form, 'tienda');
  } catch (error) {
    mostrarErrorEdicionAdmin(form, error);
    boton.disabled = false;
  }
});

$('#admin-productos').addEventListener('submit', async e => {
  const form = e.target.closest('[data-admin-editar-producto]');
  if (!form) return;
  e.preventDefault();
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await guardarEdicionAdmin(form, 'producto');
  } catch (error) {
    mostrarErrorEdicionAdmin(form, error);
    boton.disabled = false;
  }
});

$('#admin-tiendas').addEventListener('click', async e => {
  const eliminar = e.target.closest('[data-tienda-eliminar]');
  if (!eliminar) return;
  const tiendaId = eliminar.dataset.tiendaEliminar;
  const productosTienda = productos.filter(producto => producto.vendedor_id === tiendaId);
  if (!confirm(`¿Eliminar esta tienda y sus ${productosTienda.length} productos? La acción no se puede deshacer.`)) return;
  eliminar.disabled = true;
  try {
    const state = readLocalState();
    const idsProductos = await eliminarTienda(tiendaId);
    const eliminado = productos.filter(producto => producto.vendedor_id === tiendaId);
    delete state.vendedores[tiendaId];
    state.productos = state.productos.filter(producto => producto.vendedor_id !== tiendaId);
    state.solicitudesDestacado = (state.solicitudesDestacado || []).filter(solicitud =>
      solicitud.vendedor_id !== tiendaId && !idsProductos.includes(solicitud.producto_id)
    );
    writeLocalState(state);
    await eliminarFotosProductos(eliminado);
    await cargarDatos();
    renderAdminPanel();
  } catch (error) {
    await cargarDatos();
    renderAdminPanel();
    alert(`No se pudo completar la eliminación de la tienda: ${error.message}`);
  }
});

$('#admin-productos').addEventListener('click', async e => {
  const eliminar = e.target.closest('[data-producto-eliminar]');
  if (!eliminar) return;
  const id = eliminar.dataset.productoEliminar;
  if (!confirm('¿Eliminar este producto? La acción no se puede deshacer.')) return;
  eliminar.disabled = true;
  try {
    const producto = productos.find(item => item.id === id);
    await eliminarRegistro('productos', id);
    const state = readLocalState();
    state.productos = state.productos.filter(item => item.id !== id);
    state.solicitudesDestacado = (state.solicitudesDestacado || []).filter(item => item.producto_id !== id);
    writeLocalState(state);
    await eliminarFotosProductos(producto ? [producto] : []);
    await cargarDatos();
    renderAdminPanel();
  } catch (error) {
    await cargarDatos();
    renderAdminPanel();
    alert(`No se pudo completar la eliminación del producto: ${error.message}`);
  }
});

$('#admin-solicitudes').addEventListener('click', async e => {
  const aprobar = e.target.closest('[data-solicitud-aprobar]');
  const rechazar = e.target.closest('[data-solicitud-rechazar]');
  const eliminar = e.target.closest('[data-solicitud-eliminar]');
  const id = aprobar?.dataset.solicitudAprobar
    || rechazar?.dataset.solicitudRechazar
    || eliminar?.dataset.solicitudEliminar;
  if (!id) return;
  const solicitud = solicitudesDestacado.find(item => item.id === id);
  if (!solicitud) return;
  if (eliminar && solicitud.estado !== 'rechazada') return;
  if (eliminar && !confirm('¿Eliminar esta solicitud rechazada? Esta acción no se puede deshacer.')) return;
  const boton = aprobar || rechazar || eliminar;
  boton.disabled = true;
  try {
    if (eliminar) {
      if (usaSupabase && !solicitud._local) {
        const { data, error } = await db.from('solicitudes_destacado')
          .delete().eq('id', id).eq('estado', 'rechazada').select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('No se eliminó la solicitud. Comprueba que esté rechazada y que tengas permisos de administración.');
      } else {
        const state = readLocalState();
        state.solicitudesDestacado = (state.solicitudesDestacado || []).filter(item => item.id !== id);
        writeLocalState(state);
      }
    } else if (aprobar) {
      const producto = productos.find(item => item.id === solicitud.producto_id)
        || readLocalState().productos.find(item => item.id === solicitud.producto_id);
      if (!producto) throw new Error('El producto solicitado ya no existe.');
      const destacadoHasta = new Date(Date.now() + Number(solicitud.dias) * MILISEGUNDOS_DIA).toISOString();
      await guardarDestacado('productos', producto.id, true, destacadoHasta);
      await actualizarSolicitudDestacado(id, {
        estado: 'aprobada',
        aprobada_en: new Date().toISOString()
      });
    } else if (rechazar) {
      await actualizarSolicitudDestacado(id, { estado: 'rechazada', aprobada_en: null });
    }
    await cargarDatos();
    await cargarSolicitudesDestacado();
    renderAdminPanel();
  } catch (error) {
    alert(`No se pudo procesar la solicitud: ${error.message}`);
    boton.disabled = false;
  }
});

$('#p-avatar').addEventListener('change', () => {
  const f = $('#p-avatar').files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { $('#avatar-preview').innerHTML = `<img src="${esc(urlImagen(r.result))}" alt="">`; };
  r.readAsDataURL(f);
});

$('#btn-copiar-tienda').addEventListener('click', () => copiarEnlaceTienda('tienda-enlace', 'compartir-mensaje'));
$('#btn-compartir-tienda').addEventListener('click', () => compartirEnlaceTienda(miPerfil, 'tienda-enlace', 'compartir-mensaje'));
$('#btn-compartir-qr').addEventListener('click', () => compartirImagenQR(miPerfil, 'tienda-qr', 'tienda-enlace', 'compartir-mensaje'));
$('#btn-descargar-qr').addEventListener('click', () => descargarPDFCodigoQR('tienda-qr', miPerfil, $('#tienda-enlace').value, 'compartir-mensaje'));
$('#btn-compartir-tienda-publica').addEventListener('click', () => {
  const vendedor = vendedores[modalTienda.dataset.tiendaId];
  if (vendedor) compartirEnlaceTienda(vendedor, 'tienda-publica-enlace', 'tienda-publica-mensaje');
});
$('#btn-ver-qr-publico').addEventListener('click', e => {
  const panel = $('#tienda-qr-panel');
  panel.hidden = !panel.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
});
$('#btn-compartir-qr-publico').addEventListener('click', () => {
  const vendedor = vendedores[modalTienda.dataset.tiendaId];
  if (vendedor) compartirImagenQR(vendedor, 'tienda-publica-qr', 'tienda-publica-enlace', 'tienda-publica-mensaje');
});
$('#btn-descargar-qr-publico').addEventListener('click', () => {
  const vendedor = vendedores[modalTienda.dataset.tiendaId];
  if (vendedor) descargarPDFCodigoQR('tienda-publica-qr', vendedor, $('#tienda-publica-enlace').value, 'tienda-publica-mensaje');
});

$('#form-perfil').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#btn-guardar-perfil'); btn.disabled = true;
  const msg = $('#perfil-msg');
  try {
    const numeroWhatsApp = soloDigitos($('#p-whats').value);
    const whatsapp = `${$('#p-codigo-pais').value}${numeroWhatsApp}`;
    if (whatsapp.length < 8 || whatsapp.length > 15) {
      throw new Error('Revisa el número de WhatsApp y el código de país. Debe tener entre 8 y 15 dígitos en total.');
    }
    let avatar_url = miPerfil?.avatar_url || null;
    const f = $('#p-avatar').files[0];
    if (f) avatar_url = await subirFoto(await procesarImagen(f, 360), `avatares/${usuario.id}/avatar.jpg`);
    const { error } = await db.from('vendedores').upsert({
      id: usuario.id,
      negocio: $('#p-negocio').value.trim(),
      responsable: $('#p-responsable').value.trim(),
      descripcion: $('#p-descripcion').value.trim() || null,
      whatsapp,
      categoria: $('#p-categoria').value,
      direccion: $('#p-direccion').value.trim() || null,
      avatar_emoji: $('#p-emoji').value.trim() || '',
      avatar_url
    });
    if (error) throw error;
    await cargarPerfil(); pintarZonaUsuario();
    await cargarDatos();
    msg.hidden = false; msg.className = 'modal-nota msg-ok'; msg.textContent = '✅ Perfil guardado. Tu tienda ya aparece en la vitrina.';
    setTimeout(() => msg.hidden = true, 3000);
  } catch (er) {
    msg.hidden = false; msg.className = 'modal-nota msg-error'; msg.textContent = 'No se pudo guardar: ' + er.message;
  }
  btn.disabled = false;
});

/* ---------- Panel: fotos del producto ---------- */
$('#g-fotos').addEventListener('change', e => {
  const archivos = [...e.target.files].filter(f => f.type.startsWith('image/'));
  for (const f of archivos) {
    if (fotosNuevas.length >= MAX_FOTOS) break;
    fotosNuevas.push({ file: f, preview: URL.createObjectURL(f) });
  }
  e.target.value = '';
  pintarFotosNuevas();
});

function pintarFotosNuevas() {
  $('#fotos-preview').innerHTML = fotosNuevas.map((f, i) => `<div class="foto-preview"> <img src="${esc(urlImagen(f.preview))}" alt="Foto ${i + 1}"> <button type="button" class="foto-quitar" data-quitar="${i}" aria-label="Quitar foto ${i + 1}">✕</button> </div>`).join('');
  $('#g-fotos-label').textContent = fotosNuevas.length
    ? `${fotosNuevas.length} foto(s) lista(s) · elegir más`
    : ' Elegir fotos del producto';
}

$('#fotos-preview').addEventListener('click', e => {
  const b = e.target.closest('[data-quitar]'); if (!b) return;
  URL.revokeObjectURL(fotosNuevas[+b.dataset.quitar].preview);
  fotosNuevas.splice(+b.dataset.quitar, 1);
  pintarFotosNuevas();
});

const MAX_ETIQUETAS = 5;
let etiquetasSeleccionadas = [];
function pintarOpcionesEtiquetas() {
  const query = normalizar($('#g-etiqueta-buscar').value.trim());
  const opciones = ETIQUETAS_DISPONIBLES
    .filter(etiqueta => !etiquetasSeleccionadas.includes(etiqueta))
    .filter(etiqueta => !query || normalizar(etiqueta).includes(query));
  $('#g-etiqueta-opcion').innerHTML = opciones.length
    ? opciones.map(etiqueta => `<option value="${esc(etiqueta)}">${esc(etiqueta)}</option>`).join('')
    : '<option value="">No hay coincidencias</option>';
}
function pintarEtiquetasSeleccionadas() {
  $('#etiquetas-contador').textContent = `${etiquetasSeleccionadas.length}/${MAX_ETIQUETAS}`;
  $('#g-etiquetas-seleccionadas').innerHTML = etiquetasSeleccionadas.length
    ? etiquetasSeleccionadas.map(etiqueta => `<button type="button" class="etiqueta-elegida" data-quitar-etiqueta="${esc(etiqueta)}">${esc(etiqueta)} <span aria-hidden="true">×</span></button>`).join('')
    : '<span class="etiquetas-vacio">Todavía no has elegido etiquetas.</span>';
  $('#g-etiqueta-anadir').disabled = etiquetasSeleccionadas.length >= MAX_ETIQUETAS;
  pintarOpcionesEtiquetas();
}
$('#g-etiqueta-buscar').addEventListener('input', pintarOpcionesEtiquetas);
$('#g-etiqueta-anadir').addEventListener('click', () => {
  const etiqueta = $('#g-etiqueta-opcion').value;
  if (!etiqueta || etiquetasSeleccionadas.length >= MAX_ETIQUETAS) return;
  etiquetasSeleccionadas.push(etiqueta);
  $('#g-etiqueta-buscar').value = '';
  pintarEtiquetasSeleccionadas();
});
$('#g-etiquetas-seleccionadas').addEventListener('click', e => {
  const boton = e.target.closest('[data-quitar-etiqueta]');
  if (!boton) return;
  etiquetasSeleccionadas = etiquetasSeleccionadas.filter(etiqueta => etiqueta !== boton.dataset.quitarEtiqueta);
  pintarEtiquetasSeleccionadas();
});
pintarEtiquetasSeleccionadas();

/* ---------- Panel: publicar producto ---------- */
$('#form-producto').addEventListener('submit', async e => {
  e.preventDefault();
  if (!usuario) return abrirAuth('entrar');
  const btn = $('#btn-publicar'); btn.disabled = true;
  const msg = $('#producto-msg');
  try {
    if (!miPerfil) throw new Error('Primero guarda tu perfil de vendedor (sección 1).');
    const fotos = [];
    for (let i = 0; i < fotosNuevas.length; i++) {
      const blob = await procesarImagen(fotosNuevas[i].file);
      fotos.push(await subirFoto(blob, `productos/${usuario.id}/${Date.now()}-${i}.jpg`));
    }
    const tags = [...etiquetasSeleccionadas];
    if (tags.length > MAX_ETIQUETAS) throw new Error(`Selecciona como máximo ${MAX_ETIQUETAS} etiquetas.`);
    const payload = {
      vendedor_id: usuario.id,
      nombre: $('#g-nombre').value.trim(),
      detalle: $('#g-detalle').value.trim() || null,
      categoria: $('#g-categoria').value,
      precio: parseFloat($('#g-precio').value) || 0,
      fotos,
      emoji: EMOJI_CAT[$('#g-categoria').value] || '🛒',
      tags
    };
    const { data: creado, error } = await db.from('productos').insert(payload);
    if (error) throw error;
    await cargarDatos();
    const productoCreado = creado || productos
      .filter(producto => producto.vendedor_id === usuario.id && producto.nombre === payload.nombre)
      .sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0))[0];
    if (productoCreado && tags.length) {
      guardarProductoLocal({ ...productoCreado, tags });
      await cargarDatos();
    }
    fotosNuevas.forEach(f => URL.revokeObjectURL(f.preview));
    fotosNuevas = []; pintarFotosNuevas();
    e.target.reset();
    etiquetasSeleccionadas = [];
    pintarEtiquetasSeleccionadas();
    msg.hidden = false; msg.className = 'modal-nota msg-ok'; msg.textContent = '✅ Producto publicado en la vitrina.';
    setTimeout(() => msg.hidden = true, 3000);
  } catch (er) {
    msg.hidden = false; msg.className = 'modal-nota msg-error'; msg.textContent = 'No se pudo publicar: ' + er.message;
  }
  btn.disabled = false;
});

/* ---------- Panel: mis productos ---------- */
function pintarMisProductos() {
  const cont = $('#lista-mis-productos');
  if (!usuario) { cont.innerHTML = ''; return; }
  const mios = productos.filter(p => p.vendedor_id === usuario.id);
  cont.innerHTML = mios.length ? mios.map(p => {
    const thumb = (Array.isArray(p.fotos) && p.fotos.length)
      ? `<img src="${esc(urlImagen(p.fotos[0]))}" alt="">` : (p.emoji || '🛒');
    return `<div class="mini-item">
      <span class="mini-thumb">${thumb}</span>
      <strong>${esc(p.nombre)}<small>${descuentoVigente(p) ? `S/ ${fmtPrecio(precioConDescuento(p))} (antes S/ ${fmtPrecio(p.precio)})` : `S/ ${fmtPrecio(p.precio)}`} · ${esc(p.categoria)} · ${(p.fotos || []).length} foto(s)</small></strong>
      <button type="button" class="boton boton--linea" data-editar-producto="${esc(p.id)}">Editar producto</button>
      <select class="select-destacado" data-destacado-plan="${p.id}" aria-label="Duración del destacado">
        <option value="7">7 días · S/ 10</option>
        <option value="15">15 días · S/ 18</option>
        <option value="30">30 días · S/ 30</option>
      </select>
      <button type="button" class="boton-destacar" data-solicitar-destacado="${p.id}">Solicitar destacado</button>
      <button type="button" class="boton-peligro" data-borrar="${p.id}">Eliminar</button>
    </div>`;
  }).join('') : '<p class="producto-detalle">Aún no publicas productos. Usa el formulario de arriba. 🌿</p>';
}

$('#lista-mis-productos').addEventListener('click', async e => {
  const editar = e.target.closest('[data-editar-producto]');
  if (editar) {
    const producto = productos.find(item => item.id === editar.dataset.editarProducto && item.vendedor_id === usuario?.id);
    if (!producto) return;
    const formulario = $('#form-editar-producto');
    formulario.elements.producto_id.value = producto.id;
    formulario.elements.nombre.value = producto.nombre || '';
    formulario.elements.precio.value = producto.precio;
    formulario.elements.detalle.value = producto.detalle || '';
    formulario.elements.descuento_porcentaje.value = descuentoVigente(producto) ? producto.descuento_porcentaje : 0;
    const modoDias = descuentoVigente(producto) && Boolean(producto.descuento_hasta);
    formulario.elements.descuento_modo.value = modoDias ? 'dias' : 'permanente';
    const diasRestantes = modoDias
      ? Math.max(1, Math.ceil((new Date(producto.descuento_hasta).getTime() - Date.now()) / MILISEGUNDOS_DIA))
      : 7;
    formulario.elements.descuento_dias.value = Math.min(365, diasRestantes);
    formulario.querySelector('[data-descuento-dias-wrap]').hidden = !modoDias;
    $('#editar-producto-msg').hidden = true;
    $('#modal-editar-producto').showModal();
    return;
  }
  const solicitar = e.target.closest('[data-solicitar-destacado]');
  if (solicitar) {
    const selector = document.querySelector(`[data-destacado-plan="${solicitar.dataset.solicitarDestacado}"]`);
    solicitarDestacado(solicitar.dataset.solicitarDestacado, usuario.id, selector.value);
    return;
  }
  const b = e.target.closest('[data-borrar]'); if (!b) return;
  if (!confirm('¿Eliminar este producto de la vitrina?')) return;
  const p = productos.find(x => x.id === b.dataset.borrar);
  b.disabled = true;
  try {
    const resultado = await db.from('productos').delete().eq('id', b.dataset.borrar).eq('vendedor_id', usuario.id);
    if (resultado.error) throw resultado.error;
    const verificado = await db.from('productos').select('id').eq('id', b.dataset.borrar).eq('vendedor_id', usuario.id).maybeSingle();
    if (verificado.error) throw verificado.error;
    if (verificado.data) throw new Error('El producto sigue publicado. Verifica los permisos de tu cuenta.');
    const state = readLocalState();
    state.productos = state.productos.filter(producto => producto.id !== b.dataset.borrar);
    state.solicitudesDestacado = (state.solicitudesDestacado || []).filter(solicitud => solicitud.producto_id !== b.dataset.borrar);
    writeLocalState(state);
    await eliminarFotosProductos(p ? [p] : []);
  } catch (error) {
    alert(`No se pudo completar la eliminación: ${error.message}`);
  }
  await cargarDatos();
});

$('#form-editar-producto').elements.descuento_modo.addEventListener('change', e => {
  e.target.form.querySelector('[data-descuento-dias-wrap]').hidden = e.target.value !== 'dias';
});

$('#form-editar-producto').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const boton = form.querySelector('[type="submit"]');
  const mensaje = $('#editar-producto-msg');
  const id = valorFormulario(form, 'producto_id');
  const producto = productos.find(item => item.id === id && item.vendedor_id === usuario?.id);
  if (!producto) {
    mensaje.hidden = false;
    mensaje.className = 'modal-nota msg-error modal-ancho';
    mensaje.textContent = 'No encontramos este producto en tu tienda.';
    return;
  }
  const porcentaje = Number(valorFormulario(form, 'descuento_porcentaje'));
  const dias = Number(valorFormulario(form, 'descuento_dias'));
  if (!Number.isInteger(porcentaje) || porcentaje < 0 || porcentaje > 90) {
    mensaje.hidden = false;
    mensaje.className = 'modal-nota msg-error modal-ancho';
    mensaje.textContent = 'El descuento debe ser un número entero entre 0 % y 90 %.';
    return;
  }
  const precio = Number(valorFormulario(form, 'precio'));
  if (!Number.isFinite(precio) || precio < 0) {
    mensaje.hidden = false;
    mensaje.className = 'modal-nota msg-error modal-ancho';
    mensaje.textContent = 'El precio debe ser un número igual o mayor que cero.';
    return;
  }
  const modo = valorFormulario(form, 'descuento_modo');
  if (porcentaje > 0 && modo === 'dias' && (!Number.isInteger(dias) || dias < 1 || dias > 365)) {
    mensaje.hidden = false;
    mensaje.className = 'modal-nota msg-error modal-ancho';
    mensaje.textContent = 'La duración debe ser de 1 a 365 días.';
    return;
  }
  const cambios = {
    nombre: valorFormulario(form, 'nombre'),
    precio,
    detalle: valorFormulario(form, 'detalle') || null,
    descuento_porcentaje: porcentaje,
    descuento_hasta: porcentaje > 0 && modo === 'dias'
      ? new Date(Date.now() + dias * MILISEGUNDOS_DIA).toISOString()
      : null
  };
  if (!cambios.nombre) {
    mensaje.hidden = false;
    mensaje.className = 'modal-nota msg-error modal-ancho';
    mensaje.textContent = 'El nombre del producto es obligatorio.';
    return;
  }
  boton.disabled = true;
  try {
    let guardado;
    if (esDatoDemo(producto)) {
      guardado = await actualizarRegistroAdmin('productos', id, cambios);
    } else if (!usaSupabase) {
      guardarProductoLocal({ ...producto, ...cambios });
      guardado = { ...producto, ...cambios };
    } else {
      const { data, error } = await db.from('productos').update(cambios)
        .eq('id', id).eq('vendedor_id', usuario.id).select('*').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No se guardaron los cambios. Verifica que seas propietario de este producto.');
      guardado = data;
      guardarProductoLocal({ ...producto, ...guardado });
    }
    if (esDatoDemo(producto)) guardarProductoLocal({ ...producto, ...guardado });
    await cargarDatos();
    $('#modal-editar-producto').close();
  } catch (error) {
    mensaje.hidden = false;
    mensaje.className = 'modal-nota msg-error modal-ancho';
    mensaje.textContent = error.message.includes("Could not find the 'descuento_hasta' column")
      ? 'La base de datos aún no tiene habilitados los descuentos. En Supabase, ejecuta el archivo migracion_descuentos.sql y vuelve a guardar el producto.'
      : `No se pudo guardar el producto: ${error.message}`;
  } finally {
    boton.disabled = false;
  }
});

function renderizarReseñas() {
  const cont = $('#testimonio-contenedor');
  if (intervaloTestimonios) clearInterval(intervaloTestimonios);
  intervaloTestimonios = null;
  const pendientes = (readLocalState().reseñas || []).filter(r => r.aprobado);
  if (!pendientes.length) {
    $('#testimonio-puntos').innerHTML = '';
    $('#testimonio-anterior').hidden = true;
    $('#testimonio-siguiente').hidden = true;
    cont.innerHTML = '<div class="testimonio-slide activo"><blockquote>"La mejor manera de comprar es apoyar a quienes producen cerca de casa."</blockquote><p class="testimonio-autor">Cerca de ti</p></div>';
    return;
  }
  const slides = pendientes.map(r => `
    <div class="testimonio-slide">
      <blockquote>"${esc(r.texto)}"</blockquote>
      <p class="testimonio-autor">${esc(r.nombre)} · ${esc(r.negocio)}</p>
    </div>
  `).join('');
  cont.innerHTML = slides;
  const puntos = $('#testimonio-puntos');
  $('#testimonio-anterior').hidden = false;
  $('#testimonio-siguiente').hidden = false;
  puntos.innerHTML = pendientes.map((_, i) => `<button type="button" data-testimonio="${i}" class="${i === 0 ? 'activo' : ''}" aria-label="Reseña ${i + 1}"></button>`).join('');
  let slideActual = 0;
  const mostrarSlide = idx => {
    const items = [...cont.querySelectorAll('.testimonio-slide')];
    items.forEach((item, pos) => item.classList.toggle('activo', pos === idx));
    puntos.querySelectorAll('button').forEach((btn, i) => btn.classList.toggle('activo', i === idx));
  };
  const anterior = () => {
    slideActual = (slideActual - 1 + pendientes.length) % pendientes.length;
    mostrarSlide(slideActual);
  };
  const siguiente = () => {
    slideActual = (slideActual + 1) % pendientes.length;
    mostrarSlide(slideActual);
  };
  puntos.onclick = e => {
    const btn = e.target.closest('[data-testimonio]'); if (!btn) return;
    slideActual = Number(btn.dataset.testimonio); mostrarSlide(slideActual);
  };
  $('#testimonio-anterior').onclick = anterior;
  $('#testimonio-siguiente').onclick = siguiente;
  intervaloTestimonios = setInterval(siguiente, INTERVALO_TESTIMONIO);
}

$('#form-reseña').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#reseña-msg');
  const payload = {
    nombre: $('#r-nombre').value.trim(),
    negocio: $('#r-negocio').value.trim(),
    texto: $('#r-comentario').value.trim(),
    aprobado: false
  };
  if (!payload.nombre || !payload.negocio || !payload.texto) {
    msg.hidden = false; msg.className = 'modal-nota msg-error'; msg.textContent = 'Completa todos los campos.';
    return;
  }
  const state = readLocalState();
  state.reseñas.unshift({ id: `r-${Date.now()}`, ...payload });
  writeLocalState(state);
  msg.hidden = false; msg.className = 'modal-nota msg-ok'; msg.textContent = 'Gracias. Tu reseña fue enviada para revisión de administración.';
  e.target.reset();
  renderizarReseñas();
});

renderizarReseñas();

$('#pie-subir').addEventListener('click', e => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- Cierre de modales ---------- */
$$('dialog [data-cerrar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
modalPromocion.addEventListener('close', () => {
  if (vistaPreviaPromocionUrl) URL.revokeObjectURL(vistaPreviaPromocionUrl);
  vistaPreviaPromocionUrl = null;
});

/* ---------- Arranque ---------- */
pintarZonaUsuario();
setInterval(revisarExpiraciones, 60 * 1000);
db.auth.getSession().then(async ({ data }) => {
  usuario = data.session?.user || null;
  await cargarPerfil();
  pintarZonaUsuario();
  await cargarDatos();
  const tiendaCompartida = new URLSearchParams(window.location.search).get('tienda');
  if (tiendaCompartida) {
    try {
      await abrirTiendaCompartida(tiendaCompartida);
    } catch (error) {
      const aviso = $('#aviso');
      aviso.hidden = false;
      aviso.setAttribute('role', 'alert');
      aviso.textContent = 'No se pudo cargar esta tienda. Revisa tu conexión e inténtalo nuevamente.';
      console.error('Error al abrir una tienda compartida:', error);
    }
  }
});

console.log('%c🏞️ Cerca de ti %c vitrina local viva', 'font-weight:bold;font-size:14px', 'color:#2e4b3c');
})();