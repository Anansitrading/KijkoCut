import React from 'react';
import { X, ExternalLink } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectKey: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSelectKey }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full border border-gray-700 relative">
        <div className="flex flex-col space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">API Key Required</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-400">
              To generate videos with Veo, you need to select an API key associated with a project that has billing enabled.
            </p>
            <div className="flex flex-col space-y-2 pt-2">
              <button 
                onClick={onSelectKey}
                className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-md hover:bg-indigo-700 transition-colors text-sm"
              >
                Select API Key
              </button>
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-center text-sm text-indigo-400 hover:underline"
              >
                Learn more about billing <ExternalLink className="inline-block h-3 w-3" />
              </a>
            </div>
        </div>
      </div>
    </div>
  );
};
