import React, { useState } from 'react';
import { Calendar, UserCircle2, Mic2 } from 'lucide-react';
import { generateDayPlan } from './services/geminiService';
import type { DailyPlan } from './types';
import TestSession from './components/TestSession';

const App: React.FC = () => {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(false);

  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  const handleDaySelect = async (day: number) => {
    setSelectedDay(day);
    setLoading(true);
    try {
      const generatedPlan = await generateDayPlan(day);
      setPlan(generatedPlan);
    } catch (error) {
      console.error("Failed to load plan", error);
      alert("Failed to load today's plan. Please check your API key or connection.");
      setSelectedDay(null);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPlan(null);
    setSelectedDay(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Mic2 className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-slate-700 animate-pulse">Consulting AI Examiner for Day {selectedDay}...</h2>
      </div>
    );
  }

  if (plan) {
    return <TestSession plan={plan} onBack={reset} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <UserCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">KET Speaking Coach</h1>
              <p className="text-xs text-gray-500">AI-Powered Preparation</p>
            </div>
          </div>
          <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
            30 Day Challenge
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Select Your Training Day</h2>
          <p className="text-gray-600 max-w-lg mx-auto">
            Choose a day to generate a unique speaking test session. Practice Part 1 (Interview) and Part 2 (Discussion) with an AI examiner.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => handleDaySelect(day)}
              className="group relative flex flex-col items-center justify-center p-6 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all duration-200 aspect-square"
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <Calendar className="w-4 h-4 text-blue-500" />
              </div>
              <span className="text-3xl font-black text-gray-300 group-hover:text-blue-600 transition-colors">
                {day}
              </span>
              <span className="text-xs font-semibold text-gray-500 mt-2 uppercase tracking-wider group-hover:text-gray-900">
                Day
              </span>
            </button>
          ))}
        </div>
      </main>
      
      <footer className="mt-12 py-8 border-t border-gray-200 bg-white text-center">
         <p className="text-gray-400 text-sm">Powered by Gemini 2.5 Flash & TTS</p>
      </footer>
    </div>
  );
};

export default App;