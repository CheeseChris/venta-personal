'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { ProductoStock, reemplazarStockMasivo, agregarStockMasivo, obtenerTodoElStock } from '../actions';

export default function GestionStockClient() {
  // ==========================================
  // ESTADOS PARA LA SUBIDA DE EXCEL
  // ==========================================
  const [datosExcel, setDatosExcel] = useState<ProductoStock[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState('');

  // ==========================================
  // ESTADOS PARA LA VISTA PREVIA DE LA BASE DE DATOS
  // ==========================================
  const [stockActual, setStockActual] = useState<ProductoStock[]>([]);
  const [cargandoStock, setCargandoStock] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  // Cargar los datos de la base de datos al iniciar
  useEffect(() => {
    cargarDatosBD();
  }, []);

  const cargarDatosBD = async () => {
    setCargandoStock(true);
    const datos = await obtenerTodoElStock();
    setStockActual(datos);
    setCargandoStock(false);
  };

  // Filtrado de la tabla inferior
  const stockFiltrado = stockActual.filter(item => 
    item.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
    item.material_id.toLowerCase().includes(busqueda.toLowerCase()) ||
    (item.marca && item.marca.toLowerCase().includes(busqueda.toLowerCase()))
  );

  // ==========================================
  // LÓGICA DE EXCEL
  // ==========================================
  const manejarSubida = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNombreArchivo(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      const stockProcesado = data.map((row: any) => ({
        material_id: String(row.material_id || row['Material ID'] || row['ID'] || ''),
        descripcion: String(row.descripcion || row['Descripción'] || row['Producto'] || ''),
        stock: Number(row.stock || row['Stock'] || row['Cantidad'] || 0),
        precio_unitario: Number(row.precio_unitario || row['Precio'] || row['Precio Unitario'] || 0),
        marca: row.marca || row['Marca'] || row['Grupo'] || null,
        region: String(row.region || row['Región'] || row['Region'] || 'Lima'),
      })).filter(p => p.material_id && p.descripcion);

      setDatosExcel(stockProcesado);
    };

    reader.readAsBinaryString(file);
  };

  const ejecutarReemplazo = async () => {
    if (datosExcel.length === 0) return alert('No hay datos válidos en el Excel.');
    if (!confirm('⚠️ ESTO BORRARÁ TODO EL STOCK ACTUAL y lo reemplazará con el archivo subido. ¿Estás seguro?')) return;

    setProcesando(true);
    const result = await reemplazarStockMasivo(datosExcel);
    
    if (result.exito) {
      alert(`✅ ¡Éxito! Se ha reemplazado toda la base. Total productos: ${datosExcel.length}`);
      setDatosExcel([]);
      setNombreArchivo('');
      await cargarDatosBD(); // Actualizar la tabla de abajo
    } else {
      alert('❌ Error: ' + result.error);
    }
    setProcesando(false);
  };

  const ejecutarAcumulacion = async () => {
    if (datosExcel.length === 0) return alert('No hay datos válidos en el Excel.');
    if (!confirm('Se sumará el stock de los productos que ya existen, y se crearán los nuevos. ¿Estás seguro?')) return;

    setProcesando(true);
    const result = await agregarStockMasivo(datosExcel);
    
    if (result.exito) {
      alert(`✅ ¡Éxito! Se han actualizado/agregado los registros. Total en Excel: ${datosExcel.length}`);
      setDatosExcel([]);
      setNombreArchivo('');
      await cargarDatosBD(); // Actualizar la tabla de abajo
    } else {
      alert('❌ Error: ' + result.error);
    }
    setProcesando(false);
  };

  return (
    <div className="space-y-8">
      
      {/* ========================================== */}
      {/* TARJETA 1: CARGA DE EXCEL Y ACCIONES       */}
      {/* ========================================== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
        <div className="mb-6">
          <label className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer block transition-all ${nombreArchivo ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:bg-slate-50'}`}>
            {nombreArchivo ? (
              <>
                <span className="text-4xl mb-2 block">✅</span>
                <p className="text-sm font-bold text-green-700">{nombreArchivo}</p>
                <p className="text-xs text-green-600 mt-1">{datosExcel.length} productos detectados</p>
              </>
            ) : (
              <>
                <span className="text-4xl mb-2 block">📊</span>
                <p className="text-sm font-bold text-slate-700">Subir archivo Excel (.xlsx)</p>
                <p className="text-xs text-slate-500 mt-1">Debe contener columnas: material_id, descripcion, stock, precio_unitario, marca, region</p>
              </>
            )}
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={manejarSubida} />
          </label>
        </div>

        {datosExcel.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={ejecutarAcumulacion}
              disabled={procesando}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {procesando ? 'Procesando...' : '➕ Acumular Hacia Abajo (Actualizar/Añadir)'}
            </button>
            <button
              onClick={ejecutarReemplazo}
              disabled={procesando}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {procesando ? 'Procesando...' : '⚠️ Reemplazar TODA la Base'}
            </button>
          </div>
        )}

        {datosExcel.length > 0 && (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <h3 className="font-bold text-gray-800 mb-4">Vista Previa de Datos a Procesar (Primeros 5 del Excel)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th className="px-4 py-2">ID</th>
                    <th className="px-4 py-2">Descripción</th>
                    <th className="px-4 py-2">Marca</th>
                    <th className="px-4 py-2">Stock</th>
                    <th className="px-4 py-2">Precio</th>
                    <th className="px-4 py-2">Región</th>
                  </tr>
                </thead>
                <tbody>
                  {datosExcel.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="px-4 py-2 font-medium">{row.material_id}</td>
                      <td className="px-4 py-2">{row.descripcion}</td>
                      <td className="px-4 py-2">{row.marca}</td>
                      <td className="px-4 py-2 font-bold text-blue-600">{row.stock}</td>
                      <td className="px-4 py-2">S/ {row.precio_unitario}</td>
                      <td className="px-4 py-2">{row.region}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* TARJETA 2: TABLA DE INVENTARIO ACTUAL (BD) */}
      {/* ========================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50">
          <div>
            <h3 className="font-bold text-lg text-slate-800">Inventario Actual en Base de Datos</h3>
            <p className="text-xs text-slate-500">Total de items registrados: {stockActual.length}</p>
          </div>
          
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Buscar material o código..." 
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse relative">
            <thead className="sticky top-0 bg-slate-100 shadow-sm z-10">
              <tr className="text-slate-500 text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Material ID</th>
                <th className="p-4 font-bold">Descripción</th>
                <th className="p-4 font-bold text-center">Marca</th>
                <th className="p-4 font-bold text-center">Región</th>
                <th className="p-4 font-bold text-right">Precio (S/)</th>
                <th className="p-4 font-bold text-center">Stock</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {cargandoStock ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-medium animate-pulse">
                    Cargando inventario de la base de datos...
                  </td>
                </tr>
              ) : stockFiltrado.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                    No se encontraron productos en la base de datos.
                  </td>
                </tr>
              ) : (
                stockFiltrado.map((item) => (
                  <tr key={`${item.material_id}-${item.region}`} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-mono text-xs text-slate-500">{item.material_id}</td>
                    <td className="p-4 font-bold text-slate-700">{item.descripcion}</td>
                    <td className="p-4 text-center">
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">
                        {item.marca || 'N/A'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${item.region === 'Lima' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {item.region}
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-slate-700">
                      {Number(item.precio_unitario).toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${item.stock > 10 ? 'bg-green-100 text-green-700' : item.stock > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {item.stock}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}