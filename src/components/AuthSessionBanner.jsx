import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthSessionBanner({ actionLabel = "registrar una cuenta nueva" }) {
  const { isAuthenticated, user, logout } = useAuth();
  if (!isAuthenticated) return null;
  return (
    <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
      <p className="font-medium">
        Ya tenés una sesión iniciada{user?.email ? ` como ${user.email}` : ""}.
      </p>
      <p className="mt-1 text-amber-700">
        Cerrá sesión para {actionLabel}.
      </p>
      <Button
        variant="outline"
        className="mt-3 h-9 text-sm border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={() => logout(true)}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Cerrar sesión
      </Button>
    </div>
  );
}