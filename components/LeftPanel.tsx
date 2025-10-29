
import React, { useState, useRef, useEffect } from 'react';
import type { MediaAsset, TTSVoice } from '../types';
import { Icon } from './Icon';

interface LeftPanelProps {
  onSelectAsset: (asset: MediaAsset) => void;
  assets: MediaAsset[];
  onAddAsset: (asset: Omit<MediaAsset, 'id'|'duration'>) => Promise<void>;
  onTtsGenerate: (text: string, voice: TTSVoice) => void;
}

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


export const LeftPanel: React.FC<LeftPanelProps> = ({ onSelectAsset, assets, onAddAsset, onTtsGenerate }) => {
  const [activeTab, setActiveTab] = useState('script');
  const [ttsText, setTtsText] = useState('');
  const [ttsVoice, setTtsVoice] = useState<TTSVoice>('Zephyr');
  const [ttsSpeed, setTtsSpeed] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const base64Reader = new FileReader();
      base64Reader.readAsDataURL(file);
      base64Reader.onload = async () => {
        const base64 = (base64Reader.result as string).split(',')[1];
        const url = URL.createObjectURL(file);
        const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'audio';
        if (type === 'image' || type === 'video' || type === 'audio') {
          await onAddAsset({ type, url, base64, mimeType: file.type, prompt: file.name });
        }
      };
    }
  };

  const handleDragStart = (e: React.DragEvent, asset: MediaAsset) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'libraryAsset', assetId: asset.id }));
    e.dataTransfer.effectAllowed = 'copyMove';
  };
  
  const renderAssetThumbnail = (asset: MediaAsset) => {
    const isSelected = asset.selectedForEdit;
    return (
      <div 
        key={asset.id} 
        draggable 
        onDragStart={(e) => handleDragStart(e, asset)}
        className={`relative aspect-video bg-gray-700 rounded-md overflow-hidden cursor-pointer group ${isSelected ? 'ring-4 ring-indigo-500' : ''}`} 
        onClick={() => onSelectAsset(asset)}
      >
        {asset.type === 'image' && <img src={asset.url} alt="media asset" className="w-full h-full object-cover" />}
        {asset.type === 'video' && <video src={asset.url} className="w-full h-full object-cover" />}
        {asset.type === 'audio' && <div className="w-full h-full flex items-center justify-center"><Icon name="audio" className="w-10 h-10 text-gray-400"/></div>}
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
           <p className="text-white text-xs text-center p-1">{asset.prompt || 'Imported Media'}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 bg-gray-800 flex flex-col border-r border-gray-700">
      <div className="p-4 flex-shrink-0">
         <div className="flex items-center justify-around bg-gray-900 p-1 rounded-lg mb-4">
            <button className={`px-3 py-1 text-sm rounded-md ${activeTab === 'script' ? 'bg-gray-700' : ''}`} onClick={() => setActiveTab('script')}><Icon name="text" /></button>
            <button className={`px-3 py-1 text-sm rounded-md ${activeTab === 'circle' ? 'bg-gray-700' : ''}`} onClick={() => setActiveTab('circle')}><Icon name="circle" /></button>
            <button className={`px-3 py-1 text-sm rounded-md ${activeTab === 'square' ? 'bg-gray-700' : ''}`} onClick={() => setActiveTab('square')}><Icon name="square" /></button>
            <button className={`px-3 py-1 text-sm rounded-md ${activeTab === 'audio' ? 'bg-gray-700' : ''}`} onClick={() => setActiveTab('audio')}><Icon name="audio" /></button>
            <button className={`px-3 py-1 text-sm rounded-md ${activeTab === 'contrast' ? 'bg-gray-700' : ''}`} onClick={() => setActiveTab('contrast')}><Icon name="contrast" /></button>
         </div>
         <textarea
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            placeholder="Start typing here..."
            className="w-full h-24 bg-gray-700 border border-gray-600 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
         ></textarea>
         <button onClick={() => onTtsGenerate(ttsText, ttsVoice)} disabled={!ttsText.trim()} className="mt-2 w-full flex justify-center items-center p-2 bg-gray-600 hover:bg-gray-500 rounded-md disabled:bg-gray-700 disabled:cursor-not-allowed">
            <Icon name="redo" className="transform -scale-x-100" />
         </button>
         <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Settings</h3>
            <div className="space-y-3">
               <div>
                  <label className="text-xs text-gray-400">Voice</label>
                  <select value={ttsVoice} onChange={e => setTtsVoice(e.target.value as TTSVoice)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm mt-1 focus:outline-none focus:ring-indigo-500">
                     <option>Kore</option>
                     <option>Puck</option>
                     <option>Charon</option>
                     <option>Fenrir</option>
                     <option>Zephyr</option>
                  </select>
               </div>
               <div>
                  <label className="text-xs text-gray-400">Speed</label>
                  <div className="flex items-center space-x-2 mt-1">
                     <input type="range" min="50" max="150" value={ttsSpeed} onChange={e => setTtsSpeed(parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
                     <span className="text-sm w-10 text-right">{ttsSpeed}%</span>
                  </div>
               </div>
            </div>
         </div>
      </div>
      <div className="flex-1 border-t border-gray-700 p-4 overflow-y-auto">
         {assets.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">
               <Icon name="file" className="mx-auto w-12 h-12" />
               <p className="mt-2 text-sm">Add your image, video, music, and voiceover collection to compose your project.</p>
               <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept="image/*,video/*,audio/*" />
               <button onClick={() => fileInputRef.current?.click()} className="mt-4 bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm rounded-md flex items-center mx-auto">
                  <Icon name="upload" className="mr-2"/>
                  Import
               </button>
            </div>
         ) : (
             <div className="grid grid-cols-2 gap-2">
               {assets.map(renderAssetThumbnail)}
            </div>
         )}
      </div>
    </div>
  );
};
