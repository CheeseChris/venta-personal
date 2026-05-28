import AdminNav from "@/app/components/AdminNav";
import GestionStockClient from "./GestionStockClient";

export const dynamic = 'force-dynamic';

export default function GestionStockPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <AdminNav />
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestión de Stock</h1>
          <p className="text-gray-500 mt-2">Sube un Excel para reemplazar o actualizar el stock disponible.</p>
        </div>

        <GestionStockClient />
      </div>
    </div>
  );
}
