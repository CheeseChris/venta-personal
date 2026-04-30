'use client';

import { useState, useEffect, useRef } from 'react';
import { obtenerStockPorRegion, ProductoStock, registrarPedido, obtenerVendedores, 
  Vendedor, enviarCorreoConfirmacion, obtenerPedidoPorId, PedidoExistenteItem, 
  actualizarPedido, obtenerAgenciasPorRegion, verificarLimiteBebidas } from './actions';

interface ItemCarrito {
  material_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

export default function Home() {
  const [regionSeleccionada, setRegionSeleccionada] = useState<string | null>(null);
  const [stockReal, setStockReal] = useState<ProductoStock[]>([]);
  const [cargando, setCargando] = useState(false);
  const [agenciaActual, setAgenciaActual] = useState<string>('');

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [mostrarCarrito, setMostrarCarrito] = useState(false);
  const [pantalla, setPantalla] = useState<'catalogo' | 'checkout' | 'modificar'>('catalogo');

  const [comprobante, setComprobante] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [alerta, setAlerta] = useState<{ titulo: string; mensaje: string; tipo: 'error' | 'exito' | 'advertencia' } | null>(null);
  const mostrarAlerta = (titulo: string, mensaje: string, tipo: 'error' | 'exito' | 'advertencia' = 'error') => {
  setAlerta({ titulo, mensaje, tipo });};
  const [vendedoresBD, setVendedoresBD] = useState<Vendedor[]>([]);
  const [busquedaVendedor, setBusquedaVendedor] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  const [datosVenta, setDatosVenta] = useState({
    nombre: '',
    lugar: '',
    correo: '',
    codigoEmpleado: ''
  });

  const [modalRegion, setModalRegion] = useState(false);
  const [modalAgencia, setModalAgencia] = useState(false);
  const [regionPendiente, setRegionPendiente] = useState<string | null>(null);
  const [agenciasPorRegion, setAgenciasPorRegion] = useState<string[]>([]);
  const [modalModificar, setModalModificar] = useState(false);

  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todos');
  const [marcaFiltro, setMarcaFiltro] = useState('Todas');

  const [idPedidoModificar, setIdPedidoModificar] = useState('');
  const [buscandoPedido, setBuscandoPedido] = useState(false);
  const [itemsPedidoOriginal, setItemsPedidoOriginal] = useState<PedidoExistenteItem[]>([]);
  const [cantidadesModificadasMap, setCantidadesModificadasMap] = useState<Record<string, number>>({});
  const [lugarModificado, setLugarModificado] = useState('');
  const [comprobanteModificado, setComprobanteModificado] = useState<File | null>(null);
  // Auto-refresh del stock cada 45 segundos
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (regionSeleccionada && agenciaActual && pantalla === 'catalogo') {
      intervalRef.current = setInterval(async () => {
        try {
          const datosStock = await obtenerStockPorRegion(regionSeleccionada, agenciaActual);
          setStockReal(datosStock);
        } catch (e) {
          console.error("Error refrescando stock", e);
        }
      }, 45000); // cada 45 segundos
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [regionSeleccionada, agenciaActual, pantalla]);

  const cargarDatos = async (region: string, agencia: string) => {
    setRegionSeleccionada(region);
    setAgenciaActual(agencia);
    setCargando(true);
    setCarrito([]);
    setMostrarCarrito(false);
    setPantalla('catalogo');
    setComprobante(null);
    setDatosVenta({ nombre: '', lugar: '', correo: '', codigoEmpleado: '' });
    setBusquedaVendedor('');
    setBusquedaProducto('');
    setCategoriaFiltro('Todos');
    setMarcaFiltro('Todas');

    try {
      const [datosStock, datosVendedores] = await Promise.all([
        obtenerStockPorRegion(region, agencia),
        obtenerVendedores()
      ]);
      setStockReal(datosStock);
      setVendedoresBD(datosVendedores);
    } catch (error) {
      console.error("Error al cargar", error);
    } finally {
      setCargando(false);
    }
  };
  const seleccionarRegion = async (region: string) => {
  setModalRegion(false);
  setRegionPendiente(region);
  const agencias = await obtenerAgenciasPorRegion(region);
  setAgenciasPorRegion(agencias);
  setModalAgencia(true);
};
  const actualizarCantidad = (producto: ProductoStock, cambio: number) => {
    setCarrito((carritoActual) => {
      const itemExistente = carritoActual.find(item => item.material_id === producto.material_id);

      if (itemExistente) {
        const nuevaCantidad = itemExistente.cantidad + cambio;

        if (nuevaCantidad > producto.stock) {
          setTimeout(() => mostrarAlerta("Stock insuficiente", `Solo quedan ${producto.stock} unidades disponibles en el almacén para este producto.`, "advertencia"), 0);
          return carritoActual;
        }

        if (nuevaCantidad <= 0) return carritoActual.filter(item => item.material_id !== producto.material_id);
        return carritoActual.map(item => item.material_id === producto.material_id ? { ...item, cantidad: nuevaCantidad } : item);
      } else {
        if (cambio > 0) {
          return [...carritoActual, { material_id: producto.material_id, descripcion: producto.descripcion, cantidad: 1, precio_unitario: Number(producto.precio_unitario) }];
        }
        return carritoActual;
      }
    });
  };

  const manejarCambioInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setDatosVenta(prev => ({ ...prev, [name]: value }));
  };

  const procesarPedido = async () => {
    if (!datosVenta.nombre || !datosVenta.codigoEmpleado) {
      mostrarAlerta("Nombre requerido", "Debes buscar y SELECCIONAR tu nombre de la lista desplegable.", "advertencia"); return;
      return;
    }
    if (!datosVenta.nombre || !datosVenta.codigoEmpleado) {
      mostrarAlerta("Nombre requerido", "Debes buscar y SELECCIONAR tu nombre de la lista desplegable.", "advertencia");
      return;
    }
    if (!datosVenta.lugar) {
      mostrarAlerta("Lugar requerido", "Debes seleccionar un lugar de entrega de la lista.", "advertencia");
      return;
    }
    if (!datosVenta.correo) {
      mostrarAlerta("Correo requerido", "Debes ingresar tu correo electrónico para recibir la confirmación.", "advertencia");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(datosVenta.correo)) {
      mostrarAlerta("Correo inválido", "El formato del correo no es válido. Ej: usuario@empresa.com", "advertencia");
      return;
    }
    if (!comprobante) {
      mostrarAlerta("Comprobante requerido", "Debes subir el comprobante de pago (Yape o transferencia) para continuar.", "advertencia");
      return;
    }

    setGuardando(true);
    const ordenBaseId = `PED-${Math.floor(Math.random() * 1000000)}`;

    try {
      // ✅ VERIFICAR LÍMITE DE BEBIDAS ANTES DE REGISTRAR
      for (const item of carrito) {
        const productoEnStock = stockReal.find(p => p.material_id === item.material_id);
        if (productoEnStock?.categoria === 'Bebidas') {
          const verificacion = await verificarLimiteBebidas(
            datosVenta.codigoEmpleado,
            item.material_id,
            item.cantidad
          );
          if (!verificacion.permitido) {
            mostrarAlerta("Límite de Bebidas 🥤", `${item.descripcion}\n\n${verificacion.mensaje}`, "advertencia");
            setGuardando(false);
            return;
          }
        }
      }

      let comprobanteUrl = 'Sin comprobante';

      if (comprobante) {
        const formData = new FormData();
        formData.append('file', comprobante);
        formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
        formData.append('folder', 'comprobantes_cbc');

        const uploadRes = await fetch(
          `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: formData }
        );

        if (!uploadRes.ok) throw new Error("No se pudo subir el comprobante");
        const uploadData = await uploadRes.json();
        comprobanteUrl = uploadData.secure_url;
      }

      for (const item of carrito) {
        const idUnicoFila = `${ordenBaseId}-${item.material_id}`;
        const respuesta = await registrarPedido({
          pedido_id: idUnicoFila,
          nombre_cliente: datosVenta.nombre,
          agencia: datosVenta.lugar,
          correo: datosVenta.correo || 'Sin correo',
          material_id: item.material_id,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_total: item.cantidad * item.precio_unitario,
          codigo_empleado: datosVenta.codigoEmpleado,
          comprobante_url: comprobanteUrl,
        });
        if (!respuesta.exito) throw new Error("Fallo al insertar en la base de datos");
      }

      setStockReal(prevStock =>
        prevStock.map(prod => {
          const itemPedido = carrito.find(i => i.material_id === prod.material_id);
          if (itemPedido) return { ...prod, stock: prod.stock - itemPedido.cantidad };
          return prod;
        })
      );

      if (datosVenta.correo) {
        await enviarCorreoConfirmacion({
          nombre: datosVenta.nombre,
          correoDestino: datosVenta.correo,
          bcc: ["vpizarro@cbc.co", "emendivil@cbc.co","harryalca1@gmail.com"], 
          pedidoId: ordenBaseId,
          lugar: datosVenta.lugar,
          total: totalPagar,
          items: carrito,
          comprobanteUrl: comprobanteUrl,
        });
      }

      mostrarAlerta("¡Pedido Registrado! 🎉", `Tu pedido ${ordenBaseId} fue registrado con éxito. Recibirás un correo de confirmación.`, "exito");

      setCarrito([]);
      setDatosVenta({ nombre: '', lugar: '', correo: '', codigoEmpleado: '' });
      setBusquedaVendedor('');
      setComprobante(null);
      setPantalla('catalogo');

    } catch (error) {
      console.error(error);
      mostrarAlerta("Error al guardar", "Hubo un error al guardar el pedido. Revisa tu conexión e intenta nuevamente.", "error");

    } finally {
      setGuardando(false);
    }
  };

  const buscarPedidoParaModificar = async () => {
    if (!idPedidoModificar) {
      mostrarAlerta("ID requerido", "Ingresa un ID de pedido válido. Ej: PED-123456", "advertencia");
      return;
    }
    setBuscandoPedido(true);
    setItemsPedidoOriginal([]);
    setCantidadesModificadasMap({});
    setComprobanteModificado(null);
    setLugarModificado('');

    try {
      const itemsPedido = await obtenerPedidoPorId(idPedidoModificar);
      if (!itemsPedido || itemsPedido.length === 0) {
        mostrarAlerta("Pedido no encontrado", "No se encontró ningún pedido con ese ID. Verifica el número e intenta nuevamente.", "error");

        return;
      }

      setItemsPedidoOriginal(itemsPedido);
      setLugarModificado(itemsPedido[0].agencia);

      const mapaInicialQuantities: Record<string, number> = {};
      itemsPedido.forEach(item => {
        mapaInicialQuantities[item.material_id] = item.cantidad;
      });
      setCantidadesModificadasMap(mapaInicialQuantities);

      setModalModificar(false);
      setPantalla('modificar');

    } catch (error) {
      console.error(error);
      mostrarAlerta("Error de conexión", "Error buscando el pedido. Revisa tu conexión e intenta nuevamente.", "error");
    } finally {
      setBuscandoPedido(false);
    }
  };

  const actualizarCantidadPedidoExistente = (materialId: string, cambio: number) => {
    const itemOriginal = itemsPedidoOriginal.find(i => i.material_id === materialId);
    if (!itemOriginal) return;

    setCantidadesModificadasMap(prev => {
      const cantidadActual = prev[materialId] || itemOriginal.cantidad;
      const nuevaCantidad = cantidadActual + cambio;

      if (nuevaCantidad <= 0) return prev;

      const maximoPermitido = Number(itemOriginal.stock_actual) + Number(itemOriginal.cantidad);

      if (nuevaCantidad > maximoPermitido) {
        setTimeout(() => mostrarAlerta("Límite alcanzado", `Solo hay ${itemOriginal.stock_actual} unidades extras disponibles. El máximo que puedes llevar es ${maximoPermitido} en total.`, "advertencia"), 0);
        return prev;
      }

      return {
        ...prev,
        [materialId]: nuevaCantidad
      };
    });
  };

  const guardarCambiosPedido = async () => {
    if (!lugarModificado) {
      mostrarAlerta("Lugar requerido", "Debes seleccionar un lugar de entrega de la lista.", "advertencia");
      return;
    }
    if (itemsPedidoOriginal.length === 0) return;

    setGuardando(true);

    try {
      let comprobanteUrlFinal = itemsPedidoOriginal[0].comprobante_url;

      if (comprobanteModificado) {
        const formData = new FormData();
        formData.append('file', comprobanteModificado);
        formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
        formData.append('folder', 'comprobantes_cbc');

        const uploadRes = await fetch(
          `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: formData }
        );

        if (!uploadRes.ok) throw new Error("No se pudo subir el nuevo comprobante");
        const uploadData = await uploadRes.json();
        comprobanteUrlFinal = uploadData.secure_url;
      }

      const itemsToUpdate = itemsPedidoOriginal.map(itemOriginal => ({
        material_id: itemOriginal.material_id,
        cantidad_nueva: cantidadesModificadasMap[itemOriginal.material_id],
        cantidad_antigua: itemOriginal.cantidad,
        precio_unitario: Number(itemOriginal.precio_unitario)
      }));

      const respuesta = await actualizarPedido({
        pedidoId: idPedidoModificar,
        lugar: lugarModificado,
        comprobanteUrl: comprobanteUrlFinal,
        items: itemsToUpdate
      });

      if (!respuesta.exito) throw new Error(respuesta.error);

      mostrarAlerta("¡Pedido Actualizado! ✅", `El pedido ${idPedidoModificar} fue actualizado y el inventario reajustado correctamente.`, "exito");

      setIdPedidoModificar('');
      setItemsPedidoOriginal([]);
      setCantidadesModificadasMap({});
      setComprobanteModificado(null);
      setPantalla('catalogo');

    } catch (error) {
      console.error(error);
      mostrarAlerta("Error al actualizar", "Hubo un error al guardar los cambios en la base de datos. Intenta nuevamente.", "error");

    } finally {
      setGuardando(false);
    }
  };

  const totalPagar = carrito.reduce((suma, item) => suma + (item.cantidad * item.precio_unitario), 0);

  // DICCIONARIOS DE EMOJIS DINÁMICOS
  const categoryIcons: Record<string, string> = {
    'Bebidas': '🥤',
    'Campari': '🥃',
    'Diageo': '🍷',
    'La Bodeguita': '🏪',
    'Nuevos Negocios': '🏢',
    'Merch': '👕',
    'Nuna Terra': '🌱',
    'Otros': '📦'
  };

  const brandIcons: Record<string, string> = {
    'Nuna Terra': '🌱', 'La Bodeguita': '🏪', 'Eterna': '🧼', 'KIMBERLY CLARK': '🧻', 'SOFTYS': '☁️',
    'KENVUE': '🧴', 'HENKEL': '🧪', 'Concordia': '🥤', 'Cubata': '🍹', 'Evervess': '🍸',
    'Frutaris': '🍎', 'Gatorade': '⚡', 'H2OH': '🍋', 'Lipton': '🍃', 'Mountain': '🏔️',
    'Pepsi': '🔵', 'Red Bull': '🐂', 'San Carlos': '💧', 'Seven UP': '🍋🟩', 'Smirnoff': '🍸',
    'Triple Kola': '🟡', '220V': '🔋', 'Sky': '🌌', 'Appleton': '🍎', 'Cinzano': '🍷',
    'Riccadonna': '🍾', 'Aperol': '🍊', 'Wild Turkey': '🦃', 'Frangelico': '🌰', 'Bulldog': '🐶',
    'Grand Marnier': '🍊', 'Espolon': '🌵', 'Merch': '👕', 'Crecer Kids': '🧸', 'More': '🍬',
    'Pepsico': '🔵'
  };

  // Extraemos todos los grupos únicos disponibles en la base de datos
  const activeMainCategories = Array.from(new Set(stockReal.map(p => p.grupo || 'Otros'))).filter(Boolean);

  const productosFiltrados = stockReal.filter(p => {
    const mainCategory = p.grupo || 'Otros';
    const marcaAgrupada = p.marca || 'Otros';
    
    const coincideBusqueda = p.descripcion.toLowerCase().includes(busquedaProducto.toLowerCase()) || p.material_id.toLowerCase().includes(busquedaProducto.toLowerCase());
    const coincideCategoria = categoriaFiltro === 'Todos' || mainCategory === categoriaFiltro;
    const coincideMarca = marcaFiltro === 'Todas' || marcaAgrupada === marcaFiltro;
    
    return coincideBusqueda && coincideCategoria && coincideMarca;
  });

  if (!regionSeleccionada && pantalla !== 'modificar') {
    return (
      <main className="min-h-screen overflow-hidden antialiased" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 50%, #0a1628 100%)' }}>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap');
          
          body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
          @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
          @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
          @keyframes spinSettle { 0% { opacity: 0; transform: scale(0.5) rotate(-180deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }
          .badge { animation: fadeUp 0.6s ease forwards; opacity: 0; animation-delay: 0.1s; }
          .hero-title { animation: fadeUp 0.7s ease forwards; opacity: 0; animation-delay: 0.25s; }
          .hero-sub { animation: fadeUp 0.7s ease forwards; opacity: 0; animation-delay: 0.4s; }
          .hero-btns { animation: fadeUp 0.7s ease forwards; opacity: 0; animation-delay: 0.55s; }
          .hero-logo { animation: fadeIn 1s ease forwards; opacity: 0; animation-delay: 0.3s; }
          .hero-main-logo { animation: spinSettle 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0; animation-delay: 0.25s; }
          .logo-float { animation: float 5s ease-in-out infinite; }
          .ring-spin { animation: spinSlow 20s linear infinite; }
          .shimmer-text { background: linear-gradient(90deg, #06b6d4, #ffffff, #06b6d4, #a78bfa); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 4s linear infinite; }
          .card-region { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
          .card-region:hover { transform: translateY(-6px) scale(1.02); }
          .glow-btn { position: relative; overflow: hidden; transition: all 0.3s ease; }
          .glow-btn::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); transition: left 0.5s ease; }
          .glow-btn:hover::before { left: 100%; }
          .glow-btn:hover { box-shadow: 0 0 30px rgba(6,182,212,0.4); }
          .modal-btn { transition: all 0.2s ease; }
          .modal-btn:hover { filter: brightness(1.15); transform: translateY(-2px); }
        `}</style>

        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)', animation: 'pulse 8s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 70%)', animation: 'pulse 10s ease-in-out infinite reverse' }} />
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        </div>

        <header style={{ position: 'relative', zIndex: 10, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', animation: 'fadeIn 0.5s ease forwards' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/logo.png" alt="CBC" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff', fontFamily: 'Syne, sans-serif' }}>CBC Perú</p>
              <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif' }}>Portal Interno</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: '20px', padding: '6px 14px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans, sans-serif' }}>Sistema Activo</span>
          </div>
        </header>

        <div style={{ position: 'relative', zIndex: 5, maxWidth: '900px', margin: '0 auto', padding: '100px 32px 80px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div className="hero-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px', margin: '0 0 24px 0' }}>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '80px', fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: '-1px', margin: 0, textAlign: 'right' }}>
              CBC Perú
              <br />
              <span className="shimmer-text" style={{ color: '#06b6d4', fontSize: '42px', display: 'block', marginTop: '10px' }}>Venta al personal</span>
            </h1>
            <div className="hero-main-logo">
              <img src="/cbc_pe.png" alt="CBC Perú Logo" className="logo-float" style={{ width: '150px', height: '150px', objectFit: 'contain', filter: 'drop-shadow(0 0 25px rgba(6, 182, 212, 0.4))' }} />
            </div>
          </div>

          <div className="hero-btns" style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setModalRegion(true)} className="glow-btn" style={{ background: '#ffffff', color: '#0f172a', border: 'none', borderRadius: '12px', padding: '18px 36px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'Syne, sans-serif', fontSize: '16px', fontWeight: 800, transition: 'all 0.2s', boxShadow: '0 10px 25px rgba(255,255,255,0.1)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              Nuevo Pedido
            </button>
            <button onClick={() => setModalModificar(true)} className="card-region" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '18px 36px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'Syne, sans-serif', fontSize: '16px', fontWeight: 800, color: '#ffffff', transition: 'all 0.2s' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Modificar Pedido
            </button>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 5, maxWidth: '1200px', margin: '0 auto', padding: '0 32px 60px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { icon: '⚡', title: 'Tiempo Real', desc: 'Stock reajustado automáticamente' },
            { icon: '🔒', title: 'Seguro', desc: 'Acceso exclusivo para trabajadores' },
            { icon: '📦', title: 'Multi-producto', desc: 'La Bodeguita, More y Diageo' },
            { icon: '📧', title: 'Confirmación', desc: 'Correo automático al registrar' },
          ].map(f => (
            <div key={f.title} className="card-region" style={{ flex: '1', minWidth: '200px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px' }}>
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '10px' }}>{f.icon}</span>
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#ffffff', fontFamily: 'Syne, sans-serif' }}>{f.title}</p>
              <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif' }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {modalRegion && (
          <div onClick={(e) => { if (e.target === e.currentTarget) setModalRegion(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn 0.2s ease forwards' }}>
            <div style={{ background: 'linear-gradient(135deg, #0d1b3e, #0a1628)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '440px', boxShadow: '0 0 80px rgba(6,182,212,0.15)' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#67e8f9', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif' }}>Realizar Pedido</p>
                  <h2 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: 800, color: '#ffffff', fontFamily: 'Syne, sans-serif' }}>¿Cuál es tu región?</h2>
                </div>
                <button onClick={() => setModalRegion(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '36px', height: '36px', color: '#ffffff', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button onClick={() => seleccionarRegion('Lima')} className="modal-btn" style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)', border: 'none', borderRadius: '16px', padding: '20px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', fontFamily: 'Syne, sans-serif', color: '#ffffff', textAlign: 'left', width: '100%' }}>
                  <span style={{ fontSize: '28px', flexShrink: 0 }}>📍</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Región Lima</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', opacity: 0.75, fontFamily: 'DM Sans, sans-serif' }}>Callao · Chorrillos · La Molina · San Isidro</p>
                  </div>
                  <span style={{ opacity: 0.6, fontSize: '18px' }}>→</span>
                </button>

                <button onClick={() => seleccionarRegion('Norte')} className="modal-btn" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '20px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', fontFamily: 'Syne, sans-serif', color: '#ffffff', textAlign: 'left', width: '100%' }}>
                  <span style={{ fontSize: '28px', flexShrink: 0 }}>📍</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Región Norte</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', opacity: 0.75, fontFamily: 'DM Sans, sans-serif' }}>Trujillo · Chiclayo · Piura y más</p>
                  </div>
                  <span style={{ opacity: 0.6, fontSize: '18px' }}>→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {modalModificar && (
          <div onClick={(e) => { if (e.target === e.currentTarget) setModalModificar(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn 0.2s ease forwards' }}>
            <div style={{ background: 'linear-gradient(135deg, #0d1b3e, #0a1628)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '440px', boxShadow: '0 0 80px rgba(6,182,212,0.15)' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#a855f7', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif' }}>Modificar Pedido</p>
                  <h2 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: 800, color: '#ffffff', fontFamily: 'Syne, sans-serif' }}>Buscar Pedido</h2>
                </div>
                <button onClick={() => setModalModificar(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '36px', height: '36px', color: '#ffffff', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginBottom: '8px', fontFamily: 'DM Sans, sans-serif' }}>ID del Pedido</label>
                  <input
                    type="text"
                    value={idPedidoModificar}
                    onChange={(e) => setIdPedidoModificar(e.target.value)}
                    placeholder="Ej: PED-123456"
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '15px', fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <button onClick={buscarPedidoParaModificar} disabled={buscandoPedido} className="modal-btn" style={{ background: 'linear-gradient(135deg, #a855f7, #9333ea)', border: 'none', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, color: '#ffffff', width: '100%' }}>
                  {buscandoPedido ? 'Buscando...' : 'Buscar Pedido 🔍'}
                </button>
              </div>
            </div>
          </div>
        )}
      {modalAgencia && (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) setModalAgencia(false); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn 0.2s ease forwards' }}
          >
            <div style={{ background: 'linear-gradient(135deg, #0d1b3e, #0a1628)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '440px', boxShadow: '0 0 80px rgba(6,182,212,0.15)' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#67e8f9', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif' }}>Región {regionPendiente}</p>
                  <h2 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: 800, color: '#ffffff', fontFamily: 'Syne, sans-serif' }}>¿A qué agencia perteneces?</h2>
                </div>
                <button
                  onClick={() => setModalAgencia(false)}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '36px', height: '36px', color: '#ffffff', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {agenciasPorRegion.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontFamily: 'DM Sans, sans-serif' }}>
                    Cargando agencias...
                  </p>
                ) : (
                  agenciasPorRegion.map((agencia, index) => (
                    <button
                      key={agencia}
                      onClick={() => { setModalAgencia(false); cargarDatos(regionPendiente!, agencia); }}
                      className="modal-btn"
                      style={{
                        background: index === 0 ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'rgba(255,255,255,0.06)',
                        border: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '16px', padding: '20px 24px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '16px',
                        fontFamily: 'Syne, sans-serif', color: '#ffffff', textAlign: 'left', width: '100%'
                      }}
                    >
                      <span style={{ fontSize: '28px', flexShrink: 0 }}>🏢</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>{agencia}</p>
                      </div>
                      <span style={{ opacity: 0.6, fontSize: '18px' }}>→</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // VISTA CARGANDO
  if (cargando) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium animate-pulse">Procesando y Sincronizando...</p>
      </main>
    );
  }

  // ==========================================
  // VISTA 3: INTERFAZ MODIFICAR PEDIDOEXISTENTE
  // ==========================================
  if (pantalla === 'modificar') {
    return (
      <main className="min-h-screen antialiased py-10 px-4" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 50%, #0a1628 100%)', color: '#fff' }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap');
          body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
          .dark-input { width: 100%; padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; box-sizing: border-box; transition: all 0.2s; }
          .dark-input:focus { border-color: #a855f7; background: rgba(255,255,255,0.08); box-shadow: 0 0 0 3px rgba(168,85,247,0.2); }
          .dark-input::placeholder { color: rgba(255,255,255,0.3); }
          .dark-label { display: block; color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-family: 'DM Sans', sans-serif; }
          .dark-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 32px; backdrop-filter: blur(10px); }
          .btn-primary-purple { background: linear-gradient(135deg, #a855f7, #9333ea); border: none; border-radius: 14px; padding: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; color: #ffffff; width: 100%; transition: all 0.2s; box-shadow: 0 4px 15px rgba(168,85,247,0.3); }
          .btn-primary-purple:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 6px 20px rgba(168,85,247,0.4); }
          .btn-primary-purple:disabled { opacity: 0.7; cursor: not-allowed; }
          .quantity-btn { width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #fff; font-weight: 800; cursor: pointer; transition: all 0.2s; font-family: 'Syne', sans-serif; }
          .quantity-btn:hover { background: rgba(255,255,255,0.1); border-color: #a855f7; }
          .quantity-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        `}</style>

        <div className="max-w-4xl mx-auto">
          <header className="mb-10 flex items-center justify-between gap-6">
            <button onClick={() => { setPantalla('catalogo'); setIdPedidoModificar(''); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} className="hover:text-white transition-colors">
              ← Volver al inicio
            </button>
            <div className="text-right">
              <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '32px', fontWeight: 800, margin: '0 0 4px 0' }}>Modificar Pedido Existente</h1>
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Actualiza lugar y cantidades para <span style={{ color: '#a855f7', fontWeight: 700, fontFamily: 'monospace' }}>{idPedidoModificar}</span></p>
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>Cliente: {itemsPedidoOriginal[0]?.nombre_cliente}</p>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="dark-card flex flex-col h-full">
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 700, marginBottom: '24px', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>Detalle del Pedido y Lugar</h2>

              <div className="mb-8">
                <label className="dark-label">Lugar de Entrega (Editable)</label>
                <select value={lugarModificado} onChange={(e) => setLugarModificado(e.target.value)} className="dark-input" style={{ appearance: 'none' }}>
                  <option value="Sala de ventas Norte (Callao)" style={{ color: '#000' }}>Sala de ventas Norte (Callao)</option>
                  <option value="Sala de ventas Sur (Chorrillos)" style={{ color: '#000' }}>Sala de ventas Sur (Chorrillos)</option>
                  <option value="Sala de ventas Este (La Molina)" style={{ color: '#000' }}>Sala de ventas Este (La Molina)</option>
                  <option value="Cromo (San isidro)" style={{ color: '#000' }}>Cromo (San isidro)</option>
                </select>
              </div>

              <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: '400px' }}>
                <div className="flex flex-col gap-6">
                  {itemsPedidoOriginal.map(item => {
                    const cantidadModificada = cantidadesModificadasMap[item.material_id] || item.cantidad;
                    // Límite visual: Lo que se pidió + lo que está libre ahora mismo en BD
                    const maximoPermitido = Number(item.stock_actual) + Number(item.cantidad);

                    return (
                      <div key={item.material_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', fontWeight: 700, color: '#fff', margin: '0 0 2px 0' }}>{item.descripcion}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>ID: {item.material_id}</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#06b6d4' }}>S/ {Number(item.precio_unitario).toFixed(2)} und</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', padding: '4px' }}>
                            <button onClick={() => actualizarCantidadPedidoExistente(item.material_id, -1)} className="quantity-btn" disabled={cantidadModificada <= 1}>-</button>
                            <span style={{ width: '40px', textAlign: 'center', fontSize: '18px', fontWeight: 800, color: '#fff', fontFamily: 'Syne, sans-serif' }}>{cantidadModificada}</span>
                            {/* El botão "+" se bloquea si se llega al límite */}
                            <button onClick={() => actualizarCantidadPedidoExistente(item.material_id, 1)} className="quantity-btn" disabled={cantidadModificada >= maximoPermitido}>+</button>
                          </div>
                          {/* Texto del Límite de Stock */}
                          <span style={{ fontSize: '11px', fontWeight: 600, color: cantidadModificada >= maximoPermitido ? '#fca5a5' : 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif' }}>
                            Límite total: {maximoPermitido}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="dark-card flex flex-col gap-5 relative h-full">
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 700, color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '10px' }}>Estado y Comprobante</h2>

              <div>
                <label className="dark-label">Estado del Pedido (No Modificable)</label>
                <input
                  type="text"
                  value={itemsPedidoOriginal[0]?.estado || ''}
                  readOnly
                  className="dark-input"
                  style={{ background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.4)', cursor: 'not-allowed', fontWeight: 700 }}
                />
              </div>

              <div className="mt-2 flex-1 flex flex-col">
                <label className="dark-label mb-2">Comprobante de Pago Actual / Nuevo</label>

                {itemsPedidoOriginal[0]?.comprobante_url && itemsPedidoOriginal[0].comprobante_url !== 'Sin comprobante' && !comprobanteModificado && (
                  <div className="mb-4">
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Comprobante actual:</p>
                    <img src={itemsPedidoOriginal[0].comprobante_url} alt="Comprobante Actual" style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                )}

                <label className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer block flex-1 flex flex-col justify-center items-center transition-all hover:bg-white/5 ${comprobanteModificado ? 'border-green-400 bg-green-950/20' : 'border-slate-500'}`}>
                  {comprobanteModificado ? (<><span className="text-3xl mb-1 block">✅</span><p className="text-sm text-green-300 font-bold truncate px-4">{comprobanteModificado.name}</p></>) : (<><span className="text-2xl mb-1 block">📸</span><p className="text-sm text-slate-300 font-bold">Subir Transferencia Nueva (Opcional)</p></>)}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files && e.target.files[0]) setComprobanteModificado(e.target.files[0]); }} />
                </label>
              </div>

              <button onClick={guardarCambiosPedido} disabled={guardando} className="btn-primary-purple flex items-center justify-center gap-2">
                {guardando ? 'Sincronizando celdas y stock...' : 'Guardar y Reajustar Inventario ✓'}
              </button>
            </div>
          </div>
        </div>
        <ModalAlerta alerta={alerta} onClose={() => setAlerta(null)} />
      </main>
    );
  }

  // VISTA CHECKOUT
  if (pantalla === 'checkout') {
    return (
      <main className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <button onClick={() => setPantalla('catalogo')} className="mb-6 text-slate-500 hover:text-slate-800 font-bold transition-colors">
            ← Volver al catálogo
          </button>
          <h1 className="text-3xl font-black text-slate-800 mb-8">Registro de Venta</h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full">
              <h2 className="font-bold text-lg mb-4 text-slate-800 border-b pb-2">Detalle del Pedido</h2>
              <div className="flex flex-col gap-6 mb-6 overflow-y-auto pr-2 flex-1">
                {carrito.map(item => (
                  <div key={item.material_id} className="flex justify-between items-start border-b border-slate-50 pb-4">
                    <div className="flex-1 pr-4">
                      <p className="font-bold text-slate-800 text-sm mb-1 leading-tight">{item.descripcion}</p>
                      <p className="text-xs font-mono text-slate-400 mb-2">ID: {item.material_id}</p>
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded-md text-xs border border-blue-100">{item.cantidad} und</span>
                        <span className="text-slate-400 text-xs">x</span>
                        <span className="text-slate-700 font-bold text-sm bg-slate-100 px-2 py-1 rounded-md border border-slate-200">S/ {item.precio_unitario.toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="font-black text-slate-800 text-lg mt-1 whitespace-nowrap">S/ {(item.cantidad * item.precio_unitario).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 pt-6 flex justify-between items-end mt-auto">
                <span className="text-slate-500 font-bold text-lg">Total Final:</span>
                <span className="text-4xl font-black text-green-600">S/ {totalPagar.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-5 relative">
              <h2 className="font-bold text-lg text-slate-800 border-b pb-2 mb-2">Datos del Vendedor / Cliente</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 relative">
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Nombre Completo (Obligatorio)</label>
                  <input type="text" value={busquedaVendedor} onFocus={() => setMostrarSugerencias(true)} onChange={(e) => { setBusquedaVendedor(e.target.value); setMostrarSugerencias(true); setDatosVenta(prev => ({ ...prev, nombre: '', codigoEmpleado: '' })); }} placeholder="Escribe tu nombre para buscar..." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800" />
                  {datosVenta.nombre && <span className="absolute right-3 top-9 text-green-500 font-bold text-sm bg-white px-2 py-1 rounded">✓ Confirmado</span>}
                  {mostrarSugerencias && busquedaVendedor.length > 0 && !datosVenta.nombre && (
                    <ul className="absolute z-50 w-full bg-white border border-slate-200 mt-1 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {vendedoresBD.filter(v => v.nombre_completo.toLowerCase().includes(busquedaVendedor.toLowerCase())).slice(0, 15).map(v => (
                        <li key={v.codigo_empleado} onClick={() => { setBusquedaVendedor(v.nombre_completo); setDatosVenta(prev => ({ ...prev, nombre: v.nombre_completo, codigoEmpleado: v.codigo_empleado })); setMostrarSugerencias(false); }} className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0">
                          <div className="font-bold text-slate-700">{v.nombre_completo}</div>
                          <div className="text-xs text-slate-500">Cód: {v.codigo_empleado}</div>
                        </li>
                      ))}
                      {vendedoresBD.filter(v => v.nombre_completo.toLowerCase().includes(busquedaVendedor.toLowerCase())).length === 0 && (
                        <li className="px-4 py-3 text-slate-500 text-sm italic">No se encontraron vendedores.</li>
                      )}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Lugar (Obligatorio)</label>
                  <select name="lugar" value={datosVenta.lugar} onChange={manejarCambioInput} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800">
                    <option value="">Seleccione un lugar...</option>
                    <option value="Sala de ventas Norte (Callao)">Sala de ventas Norte (Callao)</option>
                    <option value="Sala de ventas Sur (Chorrillos)">Sala de ventas Sur (Chorrillos)</option>
                    <option value="Sala de ventas Este (La Molina)">Sala de ventas Este (La Molina)</option>
                    <option value="Cromo (San isidro)">Cromo (San isidro)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Código Cadastro</label>
                  <input type="text" value={datosVenta.codigoEmpleado} readOnly placeholder="Se llena automáticamente" className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 font-bold text-blue-600 cursor-not-allowed" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Correo Electrónico (Obligatorio)</label>
                  <input type="email" name="correo" value={datosVenta.correo} onChange={manejarCambioInput} placeholder="Ej: usuario@empresa.com" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800" />
                </div>
              </div>

              <div className="mt-2">
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Comprobante de Pago (Obligatorio)</label>
                <label className={`border-2 border-dashed rounded-xl p-4 text-center hover:bg-slate-50 cursor-pointer block ${comprobante ? 'border-green-400 bg-green-50/30' : 'border-slate-300'}`}>
                  {comprobante ? (<><span className="text-3xl mb-1 block">✅</span><p className="text-sm text-green-700 font-bold truncate px-4">{comprobante.name}</p></>) : (<><span className="text-2xl mb-1 block">📸</span><p className="text-sm text-slate-600 font-bold">Subir Transferencia</p></>)}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files && e.target.files[0]) setComprobante(e.target.files[0]); }} />
                </label>
                <div className="mt-4 p-4 bg-slate-100 rounded-xl text-xs text-slate-600 font-medium border border-slate-200">
                  <p className="font-bold text-slate-800 mb-2 uppercase tracking-wide">Cuentas Bancarias CBC Peruana SAC</p>
                  <p className="mb-1">RUC: <span className="font-bold text-slate-800">20600281489</span></p>
                  <div className="flex flex-col gap-2 mt-3">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">BBVA Cta. Corriente en Soles</p>
                      <p className="font-mono font-bold text-slate-700">001101840100045860</p>
                      <p className="text-[10px] text-slate-500 mt-1">Cód. Recaudación: <span className="font-bold">8897</span></p>
                    </div>
                  </div>
                </div>
              </div>

              <button onClick={procesarPedido} disabled={guardando} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-black py-4 rounded-xl shadow-lg transition-all mt-auto text-lg flex justify-center items-center gap-2">
                {guardando ? 'Guardando...' : 'Confirmar y Registrar Venta ✓'}
              </button>
            </div>
          </div>
        </div>
        <ModalAlerta alerta={alerta} onClose={() => setAlerta(null)} />
      </main>
    );
  }

  // ==========================================
  // VISTA CATÁLOGO
  // ==========================================
  return (
    <main className="min-h-screen bg-slate-50 pb-20">

      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => { setRegionSeleccionada(null); setPantalla('catalogo'); }} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">← Volver</button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Catálogo CBC</h1>
              <p className="text-sm text-blue-600 font-semibold">📍 Región {regionSeleccionada}</p>
            </div>
          </div>
          <button onClick={() => setMostrarCarrito(true)} className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 hover:shadow-md ${totalPagar > 0 ? 'bg-green-100 text-green-800 scale-105 shadow-sm' : 'bg-blue-100 text-blue-800'}`}>
            <span>🛒</span> <span>S/ {totalPagar.toFixed(2)}</span>
          </button>
        </div>
      </header>

      <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '14px 0', position: 'sticky', top: '80px', zIndex: 30, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="max-w-7xl mx-auto px-4" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => { setCategoriaFiltro('Todos'); setMarcaFiltro('Todas'); }} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, transition: 'all 0.2s', background: categoriaFiltro === 'Todos' ? '#0f172a' : '#f1f5f9', color: categoriaFiltro === 'Todos' ? '#ffffff' : '#64748b', boxShadow: categoriaFiltro === 'Todos' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none' }}>
              🏪 Todos
            </button>
            {activeMainCategories.map(cat => (
              <button key={cat} onClick={() => { setCategoriaFiltro(cat); setMarcaFiltro('Todas'); }} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, transition: 'all 0.2s', background: categoriaFiltro === cat ? '#0f172a' : '#f1f5f9', color: categoriaFiltro === cat ? '#ffffff' : '#64748b', boxShadow: categoriaFiltro === cat ? '0 2px 8px rgba(0,0,0,0.15)' : 'none' }}>
                {categoryIcons[cat] || '📦'} {cat}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: '220px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {categoriaFiltro !== 'Todos' && (
              <select 
                value={marcaFiltro} 
                onChange={(e) => setMarcaFiltro(e.target.value)}
                style={{ padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', background: '#f8fafc', fontWeight: 600, color: '#475569', minWidth: '150px' }}
              >
                <option value="Todas">Todas las marcas</option>
                {Array.from(new Set(stockReal.filter(p => (p.grupo || 'Otros') === categoriaFiltro).map(p => p.marca || 'Otros'))).sort().map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', pointerEvents: 'none' }}>🔍</span>
              <input type="text" value={busquedaProducto} onChange={e => setBusquedaProducto(e.target.value)} placeholder="Buscar por nombre o código de producto..." style={{ width: '100%', padding: '10px 40px 10px 38px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              {busquedaProducto && (
                <button onClick={() => setBusquedaProducto('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: 0 }}>✕</button>
              )}
            </div>
          </div>
        </div>

        {busquedaProducto && (
          <div className="max-w-7xl mx-auto px-4" style={{ marginTop: '8px' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
              {productosFiltrados.length === 0 ? '❌ No se encontraron productos' : `✅ ${productosFiltrados.length} producto${productosFiltrados.length !== 1 ? 's' : ''} encontrado${productosFiltrados.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeMainCategories.filter(cat => categoriaFiltro === 'Todos' || categoriaFiltro === cat).map(mainCat => {
          const prodsMain = productosFiltrados.filter(p => (p.grupo || 'Otros') === mainCat);
          if (prodsMain.length === 0) return null;

          const marcasDeMainCat = Array.from(new Set(prodsMain.map((p) => p.marca || 'Otros'))).sort((a, b) => {
            const countA = prodsMain.filter((p) => (p.marca || 'Otros') === a).length;
            const countB = prodsMain.filter((p) => (p.marca || 'Otros') === b).length;
            return countB - countA;
          });

          return (
            <div key={mainCat} className="mb-14">
              <h1 className="text-3xl font-black text-slate-800 mb-8 border-b-2 border-slate-200 pb-4 uppercase tracking-widest flex items-center gap-3">
                <span className="bg-slate-800 text-white p-2 rounded-xl text-xl shadow-md">
                  {categoryIcons[mainCat] || '📦'}
                </span>
                {mainCat}
              </h1>

              {marcasDeMainCat.map((marca) => {
                const prodsMarca = prodsMain.filter((p) => (p.marca || 'Otros') === marca);
                const icon = brandIcons[marca] || '📦';
                return (
                  <div key={marca} className="mb-10 pl-6 border-l-4 border-blue-200">
                    <h2 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-2">
                      <span className="text-2xl drop-shadow-sm">{icon}</span> {marca}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {prodsMarca.map((prod) => <TarjetaProducto key={prod.material_id} producto={prod} carrito={carrito} onActualizar={actualizarCantidad} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {productosFiltrados.length === 0 && (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">🔍</p>
            <p className="text-xl font-bold text-slate-600 mb-2">No se encontraron productos</p>
            <p className="text-slate-400 mb-6">Intenta con otro nombre, código o categoría</p>
            <button onClick={() => { setBusquedaProducto(''); setCategoriaFiltro('Todos'); }} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {mostrarCarrito && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:w-[500px] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[80vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <h3 className="font-black text-xl text-slate-800">🛒 Tu Pedido</h3>
              <button onClick={() => setMostrarCarrito(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-600 w-8 h-8 rounded-full font-bold flex items-center justify-center">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {carrito.length === 0 ? (
                <div className="text-center text-slate-400 py-10"><p className="text-4xl mb-3">📦</p><p className="font-medium">Tu carrito está vacío</p></div>
              ) : (
                <div className="flex flex-col gap-4">
                  {carrito.map((item) => (
                    <div key={item.material_id} className="flex justify-between items-start border-b border-slate-100 pb-4">
                      <div className="flex-1 pr-4">
                        <p className="font-bold text-slate-800 text-sm mb-1">{item.descripcion}</p>
                        <div className="flex items-center gap-2">
                          <span className="bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded-md text-xs">{item.cantidad} und</span>
                          <span className="text-slate-400 text-xs">x</span>
                          <span className="text-slate-700 font-bold text-sm">S/ {item.precio_unitario.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="font-black text-blue-700 text-lg">S/ {(item.cantidad * item.precio_unitario).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 bg-white sm:rounded-b-3xl">
              <div className="flex justify-between items-end mb-4">
                <span className="text-slate-500 font-bold">Total a pagar:</span>
                <span className="text-3xl font-black text-green-600">S/ {totalPagar.toFixed(2)}</span>
              </div>
              <button disabled={carrito.length === 0} onClick={() => { setMostrarCarrito(false); setPantalla('checkout'); }} className="w-full bg-slate-900 text-white font-black py-4 rounded-xl disabled:bg-slate-200 disabled:text-slate-400 hover:bg-blue-600 transition-colors shadow-lg">
                Siguiente: Confirmar Pedido →
              </button>
            </div>
          </div>
        </div>
      )}
      {alerta && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ background: '#ffffff', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '420px', boxShadow: '0 25px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px',
              background: alerta.tipo === 'exito' ? '#dcfce7' : alerta.tipo === 'advertencia' ? '#fef9c3' : '#fee2e2'
            }}>
              {alerta.tipo === 'exito' ? '✅' : alerta.tipo === 'advertencia' ? '⚠️' : '❌'}
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 800, color: '#0f172a', fontFamily: 'Syne, sans-serif' }}>
              {alerta.titulo}
            </h3>
            <p style={{ margin: '0 0 28px 0', fontSize: '14px', color: '#64748b', lineHeight: 1.7, fontFamily: 'DM Sans, sans-serif', whiteSpace: 'pre-line' }}>
              {alerta.mensaje}
            </p>
            <button
              onClick={() => setAlerta(null)}
              style={{
                width: '100%', padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, color: '#ffffff',
                background: alerta.tipo === 'exito' ? 'linear-gradient(135deg, #22c55e, #16a34a)' :
                            alerta.tipo === 'advertencia' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
                            'linear-gradient(135deg, #ef4444, #dc2626)',
                boxShadow: alerta.tipo === 'exito' ? '0 4px 15px rgba(34,197,94,0.3)' :
                           alerta.tipo === 'advertencia' ? '0 4px 15px rgba(245,158,11,0.3)' :
                           '0 4px 15px rgba(239,68,68,0.3)',
                transition: 'all 0.2s'
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
      <ModalAlerta alerta={alerta} onClose={() => setAlerta(null)} />
    </main>
  );
}
function ModalAlerta({ alerta, onClose }: { alerta: any, onClose: () => void }) {
  if (!alerta) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn 0.2s ease' }}>
      <div style={{ background: '#ffffff', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '420px', boxShadow: '0 25px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px',
          background: alerta.tipo === 'exito' ? '#dcfce7' : alerta.tipo === 'advertencia' ? '#fef9c3' : '#fee2e2'
        }}>
          {alerta.tipo === 'exito' ? '✅' : alerta.tipo === 'advertencia' ? '⚠️' : '❌'}
        </div>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 800, color: '#0f172a', fontFamily: 'Syne, sans-serif' }}>
          {alerta.titulo}
        </h3>
        <p style={{ margin: '0 0 28px 0', fontSize: '14px', color: '#64748b', lineHeight: 1.7, fontFamily: 'DM Sans, sans-serif', whiteSpace: 'pre-line' }}>
          {alerta.mensaje}
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer',
            fontFamily: 'Syne, sans-serif', fontSize: '15px', fontWeight: 700, color: '#ffffff',
            background: alerta.tipo === 'exito' ? 'linear-gradient(135deg, #22c55e, #16a34a)' :
                        alerta.tipo === 'advertencia' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
                        'linear-gradient(135deg, #ef4444, #dc2626)',
            boxShadow: alerta.tipo === 'exito' ? '0 4px 15px rgba(34,197,94,0.3)' :
                       alerta.tipo === 'advertencia' ? '0 4px 15px rgba(245,158,11,0.3)' :
                       '0 4px 15px rgba(239,68,68,0.3)',
            transition: 'all 0.2s'
          }}
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
function TarjetaProducto({ producto, carrito, onActualizar }: { producto: ProductoStock, carrito: ItemCarrito[], onActualizar: (prod: ProductoStock, cambio: number) => void }) {
  const tieneStock = producto.stock > 0;
  const itemEnCarrito = carrito.find(item => item.material_id === producto.material_id);
  const cantidadPedida = itemEnCarrito ? itemEnCarrito.cantidad : 0;

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm hover:shadow-xl transition-all border flex flex-col h-full group ${cantidadPedida > 0 ? 'border-blue-400 ring-1 ring-blue-400' : 'border-slate-100'}`}>
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded-md">{producto.material_id}</span>
        <span className={`text-xs font-bold px-2 py-1 rounded-md ${tieneStock ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>Stock: {producto.stock}</span>
      </div>
      <div className="mt-auto pt-4 border-t border-slate-50">
        <h3 className="font-bold text-slate-800 text-sm mb-3 line-clamp-2 leading-tight">{producto.descripcion}</h3>
        <div className="flex items-center justify-between mb-4">
          <span className="text-2xl font-black text-blue-700">S/ {Number(producto.precio_unitario).toFixed(2)}</span>
        </div>
        {!tieneStock ? (
          <button disabled className="w-full py-3 rounded-xl font-bold bg-slate-100 text-slate-400 cursor-not-allowed">Agotado</button>
        ) : cantidadPedida === 0 ? (
          <button onClick={() => onActualizar(producto, 1)} className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-slate-900 text-white hover:bg-blue-600 hover:shadow-lg hover:-translate-y-1">+ Añadir</button>
        ) : (
          <div className="flex items-center justify-between w-full bg-blue-50 rounded-xl overflow-hidden border border-blue-200">
            <button onClick={() => onActualizar(producto, -1)} className="w-1/3 py-3 font-black text-blue-700 hover:bg-blue-200 transition-colors text-lg">-</button>
            <span className="w-1/3 text-center font-black text-blue-900 text-lg">{cantidadPedida}</span>
            <button onClick={() => onActualizar(producto, 1)} disabled={cantidadPedida >= producto.stock} className={`w-1/3 py-3 font-black text-lg transition-colors ${cantidadPedida >= producto.stock ? 'text-blue-300 cursor-not-allowed' : 'text-blue-700 hover:bg-blue-200'}`}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}