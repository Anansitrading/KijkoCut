import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// Fix: Correct import path
import { LeftPanel } from './components/LeftPanel';
// Fix: Correct import path
import { CenterPanel } from './components/CenterPanel';
import { ApiKeyModal } from './components/ApiKeyModal';
import type { MediaAsset, ChatMessage, AgentMode, AspectRatio, TTSVoice, AttachedFile, TimelineAsset, GenerationConstraints } from './types';
import * as geminiService from './services/geminiService';
import { Icon } from './components/Icon';
import { Loader2, Mic, Paperclip, Send, Sparkles, X } from 'lucide-react';

const getMediaDuration = (url: string, type: 'video' | 'audio' | 'image'): Promise<number> => {
  if (type === 'image') return Promise.resolve(5); // Default 5s for images
  return new Promise((resolve, reject) => {
    const element = document.createElement(type);
    element.addEventListener('loadedmetadata', () => {
      resolve(element.duration);
      element.remove();
    });
    element.addEventListener('error', (e) => {
      reject(new Error(`Failed to load media metadata for ${url}`));
      element.remove();
    });
    element.src = url;
    element.load();
  });
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
  });

const App: React.FC = () => {
  const [libraryAssets, setLibraryAssets] = useState<MediaAsset[]>([]);
  const [timelineAssets, setTimelineAssets] = useState<TimelineAsset[]>([]);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | TimelineAsset | null>(null);

  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<MediaAsset | null>(null);
  
  // Right Panel State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>('chat');
  const [agentAspectRatio, setAgentAspectRatio] = useState<AspectRatio>('16:9');
  const [agentAttachedFiles, setAgentAttachedFiles] = useState<AttachedFile[]>([]);
  
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [hasSelectedApiKey, setHasSelectedApiKey] = useState(false);
  
  const checkApiKey = useCallback(async () => {
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasSelectedApiKey(selected);
      if (!selected) {
        setIsApiKeyModalOpen(true);
      }
    } else {
        setHasSelectedApiKey(true);
    }
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  const handleSelectLibraryAsset = (asset: MediaAsset) => {
    setPreviewAsset(asset);
    if (selectedAssetForEdit?.id === asset.id) {
      clearEditSelection();
    } else {
      handleAssetSelectForEdit(asset);
    }
  };

  const handleSelectTimelineAsset = (asset: TimelineAsset) => {
    setPreviewAsset(asset);
  };
  
  const handleAssetSelectForEdit = (asset: MediaAsset) => {
      setSelectedAssetForEdit(asset);
      setLibraryAssets(prev => prev.map(a => 
          a.id === asset.id ? {...a, selectedForEdit: true} : {...a, selectedForEdit: false}
      ));
      setPreviewAsset(prev => prev && prev.id === asset.id ? {...prev, selectedForEdit: true} : prev);
  }
  
  const clearEditSelection = () => {
      setSelectedAssetForEdit(null);
      setLibraryAssets(prev => prev.map(a => ({...a, selectedForEdit: false})));
      if (previewAsset) {
        setPreviewAsset({...previewAsset, selectedForEdit: false});
      }
  }
  
  const addAssetToLibrary = async (newAsset: Omit<MediaAsset, 'id' | 'duration'>) => {
    const duration = await getMediaDuration(newAsset.url, newAsset.type);
    const assetWithId: MediaAsset = { ...newAsset, id: crypto.randomUUID(), duration };
    setLibraryAssets(prev => [assetWithId, ...prev]);
    setPreviewAsset(assetWithId);
    clearEditSelection();
  };
  
  const handleDropOnTimeline = async (data: string, dropTime: number) => {
    try {
      const { type, assetId } = JSON.parse(data);
      if (type === 'libraryAsset') {
        const assetToAdd = libraryAssets.find(a => a.id === assetId);
        if (assetToAdd) {
            let duration = assetToAdd.duration;
            if (duration === undefined) {
                duration = await getMediaDuration(assetToAdd.url, assetToAdd.type);
                setLibraryAssets(prev => prev.map(a => a.id === assetId ? {...a, duration} : a));
            }
            if (duration === undefined) throw new Error("Could not determine asset duration.");

            const newTimelineAsset: TimelineAsset = { 
                ...assetToAdd, 
                timelineId: crypto.randomUUID(),
                startTime: dropTime,
                duration,
                trimStart: 0,
                trimEnd: 0,
            };

            setTimelineAssets(prev => {
                const newAssets = [...prev, newTimelineAsset];
                newAssets.sort((a, b) => a.startTime - b.startTime);
                return newAssets;
            });
        }
      }
    } catch (e) {
      console.error("Failed to handle drop:", e);
    }
  };

  const handleUpdateTimelineAsset = (timelineId: string, updates: Partial<TimelineAsset>) => {
    setTimelineAssets(prev => prev.map(asset => 
      asset.timelineId === timelineId ? { ...asset, ...updates } : asset
    ).sort((a,b) => a.startTime - b.startTime));
  };
  
  const handleRemoveFromTimeline = (timelineId: string) => {
    setTimelineAssets(prev => prev.filter(a => a.timelineId !== timelineId));
  };
  
   const handleAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentPrompt.trim() || !generationConstraints.isValid) return;

    if (detectedAgentMode.includes('video')) {
      await checkApiKey();
      if (!hasSelectedApiKey) {
        setIsApiKeyModalOpen(true);
        return;
      }
    }

    setChatHistory(prev => [...prev, { role: 'user', content: agentPrompt }]);
    setIsLoading(true);

    try {
      let aiResponse: ChatMessage = { role: 'assistant', content: '' };
      let newAsset: Omit<MediaAsset, 'id' | 'duration'> | null = null;
      const baseOptions = { prompt: agentPrompt, aspectRatio: agentAspectRatio || '16:9' };

      const getLoadingMessage = (mode: AgentMode, fileCount: number): string => {
        switch (mode) {
          case 'reference-image-video': return `Generating video with ${fileCount} reference images... (1-3 min)`;
          case 'frame-interpolation': return 'Interpolating video between frames... (1-3 min)';
          case 'video-extension': return 'Extending video by 7 seconds... (1-2 min)';
          case 'multi-image-composition': return `Composing image from ${fileCount} references... (10-30s)`;
          case 'video':
          case 'video-from-image': return 'Generating video... This can take a few minutes.';
          case 'image': return 'Generating image...';
          case 'edit-image': return 'Editing image...';
          case 'analyze-image': return 'Analyzing image...';
          default: return 'Thinking...';
        }
      };
      setLoadingMessage(getLoadingMessage(detectedAgentMode, agentAttachedFiles.length));

      switch (detectedAgentMode) {
        case 'chat':
          const text = await geminiService.generateText(agentPrompt, false, false);
          aiResponse.content = text;
          break;
        case 'image':
          const { base64, url } = await geminiService.generateImage(agentPrompt, agentAspectRatio || '1:1');
          newAsset = { type: 'image', url, base64, mimeType: 'image/png', prompt: agentPrompt };
          aiResponse.content = `Generated image for: "${agentPrompt}"`;
          aiResponse.mediaUrl = url;
          break;
        // ... other cases from Kijko's handleAgentSubmit
         case 'video':
            const videoUrl = await geminiService.generateVideo({ prompt: agentPrompt, aspectRatio: agentAspectRatio });
            newAsset = { type: 'video', url: videoUrl, prompt: agentPrompt };
            aiResponse.content = `Generated video for: "${agentPrompt}"`;
            aiResponse.mediaUrl = videoUrl;
            break;
      }
      
      if (newAsset) await addAssetToLibrary(newAsset);
      setChatHistory(prev => [...prev, aiResponse]);

    } catch (error) {
      console.error(error);
      const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
      if (errorMessage.includes("API_KEY_INVALID")) {
         setHasSelectedApiKey(false);
         setIsApiKeyModalOpen(true);
         setChatHistory(prev => [...prev, { role: 'assistant', content: "API Key error. Please re-select your API key and try again." }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }]);
      }
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
      setAgentPrompt('');
      setAgentAttachedFiles([]);
    }
  };
  
  const handleTtsGenerate = async (text: string, voice: TTSVoice) => {
    setIsLoading(true);
    setLoadingMessage('Generating voiceover...');
    try {
      const audioUrl = await geminiService.generateSpeech(text, voice);
      await addAssetToLibrary({ type: 'audio', url: audioUrl, prompt: text });
    } catch (error) {
       console.error(error);
       const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
       setChatHistory(prev => [...prev, { role: 'assistant', content: `TTS Error: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleExport = useCallback(async () => {
    alert("Export functionality requires a server-side rendering component or a client-side library like ffmpeg.wasm to compose the timeline assets into a single video file. This is a placeholder.");
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        handleExport();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExport]);
  
  // Logic from GenerateView
    const detectedAgentMode = useMemo((): AgentMode => {
        const hasAttachments = agentAttachedFiles.length > 0;
        const hasActiveAsset = !!selectedAssetForEdit;
        
        if (agentMode !== 'chat') return agentMode; // Manual override

        if (hasActiveAsset && selectedAssetForEdit?.type === 'video') return 'video-extension';
        if (hasActiveAsset && hasAttachments) return 'frame-interpolation';
        if (hasActiveAsset) return 'edit-image';
        if (hasAttachments && agentAttachedFiles.length >= 2) return 'reference-image-video';
        if (hasAttachments && agentAttachedFiles.length === 1) return 'video-from-image';

        return 'chat';
    }, [agentAttachedFiles.length, selectedAssetForEdit, agentMode]);

    const generationConstraints = useMemo(() => {
        return geminiService.validateGenerationConstraints(detectedAgentMode, agentAttachedFiles.length, !!selectedAssetForEdit);
    }, [detectedAgentMode, agentAttachedFiles.length, selectedAssetForEdit]);

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
        setAgentAttachedFiles(prev => [...prev, ...newFiles]);
    };

    const handleFileRemoved = (fileId: string) => {
        setAgentAttachedFiles(prev => {
            const removed = prev.find(f => f.id === fileId);
            if (removed) URL.revokeObjectURL(removed.url);
            return prev.filter(f => f.id !== fileId);
        });
    };


  return (
    <div className="h-screen w-screen flex flex-col bg-gray-800 text-gray-200 font-sans">
       <div className="flex items-center justify-between bg-gray-900 p-2 border-b border-gray-700 shadow-md h-14">
            <div className="flex items-center space-x-4">
                <button className="p-2 rounded-md hover:bg-gray-700"><Icon name="menu" /></button>
            </div>
            <h1 className="text-lg font-semibold text-gray-300">Kijko Video Editor</h1>
            <div className="flex items-center space-x-2">
                <button 
                onClick={handleExport}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center space-x-2">
                <span>Export</span>
                <kbd className="text-xs bg-indigo-800 rounded px-1 py-0.5">⌘E</kbd>
                </button>
            </div>
        </div>
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel 
          onSelectAsset={handleSelectLibraryAsset} 
          assets={libraryAssets} 
          onAddAsset={addAssetToLibrary} 
          onTtsGenerate={handleTtsGenerate}
        />
        <CenterPanel 
          previewAsset={previewAsset}
          timelineAssets={timelineAssets}
          onSelectTimelineAsset={handleSelectTimelineAsset}
          onDropOnTimeline={handleDropOnTimeline}
          onRemoveFromTimeline={handleRemoveFromTimeline}
          onUpdateTimelineAsset={handleUpdateTimelineAsset}
          onAssetSelectForEdit={handleAssetSelectForEdit}
        />
        <div className="w-96 bg-gray-800 flex flex-col border-l border-gray-700">
             <div className="p-4 border-b border-gray-700">
                <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-400" /> Generation Agent</h3>
                <div className="mt-4">
                    <select value={agentMode} onChange={e => setAgentMode(e.target.value as AgentMode)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm mt-1 focus:outline-none focus:ring-indigo-500">
                        <option value="chat">Auto-Detect</option>
                        <option value="image">Image Gen</option>
                        <option value="video">Video Gen</option>
                        {/* Add other options */}
                    </select>
                </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {chatHistory.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-3 rounded-lg max-w-sm ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        {msg.mediaUrl && (
                        <img src={msg.mediaUrl} alt="generated media" className="mt-2 rounded-md max-h-48" />
                        )}
                    </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="p-3 rounded-lg bg-gray-700 flex items-center space-x-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-gray-300">{loadingMessage}</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-4 border-t border-gray-700">
                <form onSubmit={handleAgentSubmit} className="space-y-2">
                    <FileAttachment attachedFiles={agentAttachedFiles} onFilesAdded={handleFilesAdded} onFileRemoved={handleFileRemoved} constraints={generationConstraints} />
                    <div className="flex items-center gap-2 bg-gray-700 rounded-lg p-1">
                        <input 
                            type="text" 
                            value={agentPrompt}
                            onChange={(e) => setAgentPrompt(e.target.value)}
                            placeholder="Type your prompt..."
                            className="flex-1 bg-transparent px-3 py-2 focus:outline-none text-sm"
                            disabled={isLoading}
                        />
                        <button type="button" className="p-2 rounded-md hover:bg-gray-600" disabled={isLoading}><Mic className="h-4 w-4" /></button>
                        <button type="submit" className="p-2 bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-800 disabled:cursor-not-allowed" disabled={isLoading || !agentPrompt.trim() || !generationConstraints.isValid}>
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
      </div>
      <ApiKeyModal 
        isOpen={isApiKeyModalOpen} 
        onClose={() => setIsApiKeyModalOpen(false)}
        onSelectKey={async () => {
          if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
            await window.aistudio.openSelectKey();
          }
          setIsApiKeyModalOpen(false);
          setHasSelectedApiKey(true);
        }}
      />
    </div>
  );
};


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
      <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex items-center gap-2">
        <Paperclip className="h-4 w-4" />
        Attach Files ({constraints.currentCount}/{constraints.maxImages})
      </button>
       <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        onChange={(e) => handleFileChange(e.target.files)} 
        accept="image/*"
        className="hidden" 
      />
       {constraints.validationMessage && <p className="text-xs text-red-400 mt-1">{constraints.validationMessage}</p>}
    </div>
  )
};

export default App;