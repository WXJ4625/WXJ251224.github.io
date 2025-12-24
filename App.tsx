
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, 
  Trash2, 
  Search, 
  Loader2, 
  Zap, 
  Settings2, 
  Table as TableIcon, 
  CheckCircle2, 
  Copy, 
  ImageIcon, 
  Download, 
  Check, 
  Sparkles,
  LayoutGrid,
  Video,
  Play,
  Key,
  ClipboardCopy,
  ClipboardCheck,
  Layers,
  FileDown,
  ArrowRight,
  Package,
  ExternalLink,
  ChevronDown,
  Monitor,
  Maximize2,
  Scissors,
  X,
  Save,
  RefreshCw,
  History,
  Clock,
  ChevronRight,
  Box,
  Activity,
  Edit3,
  AlertCircle
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType, VideoResult, HistoryRecord, ProductPrompt } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateProductProfileFromText, generateGridImage } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [productName, setProductName] = useState<string>('');
  const [images, setImages] = useState<{id: string, data: string, type: 'image' | 'video'}[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [sceneType, setSceneType] = useState<SceneType>('Studio');
  
  const [generatedPrompts, setGeneratedPrompts] = useState<ProductPrompt[]>([]);
  const [gridImages, setGridImages] = useState<Record<number, string>>({});
  const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
  
  const [error, setError] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    const stored = localStorage.getItem('storyboard_history');
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (prompts: ProductPrompt[], currentAnalysis: ProductAnalysis) => {
    const newRecord: HistoryRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      productName: productName || '未命名产品',
      referenceImage: images.find(i => i.type === 'image')?.data || images[0]?.data || '',
      prompts: JSON.parse(JSON.stringify(prompts)),
      analysis: JSON.parse(JSON.stringify(currentAnalysis))
    };
    const updatedHistory = [newRecord, ...history].slice(0, 50); 
    setHistory(updatedHistory);
    localStorage.setItem('storyboard_history', JSON.stringify(updatedHistory));
  };

  const loadHistoryRecord = (record: HistoryRecord) => {
    setProductName(record.productName);
    setAnalysis(record.analysis);
    setGeneratedPrompts(record.prompts);
    setImages([{ id: 'historical-' + record.id, data: record.referenceImage, type: 'image' }]);
    setGridImages({});
    setState(AppState.COMPLETED);
    setShowHistory(false);
  };

  const clearHistory = () => {
    if (confirm("确定清空所有历史记录吗？")) {
      setHistory([]);
      localStorage.removeItem('storyboard_history');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' = 'image') => {
    const files = Array.from(e.target.files || []);
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages(prev => [...prev, { 
            id: Math.random().toString(36).substr(2, 9), 
            data: ev.target!.result as string,
            type
          }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));

  const handleError = (err: any) => {
    if (err.message?.includes("quota") || err.status === 429) {
      setError("API 配额已耗尽，请稍后再试或检查您的 API Key 额度。");
    } else {
      setError("执行过程中出现错误: " + (err.message || "未知错误"));
    }
    setState(AppState.IDLE);
  };

  const startIndividualAnalysis = async () => {
    if (!productName.trim()) { setError("请输入产品名称"); return; }
    setState(AppState.ANALYZING_INDIVIDUAL);
    setError(null);
    try {
      const rawResults = await analyzeIndividualImages(images, productName);
      setAnalysis({ individualAnalyses: rawResults, globalProfile: { details: '', features: '', audience: '', interaction: '' } });
      setState(AppState.EDITING_INDIVIDUAL);
      // 自动执行一次全局综合
      await startGlobalSynthesis();
    } catch (err: any) {
      handleError(err);
      await skipToManualStrategy();
    }
  };

  const skipToManualStrategy = async () => {
    if (!productName.trim()) { setError("请输入产品名称"); return; }
    setState(AppState.ANALYZING_GLOBAL);
    try {
      const profile = await generateProductProfileFromText(productName);
      setAnalysis({
        individualAnalyses: [],
        globalProfile: profile
      });
      setState(AppState.EDITING_GLOBAL);
    } catch (err: any) {
      handleError(err);
      setAnalysis({
        individualAnalyses: [],
        globalProfile: { details: '', features: '', audience: '', interaction: '' }
      });
      setState(AppState.EDITING_GLOBAL);
    }
  };

  const startGlobalSynthesis = async () => {
    if (!analysis) return;
    try {
      const profile = await synthesizeProductProfile(analysis.individualAnalyses, productName);
      setAnalysis({ ...analysis, globalProfile: profile });
      setState(AppState.EDITING_GLOBAL);
    } catch (err: any) {
      handleError(err);
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    setError(null);
    try {
      const results = await generateStoryboards(analysis.globalProfile, productName, promptCount, language, sceneType);
      const parsed = results.map(raw => {
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
        const instruction = lines.find(l => !l.startsWith('镜头') && !l.startsWith('Shot')) || lines[0] || '';
        const shots: string[] = [];
        for (let i = 1; i <= 9; i++) {
          const prefix = `镜头${i.toString().padStart(2, '0')}:`;
          const altPrefix = `Shot ${i.toString().padStart(2, '0')}:`;
          const line = lines.find(l => l.startsWith(prefix) || l.startsWith(altPrefix));
          if (line) shots.push(line.split(':').slice(1).join(':').trim());
          else shots.push("");
        }
        return { instruction, shots };
      });
      setGeneratedPrompts(parsed);
      setGridImages({});
      saveToHistory(parsed, analysis);
      setState(AppState.COMPLETED);
    } catch (err: any) {
      handleError(err);
    }
  };

  const handleGenerateImage = async (idx: number, prompt: string) => {
    setImageLoading(prev => ({ ...prev, [idx]: true }));
    try {
      const referenceImg = images.find(img => img.type === 'image')?.data;
      const imageUrl = await generateGridImage(prompt, referenceImg);
      setGridImages(prev => ({ ...prev, [idx]: imageUrl }));
    } catch (err: any) {
      handleError(err);
    } finally {
      setImageLoading(prev => ({ ...prev, [idx]: false }));
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setCopyStates(prev => ({ ...prev, [key]: false })), 2000);
    });
  };

  const constructFullPrompt = (p: ProductPrompt) => {
    const shotsPart = p.shots
      .map((shot, i) => `镜头${(i + 1).toString().padStart(2, '0')}: ${shot}`)
      .join('\n');
    return `${p.instruction}\n${shotsPart}`;
  };

  const downloadPromptsAsCSV = () => {
    if (generatedPrompts.length === 0) return;
    
    let csvContent = "\uFEFF"; 
    csvContent += "方案编号,总指令,镜头01,镜头02,镜头03,镜头04,镜头05,镜头06,镜头07,镜头08,镜头09\n";
    
    generatedPrompts.forEach((p, idx) => {
      const row = [
        `方案 ${idx + 1}`,
        `"${p.instruction.replace(/"/g, '""')}"`,
        ...p.shots.map(s => `"${s.replace(/"/g, '""')}"`)
      ].join(",");
      csvContent += row + "\n";
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${productName || 'storyboard'}_prompts.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSerialID = (idx: number) => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `STB-${date}-${(idx + 1).toString().padStart(3, '0')}`;
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-12 bg-white min-h-screen text-slate-900 font-sans pb-32 flex flex-col gap-16">
      <header className="flex flex-col md:flex-row items-center justify-between gap-10">
        <div className="text-left">
          <div className="inline-flex items-center gap-4 p-4 bg-black rounded-3xl mb-6 shadow-xl">
             <Sparkles className="text-white w-8 h-8" />
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Storyboard Pro</h1>
          </div>
          <p className="text-slate-400 text-lg font-medium tracking-tight">极速生成 1-50 份商业摄影分镜方案</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHistory(true)} className="px-8 py-4 bg-slate-100 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-slate-200 transition-all border border-slate-200"><History className="w-5 h-5" /> 历史记录</button>
          <button onClick={async () => { /* @ts-ignore */ await window.aistudio.openSelectKey(); }} className="px-8 py-4 bg-black text-white rounded-2xl font-black text-sm shadow-xl">云鉴权</button>
        </div>
      </header>

      {/* STEP 1: UPLOAD */}
      <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="flex items-center gap-6 mb-12">
          <span className="w-16 h-16 rounded-[2rem] bg-black text-white flex items-center justify-center text-2xl font-black">01</span>
          <h2 className="text-4xl font-black">资产解析与档案补全</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6 mb-12">
          {images.map((img, i) => (
            <div key={img.id} className={`relative aspect-square rounded-[2rem] overflow-hidden border-4 ${i === 0 ? 'border-black scale-105 z-10' : 'border-white shadow-md'}`}>
              {img.type === 'video' ? <div className="w-full h-full bg-slate-200 flex items-center justify-center"><Video className="w-10 h-10 text-slate-400" /></div> : <img src={img.data} className="w-full h-full object-cover" />}
              <button onClick={() => removeImage(img.id)} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-xl"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {images.length < 12 && (
            <label className="aspect-square flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[2rem] cursor-pointer hover:bg-white hover:border-black transition-all group">
              <Camera className="w-10 h-10 text-slate-300 group-hover:text-black" />
              <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleFileUpload(e, 'image')} />
            </label>
          )}
        </div>

        <div className="mb-12">
          <label className="text-xs font-black uppercase text-slate-400 mb-4 block tracking-widest">产品名称</label>
          <input 
            type="text" 
            placeholder="例如：高端无线吸尘器" 
            className="w-full p-8 text-3xl font-black bg-white border-4 border-slate-100 rounded-[2.5rem] outline-none focus:border-black transition-all"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          <button 
            disabled={images.length === 0 || !productName || state.includes('ANALYZING')}
            onClick={startIndividualAnalysis}
            className="flex-1 py-8 rounded-[2.5rem] bg-black text-white font-black text-2xl flex items-center justify-center gap-6 shadow-2xl disabled:bg-slate-200"
          >
            {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Search className="w-10 h-10" /> 识别图片资产并策划</>}
          </button>
          
          <button 
            disabled={!productName || state.includes('ANALYZING')}
            onClick={skipToManualStrategy}
            className="px-10 py-8 rounded-[2.5rem] bg-white text-black font-black text-xl flex items-center justify-center gap-4 hover:bg-slate-100 transition-all border-4 border-slate-200 shadow-xl"
          >
            {state === AppState.ANALYZING_GLOBAL ? <Loader2 className="w-8 h-8 animate-spin" /> : <><Edit3 className="w-8 h-8" /> 直接由 AI 策划方案</>}
          </button>
        </div>
      </section>

      {/* STEP 2: PROFILE & GENERATE */}
      {analysis && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-indigo-600 text-white flex items-center justify-center text-2xl font-black">02</span>
            <h2 className="text-4xl font-black">策划配置与分镜生成</h2>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
             <div className="bg-white p-8 rounded-[2.5rem] shadow-sm space-y-4 border border-slate-100">
                <label className="text-xs font-black uppercase text-slate-400">产品档案 (细节、卖点、受众)</label>
                <div className="space-y-4">
                  <textarea className="w-full p-4 text-sm font-medium bg-slate-50 rounded-2xl outline-none min-h-[80px]" value={analysis.globalProfile.details} onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, details: e.target.value}})} placeholder="产品细节与材质..." />
                  <textarea className="w-full p-4 text-sm font-medium bg-slate-50 rounded-2xl outline-none min-h-[80px]" value={analysis.globalProfile.features} onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, features: e.target.value}})} placeholder="核心功能卖点..." />
                </div>
             </div>
             <div className="bg-white p-8 rounded-[2.5rem] shadow-sm space-y-4 border border-slate-100 flex flex-col">
                <label className="text-xs font-black uppercase text-slate-400">生成设定</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase text-slate-400">生成份数 (1-50)</span>
                    <input type="number" value={promptCount} onChange={e => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-full p-4 bg-slate-50 rounded-2xl font-black text-xl outline-none border-2 border-transparent focus:border-indigo-500" />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase text-slate-400">语言设定</span>
                    <button onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')} className="w-full p-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2">
                       <RefreshCw className="w-4 h-4" /> {language === 'zh' ? '中文' : 'ENGLISH'}
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex-1">
                  <span className="text-[10px] font-black uppercase text-slate-400 mb-2 block">场景主题风格</span>
                  <div className="flex flex-wrap gap-2">
                     {SCENE_OPTIONS.map(opt => (
                       <button key={opt} onClick={() => setSceneType(opt)} className={`px-4 py-2 rounded-xl text-[10px] font-black border-2 transition-all ${sceneType === opt ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}>{opt}</button>
                     ))}
                  </div>
                </div>
             </div>
          </div>

          <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-8 rounded-[2.5rem] bg-indigo-600 text-white font-black text-2xl shadow-2xl flex items-center justify-center gap-4 hover:bg-indigo-700 transition-all disabled:bg-slate-300">
            {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Zap className="w-8 h-8" /> 生成 {promptCount} 套分镜策划案</>}
          </button>
        </section>
      )}

      {/* STEP 3: OUTPUT */}
      {generatedPrompts.length > 0 && (
        <section className="space-y-12 animate-in fade-in">
          <div className="bg-black p-10 rounded-[3rem] text-white flex justify-between items-center shadow-2xl flex-col md:flex-row gap-6">
            <h2 className="text-3xl font-black flex items-center gap-4"><Package className="w-10 h-10 text-indigo-400" /> 分镜交付库 ({generatedPrompts.length} 套)</h2>
            <button onClick={downloadPromptsAsCSV} className="px-10 py-5 bg-white text-black rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 transition-all shadow-lg"><FileDown className="w-6 h-6" /> 导出全部 CSV</button>
          </div>

          <div className="grid grid-cols-1 gap-12">
            {generatedPrompts.map((p, idx) => (
              <div key={idx} className="bg-white p-10 rounded-[3.5rem] shadow-xl border-4 border-slate-50 flex flex-col lg:flex-row gap-10">
                <div className="flex-1 flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black">#{idx + 1}</span>
                      <h3 className="text-lg font-black tracking-tight">{getSerialID(idx)}</h3>
                    </div>
                    <button 
                      onClick={() => copyToClipboard(constructFullPrompt(p), `all-${idx}`)} 
                      className="flex items-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-2xl font-black text-xs transition-all"
                    >
                      {copyStates[`all-${idx}`] ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      复制提示词策划
                    </button>
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex-1 min-h-[250px] relative">
                    <label className="absolute top-4 right-6 text-[8px] font-black uppercase text-slate-300 tracking-widest">Story Text</label>
                    <textarea 
                      className="w-full h-full p-2 text-xs font-medium text-slate-600 leading-relaxed bg-transparent border-0 outline-none resize-none"
                      value={constructFullPrompt(p)}
                      readOnly
                    />
                  </div>

                  <button 
                    onClick={() => handleGenerateImage(idx, constructFullPrompt(p))}
                    disabled={imageLoading[idx]}
                    className="w-full py-5 rounded-[1.5rem] bg-black text-white font-black text-sm flex items-center justify-center gap-3 hover:bg-indigo-900 transition-all disabled:bg-slate-200"
                  >
                    {imageLoading[idx] ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ImageIcon className="w-4 h-4" /> 渲染 3x3 预览图</>}
                  </button>
                </div>

                <div className="w-full lg:w-[400px] aspect-square bg-slate-100 rounded-[2.5rem] overflow-hidden border-2 border-slate-200 flex items-center justify-center relative shadow-inner">
                  {gridImages[idx] ? (
                    <img src={gridImages[idx]} className="w-full h-full object-cover animate-in fade-in zoom-in-95 duration-500" />
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-slate-300">
                      <LayoutGrid className="w-12 h-12" />
                      <span className="font-black text-[10px] uppercase tracking-widest text-slate-400">Waiting for render...</span>
                    </div>
                  )}
                  {imageLoading[idx] && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-md flex items-center justify-center flex-col gap-4">
                      <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                      <p className="font-black text-[10px] text-indigo-900 uppercase tracking-[0.2em] animate-pulse">Rendering storyboard...</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ERROR MODAL */}
      {error && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl max-w-sm w-full text-center space-y-8 animate-in zoom-in-95 duration-300">
              <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner"><AlertCircle className="w-12 h-12" /></div>
              <div className="space-y-4">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">API 限制提醒</h3>
                <p className="text-slate-500 font-medium text-sm leading-relaxed">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="w-full py-5 bg-black text-white rounded-[1.5rem] font-black text-lg shadow-xl active:scale-95 transition-all">关闭</button>
           </div>
        </div>
      )}

      {/* HISTORY */}
      {showHistory && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-4xl max-h-[80vh] rounded-[3.5rem] overflow-hidden flex flex-col shadow-2xl border border-white/20 animate-in slide-in-from-bottom-8 duration-300">
              <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
                 <h3 className="text-2xl font-black flex items-center gap-4 text-slate-900"><History className="w-6 h-6 text-indigo-600" /> 分镜策划历史</h3>
                 <button onClick={() => setShowHistory(false)} className="p-4 bg-white border rounded-2xl shadow-sm hover:bg-slate-50"><X className="w-6 h-6 text-slate-400" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-4">
                 {history.length === 0 ? <p className="text-center py-20 text-slate-400 font-bold italic">No records found...</p> : history.map(record => (
                    <div key={record.id} className="p-6 bg-slate-50 rounded-[2rem] flex items-center justify-between group cursor-pointer hover:bg-white border-2 border-transparent hover:border-indigo-100 transition-all shadow-sm" onClick={() => loadHistoryRecord(record)}>
                       <div className="flex items-center gap-6">
                          {record.referenceImage ? <img src={record.referenceImage} className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow-sm" /> : <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-sm"><Box className="w-8 h-8 text-slate-200" /></div>}
                          <div>
                             <h4 className="text-lg font-black text-slate-900">{record.productName}</h4>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(record.timestamp).toLocaleString()} • {record.prompts.length} 份策划</p>
                          </div>
                       </div>
                       <ChevronRight className="w-6 h-6 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                    </div>
                 ))}
              </div>
              <div className="p-10 bg-slate-50/50 border-t flex justify-end"><button onClick={clearHistory} className="px-8 py-4 bg-red-50 text-red-600 rounded-xl font-black text-xs hover:bg-red-100 transition-colors">清空所有记录</button></div>
           </div>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-2xl border-t border-slate-100 py-4 px-12 flex justify-between z-[100] items-center">
        <div className="flex items-center gap-4">
          <div className={`w-2.5 h-2.5 rounded-full ${state === AppState.IDLE ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'}`}></div>
          <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{state === AppState.GENERATING_PROMPTS ? '生成策划中...' : '策划流水线就绪'}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-slate-50 border rounded-xl text-[8px] font-black uppercase text-slate-400 tracking-widest">v1.2.5 • AI PROMPT ENGINE</div>
        </div>
      </footer>
    </div>
  );
};

export default App;
