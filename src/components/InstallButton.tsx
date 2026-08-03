import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// Type minimal de l'événement `beforeinstallprompt` (non standard, Chromium).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Détecte si l'app tourne déjà en mode installé (standalone).
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari
  (window.navigator as any).standalone === true;

interface InstallButtonProps {
  /** Style compact pour la barre d'en-tête (icône seule sur petit écran). */
  compact?: boolean;
  className?: string;
}

export const InstallButton: React.FC<InstallButtonProps> = ({ compact = false, className }) => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => (window as any).__deferredInstallPrompt ?? null,
  );
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onInstallable = () =>
      setDeferred((window as any).__deferredInstallPrompt ?? null);
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('pwa-installable', onInstallable);
    window.addEventListener('pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('pwa-installable', onInstallable);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, []);

  // Déjà installée → rien à afficher.
  if (installed) return null;

  const handleClick = async () => {
    const prompt = deferred ?? (window as any).__deferredInstallPrompt;

    // Pas d'invite native disponible (ex. iOS Safari) → on guide l'utilisateur.
    if (!prompt) {
      const iOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
      toast({
        title: 'Installer l\'application',
        description: iOS
          ? "Sur iPhone/iPad : touchez « Partager » puis « Sur l'écran d'accueil »."
          : "Ouvrez le menu de votre navigateur puis « Ajouter à l'écran d'accueil ».",
      });
      return;
    }

    await prompt.prompt();
    const choice = await prompt.userChoice;
    (window as any).__deferredInstallPrompt = null;
    setDeferred(null);
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      toast({
        title: 'Application installée 🎉',
        description: "Retrouvez « Menu Gestion » sur votre écran d'accueil.",
      });
    }
  };

  return (
    <Button
      onClick={handleClick}
      variant="secondary"
      size={compact ? 'sm' : 'default'}
      className={className}
    >
      {installed ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      <span className={compact ? 'hidden sm:inline' : ''}>Installer l'app</span>
    </Button>
  );
};
