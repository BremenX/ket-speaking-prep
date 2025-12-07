import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { DailyPlan, FullReport, SessionData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Audio Types & Cache ---

let currentAudio: HTMLAudioElement | null = null;
let latestTtsRequestId = 0;
const audioCache = new Map<string, string>(); // Cache text -> Blob URL

// --- Helpers ---

// Gemini TTS is 24kHz, 1 channel, 16-bit PCM
const SAMPLE_RATE = 24000;

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createWavBlob(pcmData: Uint8Array): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (SAMPLE_RATE * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const headerSize = 44;
  
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // ChunkSize
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, SAMPLE_RATE, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Write PCM data
  const pcmBytes = new Uint8Array(buffer, headerSize);
  pcmBytes.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

export const isAudioPlaying = () => {
    return !!currentAudio && !currentAudio.paused;
};

export const stopAllAudio = () => {
  if (currentAudio) {
    try {
      currentAudio.pause();
      // On some Android devices, calling load() on an empty src crashes the webview media service.
      // We just pause and nullify.
      currentAudio.src = ""; 
      currentAudio.removeAttribute("src");
      currentAudio = null;
    } catch (e) {
      console.warn("Error stopping audio", e);
    }
  }

  // Cancel Browser Synthesis fallback
  if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch(e){}
  }
};

// --- Services ---

export const generateDayPlan = async (day: number): Promise<DailyPlan> => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Generate a KET (A2 Key) speaking test plan for Day ${day} of a 30-day challenge.
    The plan must include a mix of Part 1 (Interview/Personal questions) and Part 2 (Discussion/Phase 2) questions.
    Provide exactly 5 distinct questions/prompts.
    The students are named "Tom" and "Bella".
    For "target", specify if the question is for "Tom", "Bella", or "Both".
    Topic should be specific to this day (e.g., Hobbies, Travel, School, Food).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.INTEGER },
          topic: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                part: { type: Type.STRING, enum: ["Part 1", "Part 2"] },
                target: { type: Type.STRING, enum: ["Tom", "Bella", "Both"] },
              },
              required: ["id", "text", "part", "target"],
            },
          },
        },
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No plan generated");
  return JSON.parse(text) as DailyPlan;
};

export const playTextToSpeech = async (text: string): Promise<boolean> => {
  const requestId = ++latestTtsRequestId;

  try {
    // 1. Check Cache first
    if (audioCache.has(text)) {
      stopAllAudio();
      if (requestId !== latestTtsRequestId) return false;
      
      const audioUrl = audioCache.get(text)!;
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      
      try {
        await audio.play();
        return true;
      } catch (err) {
        console.warn("Cached playback failed (likely autoplay policy):", err);
        return false;
      }
    }

    // 2. Fetch from API if not cached
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    if (requestId !== latestTtsRequestId) return false;

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned");

    // 3. Convert raw PCM to WAV Blob
    const pcmBytes = base64ToUint8Array(base64Audio);
    const wavBlob = createWavBlob(pcmBytes);
    const audioUrl = URL.createObjectURL(wavBlob);

    // 4. Cache it
    audioCache.set(text, audioUrl);

    // 5. Play
    stopAllAudio();
    if (requestId !== latestTtsRequestId) return false;

    const audio = new Audio(audioUrl);
    currentAudio = audio;

    try {
        await audio.play();
        return true;
    } catch(err) {
        console.warn("Audio play failed (likely autoplay policy):", err);
        return false;
    }

    audio.onended = () => {
        if (currentAudio === audio) {
            currentAudio = null;
        }
    };

  } catch (error) {
    if (requestId !== latestTtsRequestId) return false;
    console.error("TTS Error:", error);
    
    // Fallback to browser TTS (often allowed without user gesture if simple)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopAllAudio();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-GB';
        try {
            window.speechSynthesis.speak(utterance);
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
  }
  return false;
};

export const evaluateSession = async (
  plan: DailyPlan,
  sessionData: SessionData
): Promise<FullReport> => {
  
  const hasTomAnswers = Object.keys(sessionData.studentA.answers).length > 0;
  const hasBellaAnswers = Object.keys(sessionData.studentB.answers).length > 0;

  if (!hasTomAnswers && !hasBellaAnswers) {
      return {
          studentA: {
              score: 0,
              feedback: "No answers recorded.",
              goodPoints: [],
              badPoints: ["No speech input detected."],
              suggestions: ["Check microphone settings."]
          },
          studentB: {
              score: 0,
              feedback: "No answers recorded.",
              goodPoints: [],
              badPoints: ["No speech input detected."],
              suggestions: ["Check microphone settings."]
          },
          generalFeedback: "Session ended without any recorded answers."
      };
  }

  const prompt = `
    Role: KET (A2 Key) Speaking Examiner.
    Task: Evaluate the following session for Day ${plan.day}: ${plan.topic}.
    
    The students are Tom (Student A) and Bella (Student B).
    
    IMPORTANT: 
    - "studentA" in the JSON output corresponds to Tom.
    - "studentB" in the JSON output corresponds to Bella.
    - If the user finished early, only evaluate answered questions. Do not penalize for missing questions.
    
    Questions in Plan:
    ${plan.questions.map(q => `- [${q.id}] ${q.text} (Target: ${q.target})`).join('\n')}

    Tom (Student A) Answers:
    ${JSON.stringify(sessionData.studentA.answers)}

    Bella (Student B) Answers:
    ${JSON.stringify(sessionData.studentB.answers)}

    Provide a strict JSON report. Score 0-5.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          studentA: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              feedback: { type: Type.STRING },
              goodPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              badPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          studentB: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              feedback: { type: Type.STRING },
              goodPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              badPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          generalFeedback: { type: Type.STRING },
        },
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate report");
  return JSON.parse(text) as FullReport;
};