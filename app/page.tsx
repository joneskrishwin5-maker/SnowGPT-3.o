"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = { id: string; role: "user" | "assistant"; content: string; };
type ChatSession = { id: string; title: string; messages: Message[]; updatedAt: number; mode?: "normal" | "esp32" | "arduino" | "voice" };

const EditableCodeBlock = ({ initialCode, language, isDarkMode, isFlashing, onFlash, currentMode }: any) => {
  const [code, setCode] = useState(initialCode);
  const isCpp = language === 'cpp' || language === 'c' || language === 'arduino';

  return (
    <div className={`rounded-xl my-4 overflow-hidden border shadow-sm ${isDarkMode ? 'bg-[#18181B] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
      <div className={`px-4 py-2 text-xs font-mono flex items-center justify-between ${isDarkMode ? 'bg-[#27272A] text-zinc-400' : 'bg-zinc-200/70 text-zinc-600'}`}>
        <span>{language}</span>
        {isCpp && (
          <button 
            onClick={() => onFlash(code, currentMode)} 
            disabled={isFlashing}
            className={`px-3 py-1.5 rounded-md font-sans font-semibold text-xs transition-colors flex items-center gap-1.5 ${isFlashing ? 'bg-sky-500/50 text-white cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-400 text-black shadow-sm'}`}
          >
            {isFlashing ? "Working..." : "Flash to Board"}
          </button>
        )}
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className={`w-full bg-transparent p-4 font-mono text-sm outline-none resize-y whitespace-pre min-h-[150px] ${isDarkMode ? 'text-sky-100' : 'text-zinc-800'}`}
        rows={Math.max(5, Math.min(code.split('\n').length + 1, 30))}
        spellCheck={false}
      />
    </div>
  );
};

export default function ChatPage() {
  const [isMounted, setIsMounted] = useState(false);

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<"normal" | "esp32" | "arduino" | "voice">("normal");

  const [isVoiceActive, setIsVoiceActive] = useState(false); 
  const [isListening, setIsListening] = useState(false); 
  const [isSpeaking, setIsSpeaking] = useState(false); 
  const [isDictating, setIsDictating] = useState(false); 
  const recognitionRef = useRef<any>(null);

  const activeModeRef = useRef(activeMode);
  const isVoiceActiveRef = useRef(false);
  const isLoadingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isDictatingRef = useRef(false);
  const currentChatIdRef = useRef(currentChatId);
  const messagesRef = useRef(messages);

  const [isSerialOpen, setIsSerialOpen] = useState(false);
  const [serialLogs, setSerialLogs] = useState<string>("");
  const [serialPort, setSerialPort] = useState<any>(null);
  const [serialReader, setSerialReader] = useState<any>(null);
  const keepReadingRef = useRef(false);
  const serialEndRef = useRef<HTMLDivElement>(null);

  const [isFlashing, setIsFlashing] = useState(false);
  const [showFlashModal, setShowFlashModal] = useState(false);
  const [flashLogs, setFlashLogs] = useState<string>("");
  const [arduinoFirmware, setArduinoFirmware] = useState<ArrayBuffer | null>(null);
  const flashEndRef = useRef<HTMLDivElement>(null);

  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [profilePic, setProfilePic] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  useEffect(() => { isVoiceActiveRef.current = isVoiceActive; }, [isVoiceActive]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { isDictatingRef.current = isDictating; }, [isDictating]);
  useEffect(() => { currentChatIdRef.current = currentChatId; }, [currentChatId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    setIsMounted(true); 
    try {
      const savedTheme = localStorage.getItem("snowgpt_theme");
      if (savedTheme === "light") setIsDarkMode(false);
      const savedName = localStorage.getItem("snowgpt_name");
      const savedPic = localStorage.getItem("snowgpt_pic");
      if (savedName) setUserName(savedName);
      if (savedPic) setProfilePic(savedPic);
      
      const savedChats = localStorage.getItem("snowgpt_chats");
      if (savedChats) setChatSessions(JSON.parse(savedChats));
    } catch (err) { console.warn("Storage error:", err); }
  }, []);

  useEffect(() => { if (isMounted) localStorage.setItem("snowgpt_chats", JSON.stringify(chatSessions)); }, [chatSessions, isMounted]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);
  useEffect(() => { serialEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [serialLogs, isSerialOpen]);
  useEffect(() => { flashEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [flashLogs]);
  useEffect(() => { if (activeMode !== 'voice') stopVoiceSession(); }, [activeMode]);

  // Prevent UI rendering until safe to avoid freeze bugs
  if (!isMounted) return <div className="h-screen w-full bg-[#0E0E10]"></div>;

  // ==========================================
  // LAZY LOADED VOICE LOGIC
  // ==========================================

  function initSpeechRecognition() {
    if (recognitionRef.current) return recognitionRef.current;
    if (typeof window === "undefined") return null;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; 
      recognition.interimResults = false;
      recognition.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          if (activeModeRef.current === 'voice') {
            setIsListening(false);
            try { recognition.stop(); } catch(e){}
            handleSendMessage(transcript);
          } else if (isDictatingRef.current) {
            setInput((prev) => prev + (prev ? " " : "") + transcript);
            setIsDictating(false);
            try { recognition.stop(); } catch(e){}
          }
        }
      };

      recognition.onerror = () => { setIsListening(false); setIsDictating(false); };
      
      recognition.onend = () => {
        if (activeModeRef.current === 'voice') {
          setIsListening(false);
          if (isVoiceActiveRef.current && !isLoadingRef.current && !isSpeakingRef.current) {
            setTimeout(() => {
              if (isVoiceActiveRef.current && !isLoadingRef.current && !isSpeakingRef.current) {
                try { recognition.start(); setIsListening(true); } catch(e){}
              }
            }, 300);
          }
        } else {
          setIsDictating(false);
        }
      };
      
      recognitionRef.current = recognition;
      return recognition;
    } catch (err) {
      return null;
    }
  }

  function toggleDictation() {
    const recognition = initSpeechRecognition();
    if (!recognition) {
      alert("Speech API blocked. You must use HTTPS or add this IP to chrome://flags 'Insecure origins treated as secure'.");
      return;
    }
    if (isDictating) {
      try { recognition.stop(); } catch(e){}
      setIsDictating(false);
    } else {
      stopSpeaking();
      try { recognition.start(); setIsDictating(true); } catch (err) { setIsDictating(false); }
    }
  }

  function startVoiceSession() {
    const recognition = initSpeechRecognition();
    if (!recognition) { alert("Speech API blocked. You must allow microphone access."); return; }
    setIsVoiceActive(true); isVoiceActiveRef.current = true; startListening();
  }

  function stopVoiceSession() { setIsVoiceActive(false); isVoiceActiveRef.current = false; stopListening(); stopSpeaking(); }

  function toggleVoicePause() {
    if (isVoiceActive) { setIsVoiceActive(false); isVoiceActiveRef.current = false; stopListening(); stopSpeaking(); } 
    else { setIsVoiceActive(true); isVoiceActiveRef.current = true; startListening(); }
  }

  function startListening() {
    const recognition = initSpeechRecognition();
    if (!recognition) return;
    stopSpeaking();
    try { recognition.start(); setIsListening(true); } catch (err) {}
  }

  function stopListening() { if (recognitionRef.current) { try { recognitionRef.current.stop(); setIsListening(false); } catch (err) {} } }

  function speakText(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const cleanText = text.replace(/```[\s\S]*?```/g, "Code block omitted.").replace(/`([^`]+)`/g, "$1").replace(/[#*_~>]/g, "").trim();
    if (!cleanText) { if (isVoiceActiveRef.current && activeModeRef.current === 'voice') startListening(); return; }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 0.85; 
    
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('David') || v.name.includes('Male') || v.name.includes('Daniel')) || voices.find(v => v.name.includes('Google')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => { setIsSpeaking(true); isSpeakingRef.current = true; };
    utterance.onend = () => {
      setIsSpeaking(false); isSpeakingRef.current = false;
      if (isVoiceActiveRef.current && activeModeRef.current === 'voice') startListening();
    };
    utterance.onerror = () => {
      setIsSpeaking(false); isSpeakingRef.current = false;
      if (isVoiceActiveRef.current && activeModeRef.current === 'voice') startListening();
    };
    setTimeout(() => { window.speechSynthesis.speak(utterance); }, 50);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) { window.speechSynthesis.cancel(); setIsSpeaking(false); isSpeakingRef.current = false; }
  }

  // ==========================================
  // HARDWARE CONTROLS
  // ==========================================
  async function closeSerial() {
    keepReadingRef.current = false;
    if (serialReader) { try { await serialReader.cancel(); } catch (e) {} setSerialReader(null); }
    if (serialPort) { try { await serialPort.close(); } catch (e) {} setSerialPort(null); }
    setIsSerialOpen(false); setSerialLogs((prev) => prev + "\n[SYSTEM] Disconnected.\n");
  }

  async function toggleSerialMonitor() {
    if (isSerialOpen) { await closeSerial(); } else {
      if (typeof navigator === "undefined" || !("serial" in navigator)) { alert("Web Serial API is not supported in this browser."); return; }
      try {
        const port = await (navigator as any).serial.requestPort(); await port.open({ baudRate: 115200 });
        setSerialPort(port); setIsSerialOpen(true); keepReadingRef.current = true; setSerialLogs("[SYSTEM] Connected to COM port...\n");
        const reader = port.readable.getReader(); setSerialReader(reader); const decoder = new TextDecoder("utf-8");
        try { while (keepReadingRef.current) { const { value, done } = await reader.read(); if (done) break; setSerialLogs((prev) => prev + decoder.decode(value)); } } catch (err) {} finally { reader.releaseLock(); }
      } catch (err: any) { setSerialLogs((prev) => prev + `\n[SYSTEM] Error: ${err.message}\n`); setIsSerialOpen(false); }
    }
  }

  async function executeArduinoFlash() {
    if (!arduinoFirmware) return;
    setFlashLogs((prev) => prev + "\nDownloading Arduino AVR web tools...\n");
    try {
      if (!(window as any).Avrgirl) {
        await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://unpkg.com/avrgirl-arduino@5.0.0/dist/avrgirl-arduino.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
      }
      const Avrgirl = (window as any).Avrgirl; const avrgirl = new Avrgirl({ board: 'uno', debug: true });
      setFlashLogs((prev) => prev + "Please select your Arduino from the browser popup...\n");
      avrgirl.flash(arduinoFirmware, (error: any) => {
        if (error) setFlashLogs((prev) => prev + `\nCritical Error: ${error.message}\n`);
        else setFlashLogs((prev) => prev + "\n[SUCCESS] Arduino Flashing complete! Board is restarting.\n👉 Close this window and check the Serial Monitor!\n");
        setArduinoFirmware(null); setIsFlashing(false);
      });
    } catch (err: any) { setFlashLogs((prev) => prev + `\nError: ${err.message}\n`); setArduinoFirmware(null); setIsFlashing(false); }
  }

  async function handleFlashCode(codeToFlash: string, modeToFlash: string) {
    if (typeof navigator === "undefined" || !("serial" in navigator)) { alert("Web Serial API is not supported in this browser."); return; }
    if (isSerialOpen) { await closeSerial(); await new Promise(resolve => setTimeout(resolve, 1000)); }
    let espPort: any = null;
    if (modeToFlash === 'esp32') { try { espPort = await (navigator as any).serial.requestPort(); } catch (err) { return; } }
    setShowFlashModal(true); setFlashLogs("Requesting cloud compilation...\n"); setIsFlashing(true);
    let transport: any = null;
    try {
      const res = await fetch("/api/flash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: codeToFlash, mode: modeToFlash }) });
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || "Cloud compilation failed."); }
      const firmwareBuffer = await res.arrayBuffer();
      setFlashLogs((prev) => prev + `[SUCCESS] Compilation complete! Firmware size: ${firmwareBuffer.byteLength} bytes.\n`);
      if (modeToFlash === 'arduino') { setArduinoFirmware(firmwareBuffer); return; }
      const { ESPLoader, Transport } = await import("esptool-js");
      transport = new Transport(espPort, true);
      const loaderOptions = { transport, baudrate: 115200, terminal: { clean() {}, writeLine(data: string) { setFlashLogs((prev) => prev + data + "\n"); }, write(data: string) { setFlashLogs((prev) => prev + data); } } };
      setFlashLogs((prev) => prev + "\nConnecting to ESP32 Bootloader...\n");
      const loader = new ESPLoader(loaderOptions); await loader.main();
      setFlashLogs((prev) => prev + "\nErasing flash and writing new firmware...\n");
      let lastProgress = 0;
      await loader.writeFlash({
        fileArray: [{ data: new Uint8Array(firmwareBuffer), address: 0x10000 }], flashSize: "keep", eraseAll: false, compress: true,
        reportProgress: (fileIndex: number, written: number, total: number) => { const progress = Math.round((written / total) * 100); if (progress > lastProgress + 10 || progress === 100) { setFlashLogs((prev) => prev + `Progress: ${progress}%\n`); lastProgress = progress; } }
      } as any);
      setFlashLogs((prev) => prev + "\n[SUCCESS] Flashing complete! Board is restarting.\n👉 Close this window and click 'Serial Monitor' to see your code working!\n");
    } catch (err: any) { setFlashLogs((prev) => prev + `\nCritical Error: ${err.message}\n`); } 
    finally { if (modeToFlash === 'esp32') { if (transport) { try { await transport.disconnect(); } catch (e) {} } else if (espPort) { try { await espPort.close(); } catch (e) {} } setIsFlashing(false); } }
  }

  function toggleTheme() { setIsDarkMode(!isDarkMode); localStorage.setItem("snowgpt_theme", !isDarkMode ? "dark" : "light"); }
  function saveProfile() { localStorage.setItem("snowgpt_name", userName); localStorage.setItem("snowgpt_pic", profilePic); setIsProfileOpen(false); }
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setProfilePic(reader.result as string); reader.readAsDataURL(file); } }
  
  function startNewChat(mode: "normal" | "esp32" | "arduino" | "voice" = "normal") { 
    setCurrentChatId(""); setMessages([]); setOpenMenuId(null); setActiveMode(mode); setIsMobileDrawerOpen(false); stopSpeaking(); if (isSerialOpen) closeSerial();
  }
  
  function loadChat(chatId: string) { 
    const chat = chatSessions.find((c) => c.id === chatId); 
    if (chat) { setCurrentChatId(chat.id); setMessages(chat.messages); setActiveMode(chat.mode || "normal"); setOpenMenuId(null); setIsMobileDrawerOpen(false); stopSpeaking(); if (chat.mode === 'normal' && isSerialOpen) closeSerial(); } 
  }
  
  function deleteChat(e: React.MouseEvent, chatId: string) { 
    e.stopPropagation(); const updatedSessions = chatSessions.filter((c) => c.id !== chatId); setChatSessions(updatedSessions); 
    if (currentChatId === chatId || updatedSessions.length === 0) startNewChat("normal"); setOpenMenuId(null); 
  }

  // FIX: Explicitly typed 'mode' as the literal union type
  async function triggerApiCall(chatId: string, currentMsgs: Message[], firstInput: string, mode: "normal" | "esp32" | "arduino" | "voice") {
    updateChatHistory(chatId, currentMsgs, firstInput, mode);
    try {
      const formData = new FormData(); formData.append("messages", JSON.stringify(currentMsgs)); formData.append("mode", mode); 
      const res = await fetch("/api/chat", { method: "POST", body: formData }); const data = await res.json();
      const aiResponseText = data.text || "Empty response from model.";
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: aiResponseText };
      
      setMessages((prev) => {
        const finalMsgs = [...prev, aiMsg];
        updateChatHistory(chatId, finalMsgs, firstInput, mode);
        return finalMsgs;
      });
      
      setIsLoading(false); isLoadingRef.current = false;
      if (mode === 'voice') speakText(aiResponseText);
    } catch (error: any) {
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: `System Alert: ${error.message}` }]);
      setIsLoading(false); isLoadingRef.current = false;
      if (isVoiceActiveRef.current && mode === 'voice') startListening();
    }
  }

  function handleSendMessage(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoadingRef.current) return;
    
    let activeChatId = currentChatIdRef.current; 
    if (!activeChatId) { 
      activeChatId = Date.now().toString(); setCurrentChatId(activeChatId); currentChatIdRef.current = activeChatId; 
    }
    
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: trimmed };
    const updatedArray = [...messagesRef.current, userMsg]; 
    
    setMessages(updatedArray); setInput(""); setIsLoading(true); isLoadingRef.current = true;
    triggerApiCall(activeChatId, updatedArray, trimmed, activeModeRef.current);
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); handleSendMessage(input); }

  function updateChatHistory(id: string, msgs: Message[], firstInput: string, currentMode: "normal" | "esp32" | "arduino" | "voice") {
    setChatSessions((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === id);
      const updatedChat = { id, title: prev[existingIdx]?.title || firstInput.slice(0, 30) + (firstInput.length > 30 ? "..." : ""), messages: msgs, updatedAt: Date.now(), mode: currentMode };
      if (existingIdx !== -1) { const newHistory = [...prev]; newHistory[existingIdx] = updatedChat; return newHistory.sort((a, b) => b.updatedAt - a.updatedAt); } 
      else { return [updatedChat, ...prev].sort((a, b) => b.updatedAt - a.updatedAt); }
    });
  }

  const renderNavLinks = () => (
    <div className="px-3 space-y-2">
      <button onClick={() => startNewChat("normal")} className={`flex items-center gap-3 rounded-2xl font-medium transition-all w-full px-4 py-3 text-sm ${activeMode === 'normal' && !currentChatId ? (isDarkMode ? 'bg-[#27272a] text-sky-400' : 'bg-blue-50 text-sky-600') : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200' : 'text-zinc-600 hover:bg-zinc-200/50')}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> <span className="whitespace-nowrap">Chat</span>
      </button>
      <button onClick={() => startNewChat("voice")} className={`flex items-center gap-3 rounded-2xl font-medium transition-all w-full px-4 py-3 text-sm ${activeMode === 'voice' && !currentChatId ? (isDarkMode ? 'bg-[#27272a] text-sky-400' : 'bg-blue-50 text-sky-600') : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200' : 'text-zinc-600 hover:bg-zinc-200/50')}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg> <span className="whitespace-nowrap">Speak Chat</span>
      </button>
      <button onClick={() => startNewChat("esp32")} className={`flex items-center gap-3 rounded-2xl font-medium transition-all w-full px-4 py-3 text-sm ${activeMode === 'esp32' && !currentChatId ? (isDarkMode ? 'bg-[#27272a] text-sky-400' : 'bg-blue-50 text-sky-600') : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200' : 'text-zinc-600 hover:bg-zinc-200/50')}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="16" height="16" x="4" y="4" rx="2" ry="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg> <span className="whitespace-nowrap">ESP32 Workshop</span>
      </button>
      <button onClick={() => startNewChat("arduino")} className={`flex items-center gap-3 rounded-2xl font-medium transition-all w-full px-4 py-3 text-sm ${activeMode === 'arduino' && !currentChatId ? (isDarkMode ? 'bg-[#27272a] text-sky-400' : 'bg-blue-50 text-sky-600') : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200' : 'text-zinc-600 hover:bg-zinc-200/50')}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg> <span className="whitespace-nowrap">Arduino Workshop</span>
      </button>
    </div>
  );

  return (
    <div className={`flex h-[100dvh] w-full font-sans overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-[#0E0E10] text-white' : 'bg-[#FAFAFA] text-zinc-900'}`}>
      
      {/* 1. MOBILE DRAWER */}
      {isMobileDrawerOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity" onClick={() => setIsMobileDrawerOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col md:hidden transform transition-transform duration-300 ease-in-out border-r shadow-2xl ${isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'} ${isDarkMode ? 'bg-[#18181B] border-zinc-800' : 'bg-white border-zinc-200'}`}>
        <div className="flex items-center justify-between h-16 px-4 shrink-0 border-b border-zinc-800/30">
          <div className="flex items-center gap-3">
            <img src="/snow-logo.png" alt="Logo" className="h-7 w-7 rounded-full object-cover bg-white shrink-0 shadow-sm" />
            <span className={`text-base font-semibold tracking-wide ${isDarkMode ? 'text-zinc-100' : 'text-zinc-800'}`}>SnowGPT <span className="text-xs font-normal text-zinc-500">3.o</span></span>
          </div>
          <button onClick={() => setIsMobileDrawerOpen(false)} className={`p-2 rounded-lg ${isDarkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}>✕</button>
        </div>
        <div className="mt-3">{renderNavLinks()}</div>
        <div className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar mt-2 border-t border-zinc-800/30">
          <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Recent</div>
          <div className="flex flex-col gap-1 mt-1">
            {chatSessions.map((chat) => (
              <div key={chat.id} className="relative group flex items-center">
                <button onClick={() => loadChat(chat.id)} className={`flex-1 text-left px-3.5 py-2 rounded-xl text-sm truncate transition pr-8 ${currentChatId === chat.id ? (isDarkMode ? "bg-zinc-800 text-sky-400 font-medium" : "bg-zinc-200 text-sky-600 font-medium") : (isDarkMode ? "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200" : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900")}`}>{chat.title}</button>
                <button onClick={(e) => deleteChat(e, chat.id)} className="absolute right-2 p-1 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. DESKTOP SIDEBAR */}
      <div className={`hidden md:flex border-r flex-col transition-all duration-300 ease-in-out shrink-0 ${isSidebarOpen ? 'w-64' : 'w-[80px]'} ${isDarkMode ? 'bg-[#18181B] border-zinc-800' : 'bg-[#F4F4F5] border-zinc-200'}`}>
        {isSidebarOpen ? (
          <div className="flex items-center justify-between h-16 px-4 shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
              <img src="/snow-logo.png" alt="Logo" className="h-7 w-7 rounded-full object-cover bg-white shrink-0 shadow-sm" />
              <span className={`text-base font-semibold tracking-wide whitespace-nowrap ${isDarkMode ? 'text-zinc-100' : 'text-zinc-800'}`}>SnowGPT <span className="text-xs font-normal text-zinc-500">3.o</span></span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className={`p-2 rounded-lg transition-colors shrink-0 ${isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-5 pb-3 shrink-0">
            <div className="relative group cursor-pointer" onClick={() => setIsSidebarOpen(true)}>
               <div className="absolute inset-0 bg-sky-500 blur-md opacity-20 rounded-full group-hover:opacity-40 transition-opacity"></div>
               <img src="/snow-logo.png" alt="Logo" className="relative h-9 w-9 rounded-full object-cover bg-white shrink-0 border border-zinc-700/30" />
            </div>
          </div>
        )}
        <div className={`mt-2 ${!isSidebarOpen ? 'flex flex-col items-center' : ''}`}>
          {isSidebarOpen ? renderNavLinks() : (
            <div className="flex flex-col items-center space-y-2">
              <button onClick={() => startNewChat("normal")} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeMode === 'normal' && !currentChatId ? 'bg-[#27272a] text-sky-400' : 'text-zinc-400 hover:bg-zinc-800/50'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
              <button onClick={() => startNewChat("voice")} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeMode === 'voice' && !currentChatId ? 'bg-[#27272a] text-sky-400' : 'text-zinc-400 hover:bg-zinc-800/50'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg></button>
              <button onClick={() => startNewChat("esp32")} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeMode === 'esp32' && !currentChatId ? 'bg-[#27272a] text-sky-400' : 'text-zinc-400 hover:bg-zinc-800/50'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="16" height="16" x="4" y="4" rx="2" ry="2"/></svg></button>
              <button onClick={() => startNewChat("arduino")} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeMode === 'arduino' && !currentChatId ? 'bg-[#27272a] text-sky-400' : 'text-zinc-400 hover:bg-zinc-800/50'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg></button>
            </div>
          )}
        </div>
        <div className={`flex-1 overflow-y-auto px-3 py-3 custom-scrollbar mt-2 border-t border-transparent transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 invisible hidden'}`}>
          <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Recent</div>
          <div className="flex flex-col gap-1 mt-1">
            {chatSessions.map((chat) => (
              <div key={chat.id} className="relative group flex items-center">
                <button onClick={() => loadChat(chat.id)} className={`flex-1 text-left px-3.5 py-2 rounded-xl text-sm truncate transition pr-8 ${currentChatId === chat.id ? (isDarkMode ? "bg-zinc-800 text-sky-400 font-medium" : "bg-white shadow-sm text-sky-600 font-medium") : (isDarkMode ? "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200" : "text-zinc-600 hover:bg-white/60 hover:text-zinc-900")}`}>{chat.title}</button>
                <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === chat.id ? null : chat.id); }} className={`absolute right-2 p-1 rounded-md transition-opacity duration-200 ${openMenuId === chat.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${isDarkMode ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700" : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200"}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>
                {openMenuId === chat.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }}></div>
                    <div className={`absolute right-0 top-9 z-50 w-36 rounded-xl shadow-lg border p-1 ${isDarkMode ? 'bg-[#27272A] border-zinc-700' : 'bg-white border-zinc-200'}`}>
                      <button onClick={(e) => deleteChat(e, chat.id)} className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${isDarkMode ? 'text-red-400 hover:bg-zinc-700/50' : 'text-red-600 hover:bg-red-50'}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg> Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. MAIN AREA */}
      <div className={`flex flex-1 flex-col h-full relative transition-colors duration-300 overflow-hidden ${isDarkMode ? 'bg-[#0E0E10]' : 'bg-white'}`}>
        
        {activeMode === 'voice' && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full mix-blend-screen filter blur-[120px] opacity-30 ${isSpeaking ? 'bg-purple-600' : isListening ? 'bg-sky-600' : 'bg-transparent'} transition-colors duration-1000`}></div>
            <div className={`absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full mix-blend-screen filter blur-[120px] opacity-30 ${isSpeaking ? 'bg-pink-600' : isListening ? 'bg-cyan-600' : 'bg-transparent'} transition-colors duration-1000`}></div>
          </div>
        )}

        {/* Universal Header */}
        <div className={`relative z-20 flex items-center justify-between px-4 sm:px-6 py-3 border-b transition-colors duration-300 ${isDarkMode ? 'border-zinc-800/50 bg-[#0E0E10]' : 'border-zinc-100 bg-[#FAFAFA]'}`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileDrawerOpen(true)} className="md:hidden flex items-center justify-center h-9 w-9 rounded-full border border-zinc-700/50 bg-zinc-800/80 p-1 shadow-sm active:scale-95 transition">
              <img src="/snow-logo.png" alt="Snow" className="h-full w-full rounded-full object-cover" />
            </button>
            <h1 className={`text-base font-medium tracking-wide ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {activeMode === 'esp32' ? 'ESP32 Workshop' : activeMode === 'arduino' ? 'Arduino Workshop' : activeMode === 'voice' ? 'Speak Chat' : 'Chat'}
            </h1>
          </div>
          
          <div className="flex items-center gap-2.5">
            {(activeMode === 'esp32' || activeMode === 'arduino') && (
              <button onClick={toggleSerialMonitor} className={`h-8 px-3 rounded-full flex items-center gap-2 transition-colors border text-xs font-medium ${isSerialOpen ? 'bg-sky-500 border-sky-400 text-black' : isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-sky-400' : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:text-sky-500'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg> {isSerialOpen ? "COM Active" : "Serial Monitor"}
              </button>
            )}
            <button onClick={toggleTheme} className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors border ${isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-sky-400' : 'bg-white border-zinc-200 text-zinc-500 hover:text-sky-500 shadow-sm'}`}>
              {isDarkMode ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>}
            </button>
            <button onClick={() => setIsProfileOpen(true)} className={`h-8 w-8 rounded-full overflow-hidden border transition flex items-center justify-center ${isDarkMode ? 'border-zinc-700 hover:border-sky-400 bg-zinc-800' : 'border-zinc-300 hover:border-sky-500 bg-zinc-100 shadow-sm'}`}>
              {profilePic ? <img src={profilePic} alt="Profile" className="h-full w-full object-cover" /> : <span className={`text-xs font-semibold ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>{userName ? userName.charAt(0).toUpperCase() : "U"}</span>}
            </button>
          </div>
        </div>

        {/* CHAT HISTORY */}
        <div className={`relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar ${activeMode === 'voice' ? (isDarkMode ? 'bg-gradient-to-b from-transparent to-[#141417]/50' : 'bg-gradient-to-b from-transparent to-zinc-50/50') : ''}`}>
          <div className={`max-w-4xl mx-auto flex flex-col gap-6 h-full ${activeMode === 'voice' ? 'pb-44 sm:pb-48' : 'pb-20'}`}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full pb-20">
                <img src="/snow-logo.png" alt="SnowGPT" className={`h-16 w-16 rounded-full object-cover p-1 mb-4 border ${isDarkMode ? 'bg-white border-zinc-700' : 'bg-white border-zinc-200 shadow-md'}`} />
                <h2 className={`text-2xl font-medium mb-1 ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  {activeMode === 'esp32' ? 'ESP32 Workshop' : activeMode === 'arduino' ? 'Arduino Workshop' : activeMode === 'voice' ? 'Speak Chat' : 'Chat'}
                </h2>
                <p className={`text-sm text-center px-4 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  {activeMode === 'voice' ? 'Enjoy a continuous, hands-free conversation with SnowGPT.' : activeMode === 'esp32' || activeMode === 'arduino' ? 'Generate, edit, and flash modern C++ sketches to your board.' : 'How can SnowGPT assist you today?'}
                </p>
              </div>
            )}
            
            {messages.map((m) => (
              <div key={m.id} className={`flex w-full gap-4 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role !== "user" ? (
                  <div className="flex gap-3 w-full max-w-3xl items-start">
                    <img src="/snow-logo.png" alt="SnowGPT" className={`h-7 w-7 rounded-full object-cover p-0.5 border flex-shrink-0 mt-0.5 ${isDarkMode ? 'bg-white border-zinc-700' : 'bg-white border-zinc-200 shadow-sm'}`} />
                    <div className={`flex-1 text-[15px] leading-relaxed pt-0.5 markdown-body ${isDarkMode ? 'text-zinc-300' : 'text-zinc-800'}`}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || "");
                            const rawCode = String(children).replace(/\n$/, '');
                            return !inline && match ? (
                              <EditableCodeBlock initialCode={rawCode} language={match[1]} isDarkMode={isDarkMode} isFlashing={isFlashing} onFlash={handleFlashCode} currentMode={activeMode} />
                            ) : (
                              <code className={`px-1.5 py-0.5 rounded-md text-[13px] font-mono ${isDarkMode ? 'bg-zinc-800 text-sky-300' : 'bg-zinc-100 text-sky-600'}`} {...props}>{children}</code>
                            );
                          },
                          a: (props: any) => <a className="text-sky-500 hover:underline" {...props} />,
                          p: (props: any) => <p className="mb-3 mt-0 last:mb-0" {...props} />,
                          ul: (props: any) => <ul className="list-disc ml-6 mb-3 mt-0 space-y-1" {...props} />,
                          ol: (props: any) => <ol className="list-decimal ml-6 mb-3 mt-0 space-y-1" {...props} />
                        }}
                      >{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className={`max-w-[75%] px-4 py-2.5 text-[15px] rounded-2xl rounded-tr-sm shadow-sm ${isDarkMode ? 'bg-[#27272A] text-zinc-100' : 'bg-zinc-200/70 text-zinc-900 border border-zinc-200/50'}`}>{m.content}</div>
                )}
              </div>
            ))}
            {isLoading && (
               <div className="flex gap-3 w-full max-w-3xl items-start">
                  <img src="/snow-logo.png" alt="SnowGPT" className={`h-7 w-7 rounded-full object-cover p-0.5 border flex-shrink-0 mt-0.5 animate-pulse ${isDarkMode ? 'bg-white border-zinc-700' : 'bg-white border-zinc-200'}`} />
                  <div className={`text-sm pt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Thinking...</div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* BOTTOM BARS */}
        {activeMode === 'voice' ? (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-lg z-30">
            <div className={`rounded-3xl p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] border backdrop-blur-2xl transition-all ${isDarkMode ? 'bg-[#18181B]/70 border-zinc-700/50' : 'bg-white/80 border-zinc-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]'}`}>
              {!isVoiceActive ? (
                <div className="flex flex-col items-center w-full">
                  <button onClick={startVoiceSession} className="relative flex items-center justify-center w-20 h-20 rounded-full bg-[#0ea5e9] text-white shadow-xl shadow-sky-500/40 hover:scale-105 transition-transform outline-none">
                    <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  </button>
                  <span className={`mt-4 text-[11px] font-bold tracking-widest uppercase ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Tap to Start Conversation</span>
                </div>
              ) : (
                <div className="flex flex-col items-center w-full animate-in fade-in duration-300">
                  <span className={`mb-5 text-[11px] font-bold tracking-widest uppercase transition-colors ${isSpeaking ? 'text-purple-400' : isLoading ? 'text-zinc-400' : isListening ? 'text-sky-500' : 'text-zinc-500'}`}>
                     {isSpeaking ? 'SnowGPT is Speaking...' : isLoading ? 'Thinking...' : isListening ? 'Listening to you...' : 'Paused'}
                  </span>
                  <div className="flex items-center justify-center gap-8 w-full">
                     <button onClick={toggleVoicePause} className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all outline-none ${isVoiceActive ? 'border-amber-400 text-amber-500 hover:bg-amber-400/10' : 'border-emerald-400 text-emerald-500 hover:bg-emerald-400/10'} bg-transparent`}>
                        {isListening || isSpeaking || isLoading ? <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                     </button>
                     <div className="relative flex items-center justify-center w-24 h-24">
                         {(isListening || isSpeaking || isLoading) && (
                             <>
                                <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${isSpeaking ? 'bg-purple-500' : isLoading ? 'bg-zinc-500' : 'bg-sky-500'}`}></div>
                                <div className={`absolute -inset-4 rounded-full animate-pulse opacity-20 duration-1000 ${isSpeaking ? 'bg-purple-500' : isLoading ? 'bg-zinc-500' : 'bg-sky-500'}`}></div>
                             </>
                         )}
                         <div className={`relative z-10 w-full h-full rounded-full shadow-lg flex items-center justify-center transition-all duration-500 outline-none ${isSpeaking ? 'bg-purple-500 scale-110 shadow-purple-500/40' : isLoading ? 'bg-zinc-500 scale-95' : isListening ? 'bg-[#0ea5e9] scale-105 shadow-sky-500/40' : 'bg-zinc-400'}`}>
                            {isSpeaking ? <svg className="w-10 h-10 text-white animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/></svg> : isLoading ? <svg className="w-10 h-10 text-white animate-spin opacity-80" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> : isListening ? <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg> : <svg className="w-10 h-10 text-white opacity-50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/></svg>}
                         </div>
                     </div>
                     <button onClick={stopVoiceSession} className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-400 transition-all hover:scale-105 outline-none">
                         <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                     </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={`p-4 transition-colors duration-300 relative z-20 ${isDarkMode ? 'bg-[#0E0E10]' : 'bg-white'}`}>
            <div className="max-w-3xl mx-auto flex flex-col items-center">
              <form onSubmit={handleSubmit} className={`w-full flex items-end gap-2 px-3 py-2 rounded-full border transition-all shadow-sm ${isDarkMode ? 'bg-[#1e1e1e] border-zinc-700/50 focus-within:border-zinc-500 focus-within:bg-[#252525]' : 'bg-zinc-100/80 border-zinc-300 focus-within:border-zinc-400'}`}>
                <button type="button" onClick={() => startNewChat("normal")} className={`mb-1 p-1.5 rounded-full transition flex-shrink-0 ${isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'}`} title="New Chat">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <textarea 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }} 
                  disabled={isLoading || isDictating} 
                  placeholder={isDictating ? "Listening..." : "Ask SnowGPT..."} 
                  rows={1} 
                  className={`flex-1 bg-transparent text-[15px] outline-none px-2 py-1.5 disabled:opacity-50 resize-none max-h-32 min-h-[24px] self-center ${isDarkMode ? 'text-zinc-100 placeholder-zinc-500' : 'text-zinc-900 placeholder-zinc-400'}`} 
                />
                <button type="button" onClick={toggleDictation} className={`mb-1 transition flex items-center justify-center flex-shrink-0`} title="Dictate">
                  {isDictating ? (
                    <div className="h-8 w-8 rounded-full bg-[#0ea5e9] flex items-center justify-center text-white shadow-sm shadow-sky-500/30">
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
                    </div>
                  ) : (
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'}`}>
                       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                    </div>
                  )}
                </button>
                {input.trim() ? (
                  <button type="submit" disabled={isLoading} className={`mb-1 h-8 w-8 rounded-full transition flex items-center justify-center flex-shrink-0 disabled:opacity-30 ${isDarkMode ? 'bg-white text-black hover:bg-zinc-200' : 'bg-zinc-900 text-white hover:bg-zinc-700'}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 14-7-7 14-2-5Z"/></svg>
                  </button>
                ) : (
                  <button type="button" onClick={() => startNewChat("voice")} className={`mb-1 h-8 w-8 rounded-full transition flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700' : 'bg-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-300'}`} title="Speak Chat Mode">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/></svg>
                  </button>
                )}
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODALS */}
      {/* ============================================================ */}
      {showFlashModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border flex flex-col ${isDarkMode ? 'bg-[#121214] border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <div className={`flex justify-between items-center px-5 py-4 border-b ${isDarkMode ? 'border-zinc-800/50' : 'border-zinc-100 bg-zinc-50/50'}`}>
              <h2 className={`text-sm font-semibold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>{isFlashing ? "Flashing in progress..." : "Flasher Output"}</h2>
              {arduinoFirmware && <button onClick={executeArduinoFlash} className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded shadow transition-colors">Select Port & Flash</button>}
              {!isFlashing && <button onClick={() => { setShowFlashModal(false); setArduinoFirmware(null); }} className={`transition ${isDarkMode ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-zinc-900'}`}>✕</button>}
            </div>
            <div className={`h-80 overflow-y-auto p-5 font-mono text-xs leading-relaxed custom-scrollbar whitespace-pre-wrap break-words ${isDarkMode ? 'bg-[#09090B] text-sky-300' : 'bg-zinc-50 text-sky-700'}`}>
              {flashLogs}
              <div ref={flashEndRef} />
            </div>
          </div>
        </div>
      )}

      {isSerialOpen && (activeMode === 'esp32' || activeMode === 'arduino') && (
        <div className={`w-80 border-l flex flex-col shadow-2xl transition-colors duration-300 z-10 ${isDarkMode ? 'bg-[#09090B] border-zinc-800' : 'bg-white border-zinc-200'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200 bg-zinc-50/50'}`}>
            <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDarkMode ? 'text-zinc-100' : 'text-zinc-800'}`}>COM Port Monitor</h3>
            <div className="flex gap-2">
              <button onClick={() => { closeSerial(); setTimeout(toggleSerialMonitor, 500); }} className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'}`}>Restart</button>
              <button onClick={() => setSerialLogs("")} className={`text-xs px-2 transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}>Clear</button>
              <button onClick={closeSerial} className={`px-1 transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}>✕</button>
            </div>
          </div>
          <div className={`flex-1 overflow-y-auto p-4 font-mono text-xs custom-scrollbar whitespace-pre-wrap break-words leading-relaxed ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
            {serialLogs || "Waiting for data..."}
            <div ref={serialEndRef} />
          </div>
        </div>
      )}

      {isProfileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border ${isDarkMode ? 'bg-[#18181B] border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <div className={`flex justify-between items-center px-6 py-4 border-b ${isDarkMode ? 'border-zinc-800/50' : 'border-zinc-100'}`}>
              <h2 className={`text-base font-medium ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>Profile Settings</h2>
              <button onClick={() => setIsProfileOpen(false)} className={`transition ${isDarkMode ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-zinc-900'}`}>✕</button>
            </div>
            <div className="p-6 flex flex-col items-center gap-5">
              <div className="relative group">
                <div className={`h-20 w-20 rounded-full overflow-hidden border flex items-center justify-center ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}>
                  {profilePic ? <img src={profilePic} alt="Profile" className="h-full w-full object-cover" /> : <span className={`text-2xl font-medium ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>{userName ? userName.charAt(0).toUpperCase() : "U"}</span>}
                </div>
                <label className="absolute bottom-0 right-0 h-7 w-7 bg-sky-500 rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-sky-400 transition">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <div className="w-full text-left">
                <label className={`text-xs uppercase tracking-wider font-semibold block mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Display Name</label>
                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none transition ${isDarkMode ? 'bg-[#0E0E10] border-zinc-800 text-white focus:border-zinc-600' : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-zinc-400'}`} />
              </div>
            </div>
            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${isDarkMode ? 'bg-[#0E0E10] border-zinc-800/50' : 'bg-zinc-50 border-zinc-200'}`}>
              <button onClick={() => setIsProfileOpen(false)} className={`px-4 py-2 text-sm font-medium transition ${isDarkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}>Cancel</button>
              <button onClick={saveProfile} className={`px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm ${isDarkMode ? 'bg-white text-black hover:bg-zinc-200' : 'bg-zinc-900 text-white hover:bg-zinc-700'}`}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}