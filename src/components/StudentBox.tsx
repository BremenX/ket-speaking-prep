import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, AlertCircle, CheckCircle2, Keyboard, Mic2, Volume2, Send } from 'lucide-react';
import type { IWindow } from '../types';
import { stopAllAudio } from '../services/geminiService';

interface StudentBoxProps {
  name: string;
  questionId: string;
  isActive: boolean;
  hasAnswered: boolean;
  savedAnswer?: string;
  onAnswerComplete: (text: string) => void;
  disabled: boolean;
}

const StudentBox: React.FC<StudentBoxProps> = ({ 
  name, 
  questionId,
  isActive, 
  hasAnswered, 
  savedAnswer,
  onAnswerComplete, 
  disabled 
}) => {
  // UI States
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Manual Input State
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  
  // Refs for logic
  const recognitionInstanceRef = useRef<any>(null);
  const fullTranscriptRef = useRef(""); 
  const isMountedRef = useRef(true);

  // Check support on mount
  useEffect(() => {
    isMountedRef.current = true;
    
    // Reset state when question changes
    fullTranscriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setErrorMsg(null);
    setIsRecording(false);
    
    // Abort any existing
    if (recognitionInstanceRef.current) {
        try { recognitionInstanceRef.current.abort(); } catch(e){}
    }

    try {
        const ua = window.navigator.userAgent.toLowerCase();
        const isIOS = /iphone|ipad|ipod/.test(ua);
        const isSafari = isIOS && /safari/.test(ua) && !/crios|fxios|crmo|edgios/.test(ua);
        
        // Strict iOS Non-Safari Check
        if (isIOS && !isSafari) {
          setIsManualMode(true);
          setErrorMsg("Browser not supported. Please use Safari on iOS or Chrome on Android.");
          return;
        }

        const windowObj = window as unknown as IWindow;
        if (!windowObj.SpeechRecognition && !windowObj.webkitSpeechRecognition) {
          setIsManualMode(true);
          setErrorMsg("Voice not supported. Manual mode.");
        }
    } catch (e) {
        setIsManualMode(true);
    }

    return () => {
        isMountedRef.current = false;
        if (recognitionInstanceRef.current) {
            try { recognitionInstanceRef.current.abort(); } catch(e) {}
        }
    };
  }, [questionId]); // Reset on question ID change

  // Lazy Initialization of Speech Recognition
  const getRecognition = useCallback(() => {
      if (recognitionInstanceRef.current) return recognitionInstanceRef.current;

      const windowObj = window as unknown as IWindow;
      const SpeechRecognition = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;

      if (!SpeechRecognition) return null;

      try {
          const recognition = new SpeechRecognition();
          recognition.continuous = false; // False is safer for Android
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.maxAlternatives = 1;

          recognition.onstart = () => {
              if (isMountedRef.current) {
                setIsRecording(true);
                setErrorMsg(null);
              }
          };

          recognition.onresult = (event: any) => {
              if (!isMountedRef.current) return;
              
              let newFinal = '';
              let newInterim = '';

              for (let i = 0; i < event.results.length; ++i) {
                  if (event.results[i].isFinal) {
                      newFinal += event.results[i][0].transcript;
                  } else {
                      newInterim += event.results[i][0].transcript;
                  }
              }

              if (newFinal) {
                  fullTranscriptRef.current = (fullTranscriptRef.current + " " + newFinal).trim();
                  setTranscript(fullTranscriptRef.current);
              }
              setInterimTranscript(newInterim);
          };

          recognition.onerror = (event: any) => {
              if (!isMountedRef.current) return;
              console.log("Rec Error:", event.error);
              
              // Ignore common non-critical errors
              if (event.error === 'no-speech' || event.error === 'aborted') {
                  setIsRecording(false);
                  return;
              }

              setIsRecording(false);
              
              if (event.error === 'not-allowed') {
                  setErrorMsg("Mic blocked. Check settings.");
              } else if (event.error === 'audio-capture') {
                  setErrorMsg("No mic found.");
              } else if (event.error === 'network') {
                  setErrorMsg("Network error.");
              } else {
                  setErrorMsg("Error: " + event.error);
              }
          };

          recognition.onend = () => {
              if (!isMountedRef.current) return;

              // ANDROID FIX: Capture any leftover interim text
              // The 'interimTranscript' state might be stale in this closure, 
              // but we can try to access the DOM or just rely on react state updates having happened
              setIsRecording(false);
              
              // We rely on the user to press 'Submit' or 'Record' again
              // We don't auto-submit here to avoid premature submission
          };
          
          recognitionInstanceRef.current = recognition;
          return recognition;
      } catch(e) {
          console.error("Init error", e);
          return null;
      }
  }, []);

  const handleMicClick = () => {
      // 1. If recording, stop
      if (isRecording) {
          if (recognitionInstanceRef.current) {
              try { recognitionInstanceRef.current.stop(); } catch(e) {}
          }
          return;
      }
      
      // 2. Start Recording
      setErrorMsg(null);
      stopAllAudio(); // Synchronous pause

      const recognition = getRecognition();
      if (!recognition) {
          setIsManualMode(true);
          return;
      }

      try {
          // Reset interim for new session
          setInterimTranscript("");
          recognition.start();
      } catch (e) {
          console.error("Start error", e);
          setIsRecording(false);
          // Force manual mode on crash
          setIsManualMode(true);
          setErrorMsg("Device error. Switched to manual.");
      }
  };

  const handleSubmit = () => {
      let finalText = fullTranscriptRef.current;
      if (isManualMode) finalText = manualText;

      // Capture leftover interim text (crucial for Android)
      if (interimTranscript && !isManualMode) {
          finalText = (finalText + " " + interimTranscript).trim();
      }

      if (!finalText.trim()) {
          setErrorMsg("Please say something first.");
          return;
      }
      
      // Stop recognition if running
      if (isRecording && recognitionInstanceRef.current) {
          try { recognitionInstanceRef.current.abort(); } catch(e) {}
      }
      
      onAnswerComplete(finalText.trim());
  };

  const hasText = isManualMode ? manualText.length > 0 : (transcript.length > 0 || interimTranscript.length > 0);

  const renderContent = () => {
      if (hasAnswered) {
          return <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-lg">{savedAnswer}</p>;
      }
      
      if (isManualMode) {
          return (
            <textarea
                className="w-full h-full p-2 bg-transparent border-none outline-none resize-none text-lg text-gray-800 placeholder-gray-400"
                placeholder="Type answer..."
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                autoFocus
            />
          );
      }

      return (
          <div className="relative z-10">
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-lg">
                  {transcript} <span className="text-gray-500 italic">{interimTranscript}</span>
              </p>
          </div>
      );
  };

  return (
    <div className={`flex flex-col h-full border-2 rounded-xl overflow-hidden transition-all duration-300 ${isActive ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200 ring-offset-2' : 'border-gray-200 bg-white opacity-90'}`}>
      
      {/* Header */}
      <div className={`p-4 border-b flex justify-between items-center ${isActive ? 'bg-blue-100 border-blue-200' : 'bg-gray-100 border-gray-200'}`}>
        <h3 className={`font-bold text-lg ${isActive ? 'text-blue-900' : 'text-gray-600'}`}>{name}</h3>
        {isActive && !hasAnswered && (
             <div className="flex gap-2">
                 {!isManualMode ? (
                     <button onClick={() => setIsManualMode(true)} className="text-xs flex items-center gap-1 text-blue-600 bg-white px-2 py-1 rounded shadow-sm hover:bg-blue-50">
                         <Keyboard className="w-3 h-3"/> Type
                     </button>
                 ) : (
                     <button onClick={() => setIsManualMode(false)} className="text-xs flex items-center gap-1 text-blue-600 bg-white px-2 py-1 rounded shadow-sm hover:bg-blue-50">
                         <Mic2 className="w-3 h-3"/> Voice
                     </button>
                 )}
                 <span className="text-xs font-bold text-blue-600 px-2 py-1 bg-white rounded-full animate-pulse">Your Turn</span>
             </div>
        )}
        {hasAnswered && <span className="text-xs font-bold text-green-600 px-2 py-1 bg-green-100 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Done</span>}
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 overflow-y-auto min-h-[150px] relative bg-white/60">
         {renderContent()}
         
         {!hasText && !isRecording && !hasAnswered && !isManualMode && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                <div className="text-center">
                    <Mic className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <span className="text-gray-400 font-medium italic">Tap Record to start</span>
                </div>
             </div>
         )}
         
         {/* Recording Indicator */}
         {!hasAnswered && isRecording && (
             <div className="absolute top-2 right-2 pointer-events-none z-20">
                 {interimTranscript ? (
                     <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full animate-pulse">
                         <Volume2 className="w-3 h-3" /> Hearing...
                     </span>
                 ) : (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-500 bg-red-100 px-2 py-1 rounded-full animate-pulse">
                         <Mic className="w-3 h-3" /> Listening...
                     </span>
                 )}
             </div>
         )}
         
         {errorMsg && (
             <div className="absolute bottom-2 left-2 right-2 bg-red-50 text-red-600 text-xs px-2 py-1 rounded border border-red-200 flex flex-col items-center justify-center text-center z-10 p-2 animate-in fade-in slide-in-from-bottom-2">
                 <span className="flex items-center gap-1 font-bold"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}</span>
             </div>
         )}
      </div>

      {/* Control Footer */}
      <div className="p-4 border-t border-gray-200 bg-white grid grid-cols-5 gap-3 sticky bottom-0 z-10">
          {hasAnswered ? (
               <button disabled className="col-span-5 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold bg-gray-100 text-gray-400 cursor-not-allowed">
                  <CheckCircle2 className="w-5 h-5" /> Finished
               </button>
          ) : isManualMode ? (
              <button 
                onClick={handleSubmit}
                className="col-span-5 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold bg-blue-600 text-white shadow-md hover:bg-blue-700 active:translate-y-1"
              >
                  <Send className="w-5 h-5" /> Submit Answer
              </button>
          ) : (
              <>
                <button
                    onClick={handleMicClick}
                    disabled={disabled}
                    className={`col-span-3 flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-bold transition-all border-b-4 active:border-b-0 active:translate-y-1 active:border-t-4 active:border-transparent ${
                        disabled 
                        ? 'bg-gray-100 text-gray-400 border-gray-200' 
                        : isRecording 
                                ? 'bg-red-500 text-white border-red-600 hover:bg-red-600'
                                : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                    }`}
                >
                    {isRecording ? (
                        <><Square className="w-5 h-5 fill-current animate-pulse" /> Stop</>
                    ) : (
                        <><Mic className="w-5 h-5" /> {transcript ? "Resume" : "Record"}</>
                    )}
                </button>

                <button
                    onClick={handleSubmit}
                    disabled={disabled || (!hasText && !interimTranscript)}
                    className={`col-span-2 flex items-center justify-center gap-1 px-2 py-4 rounded-xl font-bold transition-all border-b-4 active:border-b-0 active:translate-y-1 active:border-t-4 active:border-transparent ${
                        (!hasText && !interimTranscript) || disabled
                         ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                         : 'bg-green-600 text-white border-green-700 hover:bg-green-700 shadow-md'
                    }`}
                >
                    <CheckCircle2 className="w-5 h-5" /> Submit
                </button>
              </>
          )}
      </div>
    </div>
  );
};

export default StudentBox;