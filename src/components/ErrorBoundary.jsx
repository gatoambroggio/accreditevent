import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[hsl(120_14%_97%)] px-5">
          <div className="max-w-md text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-xl font-bold text-slate-900">Algo salió mal</h1>
            <p className="mt-2 text-sm text-slate-500">
              Se produjo un error inesperado. Podés recargar la página para continuar.
              Si el problema persiste, contactá al administrador.
            </p>
            {this.state.error?.message && (
              <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-left text-xs text-slate-300">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              <RefreshCw className="h-4 w-4" /> Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}