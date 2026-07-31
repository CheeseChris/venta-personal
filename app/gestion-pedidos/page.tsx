import { obtenerTodosLosPedidos, obtenerEstadoCompras, obtenerLimitesConfig } from "../actions";
import GestionPedidosClient from "@/app/gestion-pedidos/GestionPedidosClient";
import AdminNav from "@/app/components/AdminNav";

export const dynamic = 'force-dynamic';

export default async function GestionPedidosPage() {
  const [pedidos, comprasHabilitadas, limites] = await Promise.all([
    obtenerTodosLosPedidos(),
    obtenerEstadoCompras(),
    obtenerLimitesConfig()
  ]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <AdminNav />
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestión de Pedidos</h1>
          <p className="text-gray-500 mt-2">Revisa, aprueba o rechaza los pedidos ingresados por los vendedores.</p>
        </div>

        <GestionPedidosClient 
          pedidosIniciales={pedidos} 
          comprasHabilitadasInicial={comprasHabilitadas} 
          limiteBebidasInicial={limites.limiteBebidas}
          limiteAlcoholInicial={limites.limiteAlcohol}
        />
      </div>
    </div>
  );
}