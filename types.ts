
export type Language = 'English' | 'Hindi' | 'Hinglish';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // Fix: Added grounding metadata to Message interface for compliance with mandatory display rules.
  grounding?: any[];
}

export interface Contact {
  id: string;
  name: string;
  type: 'email' | 'phone';
  value: string;
}

export interface AppContext {
  riskLevel: number;
  silenceDuration: number;
  locationAccess: 'Granted' | 'Denied';
  emergencyContactAvailable: 'Yes' | 'No';
  language: Language;
}

export const EMERGENCY_KEYWORDS = [
  'help', 'bachao', 'madad', 'chakkar', 'dizzy', 'faint', 'saans', 
  'breathing problem', 'heart attack', 'chest pain', 'panic', 
  'police', 'ambulance', 'bleeding', 'ghabrahat', 'dard', 
  'unconscious', 'seizure', 'collapse', 'emergency', 'accident'
];
