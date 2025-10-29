import React, { useRef, useState, useEffect, useMemo } from 'react';
import type { MediaAsset, TimelineAsset } from '../types';
import { Icon } from './Icon';

const PIXELS_PER_SECOND = 50;

interface CenterPanelProps {
  previewAsset: MediaAsset | TimelineAsset | null;
  timelineAssets: TimelineAsset[];
  onSelectTimelineAsset: (asset: TimelineAsset) => void;
  onDropOnTimeline: (data: string, dropTime: number) => void;
  onRemoveFromTimeline: (timelineId: string) => void;
  onUpdateTimelineAsset: (timelineId: string, updates: Partial<TimelineAsset>) => void;
  onAssetSelectForEdit: (asset: MediaAsset) => void;
}

interface TimelineClipItemProps {
    asset: TimelineAsset;
    zoom: number;
    onUpdate: (id: string, updates: Partial<TimelineAsset>) => void;
    onRemove: (id: string) => void;
}

const formatTime = (time: number, totalDuration: number) => {
    if (totalDuration < 60) {
        return time.toFixed(1) + 's';
    }
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const CenterPanel: React.FC<CenterPanelProps> = ({ 
    previewAsset, 
    timelineAssets,
    onSelectTimelineAsset,
    onDropOnTimeline,
    onRemoveFromTimeline,
    onUpdateTimelineAsset,
    onAssetSelectForEdit 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineWrapperRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  
  const totalDuration = useMemo(() => {
    return Math.max(15, timelineAssets.reduce((max, asset) => {
        const effectiveDuration = (asset.duration || 0) - asset.trimStart - asset.trimEnd;
        return Math.max(max, asset.startTime + effectiveDuration);
    }, 0));
  }, [timelineAssets]);

  const activeAsset = useMemo(() => {
    // If a timeline asset is clicked for preview, show it
    if (previewAsset && 'timelineId' in previewAsset) return previewAsset;

    // Find the asset currently playing on the timeline
    const playingAsset = timelineAssets.find(asset => {
        const effectiveDuration = (asset.duration || 0) - asset.trimStart - asset.trimEnd;
        return currentTime >= asset.startTime && currentTime < asset.startTime + effectiveDuration;
    });

    // Fallback to the library preview asset if nothing is playing
    return playingAsset || previewAsset;
  }, [currentTime, timelineAssets, previewAsset]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!activeAsset) {
      video?.pause();
      audio?.pause();
      return;
    };

    const element = activeAsset.type === 'video' ? video : activeAsset.type === 'audio' ? audio : null;
    if (!element) return;
    
    // Set the source if it has changed
    if (activeAsset.url !== element.src) {
        element.src = activeAsset.url;
    }

    if (isPlaying) {
        // FIX: Use 'timelineId' in activeAsset as a type guard. This correctly narrows
        // `activeAsset` to `TimelineAsset`, because `timelineId` is a property unique
        // to `TimelineAsset`, ensuring correct type inference.
        if('timelineId' in activeAsset) {
          // Fix: Explicitly cast activeAsset to TimelineAsset as the type guard is insufficient.
          const timelineAsset = activeAsset as TimelineAsset;
          const effectiveTime = currentTime - timelineAsset.startTime + timelineAsset.trimStart;
          if (Math.abs(element.currentTime - effectiveTime) > 0.2) {
              element.currentTime = effectiveTime;
          }
        }
        element.play().catch(e => console.error("Playback error:", e));
    } else {
        element.pause();
    }
  }, [activeAsset, isPlaying, currentTime]);
  
  useEffect(() => {
    let animationFrameId: number;
    if (isPlaying) {
      const tick = () => {
        setCurrentTime(prev => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1/60;
        });
        animationFrameId = requestAnimationFrame(tick);
      };
      animationFrameId = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, totalDuration]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  
  const handleAssetClick = () => {
    if(previewAsset && !('timelineId' in previewAsset)) onAssetSelectForEdit(previewAsset);
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-gray-700');
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-gray-700');
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-gray-700');
    if (timelineContainerRef.current) {
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const scrollLeft = timelineContainerRef.current.scrollLeft;
        const dropTime = (x + scrollLeft) / (PIXELS_PER_SECOND * zoom);
        onDropOnTimeline(e.dataTransfer.getData('application/json'), dropTime);
    }
  };

  const handlePlayheadDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const timelineRect = timelineContainerRef.current!.getBoundingClientRect();
    
    const onMouseMove = (moveEvent: MouseEvent) => {
        const x = moveEvent.clientX - timelineRect.left;
        const scrollLeft = timelineContainerRef.current!.scrollLeft;
        const newTime = Math.max(0, (x + scrollLeft) / (PIXELS_PER_SECOND * zoom));
        setCurrentTime(Math.min(newTime, totalDuration));
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };
  
  const renderRuler = () => {
    const ticks = [];
    const interval = zoom > 0.5 ? 1 : zoom > 0.2 ? 5 : 10;
    for (let i = 0; i <= totalDuration; i += interval) {
        const minorTicks = [];
        if (zoom > 0.8) {
             for (let j = 1; j < 5; j++) {
                const time = i + (j * interval/5);
                if (time < totalDuration) {
                    minorTicks.push(<div key={`minor-${time}`} className="absolute h-2 border-l border-gray-600" style={{ left: `${time * PIXELS_PER_SECOND * zoom}px` }}></div>);
                }
            }
        }
        ticks.push(
            <div key={i} style={{ left: `${i * PIXELS_PER_SECOND * zoom}px` }} className="absolute h-4 border-l border-gray-500">
                <span className="absolute top-3 -left-2 text-xs text-gray-500">{formatTime(i, totalDuration)}</span>
                {minorTicks}
            </div>
        );
    }
    return ticks;
  };

  return (
    <div className="flex-1 flex flex-col bg-black">
      <div 
        className={`flex-1 flex items-center justify-center p-4 cursor-pointer transition-all ${previewAsset?.selectedForEdit ? 'ring-4 ring-indigo-500 ring-inset' : 'ring-0 ring-transparent'}`}
        onClick={handleAssetClick}
        title={previewAsset ? "Click to select for editing or as context" : "Preview Area"}
      >
        {!activeAsset && <div className="text-gray-600">Select an asset or drop one on the timeline</div>}
        {activeAsset?.type === 'image' && <img src={activeAsset.url} alt="Active Asset" className="max-h-full max-w-full object-contain" />}
        {activeAsset?.type === 'video' && <video ref={videoRef} muted src={activeAsset.url} className="max-h-full max-w-full object-contain" />}
        {activeAsset?.type === 'audio' && (
           <div className="flex flex-col items-center gap-4">
            <Icon name="audio" className="w-24 h-24 text-gray-500" />
            <p className="text-gray-400 max-w-md text-center">{activeAsset.prompt}</p>
            <audio ref={audioRef} src={activeAsset.url} controls className="w-64" />
           </div>
        )}
      </div>
      <div className="bg-gray-800 border-t border-gray-700 p-2 flex-shrink-0">
        <div className="flex items-center space-x-4 mb-2">
            <div className="flex items-center space-x-2">
                <button onClick={() => setCurrentTime(0)} className="p-2 rounded-md hover:bg-gray-700"><Icon name="prev" /></button>
                <button onClick={togglePlay} className="p-2 rounded-md hover:bg-gray-700">
                  {isPlaying ? <Icon name="pause" /> : <Icon name="play" />}
                </button>
                <button className="p-2 rounded-md hover:bg-gray-700"><Icon name="next" /></button>
            </div>
             <span className="text-xs w-24">{formatTime(currentTime, totalDuration)} / {formatTime(totalDuration, totalDuration)}</span>
            <div className="flex-1" />
            <div className="flex items-center space-x-2">
                <button onClick={() => setZoom(z => Math.max(0.1, z-0.1))} className="p-1 rounded-md hover:bg-gray-700"><Icon name="minus" className="h-4 w-4"/></button>
                <input type="range" min="0.1" max="5" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
                <button onClick={() => setZoom(z => Math.min(5, z+0.1))} className="p-1 rounded-md hover:bg-gray-700"><Icon name="plus" className="h-4 w-4"/></button>
            </div>
        </div>
        <div ref={timelineWrapperRef} className="h-32 bg-gray-900 rounded-md overflow-hidden">
            <div ref={timelineContainerRef} className="h-full overflow-x-auto relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                <div style={{width: `${totalDuration * PIXELS_PER_SECOND * zoom}px`, height: '100%'}} className="relative">
                    <div className="h-8 sticky top-0 bg-gray-900 z-20">{renderRuler()}</div>
                    <div 
                        ref={playheadRef}
                        onMouseDown={handlePlayheadDrag}
                        className="absolute top-0 h-full w-0.5 bg-red-500 z-30 cursor-ew-resize" style={{ left: `${currentTime * PIXELS_PER_SECOND * zoom}px` }}>
                        <div className="absolute -top-1 -left-1.5 bg-red-500 w-3 h-3 rounded-full"></div>
                    </div>
                    {timelineAssets.map((asset) => (
                        <TimelineClipItem key={asset.timelineId} asset={asset} zoom={zoom} onUpdate={onUpdateTimelineAsset} onRemove={onRemoveFromTimeline}/>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};


const TimelineClipItem: React.FC<TimelineClipItemProps> = ({ asset, zoom, onUpdate, onRemove }) => {
    const effectiveDuration = (asset.duration || 0) - asset.trimStart - asset.trimEnd;
    const width = effectiveDuration * PIXELS_PER_SECOND * zoom;
    const [resizeState, setResizeState] = useState<{side: 'left' | 'right', startX: number} | null>(null);

    const handleResizeStart = (e: React.MouseEvent, side: 'left' | 'right') => {
        e.stopPropagation();
        setResizeState({ side, startX: e.clientX });
    };

    useEffect(() => {
        if (!resizeState) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - resizeState.startX;
            const deltaTime = deltaX / (PIXELS_PER_SECOND * zoom);

            if (resizeState.side === 'left') {
                const newTrimStart = Math.max(0, asset.trimStart + deltaTime);
                const newStartTime = asset.startTime + deltaTime;
                if(newStartTime >= 0 && (asset.duration || 0) - newTrimStart - asset.trimEnd > 0.1) {
                    onUpdate(asset.timelineId, { trimStart: newTrimStart, startTime: newStartTime });
                }
            } else {
                const newTrimEnd = Math.max(0, asset.trimEnd - deltaTime);
                 if((asset.duration || 0) - asset.trimStart - newTrimEnd > 0.1) {
                    onUpdate(asset.timelineId, { trimEnd: newTrimEnd });
                 }
            }
        };

        const handleMouseUp = () => {
            setResizeState(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp, { once: true });

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

    }, [resizeState, asset, zoom, onUpdate]);

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('application/json', JSON.stringify({type: 'timelineAsset', assetId: asset.id, timelineId: asset.timelineId}));
        e.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div 
            draggable
            onDragStart={handleDragStart}
            className="absolute h-16 top-10 bg-indigo-800 rounded-md flex items-center justify-between group overflow-hidden border-2 border-transparent hover:border-indigo-400"
            style={{ left: `${asset.startTime * PIXELS_PER_SECOND * zoom}px`, width: `${width}px`}}
        >
            <div onMouseDown={(e) => handleResizeStart(e, 'left')} className="w-2 h-full cursor-ew-resize bg-indigo-400 opacity-0 group-hover:opacity-100 absolute left-0"/>
                <div className="flex-1 h-full flex items-center px-2 overflow-hidden">
                    {asset.type === 'image' && <img src={asset.url} className="h-full object-cover" />}
                    {asset.type === 'video' && <div className="text-white text-xs truncate">{asset.prompt || asset.id} (Video)</div>}
                    {asset.type === 'audio' && <div className="text-white text-xs truncate">{asset.prompt || asset.id} (Audio)</div>}
                </div>
            <div onMouseDown={(e) => handleResizeStart(e, 'right')} className="w-2 h-full cursor-ew-resize bg-indigo-400 opacity-0 group-hover:opacity-100 absolute right-0"/>
             <button onClick={() => onRemove(asset.timelineId)} className="absolute top-1 right-1 p-0.5 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100">
                <Icon name="trash" className="w-3 h-3 text-white"/>
            </button>
        </div>
    )
}