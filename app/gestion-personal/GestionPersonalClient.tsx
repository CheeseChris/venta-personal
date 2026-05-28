'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Vendedor, reemplazarPersonalMasivo, agregarPersonalMasivo, eliminarPersonal, modificarPersonal, agregarPersonal } from '../actions';

export default function GestionPersonalClient({ personalInicial }: { personalInicial: Vendedor[] }) {
  const [personal, setPersonal] = useState<Vendedor[]>(personalInicial);
  const [datosExcel, setDatosExcel] = useState<Vendedor[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState('');

  // Estados para CRUD manual
  const [busqueda, setBusqueda] = useState('');
  const [modoEdicion, setModoEdicion] = useState<string | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState('');
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');

  const personalFiltrado = personal.filter(p =>
    p.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo_empleado.toLowerCase().includes(busqueda.toLowerCase())
  );

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

      const personalProcesado = data.map((row: any) => ({
        codigo_empleado: String(row.codigo_empleado || row['Código Empleado'] || row['Codigo'] || row['ID'] || ''),
        nombre_completo: String(row.nombre_completo || row['Nombre Completo'] || row['Nombre'] || ''),
      })).filter(p => p.codigo_empleado && p.nombre_completo);

      setDatosExcel(personalProcesado);
    };

    reader.readAsBinaryString(file);
  };

  const ejecutarReemplazo = async () => {
    if (datosExcel.length === 0) return alert('No hay datos válidos en el Excel.');
    if (!confirm('⚠️ ESTO BORRARÁ TODA LA BASE DE PERSONAL ACTUAL y la reemplazará con el archivo subido. ¿Estás seguro?')) return;

    setProcesando(true);
    const result = await reemplazarPersonalMasivo(datosExcel);
    setProcesando(false);

    if (result.exito) {
      alert(`✅ ¡Éxito! Se ha reemplazado toda la base de personal.`);
      setPersonal(datosExcel);
      setDatosExcel([]);
      setNombreArchivo('');
    } else {
      alert('❌ Error: ' + result.error);
    }
  };

  const ejecutarAcumulacion = async () => {
    if (datosExcel.length === 0) return alert('No hay datos válidos en el Excel.');
    if (!confirm('Se actualizarán los nombres de los códigos existentes y se añadirán los nuevos. ¿Estás seguro?')) return;

    setProcesando(true);
    const result = await agregarPersonalMasivo(datosExcel);
    setProcesando(false);

    if (result.exito) {
      alert(`✅ ¡Éxito! Se ha actualizado la base de personal.`);
      window.location.reload(); // Recargar para ver los cambios combinados
    } else {
      alert('❌ Error: ' + result.error);
    }
  };

  const handleEliminar = async (codigo: string) => {
    if (!confirm(`¿Estás seguro de eliminar al empleado con código ${codigo}?`)) return;
    setProcesando(true);
    const result = await eliminarPersonal(codigo);
    setProcesando(false);
    if (result.exito) {
      setPersonal(personal.filter(p => p.codigo_empleado !== codigo));
    } else {
      alert('Error al eliminar: ' + result.error);
    }
  };

  const handleGuardarEdicion = async (codigo: string) => {
    if (!nombreEdicion.trim()) return alert("El nombre no puede estar vacío");
    setProcesando(true);
    const result = await modificarPersonal(codigo, nombreEdicion);
    setProcesando(false);

    if (result.exito) {
      setPersonal(personal.map(p => p.codigo_empleado === codigo ? { ...p, nombre_completo: nombreEdicion } : p));
      setModoEdicion(null);
    } else {
      alert('Error al modificar: ' + result.error);
    }
  };

  const handleAgregarNuevo = async () => {
    if (!nuevoCodigo.trim() || !nuevoNombre.trim()) return alert("Llena ambos campos");
    if (personal.some(p => p.codigo_empleado === nuevoCodigo)) return alert("El código ya existe");

    setProcesando(true);
    const result = await agregarPersonal(nuevoCodigo, nuevoNombre);
    setProcesando(false);

    if (result.exito) {
      setPersonal([{ codigo_empleado: nuevoCodigo, nombre_completo: nuevoNombre }, ...personal]);
      setNuevoCodigo('');
      setNuevoNombre('');
    } else {
      alert('Error al agregar: ' + result.error);
    }
  };

  return (
    <div className="space-y-6">
      {/* SECCIÓN DE EXCEL */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="text-2xl">📊</span> Carga Masiva (Excel)
        </h2>

        <div className="mb-4">
          <label className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer block transition-all ${nombreArchivo ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:bg-slate-50'}`}>
            {nombreArchivo ? (
              <>
                <p className="text-sm font-bold text-green-700">{nombreArchivo}</p>
                <p className="text-xs text-green-600 mt-1">{datosExcel.length} empleados detectados</p>
              </>
            ) : (
              <p className="text-sm font-bold text-slate-700">Subir archivo Excel (.xlsx) con columnas: codigo_empleado, nombre_completo</p>
            )}
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={manejarSubida} />
          </label>
        </div>

        {datosExcel.length > 0 && (
          <div className="flex gap-4">
            <button onClick={ejecutarAcumulacion} disabled={procesando} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg shadow-sm disabled:opacity-50">
              ➕ Acumular
            </button>
            <button onClick={ejecutarReemplazo} disabled={procesando} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg shadow-sm disabled:opacity-50">
              ⚠️ Reemplazar Base
            </button>
          </div>
        )}
      </div>

      {/* SECCIÓN CRUD MANUAL */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="text-2xl">👥</span> Gestión Manual
        </h2>

        {/* Agregar Nuevo */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <input
            type="text"
            placeholder="Nuevo Código"
            value={nuevoCodigo}
            onChange={(e) => setNuevoCodigo(e.target.value)}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Nombre Completo"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="flex-[2] px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAgregarNuevo}
            disabled={procesando}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50"
          >
            Agregar
          </button>
        </div>

        {/* Buscador */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar empleado por nombre o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-semibold border-b">Código Empleado</th>
                <th className="px-4 py-3 font-semibold border-b">Nombre Completo</th>
                <th className="px-4 py-3 font-semibold border-b text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {personalFiltrado.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">No se encontraron registros.</td>
                </tr>
              ) : personalFiltrado.map(p => (
                <tr key={p.codigo_empleado} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-slate-600">{p.codigo_empleado}</td>
                  <td className="px-4 py-3">
                    {modoEdicion === p.codigo_empleado ? (
                      <input
                        type="text"
                        value={nombreEdicion}
                        onChange={(e) => setNombreEdicion(e.target.value)}
                        className="w-full px-2 py-1 border border-blue-400 rounded outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="font-semibold text-gray-800">{p.nombre_completo}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {modoEdicion === p.codigo_empleado ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleGuardarEdicion(p.codigo_empleado)} className="text-green-600 font-bold hover:underline">Guardar</button>
                        <button onClick={() => setModoEdicion(null)} className="text-slate-500 font-bold hover:underline">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => { setModoEdicion(p.codigo_empleado); setNombreEdicion(p.nombre_completo); }}
                          className="text-blue-600 hover:underline text-xs font-bold uppercase tracking-wider"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleEliminar(p.codigo_empleado)}
                          className="text-red-600 hover:underline text-xs font-bold uppercase tracking-wider"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-sm text-gray-500 font-medium">
          Total de registros: {personalFiltrado.length}
        </div>
      </div>
    </div>
  );
}
