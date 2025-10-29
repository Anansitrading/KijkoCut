import React, { useState, useRef } from 'react';
import type { MediaAsset, TTSVoice } from '../types';
import { Icon } from './Icon';
import { Upload } from 'lucide-react';

interface LeftPanelProps {
  assets: MediaAsset[];
  onSelectAsset: (asset: MediaAsset) => void;
  onAddAsset: (newAsset: Omit<MediaAsset, 'id' | 'duration'>) => void;
  onTtsGenerate: (text: string, voice: TTSVoice) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ assets, onSelectAsset, onAddAsset, onTtsGenerate }) => {
  const [ttsText, setTtsText] = useState('');
  const [ttsVoice, setTtsVoice] = useState<TTSVoice>('Kore');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : 'audio';
      if (type !== 'image' && type !== 'video' && type !== 'audio') {
        alert('Unsupported file type');
        return;
      }
      onAddAsset({
        type,
        url,
        prompt: file.name,
      });
    }
  };

  const handleTtsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ttsText.trim()) {
      onTtsGenerate(ttsText, ttsVoice);
      setTtsText('');
    }
  };
  
  const renderAsset = (asset: MediaAsset) => {
    const isVideo = asset.type === 'video';
    const isAudio = asset.type === 'audio';
    
    return (
       <div 
        key={asset.id} 
        draggable
        onDragStart={(e) => {
            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'libraryAsset', assetId: asset.id }));
        }}
        onClick={() => onSelectAsset(asset)}
        className={`relative aspect-square rounded-md overflow-hidden cursor-pointer group ${asset.selectedForEdit ? 'ring-2 ring-indigo-500' : ''}`}
       >
        {isAudio ? (
          <div className="w-full h-full bg-gray-700 flex flex-col items-center justify-center p-2">
            <Icon name="audio" className="w-8 h-8 text-gray-400" />
            <p className="text-xs text-center text-gray-300 mt-2 truncate">{asset.prompt || 'Audio'}</p>
          </div>
        ) : (
          <img src={asset.url} alt={asset.prompt || 'media asset'} className="w-full h-full object-cover" />
        )}
        
        {isVideo && <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">Vid</div>}

        <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <p className="text-white text-xs text-center p-1 truncate">{asset.prompt}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 bg-gray-800 flex flex-col border-r border-gray-700">
      <div className="p-4 border-b border-gray-700">
        <h3 className="font-semibold">Media Library</h3>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="mt-2 w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-sm py-2 rounded-md"
        >
          <Upload className="h-4 w-4" />
          Upload Media
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*,audio/*" />
      </div>
      <div className="flex-1 p-4 overflow-y-auto grid grid-cols-2 gap-4">
        {assets.map(renderAsset)}
      </div>
       <div className="p-4 border-t border-gray-700">
        <h4 className="font-semibold text-sm mb-2">Text-to-Speech</h4>
        <form onSubmit={handleTtsSubmit}>
            <textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="Enter text for voiceover..."
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:outline-none focus:ring-indigo-500"
            />
            <div className="flex items-center mt-2 gap-2">
                <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value as TTSVoice)} className="flex-1 bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:outline-none focus:ring-indigo-500">
                    <option value="Kore">Kore</option>
                    <option value="Puck">Puck</option>
                    <option value="Charon">Charon</option>
                    <option value="Fenrir">Fenrir</option>
                    <option value="Zephyr">Zephyr</option>
                </select>
                <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
                    Generate
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};
