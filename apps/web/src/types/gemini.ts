// types/gemini.ts

export interface AttachedFile {
  id: string; // UUID for tracking
  file: File; // Original file object
  base64: string; // Base64 encoded data
  mimeType: string;
  url: string; // Object URL for preview
  type: 'image'; // Only images supported
}

export type GenerationType =
  | 'chat'
  | 'text-to-image'
  | 'text-to-video'
  | 'image-edit'
  | 'multi-image-composition'
  | 'image-to-video'
  | 'reference-image-video'
  | 'frame-interpolation'
  | 'video-extension'
  | 'image-analysis';


export interface GenerationConstraints {
  maxImages: number;
  currentCount: number;
  generationType: GenerationType;
  validationMessage?: string;
  isValid: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  mediaUrl?: string;
}

export type AgentMode =
  | 'chat'
  | 'image'
  | 'video'
  | 'video-from-image'
  | 'edit-image'
  | 'analyze-image'
  | 'multi-image-composition'
  | 'reference-image-video'
  | 'frame-interpolation'
  | 'video-extension';


export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type TTSVoice = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
