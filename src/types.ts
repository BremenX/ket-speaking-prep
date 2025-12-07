export interface DailyPlan {
  day: number;
  topic: string;
  questions: Question[];
}

export interface Question {
  id: string;
  text: string;
  part: 'Part 1' | 'Part 2'; // Part 1: Interview, Part 2: Discussion
  target: 'Tom' | 'Bella' | 'Both';
}

export interface SessionData {
  studentA: StudentSessionData;
  studentB: StudentSessionData;
}

export interface StudentSessionData {
  answers: Record<string, string>; // questionId -> transcript
}

export interface EvaluationResult {
  score: number; // 0-5
  feedback: string;
  goodPoints: string[];
  badPoints: string[];
  suggestions: string[];
}

export interface FullReport {
  studentA: EvaluationResult;
  studentB: EvaluationResult;
  generalFeedback: string;
}

// Web Speech API Types
export interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}