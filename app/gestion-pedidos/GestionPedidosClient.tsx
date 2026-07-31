'use client';

import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { PedidoCompleto, actualizarEstadoPedido, toggleEstadoCompras, actualizarLimitesConfig } from '../actions';

interface PedidoAgrupado {
  pedido_id_base: string;
  fecha: string;
  hora: string;
  nombre_cliente: string;
  agencia: string;
  codigo_empleado: string;
  comprobante_url: string;
  estado: string;
  precio_total_general: number;
  items: PedidoCompleto[];
}

export default function GestionPedidosClient({
  pedidosIniciales,
  comprasHabilitadasInicial,
  limiteBebidasInicial,
  limiteAlcoholInicial
}: {
  pedidosIniciales: PedidoCompleto[],
  comprasHabilitadasInicial: boolean,
  limiteBebidasInicial: number,
  limiteAlcoholInicial: number
}) {
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>(pedidosIniciales);
  const [comprasHabilitadas, setComprasHabilitadas] = useState(comprasHabilitadasInicial);
  const [limiteBebidas, setLimiteBebidas] = useState(limiteBebidasInicial);
  const [limiteAlcohol, setLimiteAlcohol] = useState(limiteAlcoholInicial);
  const [toggling, setToggling] = useState(false);
  const [guardandoLimites, setGuardandoLimites] = useState(false);
  const [errorLimites, setErrorLimites] = useState<string | null>(null);
  const [exitoLimites, setExitoLimites] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Estados para Modales
  const [modalDetalleId, setModalDetalleId] = useState<string | null>(null);
  const [modalImagenUrl, setModalImagenUrl] = useState<string | null>(null);

  // Extraer el ID base del pedido (por ejemplo de PED-12345-MAT1 a PED-12345)
  const getBaseId = (id: string) => {
    const match = id.match(/^(PED-\d+)/);
    return match ? match[1] : id.split('-')[0];
  };

  // Agrupar pedidos
  const pedidosAgrupados = useMemo(() => {
    const grupos: Record<string, PedidoAgrupado> = {};

    pedidos.forEach(p => {
      const baseId = getBaseId(p.pedido_id);

      if (!grupos[baseId]) {
        grupos[baseId] = {
          pedido_id_base: baseId,
          fecha: p.fecha,
          hora: p.hora,
          nombre_cliente: p.nombre_cliente,
          agencia: p.agencia,
          codigo_empleado: p.codigo_empleado,
          comprobante_url: p.comprobante_url,
          estado: p.estado, // Toma el estado del primer item (usualmente son iguales)
          precio_total_general: 0,
          items: []
        };
      }

      grupos[baseId].items.push(p);
      grupos[baseId].precio_total_general += Number(p.precio_total);
    });

    return Object.values(grupos).sort((a, b) => {
      const dateA = new Date(`${a.fecha}T${a.hora}`);
      const dateB = new Date(`${b.fecha}T${b.hora}`);
      return dateB.getTime() - dateA.getTime();
    });
  }, [pedidos]);

  // Filtrar pedidos
  const pedidosFiltrados = useMemo(() => {
    if (!search) return pedidosAgrupados;
    const lowerSearch = search.toLowerCase();
    return pedidosAgrupados.filter(g =>
      g.pedido_id_base.toLowerCase().includes(lowerSearch) ||
      g.nombre_cliente.toLowerCase().includes(lowerSearch) ||
      g.codigo_empleado.toLowerCase().includes(lowerSearch) ||
      g.agencia.toLowerCase().includes(lowerSearch)
    );
  }, [pedidosAgrupados, search]);

  const cambiarEstado = async (pedido_id_base: string, nuevoEstado: string) => {
    setProcesando(pedido_id_base);
    // Actualizamos en BD enviando el ID base, el server action usará LIKE para afectar a todos los items
    const result = await actualizarEstadoPedido(pedido_id_base, nuevoEstado);

    if (result.exito) {
      setPedidos(prev => prev.map(p =>
        getBaseId(p.pedido_id) === pedido_id_base
          ? { ...p, estado: nuevoEstado }
          : p
      ));
    } else {
      alert("Error al actualizar el estado: " + result.error);
    }
    setProcesando(null);
  };
  const handleToggleCompras = async () => {
    setToggling(true);
    const nuevoEstado = !comprasHabilitadas;
    const result = await toggleEstadoCompras(nuevoEstado);
    if (result.exito) {
      setComprasHabilitadas(nuevoEstado);
    }
    setToggling(false);
  };

  const handleGuardarLimites = async () => {
    setGuardandoLimites(true);
    setErrorLimites(null);
    setExitoLimites(false);
    try {
      const result = await actualizarLimitesConfig(limiteBebidas, limiteAlcohol);
      if (result.exito) {
        setExitoLimites(true);
        setTimeout(() => setExitoLimites(false), 3000);
      } else {
        setErrorLimites('Error al guardar los límites en la base de datos.');
      }
    } catch (err) {
      setErrorLimites('Error de conexión con el servidor.');
    } finally {
      setGuardandoLimites(false);
    }
  };

  const descargarExcel = () => {
    // Para el Excel sí exportamos fila por fila para facilitar tablas dinámicas
    const dataExcel = pedidos.map(p => ({
      'ID Pedido': p.pedido_id,
      'Fecha': p.fecha,
      'Hora': p.hora,
      'Cód. Empleado': p.codigo_empleado,
      'Cliente': p.nombre_cliente,
      'Agencia': p.agencia,
      'Material (ID)': p.material_id,
      'Producto': p.descripcion,
      'Cantidad': p.cantidad,
      'Unidad de compra': p.categoria === 'Bebidas' ? 'Pqt' : 'Und',
      'Total (S/)': p.precio_total,
      'Estado': p.estado,
      'Comprobante': p.comprobante_url !== 'Sin comprobante' ? p.comprobante_url : 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pedidos");
    XLSX.writeFile(workbook, "Reporte_Pedidos_CBC.xlsx");
  };

  const pedidoSeleccionado = modalDetalleId ? pedidosAgrupados.find(p => p.pedido_id_base === modalDetalleId) : null;

  return (
    <div className="space-y-6">
      {/* Buscador y Exportar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <input
            type="text"
            placeholder="Buscar por código, cliente, vendedor, agencia..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          {/* BOTÓN TOGGLE COMPRAS */}
          <button
            onClick={handleToggleCompras}
            disabled={toggling}
            className={`flex-1 sm:flex-none flex justify-center items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-sm border-2 ${comprasHabilitadas
                ? 'bg-green-50 border-green-500 text-green-700 hover:bg-green-100'
                : 'bg-red-50 border-red-500 text-red-700 hover:bg-red-100'
              } ${toggling ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className={`w-3 h-3 rounded-full ${comprasHabilitadas ? 'bg-green-500' : 'bg-red-500'}`} />
            {toggling ? 'Cambiando...' : comprasHabilitadas ? '🟢 Compras Habilitadas' : '🔴 Compras Bloqueadas'}
          </button>

          <button
            onClick={descargarExcel}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Descargar Excel
          </button>
        </div>
      </div>

      {/* Configuración de Límites (Gente y Gestión) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Configuración de Límites de Compra
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Límite para Bebidas (paquetes)</label>
            <input
              type="number"
              min="1"
              max="999"
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              value={limiteBebidas}
              onChange={(e) => setLimiteBebidas(Math.max(1, parseInt(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Límite para Alcohol / Licores (unidades)</label>
            <input
              type="number"
              min="1"
              max="999"
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              value={limiteAlcohol}
              onChange={(e) => setLimiteAlcohol(Math.max(1, parseInt(e.target.value) || 0))}
            />
          </div>
          <div>
            <button
              onClick={handleGuardarLimites}
              disabled={guardandoLimites}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {guardandoLimites ? 'Guardando...' : '💾 Guardar Límites'}
            </button>
          </div>
        </div>

        {exitoLimites && (
          <div className="mt-4 text-sm font-bold text-green-600 bg-green-50 border border-green-200 p-2 rounded-xl text-center">
            ¡Límites guardados correctamente en la base de datos!
          </div>
        )}
        {errorLimites && (
          <div className="mt-4 text-sm font-bold text-red-600 bg-red-50 border border-red-200 p-2 rounded-xl text-center">
            ❌ {errorLimites}
          </div>
        )}
      </div>

      {/* Tabla Agrupada */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold border-b">Pedido / Fecha</th>
                <th className="px-6 py-4 font-semibold border-b">Cliente / Agencia</th>
                <th className="px-6 py-4 font-semibold border-b">Vendedor</th>
                <th className="px-6 py-4 font-semibold border-b text-center">Productos</th>
                <th className="px-6 py-4 font-semibold border-b text-right">Total a Pagar</th>
                <th className="px-6 py-4 font-semibold border-b text-center">Comprobante</th>
                <th className="px-6 py-4 font-semibold border-b text-center">Estado</th>
                <th className="px-6 py-4 font-semibold border-b text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pedidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    {search ? "No se encontraron pedidos con esa búsqueda." : "No hay pedidos registrados en el sistema."}
                  </td>
                </tr>
              ) : pedidosFiltrados.map((grupo) => {
                const isProcesando = procesando === grupo.pedido_id_base;

                return (
                  <tr key={grupo.pedido_id_base} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-black text-blue-900">{grupo.pedido_id_base}</div>
                      <div className="text-xs text-gray-500">{grupo.fecha} {grupo.hora}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-gray-900">{grupo.nombre_cliente}</div>
                      <div className="text-xs text-gray-500">📍 {grupo.agencia}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-700">{grupo.codigo_empleado}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setModalDetalleId(grupo.pedido_id_base)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Ver Detalle ({grupo.items.length})
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-black text-gray-900">S/ {grupo.precio_total_general.toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {grupo.comprobante_url && grupo.comprobante_url !== 'Sin comprobante' ? (
                        <button
                          onClick={() => setModalImagenUrl(grupo.comprobante_url)}
                          className="flex flex-col items-center gap-1 text-orange-600 hover:text-orange-800 font-bold text-xs mx-auto transition-colors"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          Ver Imagen
                        </button>
                      ) : (
                        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-md">Sin adjunto</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-black tracking-wide ${grupo.estado === 'APROBADO' ? 'bg-green-100 text-green-800' :
                        grupo.estado === 'RECHAZADO' ? 'bg-red-100 text-red-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                        {grupo.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => cambiarEstado(grupo.pedido_id_base, 'APROBADO')}
                          disabled={isProcesando || grupo.estado === 'APROBADO'}
                          title="Aprobar todo el pedido"
                          className={`p-2 rounded-xl transition-all shadow-sm ${grupo.estado === 'APROBADO'
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                            : 'bg-green-50 text-green-600 hover:bg-green-500 hover:text-white hover:scale-105'
                            }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button
                          onClick={() => cambiarEstado(grupo.pedido_id_base, 'RECHAZADO')}
                          disabled={isProcesando || grupo.estado === 'RECHAZADO'}
                          title="Rechazar todo el pedido"
                          className={`p-2 rounded-xl transition-all shadow-sm ${grupo.estado === 'RECHAZADO'
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                            : 'bg-red-50 text-red-600 hover:bg-red-500 hover:text-white hover:scale-105'
                            }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DETALLE DE PRODUCTOS */}
      {modalDetalleId && pedidoSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-gray-900">Detalle de Productos</h3>
                <p className="text-sm text-gray-500 font-medium">Pedido: <span className="text-blue-600">{pedidoSeleccionado.pedido_id_base}</span></p>
              </div>
              <button
                onClick={() => setModalDetalleId(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Código Mat.</th>
                    <th className="px-4 py-3 font-semibold">Descripción del Producto</th>
                    <th className="px-4 py-3 font-semibold text-center">Cantidad</th>
                    <th className="px-4 py-3 font-semibold text-right rounded-tr-lg">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pedidoSeleccionado.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-500">{item.material_id}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.descripcion}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                          {item.cantidad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                        S/ {Number(item.precio_total).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-right text-sm font-bold text-gray-600 uppercase">Total:</td>
                    <td className="px-4 py-4 text-right text-lg font-black text-blue-900">
                      S/ {pedidoSeleccionado.precio_total_general.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMAGEN COMPROBANTE */}
      {modalImagenUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-opacity">
          <div className="relative max-w-4xl w-full flex flex-col items-center">
            {/* Controles top */}
            <div className="w-full flex justify-end gap-3 mb-4">
              <a
                href={modalImagenUrl}
                download="comprobante.jpg"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors backdrop-blur-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Descargar original
              </a>
              <button
                onClick={() => setModalImagenUrl(null)}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors backdrop-blur-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Imagen */}
            <div className="relative w-full max-h-[80vh] flex justify-center bg-transparent rounded-2xl overflow-hidden">
              <img
                src={modalImagenUrl}
                alt="Comprobante de pago"
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
