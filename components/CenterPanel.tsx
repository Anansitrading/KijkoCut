import React from 'react';
import type { MediaAsset, TimelineAsset } from '../types';
import { Edit } from 'lucide-react';

interface CenterPanelProps {
  previewAsset: MediaAsset | TimelineAsset | null;
  timelineAssets: TimelineAsset[];
  onSelectTimelineAsset: (asset: TimelineAsset) => void;
  onDropOnTimeline: (data: string, dropTime: number) => void;
  onRemoveFromTimeline: (timelineId: string) => void;
  onUpdateTimelineAsset: (timelineId: string, updates: Partial<TimelineAsset>) => void;
  onAssetSelectForEdit: (asset: MediaAsset) => void;
}

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};


export const CenterPanel: React.FC<CenterPanelProps> = ({
  previewAsset,
  timelineAssets,
  onSelectTimelineAsset,
  onDropOnTimeline,
  onRemoveFromTimeline,
  onUpdateTimelineAsset,
  onAssetSelectForEdit,
}) => {
    
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    // A simple way to estimate drop time. A real implementation would be more complex.
    // For this mock, let's assume dropping at the end of the timeline
    const lastAsset = timelineAssets.sort((a,b) => (a.startTime + (a.duration || 0)) - (b.startTime + (b.duration || 0))).pop();
    const dropTime = lastAsset ? lastAsset.startTime + (lastAsset.duration || 0) : 0; 
    onDropOnTimeline(data, dropTime);
  };
    
  const renderPreview = () => {
    if (!previewAsset) {
      return (
        <div className="w-full h-full bg-black flex items-center justify-center">
          <p className="text-gray-400">Select an asset to preview</p>
        </div>
      );
    }
    
    const isTimelineAsset = 'timelineId' in previewAsset;
    
    return (
        <div className="relative w-full h-full bg-black flex items-center justify-center">
            {previewAsset.type === 'image' && <img src={previewAsset.url} alt="preview" className="max-w-full max-h-full object-contain" />}
            {previewAsset.type === 'video' && <video src={previewAsset.url} className="max-w-full max-h-full" controls autoPlay key={previewAsset.url} />}
            {previewAsset.type === 'audio' && (
                <div className="text-center text-white">
                    <p>Audio Preview</p>
                    <p className="text-sm text-gray-400">{previewAsset.prompt}</p>
                    <audio src={previewAsset.url} controls autoPlay key={previewAsset.url} className="mt-4" />
                </div>
            )}
            
            <div className="absolute top-2 right-2 flex gap-2">
            {!isTimelineAsset && (previewAsset.type === 'image' || previewAsset.type === 'video') && (
                 <button 
                    onClick={() => onAssetSelectForEdit(previewAsset)} 
                    className={`p-2 rounded-md ${previewAsset.selectedForEdit ? 'bg-indigo-600 text-white' : 'bg-gray-700 bg-opacity-80 hover:bg-gray-600'}`}>
                    <Edit className="h-4 w-4"/>
                </button>
            )}
            </div>
            
            <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-50 p-2 rounded-md text-white">
                <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold">{previewAsset.prompt || 'Untitled'}</p>
                    <p className="text-xs">{formatTime(previewAsset.duration || 0)}</p>
                </div>
            </div>
        </div>
    );
  };
  
  const renderTimeline = () => {
    const PIXELS_PER_SECOND = 20;
    const totalDuration = timelineAssets.reduce((max, asset) => Math.max(max, asset.startTime + (asset.duration || 0)), 60);

    return (
    <div className="h-48 bg-gray-900 border-t border-gray-700 p-2 overflow-auto" onDragOver={handleDragOver} onDrop={handleDrop}>
        <div className="relative h-full" style={{ width: `${totalDuration * PIXELS_PER_SECOND}px`}}>
         {timelineAssets.map((asset) => (
            <div 
                key={asset.timelineId}
                className="absolute h-12 bg-indigo-800 rounded-md top-8 border border-indigo-500 p-2 text-white text-xs flex items-center cursor-pointer hover:border-indigo-300"
                style={{ left: `${asset.startTime * PIXELS_PER_SECOND}px`, width: `${(asset.duration || 5) * PIXELS_PER_SECOND}px` }}
                onClick={() => onSelectTimelineAsset(asset)}
            >
                <p className="truncate">{asset.prompt}</p>
            </div>
         ))}
        </div>
    </div>
  );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-850">
      <div className="flex-1 p-4 flex items-center justify-center">
        {renderPreview()}
      </div>
      {renderTimeline()}
    </div>
  );
};
