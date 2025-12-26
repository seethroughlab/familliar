import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    const wasDismissed = sessionStorage.getItem('pwa-prompt-dismissed');
    if (wasDismissed) {
      setDismissed(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show prompt after a short delay
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  if (!showPrompt || dismissed || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 animate-slide-up">
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-500/20 rounded-lg shrink-0">
            <Download className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-white text-sm">Install Familiar</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Add to your home screen for the best experience
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-zinc-700 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleInstall}
            className="flex-1 py-2 px-3 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="py-2 px-3 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
