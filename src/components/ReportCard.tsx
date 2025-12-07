import React from 'react';
import { FullReport, EvaluationResult } from '../types';
import { CheckCircle2, XCircle, Lightbulb } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ReportCardProps {
  report: FullReport;
  onRestart: () => void;
}

const ScoreChart = ({ scoreA, scoreB }: { scoreA: number, scoreB: number }) => {
    const data = [
        { name: 'Tom', score: scoreA },
        { name: 'Bella', score: scoreB },
    ];
    return (
        <div className="h-64 w-full mt-4">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 5]} />
                    <Tooltip cursor={{fill: 'transparent'}} />
                    <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#8b5cf6'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

const StudentResult = ({ name, data, colorClass }: { name: string, data: EvaluationResult, colorClass: string }) => (
  <div className={`p-6 rounded-2xl border ${colorClass} bg-opacity-50`}>
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-xl font-bold">{name}</h3>
      <div className="flex items-center gap-2">
         <span className="text-sm text-gray-500 uppercase tracking-wider">Score</span>
         <span className="text-3xl font-black">{data.score}/5</span>
      </div>
    </div>
    
    <p className="text-gray-700 italic mb-6">"{data.feedback}"</p>

    <div className="space-y-4">
      <div>
        <h4 className="flex items-center gap-2 font-semibold text-green-700 mb-2">
          <CheckCircle2 className="w-5 h-5" /> Good Points
        </h4>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
          {data.goodPoints.map((pt, i) => <li key={i}>{pt}</li>)}
        </ul>
      </div>

      <div>
        <h4 className="flex items-center gap-2 font-semibold text-red-600 mb-2">
          <XCircle className="w-5 h-5" /> Areas to Improve
        </h4>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
          {data.badPoints.map((pt, i) => <li key={i}>{pt}</li>)}
        </ul>
      </div>

      <div>
        <h4 className="flex items-center gap-2 font-semibold text-amber-600 mb-2">
          <Lightbulb className="w-5 h-5" /> Suggestions
        </h4>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
          {data.suggestions.map((pt, i) => <li key={i}>{pt}</li>)}
        </ul>
      </div>
    </div>
  </div>
);

const ReportCard: React.FC<ReportCardProps> = ({ report, onRestart }) => {
  return (
    <div className="max-w-5xl mx-auto p-6 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800">Session Report</h2>
        <p className="text-gray-500 mt-2">Here is how you performed on today's KET session.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <StudentResult name="Tom" data={report.studentA} colorClass="border-blue-200 bg-blue-50" />
        <StudentResult name="Bella" data={report.studentB} colorClass="border-purple-200 bg-purple-50" />
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-2">General Feedback</h3>
        <p className="text-gray-600 leading-relaxed">{report.generalFeedback}</p>
        <div className="mt-6 border-t pt-6">
            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 text-center">Score Comparison</h4>
            <ScoreChart scoreA={report.studentA.score} scoreB={report.studentB.score} />
        </div>
      </div>

      <div className="flex justify-center pb-12">
        <button
          onClick={onRestart}
          className="px-8 py-3 bg-gray-900 text-white rounded-full font-bold hover:bg-black transition-colors shadow-lg"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default ReportCard;