import React, { useState, useEffect } from 'react';
import type { DailyPlan, SessionData, FullReport } from '../types';
import { playTextToSpeech, evaluateSession, stopAllAudio } from '../services/geminiService';
import { Volume2, Eye, EyeOff, ArrowRight, Loader2, Flag, VolumeX, Check, PlayCircle } from 'lucide-react';
import StudentBox from './StudentBox';
import ReportCard from './ReportCard';

interface TestSessionProps {
  plan: DailyPlan;
  onBack: () => void;
}

const TestSession: React.FC<TestSessionProps> = ({ plan, onBack }) => {
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [showQuestionText, setShowQuestionText] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  
  const [sessionData, setSessionData] = useState<SessionData>({
    studentA: { answers: {} },
    studentB: { answers: {} }
  });
  
  // Phase logic: examiner -> tom -> bella -> next question
  const [phase, setPhase] = useState<'examiner_speaking' | 'student_a_turn' | 'student_b_turn' | 'evaluating' | 'results'>('examiner_speaking');
  const [report, setReport] = useState<FullReport | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const currentQuestion = plan.questions[currentQuestionIdx];

  // Stop audio when unmounting
  useEffect(() => {
      return () => { stopAllAudio(); };
  }, []);

  // Auto-play TTS when question changes
  useEffect(() => {
    if (phase === 'examiner_speaking' && currentQuestion) {
       // Reset blocked state
       setAutoplayBlocked(false);
       
       const playAudio = async () => {
         setIsTTSLoading(true);
         try {
           const success = await playTextToSpeech(currentQuestion.text);
           if (!success) {
               console.warn("Autoplay blocked or failed");
               setAutoplayBlocked(true);
           }
         } catch(e) {
           console.error("TTS Auto-play error", e);
           setAutoplayBlocked(true);
         } finally {
           setIsTTSLoading(false);
         }
       };

       // Small delay to allow UI transition
       const timer = setTimeout(playAudio, 500);
       return () => clearTimeout(timer);
    }
  }, [currentQuestion, phase]);

  const handleManualPlay = async () => {
      setAutoplayBlocked(false);
      setIsTTSLoading(true);
      try {
          await playTextToSpeech(currentQuestion.text);
      } catch (e) {
          console.error("Manual play error", e);
      } finally {
          setIsTTSLoading(false);
      }
  };

  const handleExaminerDone = async () => {
      stopAllAudio(); // synchronous now
      // ALWAYS start with Tom (Student A)
      setPhase('student_a_turn');
  };

  const handleStudentAComplete = (text: string) => {
    setSessionData(prev => ({
        ...prev,
        studentA: {
            ...prev.studentA,
            answers: { ...prev.studentA.answers, [currentQuestion.id]: text }
        }
    }));
    
    // ALWAYS move to Bella (Student B) next
    setPhase('student_b_turn');
  };

  const handleStudentBComplete = (text: string) => {
    setSessionData(prev => ({
        ...prev,
        studentB: {
            ...prev.studentB,
            answers: { ...prev.studentB.answers, [currentQuestion.id]: text }
        }
    }));
    // After Bella, go to next question
    goToNextQuestion();
  };

  const goToNextQuestion = () => {
      if (currentQuestionIdx < plan.questions.length - 1) {
          setCurrentQuestionIdx(prev => prev + 1);
          setShowQuestionText(false);
          setPhase('examiner_speaking');
      } else {
          finishSession();
      }
  };

  const finishSession = async () => {
      // Force stop everything
      try { stopAllAudio(); } catch(e) {}
      
      setPhase('evaluating');
      setIsFinishing(true);
      
      try {
          const result = await evaluateSession(plan, sessionData);
          setReport(result);
          setPhase('results');
      } catch (err) {
          console.error("Evaluation error:", err);
          // Fallback report so the user is not stuck
          setReport({
              studentA: { score: 0, feedback: "Incomplete data or connection error.", goodPoints: [], badPoints: [], suggestions: ["Check internet connection."] },
              studentB: { score: 0, feedback: "Incomplete data or connection error.", goodPoints: [], badPoints: [], suggestions: ["Check internet connection."] },
              generalFeedback: "Session ended. We could not generate a full AI report, possibly due to network issues or no audio data recorded."
          });
          setPhase('results');
      } finally {
          setIsFinishing(false);
      }
  };

  const handleEarlyFinish = () => {
      if (isFinishing) return;
      
      if (!confirmExit) {
          setConfirmExit(true);
          // Reset confirm state after 3 seconds
          setTimeout(() => setConfirmExit(false), 3000);
          return;
      }
      
      finishSession();
  };

  if (phase === 'results' && report) {
      return <ReportCard report={report} onRestart={onBack} />;
  }

  if (phase === 'evaluating') {
      return (
          <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-50">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-6"></div>
              <h2 className="text-2xl font-bold text-gray-800">Generating Analysis...</h2>
              <p className="text-gray-500 mt-2">The examiner is reviewing your answers.</p>
          </div>
      );
  }

  // Check if students have already answered the current question
  const savedAnswerTom = sessionData.studentA.answers[currentQuestion.id];
  const savedAnswerBella = sessionData.studentB.answers[currentQuestion.id];
  
  const hasTomAnswered = !!savedAnswerTom;
  const hasBellaAnswered = !!savedAnswerBella;

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-y-auto">
      {/* Header / Progress - Sticky on mobile to keep context */}
      <div className="sticky top-0 bg-white border-b px-4 md:px-6 py-3 md:py-4 flex justify-between items-center shadow-sm z-30">
        <div className="flex flex-col">
           <h1 className="font-bold text-base md:text-lg text-gray-800 flex items-center gap-2">
             <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Day {plan.day}</span>
             <span className="truncate max-w-[150px] md:max-w-none">{plan.topic}</span>
           </h1>
           <div className="flex items-center gap-2 mt-1">
             <div className="text-xs text-gray-500">Q{currentQuestionIdx + 1}/{plan.questions.length}</div>
             <div className="flex gap-1">
                {plan.questions.map((_, idx) => (
                    <div key={idx} className={`h-1.5 w-4 md:w-6 rounded-full transition-colors ${idx === currentQuestionIdx ? 'bg-blue-600' : idx < currentQuestionIdx ? 'bg-green-500' : 'bg-gray-200'}`} />
                ))}
            </div>
           </div>
        </div>
        
        <div className="flex items-center gap-2">
            <button
                onClick={stopAllAudio}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-colors"
                title="Stop All Audio"
            >
                <VolumeX className="w-4 h-4" />
                <span className="hidden md:inline">Stop Audio</span>
            </button>

            <button 
               onClick={handleEarlyFinish}
               disabled={isFinishing}
               className={`flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                   confirmExit 
                   ? 'bg-red-600 text-white border-red-700 animate-pulse' 
                   : 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200'
               }`}
               title="Finish test early"
            >
               {isFinishing ? <Loader2 className="w-4 h-4 animate-spin"/> : confirmExit ? <Check className="w-4 h-4"/> : <Flag className="w-4 h-4" />}
               <span className="hidden md:inline">{confirmExit ? "Confirm?" : "Finish & Report"}</span>
               <span className="md:hidden">{confirmExit ? "Confirm" : "Finish"}</span>
            </button>
        </div>
      </div>

      {/* Examiner Area (Top) */}
      <div className="flex-none p-6 bg-slate-900 text-white min-h-[30vh] md:min-h-[35vh] flex flex-col items-center justify-center text-center relative z-20">
         <div className="absolute top-4 left-4 text-xs font-mono uppercase tracking-widest text-slate-400">Examiner AI</div>
         
         <div className="max-w-3xl w-full flex flex-col items-center gap-6 z-10">
            {isTTSLoading ? (
               <div className="flex flex-col items-center animate-pulse">
                  <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-3" />
                  <span className="text-xl font-light text-slate-300">Preparing question...</span>
               </div>
            ) : autoplayBlocked ? (
               <div className="flex flex-col items-center animate-in zoom-in duration-300">
                    <button 
                        onClick={handleManualPlay}
                        className="flex flex-col items-center justify-center gap-4 group"
                    >
                        <div className="p-4 rounded-full bg-blue-600 group-hover:bg-blue-500 shadow-xl shadow-blue-900/50 transition-all transform group-hover:scale-110">
                            <PlayCircle className="w-12 h-12 text-white fill-current" />
                        </div>
                        <span className="text-xl font-medium text-white group-hover:text-blue-200">Tap to Play Question</span>
                    </button>
               </div>
            ) : (
                <>
                    <div className={`text-2xl md:text-3xl font-serif leading-normal transition-opacity duration-500 ${showQuestionText ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
                        "{currentQuestion.text}"
                    </div>
                    
                    {!showQuestionText && (
                        <div className="text-slate-500 italic text-lg">(Listen to the question...)</div>
                    )}
                </>
            )}

            {!isTTSLoading && !autoplayBlocked && (
                <div className="flex gap-4 mt-2">
                    <button 
                        onClick={() => {
                            setIsTTSLoading(true);
                            playTextToSpeech(currentQuestion.text).catch(e => console.error(e)).finally(() => setIsTTSLoading(false));
                        }}
                        disabled={isTTSLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors text-sm md:text-base disabled:opacity-50"
                    >
                        <Volume2 className="w-4 h-4" /> Replay
                    </button>
                    <button 
                        onClick={() => setShowQuestionText(!showQuestionText)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors text-sm md:text-base"
                    >
                        {showQuestionText ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/> }
                        {showQuestionText ? "Hide Text" : "Show Text"}
                    </button>
                </div>
            )}
         </div>

         {phase === 'examiner_speaking' && !isTTSLoading && !autoplayBlocked && (
             <div className="mt-8 z-20 animate-bounce">
                <button 
                    onClick={handleExaminerDone} 
                    className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-full font-bold shadow-lg hover:bg-blue-500 transform transition hover:scale-105"
                >
                    Start Answering <ArrowRight className="w-4 h-4"/>
                </button>
             </div>
         )}
      </div>

      {/* Answer Area (Bottom) */}
      <div className="flex-1 p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 bg-slate-50 z-0 pb-12">
         <StudentBox 
            key={`tom-${currentQuestion.id}`}
            name="Tom" 
            questionId={currentQuestion.id}
            isActive={phase === 'student_a_turn'} 
            hasAnswered={hasTomAnswered}
            savedAnswer={savedAnswerTom}
            disabled={phase !== 'student_a_turn'}
            onAnswerComplete={handleStudentAComplete}
         />
         <StudentBox 
            key={`bella-${currentQuestion.id}`}
            name="Bella" 
            questionId={currentQuestion.id}
            isActive={phase === 'student_b_turn'} 
            hasAnswered={hasBellaAnswered}
            savedAnswer={savedAnswerBella}
            disabled={phase !== 'student_b_turn'}
            onAnswerComplete={handleStudentBComplete}
         />
      </div>
    </div>
  );
};

export default TestSession;