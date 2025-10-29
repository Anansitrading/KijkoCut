
import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { RightPanel } from './components/RightPanel';
import { ApiKeyModal } from './components/ApiKeyModal';
import type { MediaAsset, ChatMessage, AgentMode, AspectRatio, TTSVoice, AttachedFile, TimelineAsset } from './types';
import * as geminiService from './services/geminiService';

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


const App: React.FC = () => {
  const [libraryAssets, setLibraryAssets] = useState<MediaAsset[]>([]);
  const [timelineAssets, setTimelineAssets] = useState<TimelineAsset[]>([]);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | TimelineAsset | null>(null);

  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<MediaAsset | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
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
    }
  };

  const handleSelectTimelineAsset = (asset: TimelineAsset) => {
    setPreviewAsset(asset);
  };
  
  const handleAssetSelectForEdit = (asset: MediaAsset) => {
    if (selectedAssetForEdit?.id === asset.id) {
      clearEditSelection();
    } else {
      setSelectedAssetForEdit(asset);
      setLibraryAssets(prev => prev.map(a => 
          a.id === asset.id ? {...a, selectedForEdit: true} : {...a, selectedForEdit: false}
      ));
      setPreviewAsset(prev => prev && prev.id === asset.id ? {...prev, selectedForEdit: true} : prev);
    }
  }
  
  const clearEditSelection = () => {
      setSelectedAssetForEdit(null);
      setLibraryAssets(prev => prev.map(a => ({...a, selectedForEdit: false})));
      setPreviewAsset(prev => prev ? {...prev, selectedForEdit: false} : null);
  }
  
  const addAssetToLibrary = async (newAsset: Omit<MediaAsset, 'id'>) => {
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
  
  const handleAgentSubmit = async (
    prompt: string, 
    mode: AgentMode, 
    options: { 
      aspectRatio?: AspectRatio; 
      thinking?: boolean; 
      search?: boolean;
      attachedFiles: AttachedFile[];
      selectedAsset: MediaAsset | null;
    }) => {

    if (mode.includes('video')) {
      await checkApiKey();
      if (!hasSelectedApiKey) {
        setIsApiKeyModalOpen(true);
        return;
      }
    }

    setChatHistory(prev => [...prev, { role: 'user', content: prompt }]);
    setIsLoading(true);

    try {
      let aiResponse: ChatMessage = { role: 'assistant', content: '' };
      let newAsset: Omit<MediaAsset, 'id'> | null = null;
      const baseOptions = { prompt, aspectRatio: options.aspectRatio || '16:9' };

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
      setLoadingMessage(getLoadingMessage(mode, options.attachedFiles.length));

      switch (mode) {
        case 'chat':
          const text = await geminiService.generateText(prompt, !!options.search, !!options.thinking);
          aiResponse.content = text;
          break;
        case 'image':
          const { base64, url } = await geminiService.generateImage(prompt, options.aspectRatio || '1:1');
          newAsset = { type: 'image', url, base64, mimeType: 'image/png', prompt };
          aiResponse.content = `Generated image for: "${prompt}"`;
          aiResponse.mediaUrl = url;
          break;
        case 'multi-image-composition':
            const composedImage = await geminiService.generateImageFromMultipleReferences(prompt, options.attachedFiles);
            newAsset = { type: 'image', url: composedImage.url, base64: composedImage.base64, mimeType: 'image/png', prompt, parentAssetId: options.selectedAsset?.id };
            aiResponse.content = `Composed image from ${options.attachedFiles.length} references: "${prompt}"`;
            aiResponse.mediaUrl = composedImage.url;
            break;
        case 'edit-image':
        case 'analyze-image':
            const sourceAsset = options.selectedAsset || options.attachedFiles[0];
            if (!sourceAsset) throw new Error("No image provided for operation.");
            
            if(mode === 'edit-image') {
              const editedImage = await geminiService.editImage(prompt, sourceAsset.base64!, sourceAsset.mimeType!);
              newAsset = { type: 'image', url: editedImage.url, base64: editedImage.base64, mimeType: 'image/png', prompt, parentAssetId: options.selectedAsset?.id };
              aiResponse.content = `Edited image with prompt: "${prompt}"`;
              aiResponse.mediaUrl = editedImage.url;
            } else {
              const analysis = await geminiService.analyzeImage(prompt, sourceAsset.base64!, sourceAsset.mimeType!);
              aiResponse.content = analysis;
            }
            break;
        case 'video':
        case 'video-from-image':
        case 'reference-image-video':
        case 'frame-interpolation':
            const videoOpts: any = { ...baseOptions };
            if (mode === 'video-from-image') videoOpts.image = options.attachedFiles[0] || options.selectedAsset;
            if (mode === 'reference-image-video') videoOpts.referenceImages = options.attachedFiles;
            if (mode === 'frame-interpolation') {
                videoOpts.image = options.selectedAsset;
                videoOpts.lastFrame = options.attachedFiles[0];
            }
            const videoUrl = await geminiService.generateVideo(videoOpts);
            newAsset = { type: 'video', url: videoUrl, prompt, parentAssetId: options.selectedAsset?.id };
            aiResponse.content = `Generated video for: "${prompt}"`;
            aiResponse.mediaUrl = videoUrl;
            break;
        case 'video-extension':
            if (!options.selectedAsset || options.selectedAsset.type !== 'video') throw new Error("A video asset must be selected to extend.");
            const extendedVideoUrl = await geminiService.extendVideo(options.selectedAsset.url, prompt, options.aspectRatio || '16:9');
            newAsset = { type: 'video', url: extendedVideoUrl, prompt, parentAssetId: options.selectedAsset.id };
            aiResponse.content = `Extended video with prompt: "${prompt}"`;
            aiResponse.mediaUrl = extendedVideoUrl;
            break;
      }
      
      if (newAsset) addAssetToLibrary(newAsset);
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
    }
  };
  
  const handleTtsGenerate = async (text: string, voice: TTSVoice) => {
    setIsLoading(true);
    setLoadingMessage('Generating voiceover...');
    try {
      const audioUrl = await geminiService.generateSpeech(text, voice);
      addAssetToLibrary({ type: 'audio', url: audioUrl, prompt: text });
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


  return (
    <div className="h-screen w-screen flex flex-col bg-gray-800 text-gray-200 font-sans">
      <Header onExport={handleExport} />
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
        <RightPanel 
          chatHistory={chatHistory} 
          setChatHistory={setChatHistory}
          isLoading={isLoading} 
          loadingMessage={loadingMessage} 
          onAgentSubmit={handleAgentSubmit}
          selectedAssetForEdit={selectedAssetForEdit}
          clearEditSelection={clearEditSelection}
        />
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

export default App;
