import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Shield, AlertCircle, MapPin, Users, Send, Power, Loader2, Volume2, 
  PhoneCall, Timer, Wind, Bell, X, Check, Heart, User, Activity, Search, Edit2, Plus, Trash2, Mic, MicOff, ExternalLink, Settings, Save, Mail, MessageSquare, Sun, Moon, Zap
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { GuardianAIService } from './geminiService';
import { sendEmergencyAlert, detectRiskAnomaly } from './azureService';
import { AppContext, Message, Language, EMERGENCY_KEYWORDS, Contact } from './types';

// Declaration for Leaflet globally available from script tag
declare const L: any;

interface MedicalData {
  bloodType: string;
  allergies: string;
  condition: string;
}

const App: React.FC = () => {
  // --- View States ---
  const [activeView, setActiveView] = useState<'main' | 'fakeCall' | 'timer' | 'calmDown' | 'settings'>('main');
  const [isSirenActive, setIsSirenActive] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showMedicalEdit, setShowMedicalEdit] = useState(false);
  const [showContactAdd, setShowContactAdd] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  
  // --- Theme State ---
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // --- Data States ---
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "I'm with you. I'm listening for distress signals and watching your safety status.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [riskLevel, setRiskLevel] = useState(21);
  const [silenceDuration, setSilenceDuration] = useState(0);
  const [riskTrend, setRiskTrend] = useState<{time: number, risk: number}[]>([
    {time: 0, risk: 21}, {time: 5, risk: 25}, {time: 10, risk: 21}
  ]);
  const [timerValue, setTimerValue] = useState(300);
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  
  // --- Feature States ---
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [medicalInfo, setMedicalInfo] = useState<MedicalData>({
    bloodType: 'O+',
    allergies: 'Peanuts',
    condition: 'Asthma'
  });
  
  // Contact State Types
  const [newContact, setNewContact] = useState<{ name: string; type: 'email' | 'phone'; value: string }>({ 
    name: '', 
    type: 'phone', 
    value: '' 
  });
  
  // --- Voice & Settings State ---
  const [micStatus, setMicStatus] = useState<'listening' | 'blocked' | 'off'>('off');
  const [voiceTriggerDetected, setVoiceTriggerDetected] = useState(false);
  const [safeword, setSafeword] = useState('help');
  
  // --- Refs ---
  const guardianService = useMemo(() => new GuardianAIService(), []);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sirenAudio = useRef<HTMLAudioElement | null>(null);
  
  // Voice Refs
  const recognitionRef = useRef<any>(null);
  const isMicShouldBeActive = useRef(false);
  const isSOSTriggered = useRef(false);
  const safewordRef = useRef(safeword); 

  // --- Map Refs & State ---
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const userMarker = useRef<any>(null);
  const emergencyMarkers = useRef<any[]>([]);
  const [locationLabel, setLocationLabel] = useState("E Block, Connaught Place, New Delhi");

  // --- Theme Effect ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // --- Sync Refs ---
  useEffect(() => {
    safewordRef.current = safeword;
  }, [safeword]);

  // --- Initialization Logic ---
  useEffect(() => {
    const isEnabled = localStorage.getItem('guardian_monitor_enabled') === 'true';
    if (!isEnabled) {
      setShowActivationModal(true);
    } else {
      isMicShouldBeActive.current = true;
    }
  }, []);

  // --- Azure Cognitive Services Anomaly Check ---
  useEffect(() => {
    const checkAnomaly = async () => {
      if (riskTrend.length > 2) {
        const result = await detectRiskAnomaly(riskTrend);
        if (result.isAnomaly) {
          setAnomalyDetected(true);
          // Auto-fade alert after 3s
          setTimeout(() => setAnomalyDetected(false), 3000);
        }
      }
    };
    checkAnomaly();
  }, [riskTrend]);

  // --- Map Initialization ---
  useEffect(() => {
    if (activeView !== 'main') return;
    if (!mapContainerRef.current) return;
    if (mapInstance.current) return;

    const defaultLat = 28.6139;
    const defaultLng = 77.2090;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([defaultLat, defaultLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    mapInstance.current = map;

    const userIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: var(--brand-primary); width: 14px; height: 14px; border-radius: 50%; border: 3px solid var(--surface); box-shadow: 0 0 15px var(--brand-primary);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    userMarker.current = L.marker([defaultLat, defaultLng], { icon: userIcon }).addTo(map);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 15);
          userMarker.current.setLatLng([latitude, longitude]);
          setLocationLabel("Live GPS Location Active");
        },
        (err) => console.log("Geo denied or error:", err)
      );
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [activeView]);

  const addEmergencyMarkers = (type: 'hospital' | 'police') => {
    if (!mapInstance.current || !userMarker.current) return;

    emergencyMarkers.current.forEach(m => m.remove());
    emergencyMarkers.current = [];

    const userPos = userMarker.current.getLatLng();
    const color = type === 'hospital' ? '#E53E3E' : '#2B6CB0';
    
    const mocks = [
      { offset: [0.002, 0.003], name: type === 'hospital' ? 'Metro Hospital' : 'District Police HQ' },
      { offset: [-0.003, -0.001], name: type === 'hospital' ? 'City Clinic' : 'Control Room' }
    ];

    mocks.forEach(m => {
      const pos = [userPos.lat + m.offset[0], userPos.lng + m.offset[1]];
      const icon = L.divIcon({
        className: 'emergency-icon',
        html: `<div style="background-color: ${color}; width: 10px; height: 10px; border-radius: 2px; border: 1px solid white;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
      });
      const marker = L.marker(pos, { icon }).addTo(mapInstance.current).bindPopup(`<b>${m.name}</b>`).openPopup();
      emergencyMarkers.current.push(marker);
    });

    const group = new L.featureGroup([userMarker.current, ...emergencyMarkers.current]);
    mapInstance.current.fitBounds(group.getBounds().pad(0.5));
  };

  // --- Core Handlers ---
  const handleSendMessage = useCallback(async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || isTyping) return;

    if (messageText.toLowerCase().includes('hospital')) addEmergencyMarkers('hospital');
    if (messageText.toLowerCase().includes('police')) addEmergencyMarkers('police');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setSilenceDuration(0);

    const hasEmergency = EMERGENCY_KEYWORDS.some(k => messageText.toLowerCase().includes(k));
    const newRisk = hasEmergency ? Math.min(100, riskLevel + 40) : Math.min(100, riskLevel + 5);
    setRiskLevel(newRisk);
    setRiskTrend(prev => [...prev.slice(-10), {time: prev.length * 5, risk: newRisk}]);

    try {
      const response = await guardianService.getResponse(messageText, {
        riskLevel: newRisk,
        silenceDuration: 0,
        locationAccess: 'Granted',
        emergencyContactAvailable: contacts.length > 0 ? 'Yes' : 'No',
        language: 'English'
      });

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.text,
        timestamp: new Date(),
        grounding: response.grounding
      }]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, riskLevel, contacts.length, guardianService]);

  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  const triggerSOSFlow = useCallback(() => {
    if (isSOSTriggered.current) return;
    isSOSTriggered.current = true;
    
    // Play Ping Sound
    const ping = new Audio('https://www.soundjay.com/button/beep-07.mp3');
    ping.play().catch(e => console.log("Ping blocked", e));
    
    setVoiceTriggerDetected(true);
    handleSendMessageRef.current(`SAFEWORD DETECTED: "${safewordRef.current.toUpperCase()}"`);
    setActiveView('timer');
    setTimerValue(300);
    setIsSirenActive(true);
    setRiskLevel(100);

    // Trigger Azure Alert
    sendEmergencyAlert(contacts, locationLabel, 100);

    setTimeout(() => {
      isSOSTriggered.current = false;
      setVoiceTriggerDetected(false);
    }, 5000);
  }, [contacts, locationLabel]);

  // --- Voice Monitor Logic ---
  const startVoiceMonitor = useCallback(() => {
    if (recognitionRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicStatus('blocked');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setMicStatus('listening');
      };

      recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript.toLowerCase();
        const currentSafeword = safewordRef.current.toLowerCase();
        
        if (text.includes(currentSafeword) || text.includes('help') || text.includes('emergency')) {
          triggerSOSFlow();
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setMicStatus('blocked');
          isMicShouldBeActive.current = false;
        } else {
          console.log("Voice error (recoverable):", event.error);
        }
      };

      recognition.onend = () => {
        setMicStatus('off');
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      setMicStatus('off');
      recognitionRef.current = null;
    }
  }, [triggerSOSFlow]);

  useEffect(() => {
    let timeoutId: any;
    if (isMicShouldBeActive.current && micStatus === 'off') {
      timeoutId = setTimeout(() => {
        startVoiceMonitor();
      }, 200);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [micStatus, startVoiceMonitor]);

  const handleActivation = useCallback(() => {
    setShowActivationModal(false);
    localStorage.setItem('guardian_monitor_enabled', 'true');
    isMicShouldBeActive.current = true;
    startVoiceMonitor();
  }, [startVoiceMonitor]);

  useEffect(() => {
    const handleGlobalInteraction = () => {
      if (isMicShouldBeActive.current && micStatus === 'off') {
        startVoiceMonitor();
      }
    };
    window.addEventListener('mousedown', handleGlobalInteraction);
    return () => window.removeEventListener('mousedown', handleGlobalInteraction);
  }, [startVoiceMonitor, micStatus]);

  useEffect(() => {
    if (isSirenActive) {
      const audio = new Audio('https://www.soundjay.com/mechanical/emergency-siren-01.mp3');
      audio.loop = true;
      audio.play().catch(e => console.log("Audio play blocked: ", e));
      sirenAudio.current = audio;
    } else {
      sirenAudio.current?.pause();
      sirenAudio.current = null;
    }
    return () => sirenAudio.current?.pause();
  }, [isSirenActive]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSilenceDuration(prev => prev + 1);
      if (activeView === 'timer' && timerValue > 0) {
        setTimerValue(t => {
          if (t <= 1) {
            setRiskLevel(100);
            setIsSirenActive(true);
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeView, timerValue]);

  const toggleSiren = () => setIsSirenActive(!isSirenActive);

  const addContact = () => {
    if (newContact.name && newContact.value && contacts.length < 5) {
      setContacts([...contacts, { ...newContact, id: Date.now().toString() }]);
      setNewContact({ name: '', type: 'phone', value: '' });
      setShowContactAdd(false);
    }
  };

  const removeContact = (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
  };

  const handleQuickSOS = () => {
    setIsSirenActive(true);
    setRiskLevel(100);
    handleSendMessage("EMERGENCY SOS TRIGGERED");
    setActiveView('timer');
    setTimerValue(300);
    sendEmergencyAlert(contacts, locationLabel, 100);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // --- Views ---

  if (activeView === 'settings') {
    return (
      <div className="fixed inset-0 bg-[var(--bg-primary)] flex flex-col items-center justify-center p-8 z-[100]">
        <div className="bg-theme-surface p-8 rounded-3xl w-full max-w-sm border border-theme shadow-xl relative">
          <button 
            onClick={() => setActiveView('main')} 
            className="absolute top-4 right-4 text-theme-secondary hover:text-[var(--brand-primary)] transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="w-16 h-16 bg-[var(--brand-primary)] bg-opacity-10 rounded-full flex items-center justify-center mb-6 border border-[var(--brand-primary)] border-opacity-20">
            <Settings className="w-8 h-8 text-[var(--brand-primary)]" />
          </div>
          
          <h2 className="text-2xl font-bold mb-1 text-theme-primary">Safety Settings</h2>
          <p className="text-theme-secondary text-xs font-medium mb-8">Configure your distress triggers.</p>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-theme-secondary mb-2">Safeword</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={safeword}
                  onChange={(e) => setSafeword(e.target.value)}
                  className="w-full bg-[var(--bg-primary)] p-4 rounded-xl text-lg font-bold border border-theme text-theme-primary focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-opacity-20 transition-all pl-12"
                />
                <Mic className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--brand-primary)]" />
              </div>
              <p className="text-[10px] text-theme-secondary mt-2 font-medium">
                Current trigger: Say <span className="text-[var(--brand-primary)] font-black">"{safeword}"</span> to activate SOS.
              </p>
            </div>

            <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-theme flex items-center justify-between">
              <span className="text-xs font-bold text-theme-primary">Voice Monitoring</span>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${micStatus === 'listening' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {micStatus === 'listening' ? 'Active' : 'Offline'}
              </div>
            </div>

            <button 
              onClick={() => setActiveView('main')}
              className="w-full bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white py-4 rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" /> Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeView === 'fakeCall') {
    return (
      <div className="fixed inset-0 bg-[var(--bg-primary)] flex flex-col items-center justify-center p-8 text-theme-primary z-[100]">
        <div className="w-32 h-32 bg-theme-surface rounded-full flex items-center justify-center mb-8 shadow-inner border border-theme">
          <User className="w-16 h-16 text-theme-secondary" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Family Member</h2>
        <p className="text-theme-secondary mb-auto">Calling Mobile...</p>
        <div className="flex w-full max-sm:px-4 max-w-sm justify-between mb-12">
          <button onClick={() => setActiveView('main')} className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 bg-[#E53E3E] rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all">
              <PhoneCall className="w-8 h-8 rotate-[135deg] text-white" />
            </div>
            <span className="text-xs font-bold text-theme-secondary">Decline</span>
          </button>
          <button onClick={() => setActiveView('main')} className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all">
              <PhoneCall className="w-8 h-8 text-white" />
            </div>
            <span className="text-xs font-bold text-theme-secondary">Accept</span>
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'timer') {
    return (
      <div className="fixed inset-0 bg-[var(--bg-primary)] flex flex-col items-center justify-center p-8 text-theme-primary z-[100]">
        <Timer className={`w-16 h-16 mb-4 ${timerValue < 60 ? 'text-[#E53E3E] animate-pulse' : 'text-[var(--brand-primary)]'}`} />
        <h2 className="text-2xl font-bold mb-2">Safety Check-In</h2>
        <div className={`text-6xl font-mono font-bold my-8 ${timerValue < 60 ? 'text-[#E53E3E]' : 'text-[var(--brand-primary)]'}`}>
          {Math.floor(timerValue / 60)}:{(timerValue % 60).toString().padStart(2, '0')}
        </div>
        <p className="text-theme-secondary text-center max-w-xs mb-12 text-sm font-medium">
          {timerValue === 0 ? "SOS BROADCASTED" : "If the timer reaches zero, SOS will be triggered automatically to your Trusted Circle."}
        </p>
        <div className="flex gap-4 w-full max-w-sm">
          <button 
            onClick={handleQuickSOS}
            className="flex-1 bg-theme-surface hover:bg-[var(--bg-secondary)] text-[#E53E3E] p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all border border-[#E53E3E]/20"
          >
            <Users className="w-5 h-5" />
            Alert Circle
          </button>
          <button 
            onClick={() => setActiveView('main')}
            className="flex-1 bg-[#E53E3E] hover:bg-[#C53030] text-white p-4 rounded-xl font-bold shadow-lg transition-all"
          >
            I'm Safe
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'calmDown') {
    return (
      <div className="fixed inset-0 bg-[var(--bg-primary)] flex flex-col items-center justify-center p-8 z-[100]">
        <div className="relative w-64 h-64 flex items-center justify-center">
          <div className="absolute inset-0 bg-[var(--brand-primary)] bg-opacity-10 rounded-full animate-breathe" />
          <div className="z-10 text-3xl font-bold tracking-widest text-[var(--brand-primary)] uppercase">
            {silenceDuration % 8 < 4 ? 'Inhale' : 'Exhale'}
          </div>
        </div>
        <button 
          onClick={() => setActiveView('main')}
          className="mt-16 bg-theme-surface hover:bg-[var(--bg-secondary)] px-8 py-3 rounded-full text-sm font-bold shadow-sm transition-all border border-theme text-theme-primary"
        >
          Exit Guide
        </button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-300 ${isSirenActive ? 'siren-flash' : ''} bg-[var(--bg-primary)]`}>
      {/* Mic Activation Modal */}
      {showActivationModal && (
        <div 
          onClick={handleActivation}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 cursor-pointer"
        >
          <div className="bg-theme-surface border border-theme p-8 rounded-3xl shadow-2xl text-center max-w-sm animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-[var(--brand-primary)] bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mic className="w-10 h-10 text-[var(--brand-primary)] animate-pulse" />
            </div>
            <h2 className="text-xl font-bold mb-2 text-theme-primary">Enable Family Monitor</h2>
            <p className="text-theme-secondary text-sm mb-6 font-medium">
              We need to hear you to help you. Click anywhere to activate distress detection.
            </p>
            <button 
              onClick={(e) => { e.stopPropagation(); handleActivation(); }}
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95"
            >
              I'm Ready
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="p-4 border-b border-theme bg-theme-surface flex items-center justify-between z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--brand-primary)] rounded-lg flex items-center justify-center text-white">
            <Heart className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2 text-theme-primary leading-none">
              WithYou
            </h1>
            <p className="text-[10px] text-[var(--brand-primary)] font-bold uppercase tracking-widest">Safety Feels Like Family</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="p-2 rounded-full bg-[var(--bg-secondary)] text-theme-primary transition-transform hover:scale-105">
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          
          <div className="text-[10px] font-mono flex items-center gap-2 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-full border border-theme shadow-sm">
            <span className="text-theme-secondary uppercase font-bold tracking-tight hidden sm:inline">Monitor:</span>
            <div 
              className={`flex items-center gap-1.5 transition-colors duration-300 ${voiceTriggerDetected ? 'text-[#E53E3E]' : micStatus === 'listening' ? 'text-green-600' : micStatus === 'blocked' ? 'text-[#E53E3E]' : 'text-theme-secondary'}`}
            >
              {voiceTriggerDetected ? (
                <AlertCircle className="w-3 h-3 animate-ping" />
              ) : micStatus === 'listening' ? (
                <div className="relative">
                  <Mic className="w-3 h-3 animate-pulse" />
                </div>
              ) : (
                <MicOff className="w-3 h-3" />
              )}
              <span className="font-black uppercase tracking-tighter">
                {voiceTriggerDetected ? 'SOS!' : micStatus === 'listening' ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-12 gap-4 p-4 h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg-primary)]">
        
        {/* Sidebar Tools */}
        <div className="col-span-12 md:col-span-1 flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto">
          {[
            { id: 'fakeCall', icon: PhoneCall, label: 'Call Home', color: 'text-[var(--brand-primary)]' },
            { id: 'timer', icon: Timer, label: 'Check In', color: 'text-[var(--accent)]' },
            { id: 'calmDown', icon: Wind, label: 'Breathe', color: 'text-blue-500' },
            { id: 'settings', icon: Settings, label: 'Settings', color: 'text-theme-secondary' }
          ].map(tool => (
            <button
              key={tool.id}
              onClick={() => tool.id === 'siren' ? toggleSiren() : setActiveView(tool.id as any)}
              className={`flex-1 md:flex-none flex flex-col items-center justify-center p-3 rounded-2xl border transition-all group shadow-sm bg-theme-surface border-theme hover:bg-[var(--bg-secondary)]`}
            >
              <tool.icon className={`w-6 h-6 mb-1 ${tool.color} group-hover:scale-110 transition-transform`} />
              <span className="text-[10px] text-theme-secondary font-bold text-center leading-tight uppercase tracking-tight">{tool.label}</span>
            </button>
          ))}
        </div>

        {/* Column 1: Safety AI */}
        <div className="col-span-12 md:col-span-3 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 bg-theme-surface rounded-3xl border border-theme flex flex-col overflow-hidden shadow-sm">
            <div className="p-3 border-b border-theme bg-[var(--bg-secondary)] bg-opacity-30 flex items-center justify-between">
              <span className="text-xs font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wide">
                <div className="w-2 h-2 bg-[var(--brand-primary)] rounded-full animate-pulse" />
                WithYou AI
              </span>
              <span className="text-[10px] bg-[var(--brand-primary)] bg-opacity-10 text-[var(--brand-primary)] px-2 py-1 rounded-full border border-[var(--brand-primary)] border-opacity-20 uppercase font-black">Online</span>
            </div>
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-4 rounded-2xl text-xs max-w-[90%] shadow-sm leading-relaxed ${m.role === 'user' ? 'bg-[var(--brand-primary)] text-white' : 'bg-[var(--bg-primary)] text-theme-primary border border-theme'}`}>
                    <div>{m.content}</div>
                    {m.grounding && m.grounding.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-white/20 space-y-2">
                        {m.grounding.map((chunk, idx) => (
                          <div key={idx}>
                            {chunk.maps && (
                              <a 
                                href={chunk.maps.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[9px] font-black text-inherit hover:underline uppercase tracking-tighter"
                              >
                                <MapPin className="w-2.5 h-2.5" /> {chunk.maps.title || 'View Location'} <ExternalLink className="w-2 h-2" />
                              </a>
                            )}
                            {chunk.web && (
                              <a 
                                href={chunk.web.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[9px] font-black text-inherit hover:underline uppercase tracking-tighter"
                              >
                                <Search className="w-2.5 h-2.5" /> {chunk.web.title || 'Related Source'} <ExternalLink className="w-2 h-2" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && <div className="text-[10px] text-[var(--brand-primary)] font-black animate-pulse ml-2 uppercase tracking-widest">Listening...</div>}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 bg-theme-surface border-t border-theme">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                className="relative"
              >
                <input 
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Tell me what's wrong..." 
                  className="w-full bg-[var(--bg-primary)] border border-theme rounded-xl py-3 pl-4 pr-12 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-opacity-20 text-theme-primary placeholder:text-theme-secondary font-medium"
                />
                <button type="submit" className="absolute right-3 top-2.5 text-[var(--brand-primary)] hover:text-[var(--brand-hover)] transition-colors p-1">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Column 2: Map & Tracking */}
        <div className="col-span-12 md:col-span-5 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 bg-theme-surface rounded-3xl border border-theme relative overflow-hidden shadow-sm">
             {/* Map Controls */}
            <div className="absolute top-4 left-4 right-4 flex justify-between z-10 pointer-events-none">
              <div className="flex items-center gap-2 bg-theme-surface backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] text-[var(--brand-primary)] border border-theme shadow-sm font-black uppercase tracking-widest pointer-events-auto">
                <MapPin className="w-3 h-3" /> Live
              </div>
              <div className="flex gap-2 pointer-events-auto">
                <button onClick={() => handleSendMessage("Hospitals near me")} className="bg-[#E53E3E] text-white px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-1.5 hover:bg-[#C53030] shadow-md transition-all active:scale-95 uppercase tracking-tighter">
                  <Activity className="w-3.5 h-3.5" /> Medical
                </button>
                <button onClick={() => handleSendMessage("Police stations near me")} className="bg-[#2B6CB0] text-white px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-1.5 hover:bg-[#2C5282] shadow-md transition-all active:scale-95 uppercase tracking-tighter">
                  <Shield className="w-3.5 h-3.5" /> Police
                </button>
              </div>
            </div>
            
            <div ref={mapContainerRef} className="w-full h-full tactical-map" style={{ zIndex: 0 }}></div>
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-theme-surface border border-theme px-5 py-2.5 rounded-full text-[10px] font-black tracking-widest shadow-xl z-20 flex items-center gap-2.5 backdrop-blur-sm text-theme-primary uppercase">
              <div className="w-2.5 h-2.5 bg-[var(--brand-primary)] rounded-full animate-pulse" />
              {locationLabel}
            </div>
          </div>

          <div className="bg-theme-surface rounded-3xl border border-theme p-5 shrink-0 shadow-sm relative overflow-hidden">
             {/* Azure Anomaly Overlay */}
            {anomalyDetected && (
              <div className="absolute inset-0 bg-[#E53E3E] z-50 flex items-center justify-center flex-col animate-pulse p-4 text-center">
                <Zap className="w-12 h-12 text-white mb-2" />
                <h3 className="text-white font-black uppercase text-lg">Unusual Risk Pattern Detected</h3>
                <p className="text-white/80 text-xs">Azure Cognitive Services has identified a safety anomaly.</p>
              </div>
            )}
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-theme-secondary uppercase tracking-widest">Wellbeing Monitor</h3>
              <div className="flex items-center gap-1 text-[10px] text-[var(--accent)] font-bold">
                <Zap className="w-3 h-3" /> Azure AI Active
              </div>
            </div>
            <div className="flex gap-2 mb-4">
              {riskLevel > 50 && <span className="text-[10px] bg-[#E53E3E] text-white px-3 py-1 rounded-full font-black uppercase animate-pulse shadow-md tracking-tighter">High Stress</span>}
              <span className="text-[10px] bg-[var(--brand-primary)] bg-opacity-10 text-[var(--brand-primary)] border border-[var(--brand-primary)] border-opacity-20 px-3 py-1 rounded-full font-black uppercase tracking-tighter">Analysis Active</span>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                {[
                  { label: 'Panic', color: 'bg-[#ECC94B]', val: riskLevel > 40 ? '88%' : '12%' },
                  { label: 'Pain', color: 'bg-[#E53E3E]', val: riskLevel > 60 ? '75%' : '08%' },
                  { label: 'Focus', color: 'bg-[#4299E1]', val: riskLevel > 20 ? '92%' : '44%' }
                ].map(stat => (
                  <div key={stat.label} className="flex items-center justify-between">
                    <span className="text-[10px] text-theme-secondary font-black uppercase tracking-tight">{stat.label}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden border border-theme">
                        <div className={`h-full ${stat.color} transition-all duration-1000 ease-out`} style={{width: stat.val}} />
                      </div>
                      <span className="text-[9px] text-theme-primary font-black font-mono w-8">{stat.val}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center justify-center border-l border-theme pl-2">
                <p className="text-[10px] text-theme-secondary uppercase font-black mb-1 tracking-widest">Silence</p>
                <div className="text-3xl font-mono font-black text-theme-primary">{silenceDuration}s</div>
                {silenceDuration > 30 && <p className="text-[9px] text-[#E53E3E] mt-1 uppercase font-black animate-pulse">Alert</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Medical & Circle */}
        <div className="col-span-12 md:col-span-3 flex flex-col gap-4 overflow-hidden">
          <div className="bg-theme-surface rounded-3xl border border-theme p-5 relative shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-black text-theme-primary flex items-center gap-2 uppercase tracking-widest">
                <Heart className="w-4 h-4 text-[#E53E3E]" /> Medical ID
              </h3>
              <button 
                onClick={() => setShowMedicalEdit(true)} 
                className="text-[10px] text-[var(--brand-primary)] hover:text-[var(--brand-hover)] font-black uppercase tracking-tight flex items-center gap-1 transition-colors bg-[var(--bg-primary)] px-3 py-1 rounded-full border border-theme shadow-sm"
              >
                <Edit2 className="w-2.5 h-2.5" /> Edit
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between border-b border-theme pb-3">
                <span className="text-[10px] text-theme-secondary uppercase font-black tracking-tighter">Blood Type</span>
                <span className="text-xs font-black text-theme-primary">{medicalInfo.bloodType}</span>
              </div>
              <div className="flex justify-between border-b border-theme pb-3">
                <span className="text-[10px] text-theme-secondary uppercase font-black tracking-tighter">Allergies</span>
                <span className="text-xs font-black text-theme-primary truncate max-w-[120px]">{medicalInfo.allergies}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-theme-secondary uppercase font-black tracking-tighter">Condition</span>
                <span className="text-xs font-black text-theme-primary truncate max-w-[120px]">{medicalInfo.condition}</span>
              </div>
            </div>

            {showMedicalEdit && (
              <div className="absolute inset-0 bg-theme-surface z-50 p-5 rounded-3xl border border-theme shadow-2xl overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-5">
                  <h4 className="text-xs font-black text-theme-primary uppercase tracking-widest">Update ID</h4>
                  <button onClick={() => setShowMedicalEdit(false)} className="text-theme-secondary hover:text-[var(--brand-primary)] transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                  {['bloodType', 'allergies', 'condition'].map((field) => (
                    <input 
                      key={field}
                      className="w-full bg-[var(--bg-primary)] p-3 rounded-xl text-xs border border-theme text-theme-primary focus:outline-none focus:border-[var(--brand-primary)] transition-colors font-medium capitalize"
                      placeholder={field}
                      value={(medicalInfo as any)[field]}
                      onChange={(e) => setMedicalInfo({...medicalInfo, [field]: e.target.value})}
                    />
                  ))}
                  <button 
                    onClick={() => setShowMedicalEdit(false)}
                    className="w-full bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white py-3 rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg mt-2 mb-2"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-theme-surface rounded-3xl border border-theme p-5 overflow-hidden min-h-[160px] relative shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-black text-theme-primary flex items-center gap-2 uppercase tracking-widest">
                <Users className="w-4 h-4 text-[var(--brand-primary)]" /> Trusted Circle
              </h3>
              {contacts.length < 3 && (
                <button onClick={() => setShowContactAdd(true)} className="text-[var(--brand-primary)] hover:text-[var(--brand-hover)] transition-colors p-1.5 bg-[var(--brand-primary)] bg-opacity-10 rounded-xl shadow-sm border border-[var(--brand-primary)] border-opacity-20">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="space-y-3">
              {contacts.length === 0 ? (
                <div className="flex items-center gap-4 opacity-60">
                  <div className="w-12 h-12 bg-[var(--bg-primary)] rounded-full flex items-center justify-center border border-theme">
                    <User className="w-6 h-6 text-theme-secondary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-theme-secondary font-black italic tracking-tighter uppercase">No Contacts</p>
                    <button onClick={() => setShowContactAdd(true)} className="text-[10px] text-[var(--brand-primary)] font-black uppercase tracking-widest hover:underline">Add Family</button>
                  </div>
                </div>
              ) : (
                contacts.map(contact => (
                  <div key={contact.id} className="flex items-center justify-between bg-[var(--bg-primary)] p-3 rounded-2xl border border-theme hover:border-[var(--brand-primary)] transition-all group shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center border border-theme">
                        {contact.type === 'email' ? <Mail className="w-4 h-4 text-[var(--brand-primary)]" /> : <MessageSquare className="w-4 h-4 text-[var(--brand-primary)]" />}
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-theme-primary uppercase truncate max-w-[80px]">{contact.name}</p>
                        <p className="text-[9px] text-theme-secondary font-mono font-black tracking-tight">{contact.value}</p>
                      </div>
                    </div>
                    <button onClick={() => removeContact(contact.id)} className="text-theme-secondary hover:text-[#E53E3E] transition-colors p-1 opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {showContactAdd && (
              <div className="absolute inset-0 bg-theme-surface z-50 p-5 rounded-3xl border border-theme shadow-2xl overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-black text-theme-primary uppercase tracking-widest">Add Family</h4>
                  <button onClick={() => setShowContactAdd(false)} className="text-theme-secondary hover:text-[#E53E3E] p-1"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2 mb-2">
                    {['phone', 'email'].map(t => (
                      <button 
                        key={t}
                        onClick={() => setNewContact({...newContact, type: t as any})}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${newContact.type === t ? 'bg-[var(--brand-primary)] text-white shadow-md' : 'bg-[var(--bg-primary)] text-theme-secondary border border-theme'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input 
                    className="w-full bg-[var(--bg-primary)] p-3 rounded-xl text-xs border border-theme text-theme-primary focus:outline-none focus:border-[var(--brand-primary)] transition-colors font-medium"
                    placeholder="Full Name"
                    value={newContact.name}
                    onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                  />
                  <input 
                    className="w-full bg-[var(--bg-primary)] p-3 rounded-xl text-xs border border-theme text-theme-primary focus:outline-none focus:border-[var(--brand-primary)] transition-colors font-medium"
                    placeholder={newContact.type === 'phone' ? "+1 234..." : "email@..."}
                    value={newContact.value}
                    onChange={(e) => setNewContact({...newContact, value: e.target.value})}
                  />
                  <button 
                    onClick={addContact}
                    className="w-full bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white py-3 rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg mt-2 mb-2"
                  >
                    Add to Circle
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 bg-theme-surface rounded-3xl border border-theme p-5 flex flex-col shadow-sm">
            <h3 className="text-xs font-black text-theme-secondary uppercase mb-5 tracking-widest bg-[var(--bg-secondary)] inline-block p-1.5 rounded-lg border border-theme">Risk Trend</h3>
            <div className="flex-1 -mx-4 relative min-h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={riskTrend}>
                  <Line type="monotone" dataKey="risk" stroke={riskLevel > 50 ? "#E53E3E" : "var(--brand-primary)"} strokeWidth={4} dot={false} isAnimationActive={true} />
                  <YAxis hide domain={[0, 100]} />
                  <XAxis hide />
                  <Tooltip 
                    contentStyle={{backgroundColor: 'var(--surface)', border: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-primary)', borderRadius: '12px'}}
                    itemStyle={{color: 'var(--brand-primary)', fontWeight: '900'}}
                  />
                </LineChart>
              </ResponsiveContainer>
              {riskLevel > 70 && <div className="absolute inset-0 bg-[#E53E3E] bg-opacity-5 animate-pulse pointer-events-none" />}
            </div>
          </div>
        </div>

      </main>

      {/* SOS Primary FAB */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-5 items-end pointer-events-none">
        {riskLevel > 70 && (
          <div className="bg-[#E53E3E] text-white text-[10px] font-black px-5 py-3 rounded-2xl shadow-2xl animate-bounce text-center max-w-[240px] border border-white/20 pointer-events-auto uppercase tracking-tighter leading-tight">
            Distress Detected. Family Alert Mode.
          </div>
        )}
        
        <button 
          onClick={handleQuickSOS}
          className="bg-[#E53E3E] hover:bg-[#C53030] text-white p-6 rounded-full shadow-2xl flex items-center gap-3 transition-all active:scale-90 group border-4 border-white pointer-events-auto"
        >
          <AlertCircle className="w-8 h-8 group-hover:rotate-12 transition-transform duration-300" />
          <span className="font-black text-xl pr-3 tracking-tighter uppercase">QUICK SOS</span>
        </button>
      </div>
    </div>
  );
};

export default App;
