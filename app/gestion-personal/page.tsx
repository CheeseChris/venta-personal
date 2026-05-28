import { obtenerVendedores } from "../actions";
import AdminNav from "@/app/components/AdminNav";
import GestionPersonalClient from "@/app/gestion-personal/GestionPersonalClient";

export const dynamic = 'force-dynamic';

export default async function GestionPersonalPage() {
  const personal = await obtenerVendedores();

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <AdminNav />
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestión de Personal</h1>
          <p className="text-gray-500 mt-2">Agrega, edita, elimina o sube un Excel con la base de trabajadores.</p>
        </div>

        <GestionPersonalClient personalInicial={personal} />
      </div>
    </div>
  );
}
