// services/geminiService.ts
import { GoogleGenAI, Modality, Type, VideoGenerationReferenceType } from '@google/genai';
import type { GenerateContentResponse, LiveSession, LiveServerMessage } from '@google/genai';
import type { AspectRatio, TTSVoice, AgentMode, GenerationConstraints, GenerationType } from '../types';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const handleApiError = (error: unknown): Error => {
  const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
  if (errorMessage.includes('SAFETY')) {
    return new Error('Content blocked by safety filters. Please modify your prompt.');
  }
  if (errorMessage.includes('quota')) {
    return new Error('API quota exceeded. Please check your billing or try again later.');
  }
  if (errorMessage.includes("Requested entity was not found")) {
    return new Error("API_KEY_INVALID: Requested entity was not found. Please re-select your API key.");
  }
  return new Error(errorMessage);
};

// --- Constraint Validation ---
export const validateGenerationConstraints = (
  mode: AgentMode,
  attachedFileCount: number,
  hasActiveAsset: boolean
): GenerationConstraints => {
  let constraints: Omit<GenerationConstraints, 'isValid'> = {
    maxImages: 0,
    currentCount: attachedFileCount + (hasActiveAsset ? 1 : 0),
    generationType: 'chat',
    validationMessage: ''
  };

  switch (mode) {
    case 'image':
      constraints.generationType = 'text-to-image';
      constraints.maxImages = 0; // Only prompt
      break;
    case 'multi-image-composition':
      constraints.generationType = 'multi-image-composition';
      constraints.maxImages = 10; // UI limit
      if (attachedFileCount < 2) constraints.validationMessage = "Requires at least 2 images.";
      break;
    case 'edit-image':
      constraints.generationType = 'image-edit';
      constraints.maxImages = 1; // 1 active asset or 1 attachment
      if (attachedFileCount + (hasActiveAsset ? 1 : 0) !== 1) constraints.validationMessage = "Requires exactly 1 image.";
      break;
    case 'analyze-image':
       constraints.generationType = 'image-analysis';
       constraints.maxImages = 1;
       if (attachedFileCount + (hasActiveAsset ? 1 : 0) !== 1) constraints.validationMessage = "Requires exactly 1 image.";
       break;
    case 'video':
      constraints.generationType = 'text-to-video';
      constraints.maxImages = 0;
      break;
    case 'video-from-image':
      constraints.generationType = 'image-to-video';
      constraints.maxImages = 1;
      if (attachedFileCount + (hasActiveAsset ? 1 : 0) !== 1) constraints.validationMessage = "Requires exactly 1 image.";
      break;
    case 'reference-image-video':
      constraints.generationType = 'reference-image-video';
      constraints.maxImages = 3;
      if (attachedFileCount < 1) constraints.validationMessage = "Requires 1-3 images.";
      break;
    case 'frame-interpolation':
      constraints.generationType = 'frame-interpolation';
      constraints.maxImages = 2; // 1 active, 1 attached
      if (attachedFileCount !== 1 || !hasActiveAsset) constraints.validationMessage = "Requires 1 selected asset and 1 attached image.";
      break;
    case 'video-extension':
      constraints.generationType = 'video-extension';
      constraints.maxImages = 1; // Only active asset
      if (!hasActiveAsset || attachedFileCount > 0) constraints.validationMessage = "Requires a selected video asset only.";
      break;
    default:
      constraints.generationType = 'chat';
      constraints.maxImages = 0;
  }
  
  const isValid = constraints.currentCount <= constraints.maxImages && !constraints.validationMessage;
  return { ...constraints, isValid };
};


// --- Text Generation ---
export const generateText = async (prompt: string, useSearchGrounding: boolean, useThinkingMode: boolean): Promise<string> => {
  try {
    const ai = getAiClient();
    const model = useThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    const tools = useSearchGrounding ? [{ googleSearch: {} }] : [];
    const config = useThinkingMode ? { thinkingConfig: { thinkingBudget: 32768 } } : {};

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config,
      tools,
    });
    return response.text;
  } catch (error) {
    throw handleApiError(error);
  }
};

// --- Image Generation (Imagen & Gemini Flash Image) ---
export const generateImage = async (prompt: string, aspectRatio: AspectRatio): Promise<{ base64: string, url: string }> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio,
      },
    });

    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    const url = `data:image/png;base64,${base64ImageBytes}`;
    return { base64: base64ImageBytes, url };
  } catch (error) {
    throw handleApiError(error);
  }
};

export const generateImageFromMultipleReferences = async (prompt: string, referenceImages: { base64: string; mimeType: string }[]): Promise<{ base64: string, url: string }> => {
  try {
    const ai = getAiClient();
    const parts = [
      ...referenceImages.map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })),
      { text: prompt }
    ];
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
      config: { responseModalities: [Modality.IMAGE] },
    });
    
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64 = part.inlineData.data;
        const url = `data:image/png;base64,${base64}`;
        return { base64, url };
      }
    }
    throw new Error("No image was generated by the model.");
  } catch (error) {
    throw handleApiError(error);
  }
}

export const editImage = async (prompt: string, imageBase64: string, mimeType: string): Promise<{ base64: string, url: string }> => {
    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { data: imageBase64, mimeType } },
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64 = part.inlineData.data;
                const url = `data:image/png;base64,${base64}`;
                return { base64, url };
            }
        }
        throw new Error("No image was generated by the model.");
    } catch (error) {
        throw handleApiError(error);
    }
};

export const analyzeImage = async (prompt: string, imageBase64: string, mimeType: string): Promise<string> => {
    try {
        const ai = getAiClient();
        const imagePart = { inlineData: { mimeType, data: imageBase64 } };
        const textPart = { text: prompt };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        return response.text;
    } catch (error) {
        throw handleApiError(error);
    }
};

// --- Video Generation (Veo) ---
interface VideoGenerationOptions {
    prompt: string;
    aspectRatio: AspectRatio;
    image?: { base64: string; mimeType: string };
    referenceImages?: { base64: string; mimeType: string }[];
    lastFrame?: { base64: string; mimeType: string };
}

export const generateVideo = async (options: VideoGenerationOptions): Promise<string> => {
    try {
        const ai = getAiClient();
        const useAdvancedModel = !!options.referenceImages || !!options.lastFrame;
        const model = useAdvancedModel ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
        
        const request: any = {
            model,
            prompt: options.prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: options.aspectRatio,
            }
        };

        if(options.image) {
            request.image = { imageBytes: options.image.base64, mimeType: options.image.mimeType };
        }
        if(options.lastFrame) {
            request.config.lastFrame = { imageBytes: options.lastFrame.base64, mimeType: options.lastFrame.mimeType };
        }
        if(options.referenceImages && options.referenceImages.length > 0) {
            request.config.referenceImages = options.referenceImages.map(img => ({
                image: { imageBytes: img.base64, mimeType: img.mimeType },
                referenceType: VideoGenerationReferenceType.ASSET,
            }));
        }

        let operation = await ai.models.generateVideos(request);

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation failed or returned no link.");
        }

        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (error) {
        throw handleApiError(error);
    }
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
});

export const extendVideo = async (videoUrl: string, prompt: string, aspectRatio: AspectRatio): Promise<string> => {
    try {
        const ai = getAiClient();
        const videoResponse = await fetch(videoUrl);
        const videoBlob = await videoResponse.blob();
        const previousVideo = {
            videoBytes: await blobToBase64(videoBlob),
            mimeType: 'video/mp4'
        };

        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            video: previousVideo,
            prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio,
            }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Video extension failed.");
        
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (error) {
        throw handleApiError(error);
    }
};

// --- Text-to-Speech (TTS) ---
function pcmToWav(pcmData: Int16Array, sampleRate: number, numChannels: number): Blob {
    const headerSize = 44;
    const dataSize = pcmData.length * 2;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataSize, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);
    for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(headerSize + i * 2, pcmData[i], true);
    }
    return new Blob([view], { type: 'audio/wav' });
}

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export const generateSpeech = async (text: string, voice: TTSVoice): Promise<string> => {
    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error("TTS generation failed.");
        
        const decodedBytes = decode(base64Audio);
        const pcmData = new Int16Array(decodedBytes.buffer);
        const wavBlob = pcmToWav(pcmData, 24000, 1);
        return URL.createObjectURL(wavBlob);
    } catch (error) {
        throw handleApiError(error);
    }
};

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const response = await fetch(dataUrl);
    return await response.blob();
};