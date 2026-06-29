import React from 'react';

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
}

// Erreurs typiques d'un chunk (module dynamique) introuvable après un redéploiement
// — les noms de fichiers hashés changent, l'ancien index.html en cache pointe vers
// des fichiers qui n'existent plus.
const CHUNK_ERROR =
  /(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\d]+ failed|Unable to preload CSS)/i;

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidMount() {
    // Chargement réussi -> on libère le verrou anti-boucle de rechargement.
    try { sessionStorage.removeItem('chunk-reloaded'); } catch { /* ignore */ }
  }

  componentDidCatch(error: Error) {
    const isChunkError = CHUNK_ERROR.test(error?.message ?? '');
    // Après mise à jour de l'app : on recharge UNE fois pour récupérer
    // la version à jour, sans risque de boucle infinie.
    if (isChunkError) {
      try {
        if (!sessionStorage.getItem('chunk-reloaded')) {
          sessionStorage.setItem('chunk-reloaded', '1');
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    try { sessionStorage.removeItem('chunk-reloaded'); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 p-6">
          <div className="text-center max-w-md">
            <h1 className="text-xl font-bold text-gray-900 mb-2">Une erreur est survenue</h1>
            <p className="text-gray-600 mb-4">
              L'application a peut-être été mise à jour. Recharge la page pour récupérer
              la dernière version.
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
