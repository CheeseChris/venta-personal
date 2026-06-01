'use server';

import { sql } from '@vercel/postgres';
// @ts-ignore
import nodemailer from 'nodemailer';

export interface ProductoStock {
  material_id: string;
  descripcion: string;
  categoria?: string;      // <-- El "?" significa que es opcional internamente
  stock: number;
  precio_unitario: number;
  grupo?: string;          // <-- "?"
  marca?: string;          // <-- "?"
  region?: string;         // <-- "?"
  agencia?: string;        // <-- "?"
}

export interface Vendedor {
  codigo_empleado: string;
  nombre_completo: string;
}export interface PedidoExistenteItem {
  pedido_id: string;
  material_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  estado: string;
  nombre_cliente: string;
  agencia: string;
  comprobante_url: string;
  stock_actual: number;
  categoria?: string;
  grupo?: string;
  marca?: string;
}

export async function obtenerAgenciasPorRegion(region: string): Promise<string[]> {
  const { rows } = await sql<{ agencia: string }>`
    SELECT DISTINCT agencia 
    FROM stock_disponible 
    WHERE region = ${region} AND agencia IS NOT NULL AND agencia != ''
    ORDER BY agencia ASC;
  `;
  return rows.map(r => r.agencia);
}

export async function obtenerStockPorRegion(region: string, agencia: string): Promise<ProductoStock[]> {
  const { rows } = await sql<ProductoStock>`
    SELECT 
      material_id, descripcion, categoria, stock, 
      precio_unitario, grupo, marca, region, agencia 
    FROM stock_disponible 
    WHERE region = ${region} AND agencia = ${agencia}
    ORDER BY descripcion ASC;
  `;
  return rows;
}
// NUEVA FUNCIÓN AÑADIDA: Obtiene todo el stock sin importar la región
export async function obtenerTodoElStock(): Promise<ProductoStock[]> {
  try {
    const { rows } = await sql<ProductoStock>`
      SELECT 
        material_id, 
        descripcion, 
        categoria, 
        stock, 
        precio_unitario, 
        grupo, 
        marca, 
        region, 
        agencia 
      FROM stock_disponible 
      ORDER BY region ASC, descripcion ASC;
    `;
    return rows;
  } catch (error) {
    console.error("🔥 Error obteniendo todo el stock:", error);
    return [];
  }
}

export async function obtenerVendedores(): Promise<Vendedor[]> {
  const { rows } = await sql<Vendedor>`
    SELECT * FROM vendedores
    ORDER BY nombre_completo ASC;
  `;
  return rows;
}

// CORRECCIÓN: Buscamos usando "LIKE" para que al escribir PED-123 encuentre todos los items asociados a ese pedido
export async function obtenerPedidoPorId(pedidoId: string): Promise<PedidoExistenteItem[]> {
  const searchTerm = `${pedidoId}%`;
  const { rows } = await sql<any>`
    SELECT 
      rp.pedido_id,
      rp.material_id,
      rp.descripcion,
      rp.cantidad,
      rp.precio_total,
      rp.agencia,
      rp.estado,
      rp.nombre_cliente,
      rp.comprobante_url,
      (rp.precio_total / rp.cantidad)::numeric as precio_unitario,
      sd.stock as stock_actual,
      sd.categoria,
      sd.grupo,
      sd.marca
    FROM registro_pedidos rp
    LEFT JOIN stock_disponible sd 
      ON rp.material_id = sd.material_id 
    WHERE rp.pedido_id LIKE ${searchTerm};
  `;
  return rows;
}

export async function registrarPedido(pedidoData: {
  pedido_id: string;
  nombre_cliente: string;
  agencia: string;
  agencia_inventario: string;  // ← esta línea
  correo: string;
  material_id: string;
  descripcion: string;
  cantidad: number;
  precio_total: number;
  codigo_empleado: string;
  comprobante_url: string;
}) {
  try {
    const fechaActual = new Date();
    const fecha = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(fechaActual);
    const hora = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(fechaActual);

    await sql`
      INSERT INTO registro_pedidos (
        pedido_id, fecha, hora, nombre_cliente, agencia, correo,
        material_id, descripcion, cantidad, precio_total,
        estado, codigo_empleado, comprobante_url, agencia_inventario
      ) VALUES (
        ${pedidoData.pedido_id}, ${fecha}, ${hora}, ${pedidoData.nombre_cliente},
        ${pedidoData.agencia}, ${pedidoData.correo}, ${pedidoData.material_id},
        ${pedidoData.descripcion}, ${pedidoData.cantidad}, ${pedidoData.precio_total},
        'EN REVISION', ${pedidoData.codigo_empleado}, ${pedidoData.comprobante_url},
        ${pedidoData.agencia_inventario}
      );
    `;

    await sql`
      UPDATE stock_disponible 
      SET stock = stock - ${pedidoData.cantidad}
      WHERE material_id = ${pedidoData.material_id}
        AND agencia = ${pedidoData.agencia_inventario};
    `;

    return { exito: true };
  } catch (error) {
    console.error("🔥 Error en Postgres (Registro):", error);
    return { exito: false, error: (error as any).message ?? "Error desconocido" };
  }
}

export async function actualizarPedido(datos: {
  pedidoId: string;
  lugar: string;
  comprobanteUrl: string;
  items: { material_id: string; cantidad_nueva: number; cantidad_antigua: number; precio_unitario: number }[];
}) {
  try {
    for (const item of datos.items) {
      const nuevoPrecioTotal = item.cantidad_nueva * item.precio_unitario;
      const diferenciaCantidad = item.cantidad_nueva - item.cantidad_antigua;

      // Armamos el ID exacto que tiene la BD para actualizar la fila correcta
      const idDbExacto = `${datos.pedidoId}-${item.material_id}`;

      await sql`
        UPDATE registro_pedidos
        SET 
          agencia = ${datos.lugar},
          cantidad = ${item.cantidad_nueva},
          precio_total = ${nuevoPrecioTotal},
          comprobante_url = ${datos.comprobanteUrl}
        WHERE pedido_id = ${idDbExacto};
      `;

      await sql`
        UPDATE stock_disponible 
        SET stock = stock - ${diferenciaCantidad}
        WHERE material_id = ${item.material_id};
      `;
    }
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error actualizando pedido en Postgres:", error);
    return { exito: false, error: (error as any).message ?? "Fallo al actualizar en base de datos" };
  }
}

export async function enviarCorreoConfirmacion(datos: {
  nombre: string;
  correoDestino: string;
  bcc?: string[]; // Propiedad añadida
  pedidoId: string;
  lugar: string;
  total: number;
  items: any[];
  comprobanteUrl?: string;
}) {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      tls: {
        rejectUnauthorized: false
      },
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_PASS,
      },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"CBC Pedidos" <${process.env.BREVO_SENDER_EMAIL}>`,
      to: datos.correoDestino,
      bcc: datos.bcc, // Asignación de la copia oculta
      subject: `Confirmación de Pedido: ${datos.pedidoId}`,
      html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family: 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
          <tr>
            <td style="background:#ffffff; border-radius: 16px 16px 0 0; padding: 32px 40px 24px 40px; text-align:center; border-top: 6px solid transparent; background-image: linear-gradient(white, white), linear-gradient(90deg, #f97316, #eab308, #22c55e, #a855f7, #06b6d4); background-origin: border-box; background-clip: padding-box, border-box;">
              <p style="margin:0 0 6px 0; font-size:11px; font-weight:700; color:#9ca3af; letter-spacing:3px; text-transform:uppercase;">Sistema de Pedidos Interno</p>
              <p style="margin:0; font-size:28px; font-weight:900; color:#1e3a5f;">CBC Perú</p>
            </td>
          </tr>
          <tr>
            <td style="background:#22c55e; padding: 16px 40px; text-align:center;">
              <p style="margin:0; font-size:15px; font-weight:700; color:#ffffff; letter-spacing:0.5px;">✅ &nbsp;¡Pedido Registrado/Modificado con Éxito!</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff; padding: 40px;">
              <p style="margin: 0 0 8px 0; font-size:17px; color:#374151;">
                Hola <strong style="color:#111827;">${datos.nombre}</strong>,
              </p>
              <p style="margin: 0 0 32px 0; font-size:14px; color:#6b7280; line-height:1.7;">
                Tu solicitud ha sido procesada correctamente en la base de datos.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border-radius:12px; border:1px solid #e5e7eb; margin-bottom:28px;">
                <tr>
                  <td style="padding: 18px 24px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin:0; font-size:10px; font-weight:700; color:#9ca3af; letter-spacing:2px; text-transform:uppercase;">N° de Pedido</p>
                    <p style="margin:6px 0 0 0; font-size:22px; font-weight:900; color:#06b6d4; font-family:monospace;">${datos.pedidoId}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 24px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin:0; font-size:10px; font-weight:700; color:#9ca3af; letter-spacing:2px; text-transform:uppercase;">Lugar de Entrega</p>
                    <p style="margin:6px 0 0 0; font-size:15px; font-weight:600; color:#374151;">📍 ${datos.lugar}</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 10px 0; font-size:10px; font-weight:700; color:#9ca3af; letter-spacing:2px; text-transform:uppercase;">Detalle de Productos</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px; overflow:hidden; border:1px solid #e5e7eb; margin-bottom:24px;">
                <thead>
                  <tr style="background:#374151;">
                    <th style="padding:13px 20px; text-align:left; font-size:11px; font-weight:700; color:#f9fafb; letter-spacing:1px; text-transform:uppercase;">Producto</th>
                    <th style="padding:13px 16px; text-align:center; font-size:11px; font-weight:700; color:#f9fafb; letter-spacing:1px; text-transform:uppercase;">Cant.</th>
                    <th style="padding:13px 20px; text-align:right; font-size:11px; font-weight:700; color:#f9fafb; letter-spacing:1px; text-transform:uppercase;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${datos.items.map((item, index) => `
                    <tr style="background:${index % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                      <td style="padding:13px 20px; font-size:13px; color:#374151; font-weight:500; border-bottom:1px solid #f3f4f6;">${item.descripcion}</td>
                      <td style="padding:13px 16px; text-align:center; border-bottom:1px solid #f3f4f6;">
                        <span style="background:#e0f2fe; color:#0284c7; font-size:12px; font-weight:700; padding:3px 10px; border-radius:20px;">${item.cantidad}</span>
                      </td>
                      <td style="padding:13px 20px; text-align:right; font-size:14px; font-weight:700; color:#111827; border-bottom:1px solid #f3f4f6;">S/ ${(item.cantidad * item.precio_unitario).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px; overflow:hidden; border: 2px solid #06b6d4; margin-bottom:32px;">
                <tr>
                  <td style="padding:20px 24px; background:#ecfeff;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:15px; font-weight:600; color:#0e7490;">Total a Pagar</td>
                        <td style="text-align:right; font-size:30px; font-weight:900; color:#0e7490;">S/ ${datos.total.toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ${datos.comprobanteUrl && datos.comprobanteUrl !== 'Sin comprobante' ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; margin-bottom:32px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0; font-size:13px; font-weight:700; color:#ea580c;">📎 Comprobante de pago adjunto</p>
                    <a href="${datos.comprobanteUrl}" target="_blank" 
                      style="display:inline-block; margin-top:8px; background:#ea580c; color:#ffffff; font-size:13px; font-weight:700; padding: 8px 20px; border-radius:8px; text-decoration:none;">
                      Ver imagen del comprobante →
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
              <p style="margin:0; font-size:13px; color:#9ca3af; line-height:1.7;">
                Para consultas sobre tu pedido, comunícate con el área de logística indicando tu número de pedido.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0; height:5px; background: linear-gradient(90deg, #f97316 0%, #eab308 25%, #22c55e 50%, #a855f7 75%, #06b6d4 100%);"></td>
          </tr>
          <tr>
            <td style="background:#f9fafb; border-radius: 0 0 16px 16px; padding: 20px 40px; text-align:center; border: 1px solid #e5e7eb; border-top:none;">
              <p style="margin:0 0 4px 0; font-size:13px; font-weight:700; color:#374151;">CBC Perú</p>
              <p style="margin:0; font-size:11px; color:#9ca3af;">Sistema de Pedidos Interno &nbsp;•&nbsp; Uso exclusivo de trabajadores</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    console.log("✅ Correo enviado:", info.messageId);
    return { exito: true };

  } catch (error) {
    console.error("❌ Error enviando correo:", error);
    return { exito: false, error: (error as any).message };
  }
}

export interface PedidoCompleto {
  pedido_id: string;
  fecha: string;              // ← AÑADIDO
  hora: string;               // ← AÑADIDO
  nombre_cliente: string;
  agencia: string;
  agencia_inventario: string;
  correo: string;
  material_id: string;
  descripcion: string;
  cantidad: number;
  precio_total: number;
  codigo_empleado: string;
  comprobante_url: string;
  estado: string;
  categoria?: string;
}

export async function obtenerTodosLosPedidos(): Promise<PedidoCompleto[]> {
  try {
    const { rows } = await sql<any>`
      SELECT 
        rp.*,
        sd.categoria
      FROM registro_pedidos rp
      LEFT JOIN stock_disponible sd 
        ON rp.material_id = sd.material_id
        AND rp.agencia_inventario = sd.agencia
      ORDER BY rp.fecha DESC, rp.hora DESC;
    `;

    // Aseguramos que fecha y hora sean strings, ya que Postgres puede devolver objetos Date
    // y React no puede renderizar objetos Date directamente.
    const pedidosFormateados = rows.map(row => ({
      ...row,
      fecha: row.fecha instanceof Date ? row.fecha.toISOString().split('T')[0] : String(row.fecha),
      hora: row.hora instanceof Date ? row.hora.toISOString().split('T')[1]?.substring(0, 8) || String(row.hora) : String(row.hora)
    }));

    return pedidosFormateados as PedidoCompleto[];
  } catch (error) {
    console.error("🔥 Error obteniendo todos los pedidos:", error);
    return [];
  }
}

export async function actualizarEstadoPedido(pedidoId: string, nuevoEstado: string) {
  try {
    const idDbExacto = `${pedidoId}%`;

    // 1. Obtener los items con su agencia_inventario
    const { rows: itemsActuales } = await sql<any>`
      SELECT material_id, cantidad, estado, agencia_inventario
      FROM registro_pedidos 
      WHERE pedido_id LIKE ${idDbExacto};
    `;

    if (itemsActuales.length === 0) {
      return { exito: false, error: "Pedido no encontrado en la base de datos" };
    }

    const estadoAnterior = itemsActuales[0].estado;

    // 2. Si pasa a RECHAZADO, devolver stock A LA AGENCIA CORRECTA
    if (nuevoEstado === 'RECHAZADO' && estadoAnterior !== 'RECHAZADO') {
      for (const item of itemsActuales) {
        await sql`
          UPDATE stock_disponible
          SET stock = stock + ${item.cantidad}
          WHERE material_id = ${item.material_id}
            AND agencia = ${item.agencia_inventario};
        `;
      }
    }
    // 3. Si estaba RECHAZADO y pasa a otro estado, restar stock DE LA AGENCIA CORRECTA
    else if (estadoAnterior === 'RECHAZADO' && nuevoEstado !== 'RECHAZADO') {
      for (const item of itemsActuales) {
        const { rows: stockQuery } = await sql<any>`
          SELECT stock FROM stock_disponible 
          WHERE material_id = ${item.material_id}
            AND agencia = ${item.agencia_inventario};
        `;
        if (stockQuery.length === 0 || stockQuery[0].stock < item.cantidad) {
          return { 
            exito: false, 
            error: `Stock insuficiente en agencia ${item.agencia_inventario} para producto ${item.material_id}` 
          };
        }
      }

      for (const item of itemsActuales) {
        await sql`
          UPDATE stock_disponible
          SET stock = stock - ${item.cantidad}
          WHERE material_id = ${item.material_id}
            AND agencia = ${item.agencia_inventario};
        `;
      }
    }

    // 4. Actualizar estado
    await sql`
      UPDATE registro_pedidos
      SET estado = ${nuevoEstado}
      WHERE pedido_id LIKE ${idDbExacto};
    `;

    return { exito: true };
  } catch (error) {
    console.error("🔥 Error actualizando estado de pedido:", error);
    return { exito: false, error: error instanceof Error ? error.message : "Fallo al actualizar el estado" };
  }
}
// ==========================================
// ADMIN FUNCTIONS PARA GESTIÓN DE STOCK Y PERSONAL
// ==========================================

export async function reemplazarStockMasivo(datos: ProductoStock[]) {
  try {
    // 1. Limpiamos la tabla
    await sql`TRUNCATE TABLE stock_disponible;`;

    // 2. Insertamos los nuevos
    for (const item of datos) {
      await sql`
        INSERT INTO stock_disponible (material_id, descripcion, categoria, stock, precio_unitario, grupo, marca, region, agencia)
        VALUES (${item.material_id}, ${item.descripcion}, ${item.categoria}, ${item.stock}, ${item.precio_unitario}, ${item.grupo}, ${item.marca}, ${item.region}, ${item.agencia});
      `;
    }
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error reemplazando stock:", error);
    return { exito: false, error: error instanceof Error ? error.message : "Fallo al reemplazar stock" };
  }
}

export async function agregarStockMasivo(datos: ProductoStock[]) {
  try {
    for (const item of datos) {
      await sql`
        INSERT INTO stock_disponible (material_id, descripcion, categoria, stock, precio_unitario, grupo, marca, region, agencia)
        VALUES (${item.material_id}, ${item.descripcion}, ${item.categoria}, ${item.stock}, ${item.precio_unitario}, ${item.grupo}, ${item.marca}, ${item.region}, ${item.agencia})
        ON CONFLICT (material_id) DO UPDATE 
        SET stock = stock_disponible.stock + EXCLUDED.stock,
            precio_unitario = EXCLUDED.precio_unitario,
            descripcion = EXCLUDED.descripcion,
            categoria = EXCLUDED.categoria,
            grupo = EXCLUDED.grupo,
            marca = EXCLUDED.marca,
            region = EXCLUDED.region,
            agencia = EXCLUDED.agencia;
      `;
    }
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error agregando stock:", error);
    return { exito: false, error: error instanceof Error ? error.message : "Fallo al agregar stock" };
  }
}

export async function reemplazarPersonalMasivo(datos: Vendedor[]) {
  try {
    await sql`TRUNCATE TABLE vendedores;`;

    for (const item of datos) {
      await sql`
        INSERT INTO vendedores (codigo_empleado, nombre_completo)
        VALUES (${item.codigo_empleado}, ${item.nombre_completo});
      `;
    }
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error reemplazando personal:", error);
    return { exito: false, error: error instanceof Error ? error.message : "Fallo al reemplazar personal" };
  }
}

export async function agregarPersonalMasivo(datos: Vendedor[]) {
  try {
    for (const item of datos) {
      await sql`
        INSERT INTO vendedores (codigo_empleado, nombre_completo)
        VALUES (${item.codigo_empleado}, ${item.nombre_completo})
        ON CONFLICT (codigo_empleado) DO UPDATE 
        SET nombre_completo = EXCLUDED.nombre_completo;
      `;
    }
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error agregando personal:", error);
    return { exito: false, error: error instanceof Error ? error.message : "Fallo al agregar personal" };
  }
}

export async function eliminarPersonal(codigo_empleado: string) {
  try {
    await sql`
      DELETE FROM vendedores WHERE codigo_empleado = ${codigo_empleado};
    `;
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error eliminando personal:", error);
    return { exito: false, error: error instanceof Error ? error.message : "Fallo al eliminar personal" };
  }
}

export async function modificarPersonal(codigo_empleado: string, nuevo_nombre: string) {
  try {
    await sql`
      UPDATE vendedores SET nombre_completo = ${nuevo_nombre} WHERE codigo_empleado = ${codigo_empleado};
    `;
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error modificando personal:", error);
    return { exito: false, error: error instanceof Error ? error.message : "Fallo al modificar personal" };
  }
}

export async function agregarPersonal(codigo_empleado: string, nombre_completo: string) {
  try {
    await sql`
      INSERT INTO vendedores (codigo_empleado, nombre_completo)
      VALUES (${codigo_empleado}, ${nombre_completo});
    `;
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error agregando personal:", error);
    return { exito: false, error: error instanceof Error ? error.message : "Fallo al agregar personal" };
  }
}

export async function verificarLimiteBebidas(
  codigoEmpleado: string,
  materialId: string,
  cantidadSolicitada: number
): Promise<{ permitido: boolean; mensaje?: string; cantidadDisponible: number }> {
  try {
    // Verificar si el producto es de categoría Bebidas o Alcohol/Licores
    const { rows: productoRows } = await sql<any>`
      SELECT categoria, marca, grupo, descripcion FROM stock_disponible 
      WHERE material_id = ${materialId} 
      LIMIT 1;
    `;

    if (productoRows.length === 0) {
      return { permitido: true, cantidadDisponible: 999999 };
    }

    const categoria = productoRows[0].categoria;
    const marca = productoRows[0].marca || '';
    const grupo = productoRows[0].grupo || '';
    const descripcion = productoRows[0].descripcion || '';
    
    // Usamos 'grupo' para clasificar (no 'categoria') igual que el frontend
    const esBebida = grupo === 'Bebidas';
    
    const esDiageo = marca.toUpperCase().trim() === 'DIAGEO' || 
                     grupo.toUpperCase().trim() === 'DIAGEO' || 
                     descripcion.toUpperCase().includes('DIAGEO');

    // Licores con grupo='Licores' excepto Diageo (que tiene grupo='Diageo')
    const esAlcohol = grupo === 'Licores' && !esDiageo;

    if (!esBebida && !esAlcohol) {
      return { permitido: true, cantidadDisponible: 999999 };
    }

    const categoriaLimite = esBebida ? 'Bebidas' : 'Alcohol y Licores';

    // Buscar pedidos de ese SKU por ese empleado en los últimos 28 días
    const { rows: pedidosRows } = await sql<any>`
      SELECT 
        rp.cantidad,
        rp.fecha
      FROM registro_pedidos rp
      WHERE rp.codigo_empleado = ${codigoEmpleado}
        AND rp.material_id = ${materialId}
        AND rp.estado != 'RECHAZADO'
        AND rp.fecha >= (CURRENT_DATE - INTERVAL '15 days')
      ORDER BY rp.fecha DESC;
    `;

    const totalPedidoEnVentana = pedidosRows.reduce(
      (suma: number, row: any) => suma + Number(row.cantidad), 0
    );

    const cantidadDisponible = Math.max(0, 4 - totalPedidoEnVentana);

    if (totalPedidoEnVentana >= 4) {
      // Calcular cuándo podrá pedir de nuevo (28 días desde el pedido más antiguo en la ventana)
      const fechaMasAntigua = new Date(pedidosRows[pedidosRows.length - 1].fecha);
      const fechaProximoPedido = new Date(fechaMasAntigua);
      fechaProximoPedido.setDate(fechaProximoPedido.getDate() + 15);
      const fechaFormateada = fechaProximoPedido.toLocaleDateString('es-PE', {
        day: '2-digit', month: 'long', year: 'numeric'
      });

      return {
        permitido: false,
        cantidadDisponible: 0,
        mensaje: `Ya realizaste un pedido de 4 unidades de este producto en los últimos 28 días. Podrás volver a pedirlo a partir del ${fechaFormateada}.`
      };
    }

    if (totalPedidoEnVentana + cantidadSolicitada > 4) {
      return {
        permitido: false,
        cantidadDisponible,
        mensaje: `Solo puedes pedir ${cantidadDisponible} unidade${cantidadDisponible !== 1 ? 's' : ''} más de este producto. El límite es 4 unidades cada 28 días para productos de ${categoriaLimite}.`
      };
    }

    return { permitido: true, cantidadDisponible };

  } catch (error) {
    console.error("🔥 Error verificando límite de producto:", error);
    return { permitido: true, cantidadDisponible: 4 };
  }
}

export async function obtenerEstadoCompras(): Promise<boolean> {
  try {
    const { rows } = await sql<{ valor: string }>`
      SELECT valor FROM configuracion_sistema WHERE clave = 'compras_habilitadas';
    `;
    return rows[0]?.valor === 'true';
  } catch {
    return true; // Si falla, permite compras por defecto
  }
}

export async function toggleEstadoCompras(nuevoEstado: boolean): Promise<{ exito: boolean }> {
  try {
    await sql`
      UPDATE configuracion_sistema 
      SET valor = ${nuevoEstado ? 'true' : 'false'}
      WHERE clave = 'compras_habilitadas';
    `;
    return { exito: true };
  } catch (error) {
    console.error("🔥 Error actualizando estado de compras:", error);
    return { exito: false };
  }
}

export async function verificarLimiteGlobalBebidas(
  codigoEmpleado: string,
  tipo: 'Bebidas' | 'Alcohol'
): Promise<{ permitido: boolean; mensaje?: string }> {
  try {
    const label = tipo === 'Bebidas' ? 'bebidas' : 'alcohol y licores';
    let rows;

    if (tipo === 'Bebidas') {
      const result = await sql<any>`
        SELECT SUM(rp.cantidad) as total
        FROM registro_pedidos rp
        JOIN stock_disponible sd ON rp.material_id = sd.material_id
        WHERE rp.codigo_empleado = ${codigoEmpleado}
          AND sd.grupo = 'Bebidas'
          AND rp.estado != 'RECHAZADO'
          AND rp.fecha >= (CURRENT_DATE - INTERVAL '28 days');
      `;
      rows = result.rows;
    } else {
      const result = await sql<any>`
        SELECT SUM(rp.cantidad) as total
        FROM registro_pedidos rp
        JOIN stock_disponible sd ON rp.material_id = sd.material_id
        WHERE rp.codigo_empleado = ${codigoEmpleado}
          AND sd.grupo = 'Licores'
          AND UPPER(sd.marca) != 'DIAGEO'
          AND rp.estado != 'RECHAZADO'
          AND rp.fecha >= (CURRENT_DATE - INTERVAL '28 days');
      `;
      rows = result.rows;
    }

    const total = Number(rows[0]?.total || 0);

    if (total >= 4) {
      return {
        permitido: false,
        mensaje: `Ya alcanzaste el límite de 4 paquetes/unidades de ${label} en los últimos 28 días. Podrás realizar un nuevo pedido de ${label} una vez transcurrido ese período.`
      };
    }

    return { permitido: true };
  } catch (error) {
    console.error("🔥 Error verificando límite global:", error);
    return { permitido: true };
  }
}