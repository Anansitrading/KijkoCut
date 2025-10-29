"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore } from "@/stores/media-store";
import { toast } from "sonner";
import * as geminiService from '@/lib/geminiService';
import { AgentMode, AspectRatio, AttachedFile, ChatMessage, GenerationConstraints } from '@/types/gemini';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mic, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { MediaFile } from '@/types/media';


const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
  });

export function GenerateView() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<AgentMode>('chat');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<MediaFile | null>(null);

  const { activeProject } = useProjectStore();
  const { addGeneratedMedia } = useMediaStore();

  const detectedAgentMode = useMemo((): AgentMode => {
    const hasAttachments = attachedFiles.length > 0;
    const hasActiveAsset = !!selectedAssetForEdit;
    
    if (mode !== 'chat') return mode; // Manual override

    if (hasActiveAsset && selectedAssetForEdit?.type === 'video') return 'video-extension';
    if (hasActiveAsset && hasAttachments) return 'frame-interpolation';
    if (hasActiveAsset) return 'edit-image';
    if (hasAttachments && attachedFiles.length >= 2) return 'reference-image-video';
    if (hasAttachments && attachedFiles.length === 1) return 'video-from-image';

    return 'chat';
  }, [attachedFiles.length, selectedAssetForEdit, mode]);

  const generationConstraints = useMemo(() => {
    return geminiService.validateGenerationConstraints(detectedAgentMode, attachedFiles.length, !!selectedAssetForEdit);
  }, [detectedAgentMode, attachedFiles.length, selectedAssetForEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !prompt.trim() || !generationConstraints.isValid) return;

    setIsLoading(true);
    setChatHistory(prev => [...prev, { role: 'user', content: prompt }]);

    try {
        const getLoadingMessage = (mode: AgentMode, fileCount: number): string => {
            // ... loading messages from Kijko
            return "Generating...";
        };
        setLoadingMessage(getLoadingMessage(detectedAgentMode, attachedFiles.length));

        let aiResponse: ChatMessage = { role: 'assistant', content: '' };
        
        switch (detectedAgentMode) {
            case 'image':
                const { base64, url } = await geminiService.generateImage(prompt, aspectRatio);
                const imageBlob = await geminiService.dataUrlToBlob(url);
                await addGeneratedMedia(activeProject.id, {
                    name: prompt.slice(0, 20),
                    blob: imageBlob,
                    type: 'image',
                    prompt: prompt,
                });
                aiResponse.content = `Generated image for: "${prompt}"`;
                aiResponse.mediaUrl = url;
                break;
            case 'video':
                 const videoUrl = await geminiService.generateVideo({ prompt, aspectRatio });
                 const videoBlob = await geminiService.dataUrlToBlob(videoUrl);
                 await addGeneratedMedia(activeProject.id, {
                     name: prompt.slice(0, 20),
                     blob: videoBlob,
                     type: 'video',
                     prompt: prompt,
                 });
                 aiResponse.content = `Generated video for: "${prompt}"`;
                 aiResponse.mediaUrl = videoUrl;
                 break;
            // Add other cases here...
            default:
                const text = await geminiService.generateText(prompt, false, false);
                aiResponse.content = text;
        }

        setChatHistory(prev => [...prev, aiResponse]);
    } catch (error) {
        console.error("AI Generation Error:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        toast.error("Generation Failed", { description: errorMessage });
        setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }]);
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
        setPrompt('');
        setAttachedFiles([]);
    }
  };

  const handleFilesAdded = async (files: File[]) => {
    const newFiles: AttachedFile[] = await Promise.all(
        files.map(async (file) => {
            const base64 = await fileToBase64(file);
            return {
                id: crypto.randomUUID(),
                file,
                base64,
                mimeType: file.type,
                url: URL.createObjectURL(file),
                type: 'image'
            };
        })
    );
    setAttachedFiles(prev => [...prev, ...newFiles]);
  };

   const handleFileRemoved = (fileId: string) => {
      setAttachedFiles(prev => {
          const removed = prev.find(f => f.id === fileId);
          if (removed) URL.revokeObjectURL(removed.url);
          return prev.filter(f => f.id !== fileId);
      });
  };

  return (
    <div className="h-full flex flex-col bg-panel">
        <div className="p-4 border-b">
            <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Generation Agent</h3>
             <div className="mt-4">
                <Select value={mode} onValueChange={v => setMode(v as AgentMode)}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="chat">Auto-Detect</SelectItem>
                        <SelectItem value="image">Image Gen</SelectItem>
                        <SelectItem value="video">Video Gen</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-3 rounded-lg max-w-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.mediaUrl && (
                  <img src={msg.mediaUrl} alt="generated media" className="mt-2 rounded-md max-h-48" />
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
                <div className="p-3 rounded-lg bg-card flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">{loadingMessage || "Thinking..."}</span>
                </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="space-y-2">
           <FileAttachment attachedFiles={attachedFiles} onFilesAdded={handleFilesAdded} onFileRemoved={handleFileRemoved} constraints={generationConstraints} />
           <div className="flex items-center gap-2 bg-background rounded-md border p-1">
             <Input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Type your prompt..."
                className="flex-1 bg-transparent border-0 ring-0 focus-visible:ring-0"
                disabled={isLoading}
             />
             <Button type="button" variant="text" size="icon" disabled={isLoading}><Mic className="h-4 w-4" /></Button>
             <Button type="submit" size="icon" disabled={isLoading || !prompt.trim() || !generationConstraints.isValid}>
                <Send className="h-4 w-4" />
             </Button>
           </div>
        </form>
      </div>
    </div>
  );
}

const FileAttachment: React.FC<{
    attachedFiles: AttachedFile[],
    onFilesAdded: (files: File[]) => void,
    onFileRemoved: (fileId: string) => void,
    constraints: GenerationConstraints
}> = ({ attachedFiles, onFilesAdded, onFileRemoved, constraints }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (files: FileList | null) => {
    if (files) onFilesAdded(Array.from(files));
  };

  return (
    <div>
      {attachedFiles.length > 0 && (
         <div className="flex space-x-2 overflow-x-auto pb-2">
           {attachedFiles.map(file => (
             <div key={file.id} className="relative flex-shrink-0 w-16 h-16 group">
               <img src={file.url} alt={file.file.name} className="w-full h-full object-cover rounded-md" />
               <button 
                 type="button"
                 onClick={() => onFileRemoved(file.id)}
                 className="absolute top-0 right-0 m-1 bg-black bg-opacity-50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
               >
                 <X className="w-3 h-3"/>
               </button>
             </div>
           ))}
         </div>
      )}
      <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        onChange={(e) => handleFileChange(e.target.files)} 
        accept="image/*"
        className="hidden" 
      />
      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
        <Paperclip className="h-4 w-4 mr-2" />
        Attach Files ({constraints.currentCount}/{constraints.maxImages})
      </Button>
       {constraints.validationMessage && <p className="text-xs text-destructive mt-1">{constraints.validationMessage}</p>}
    </div>
  )
};
