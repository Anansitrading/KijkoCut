import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLink } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectKey: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSelectKey }) => {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API Key Required</DialogTitle>
          <DialogDescription>
            To generate videos with Veo, you need to select an API key associated with a project that has billing enabled.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col space-y-2">
          <Button 
            onClick={onSelectKey}
            className="w-full"
          >
            Select API Key
          </Button>
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-center text-sm text-primary hover:underline"
          >
            Learn more about billing <ExternalLink className="inline-block h-3 w-3" />
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
