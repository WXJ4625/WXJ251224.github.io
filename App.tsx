
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
  Edit3
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType, VideoResult, HistoryRecord, ProductPrompt } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateStoryboardImage, generateVideo } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];

const extractFramesFromVideo = async (dataUrl: string, count: number = 4): Promise<string[]> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = dataUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    const frames: string[] = [];
    video.onloadedmetadata = async () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve([]);
      canvas.width = video.videoWidth / 2;
      canvas.height = video.videoHeight / 2;
      const duration = video.duration;
      for (let i = 1; i <= count; i++) {
        const time = (duration / (count + 1)) * i;
        video.currentTime = time;
        await new Promise(r => video.onseeked = r);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.7));
      }
      resolve(frames);
    };
    video.onerror = () => resolve([]);
  });
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [productName, setProductName] = useState<string>('');
  const [images, setImages] = useState<{id: string, data: string, type: 'image' | 'video'}[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [videoCount, setVideoCount] = useState<number>(1);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [sceneType, setSceneType] = useState<SceneType>('Studio');
  
  const [generatedPrompts, setGeneratedPrompts] = useState<ProductPrompt[]>([]);
  const [renderedImages, setRenderedImages] = useState<Record<number, string>>({});
  const [batchProgress, setBatchProgress] = useState<{ current: number, total: number } | null>(null);
  const [videoResults, setVideoResults] = useState<Record<number, VideoResult[]>>({});
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
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
    setRenderedImages({});
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

  // 深度解析逻辑 (可能会触发配额错误)
  const startIndividualAnalysis = async () => {
    if (!productName.trim()) { setError("请输入产品名称"); return; }
    setState(AppState.ANALYZING_INDIVIDUAL);
    setError(null);
    try {
      const rawResults = await analyzeIndividualImages(images, productName);
      const enhancedResults = await Promise.all(rawResults.map(async (res) => {
        const matchingAsset = images.find(img => img.id === res.id);
        if (matchingAsset?.type === 'video') {
          const frames = await extractFramesFromVideo(matchingAsset.data);
          return { ...res, keyframes: frames };
        }
        return res;
      }));
      setAnalysis({ individualAnalyses: enhancedResults, globalProfile: { details: '', usage: '', howToUse: '' } });
      setState(AppState.EDITING_INDIVIDUAL);
    } catch (err: any) {
      if (err.message?.includes("quota")) {
        setError("API 配额超限。建议点击下方的“直接开始策划”按钮，手动输入产品详情。");
      } else {
        setError("分析资产失败，请检查网络。");
      }
      setState(AppState.IDLE);
    }
  };

  // 新增：直接开始策划 (跳过耗时的 AI 图像分析)
  const skipToManualStrategy = () => {
    if (!productName.trim()) { setError("请输入产品名称"); return; }
    setAnalysis({
      individualAnalyses: [],
      globalProfile: {
        details: `${productName}，高科技质感，现代简约设计...`,
        usage: `日常办公、生活化场景、专业摄影棚...`,
        howToUse: `模特握持、单手操作、放置在桌面上演示...`
      }
    });
    setState(AppState.EDITING_GLOBAL);
  };

  const startGlobalSynthesis = async () => {
    if (!analysis) return;
    setState(AppState.ANALYZING_GLOBAL);
    try {
      const profile = await synthesizeProductProfile(analysis.individualAnalyses, productName);
      setAnalysis({ ...analysis, globalProfile: profile });
      setState(AppState.EDITING_GLOBAL);
    } catch (err: any) {
      if (err.message?.includes("quota")) {
        setError("AI 综合配额超限，已为您开启手动编辑模式。");
        setState(AppState.EDITING_GLOBAL);
      } else {
        setError("提炼失败。");
        setState(AppState.EDITING_INDIVIDUAL);
      }
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    setRenderedImages({});
    try {
      const results = await generateStoryboards(analysis.globalProfile, productName, promptCount, language, sceneType);
      const parsed = results.map(raw => {
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
        const instruction = lines[0] || '';
        const shots = lines.filter(l => l.match(/^(?:镜头|Lens|Shot)\s*0?\d\s*:/i)).map(l => {
          const p = l.split(':');
          return p.slice(1).join(':').trim();
        });
        while (shots.length < 9) shots.push("");
        return { instruction, shots: shots.slice(0, 9) };
      });
      setGeneratedPrompts(parsed);
      saveToHistory(parsed, analysis);
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError(err.message?.includes("quota") ? "提示词生成配额不足，请稍后再试或精简产品描述。" : "生成提示词失败。");
      setState(AppState.EDITING_GLOBAL);
    }
  };

  // 其他辅助方法保持不变...
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setCopyStates(prev => ({ ...prev, [key]: false })), 2000);
    });
  };

  const getSerialID = (index: number) => {
    const date = new Date();
    const YYYYMMDD = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
    return `${productName || '产品'}-${YYYYMMDD}${(index + 1).toString().padStart(3, '0')}`;
  };

  const downloadPromptsAsCSV = () => {
    const headers = ['产品名称-年月日序号', '主指令', '镜头01', '镜头02', '镜头03', '镜头04', '镜头05', '镜头06', '镜头07', '镜头08', '镜头09'];
    const rows = generatedPrompts.map((p, index) => [getSerialID(index), p.instruction, ...p.shots].map(c => `"${c.replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['\ufeff' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `storyboard_${productName}.csv`;
    link.click();
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-12 bg-white min-h-screen text-slate-900 font-sans pb-32 flex flex-col gap-16">
      <header className="flex flex-col md:flex-row items-center justify-between gap-10">
        <div className="text-left">
          <div className="inline-flex items-center gap-4 p-4 bg-black rounded-3xl mb-6 shadow-xl">
             <Sparkles className="text-white w-8 h-8" />
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Storyboard Pro</h1>
          </div>
          <p className="text-slate-400 text-lg font-medium tracking-tight">AI 商业分镜产线 • 极速提示词策划</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHistory(true)} className="px-8 py-4 bg-slate-100 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-slate-200 transition-all border border-slate-200"><History className="w-5 h-5" /> 历史记录</button>
          <button onClick={async () => { /* @ts-ignore */ await window.aistudio.openSelectKey(); }} className="px-8 py-4 bg-black text-white rounded-2xl font-black text-sm shadow-xl">云鉴权</button>
        </div>
      </header>

      {/* STEP 1: ASSET & NAMING */}
      <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 shadow-sm w-full">
        <div className="flex items-center gap-6 mb-12">
          <span className="w-16 h-16 rounded-[2rem] bg-black text-white flex items-center justify-center text-2xl font-black">01</span>
          <h2 className="text-4xl font-black">产品档案资产上传</h2>
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
          <label className="text-xs font-black uppercase text-slate-400 mb-4 block">产品名称</label>
          <input 
            type="text" 
            placeholder="例如：高端按摩仪" 
            className="w-full p-8 text-3xl font-black bg-white border-4 border-slate-100 rounded-[2.5rem] outline-none focus:border-black transition-all"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          <button 
            disabled={images.length === 0 || !productName || state === AppState.ANALYZING_INDIVIDUAL}
            onClick={startIndividualAnalysis}
            className="flex-1 py-8 rounded-[2.5rem] bg-black text-white font-black text-2xl flex items-center justify-center gap-6 shadow-2xl disabled:bg-slate-200"
          >
            {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Search className="w-10 h-10" /> 深度资产分析</>}
          </button>
          
          <button 
            disabled={!productName || state === AppState.ANALYZING_INDIVIDUAL}
            onClick={skipToManualStrategy}
            className="px-10 py-8 rounded-[2.5rem] bg-indigo-50 text-indigo-600 font-black text-xl flex items-center justify-center gap-4 hover:bg-indigo-100 transition-all border-4 border-indigo-100"
          >
            <Edit3 className="w-8 h-8" /> 直接生成分镜 (配额受限选此项)
          </button>
        </div>
      </section>

      {/* ANALYSIS RESULTS (ONLY SHOW IF ANALYZED) */}
      {analysis && analysis.individualAnalyses.length > 0 && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12 w-full">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-indigo-600 text-white flex items-center justify-center text-2xl font-black">02</span>
            <h2 className="text-4xl font-black">资产结构解析</h2>
          </div>
          <div className="space-y-8">
            {analysis.individualAnalyses.map((item, idx) => (
              <div key={item.id} className="flex flex-col lg:flex-row gap-8 p-8 bg-white rounded-[3rem] items-start border border-slate-100 shadow-sm">
                <div className="w-40 aspect-square rounded-[2rem] overflow-hidden bg-slate-50 flex-shrink-0">
                   {images.find(i => i.id === item.id)?.type === 'video' ? <Video className="w-full h-full p-10 text-slate-300" /> : <img src={images.find(img => img.id === item.id)?.data} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 w-full space-y-4">
                  <textarea className="w-full p-6 text-xl font-bold bg-slate-50 border-0 rounded-3xl min-h-[100px]" value={item.description} onChange={(e) => { const n = [...analysis.individualAnalyses]; n[idx].description = e.target.value; setAnalysis({...analysis, individualAnalyses: n}); }} />
                  {item.motionDynamics && <p className="px-6 py-3 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold flex items-center gap-2"><Activity className="w-4 h-4" /> 动态特性：{item.motionDynamics}</p>}
                </div>
              </div>
            ))}
          </div>
          <button disabled={state === AppState.ANALYZING_GLOBAL} onClick={startGlobalSynthesis} className="w-full mt-12 py-8 rounded-[2.5rem] bg-indigo-600 text-white font-black text-2xl shadow-xl">提炼全局策略</button>
        </section>
      )}

      {/* CONFIG & GENERATION */}
      {analysis && (state === AppState.EDITING_GLOBAL || state === AppState.GENERATING_PROMPTS || state === AppState.COMPLETED) && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12 w-full">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-emerald-600 text-white flex items-center justify-center text-2xl font-black">03</span>
            <h2 className="text-4xl font-black">全局策略设定</h2>
          </div>
          <div className="bg-white p-12 rounded-[3rem] shadow-sm mb-12 space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
               <div className="space-y-4">
                  <label className="text-xs font-black uppercase text-slate-400">产品外观细节</label>
                  <textarea className="w-full p-8 text-2xl font-black bg-slate-50 border-0 rounded-[2rem] min-h-[140px]" value={analysis.globalProfile.details} onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, details: e.target.value}})} />
               </div>
               <div className="space-y-4">
                  <label className="text-xs font-black uppercase text-slate-400">核心交互演示</label>
                  <textarea className="w-full p-8 text-2xl font-black bg-slate-50 border-0 rounded-[2rem] min-h-[140px]" value={analysis.globalProfile.howToUse} onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, howToUse: e.target.value}})} />
               </div>
            </div>
            <div className="flex flex-col xl:flex-row gap-8">
               <div className="flex-1 space-y-4">
                  <label className="text-xs font-black uppercase text-slate-400">生成份数 (1-50)</label>
                  <input type="number" value={promptCount} onChange={e => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-full bg-slate-100 p-6 text-2xl font-black rounded-[2rem]" />
               </div>
               <div className="flex-1 space-y-4">
                  <label className="text-xs font-black uppercase text-slate-400">商业场景</label>
                  <div className="grid grid-cols-3 gap-3">
                     {SCENE_OPTIONS.slice(0, 3).map(opt => (
                       <button key={opt} onClick={() => setSceneType(opt)} className={`p-4 rounded-2xl text-xs font-black border-2 ${sceneType === opt ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-100 text-slate-400'}`}>{opt}</button>
                     ))}
                  </div>
               </div>
            </div>
          </div>
          <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-8 rounded-[2.5rem] bg-emerald-600 text-white font-black text-2xl shadow-2xl">
            {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-10 h-10 animate-spin" /> : '立即生成分镜策划'}
          </button>
        </section>
      )}

      {/* PROMPT CARDS */}
      {generatedPrompts.length > 0 && (
        <section className="space-y-12 w-full animate-in fade-in">
          <div className="bg-black p-10 rounded-[3rem] text-white flex justify-between items-center shadow-2xl">
            <h2 className="text-3xl font-black flex items-center gap-4"><Package className="w-10 h-10 text-emerald-400" /> 已生成 {generatedPrompts.length} 套方案</h2>
            <button onClick={downloadPromptsAsCSV} className="px-10 py-5 bg-white text-black rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 transition-all"><FileDown className="w-6 h-6" /> 导出策划 CSV</button>
          </div>

          <div className="space-y-16">
            {generatedPrompts.map((p, idx) => (
              <div key={idx} className="bg-white p-12 rounded-[4rem] shadow-xl border-4 border-slate-50 flex flex-col gap-8">
                <div className="flex items-center gap-6">
                  <span className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black">#{idx + 1}</span>
                  <h3 className="text-xl font-black">{getSerialID(idx)}</h3>
                </div>
                <div className="bg-slate-50 p-10 rounded-[3rem] space-y-10">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {p.shots.map((shot, si) => (
                        <div key={si} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 group">
                           <div className="flex justify-between items-center mb-4">
                              <span className="text-[10px] font-black text-slate-400 uppercase">镜头 0{si+1}</span>
                              <button onClick={() => copyToClipboard(shot, `shot-${idx}-${si}`)} className="text-slate-300 hover:text-emerald-500">
                                {copyStates[`shot-${idx}-${si}`] ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                              </button>
                           </div>
                           <p className="text-sm font-medium text-slate-700 leading-relaxed">{shot}</p>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* HISTORY MODAL & FOOTER */}
      {showHistory && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
           <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[3.5rem] overflow-hidden flex flex-col shadow-2xl">
              <div className="p-10 border-b flex justify-between items-center bg-slate-50">
                 <h3 className="text-3xl font-black flex items-center gap-6"><History className="w-8 h-8 text-indigo-600" /> 分镜历史库</h3>
                 <button onClick={() => setShowHistory(false)} className="p-4 bg-white border rounded-2xl"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-6">
                 {history.length === 0 ? <p className="text-center py-20 text-slate-400 font-bold">暂无历史记录</p> : history.map(record => (
                    <div key={record.id} className="p-8 bg-slate-50 rounded-[2.5rem] flex items-center justify-between group cursor-pointer hover:border-indigo-200 border border-transparent transition-all" onClick={() => loadHistoryRecord(record)}>
                       <div className="flex items-center gap-6">
                          <img src={record.referenceImage} className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-sm" />
                          <div>
                             <h4 className="text-xl font-black">{record.productName}</h4>
                             <span className="text-xs text-slate-400 font-bold">{new Date(record.timestamp).toLocaleString()} • {record.prompts.length} 套方案</span>
                          </div>
                       </div>
                       <ChevronRight className="w-8 h-8 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                    </div>
                 ))}
              </div>
              <div className="p-10 bg-slate-50 border-t flex justify-end"><button onClick={clearHistory} className="px-8 py-4 bg-red-50 text-red-600 rounded-2xl font-black text-xs">清空记录</button></div>
           </div>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-3xl border-t border-slate-200 py-6 px-12 flex justify-between z-50 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className={`w-3 h-3 rounded-full ${state === AppState.IDLE ? 'bg-slate-300' : 'bg-emerald-500 animate-pulse'}`}></div>
          <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{state === AppState.GENERATING_PROMPTS ? '正在进行创意策划...' : '产线就绪 (Flash 优化模式)'}</span>
        </div>
        <div className="hidden md:flex items-center gap-4 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-2xl text-[10px] font-black uppercase"><Activity className="w-3.5 h-3.5" /> 结构锁定已启用</div>
      </footer>

      {error && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
           <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-sm w-full text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto"><X className="w-10 h-10" /></div>
              <h3 className="text-2xl font-black">系统提示</h3>
              <p className="text-slate-500 font-medium leading-relaxed">{error}</p>
              <button onClick={() => setError(null)} className="w-full py-5 bg-black text-white rounded-2xl font-black text-lg">确认</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
