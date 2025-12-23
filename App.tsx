
import React, { useState, useMemo } from 'react';
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
  Monitor
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType, VideoResult } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateStoryboardImage, generateVideo } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [images, setImages] = useState<{id: string, data: string}[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [videoCount, setVideoCount] = useState<number>(1);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [sceneType, setSceneType] = useState<SceneType>('Studio');
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  
  // 存储所有已渲染的九宫格图片
  const [renderedImages, setRenderedImages] = useState<Record<number, string>>({});
  const [batchProgress, setBatchProgress] = useState<{ current: number, total: number } | null>(null);
  
  const [videoResults, setVideoResults] = useState<Record<number, VideoResult[]>>({});
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopyStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 10) {
      setError("最多只能上传10张参考图");
      return;
    }
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), data: ev.target!.result as string }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const startIndividualAnalysis = async () => {
    if (images.length === 0) return;
    setState(AppState.ANALYZING_INDIVIDUAL);
    setError(null);
    try {
      const results = await analyzeIndividualImages(images);
      setAnalysis({
        individualAnalyses: results,
        globalProfile: { details: '', usage: '', howToUse: '' }
      });
      setState(AppState.EDITING_INDIVIDUAL);
    } catch (err: any) {
      setError("分析失败，请检查网络。");
      setState(AppState.IDLE);
    }
  };

  const startGlobalSynthesis = async () => {
    if (!analysis) return;
    setState(AppState.ANALYZING_GLOBAL);
    try {
      const profile = await synthesizeProductProfile(analysis.individualAnalyses);
      setAnalysis({ ...analysis, globalProfile: profile });
      setState(AppState.EDITING_GLOBAL);
    } catch (err) {
      setError("综合失败。");
      setState(AppState.EDITING_INDIVIDUAL);
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    setRenderedImages({});
    try {
      const results = await generateStoryboards(analysis.globalProfile, promptCount, language, sceneType);
      setGeneratedPrompts(results);
      setState(AppState.COMPLETED);
    } catch (err) {
      setError("生成失败。");
      setState(AppState.EDITING_GLOBAL);
    }
  };

  const renderSingleImage = async (index: number) => {
    const prompt = generatedPrompts[index];
    if (!prompt || images.length === 0) return;
    setState(AppState.GENERATING_IMAGE);
    try {
      const img = await generateStoryboardImage(prompt, images[0].data);
      setRenderedImages(prev => ({ ...prev, [index]: img }));
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError(`分镜 ${index + 1} 渲染失败。`);
      setState(AppState.COMPLETED);
    }
  };

  const startGenerateAllImages = async () => {
    if (generatedPrompts.length === 0 || images.length === 0) return;
    setState(AppState.GENERATING_IMAGE);
    const total = generatedPrompts.length;
    setBatchProgress({ current: 0, total });
    
    for (let i = 0; i < total; i++) {
      setBatchProgress({ current: i + 1, total });
      try {
        const img = await generateStoryboardImage(generatedPrompts[i], images[0].data);
        setRenderedImages(prev => ({ ...prev, [i]: img }));
      } catch (err) {
        console.error(`Index ${i} failed`, err);
      }
    }
    setBatchProgress(null);
    setState(AppState.COMPLETED);
  };

  const downloadAllRenderedImages = () => {
    const keys = Object.keys(renderedImages);
    if (keys.length === 0) return;
    keys.forEach((key) => {
      const idx = parseInt(key);
      const link = document.createElement('a');
      link.href = renderedImages[idx];
      link.download = `storyboard_grid_${idx + 1}.png`;
      link.click();
    });
  };

  const downloadPromptsAsCSV = () => {
    if (generatedPrompts.length === 0) return;
    const headers = ['编号', '主指令', '镜头01', '镜头02', '镜头03', '镜头04', '镜头05', '镜头06', '镜头07', '镜头08', '镜头09'];
    const rows = generatedPrompts.map((prompt, index) => {
      const lines = prompt.split(/\n+/).map(l => l.trim()).filter(l => l);
      const id = (index + 1).toString();
      const context = lines[0] || '';
      const lensData = new Array(9).fill('');
      for (let i = 1; i <= 9; i++) {
        const pattern = new RegExp(`(?:镜头|Lens|Shot)\\s*0?${i}\\s*:?\\s*(.*)`, 'i');
        const match = lines.find(l => pattern.test(l));
        if (match) {
          lensData[i - 1] = match.replace(/^(?:镜头|Lens|Shot)\s*0?${i}\s*:?\\s*/i, '').trim();
        }
      }
      return [id, context, ...lensData].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storyboard_all_prompts_${new Date().getTime()}.csv`;
    link.click();
  };

  const checkAndOpenKeySelector = async () => {
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
  };

  const generateSingleVideo = async (index: number) => {
    const prompt = generatedPrompts[index];
    const finalImage = renderedImages[index];
    if (!prompt || !finalImage) return;

    await checkAndOpenKeySelector();
    setState(AppState.GENERATING_VIDEO);
    
    try {
      const urls: VideoResult[] = [];
      for (let i = 0; i < videoCount; i++) {
        setVideoStatus(`[方案 ${index+1}] 正在生成视频 ${i + 1}/${videoCount}...`);
        const videoUrl = await generateVideo(prompt, finalImage, (status) => setVideoStatus(`[方案 ${index+1}] ${status}`));
        urls.push({ id: Math.random().toString(36).substr(2, 9), url: videoUrl });
      }
      setVideoResults(prev => ({ ...prev, [index]: urls }));
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError("视频渲染失败。");
      setState(AppState.COMPLETED);
    } finally {
      setVideoStatus('');
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-12 bg-white min-h-screen text-slate-900 font-sans pb-32 flex flex-col gap-16">
      <header className="text-center">
        <div className="inline-flex items-center justify-center p-6 bg-black rounded-[2.5rem] mb-8 shadow-2xl">
          <Sparkles className="text-white w-14 h-14" />
        </div>
        <h1 className="text-7xl font-black text-slate-900 tracking-tighter mb-6 italic uppercase">
          Storyboard Pro Factory
        </h1>
        <p className="text-slate-400 text-2xl font-medium tracking-tight">
          垂直极速分镜工厂 • 人机交互锁定渲染 • 全量资产输出
        </p>
      </header>

      {/* STEP 1: UPLOAD - FULL WIDTH */}
      <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 shadow-sm w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div className="flex items-center gap-6">
            <span className="w-16 h-16 rounded-[2rem] bg-black text-white flex items-center justify-center text-2xl font-black">01</span>
            <h2 className="text-4xl font-black">上传产品原型</h2>
          </div>
          <div className="px-6 py-3 bg-white rounded-2xl border border-slate-200 text-slate-500 font-bold text-sm">
            首张图将被设定为物理结构锁定的唯一参考源
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-8 mb-12">
          {images.map((img, i) => (
            <div key={img.id} className={`relative aspect-[3/4] rounded-[2.5rem] overflow-hidden border-4 transition-all ${i === 0 ? 'border-black ring-8 ring-black/5 shadow-2xl scale-105 z-10' : 'border-white shadow-md'}`}>
              <img src={img.data} className="w-full h-full object-cover" alt="ref" />
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <span className="text-white font-black text-xs tracking-widest uppercase">{i === 0 ? '结构核心源' : `视角 ${i+1}`}</span>
              </div>
              <button onClick={() => removeImage(img.id)} className="absolute top-4 right-4 bg-red-500 text-white p-2.5 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-90">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          {images.length < 12 && (
            <label className="aspect-[3/4] flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[2.5rem] cursor-pointer hover:bg-white hover:border-black transition-all group">
              <Camera className="w-12 h-12 text-slate-300 group-hover:text-black transition-colors" />
              <span className="mt-6 text-sm font-black text-slate-400 uppercase tracking-widest group-hover:text-black">点击上传</span>
              <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
            </label>
          )}
        </div>

        <button 
          disabled={images.length === 0 || state === AppState.ANALYZING_INDIVIDUAL}
          onClick={startIndividualAnalysis}
          className="w-full py-8 rounded-[2.5rem] bg-black text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] active:scale-[0.98] transition-all shadow-2xl disabled:bg-slate-200 disabled:shadow-none"
        >
          {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Search className="w-10 h-10" /> 深度扫描产品基因</>}
        </button>
      </section>

      {/* STEP 2: INDIVIDUAL RESULTS - FULL WIDTH LIST */}
      {analysis && analysis.individualAnalyses.length > 0 && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12 w-full">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-indigo-600 text-white flex items-center justify-center text-2xl font-black">02</span>
            <h2 className="text-4xl font-black">产品视角拆解分析</h2>
          </div>
          <div className="space-y-8">
            {analysis.individualAnalyses.map((item, idx) => (
              <div key={item.id} className="flex flex-col lg:flex-row gap-10 p-10 bg-white rounded-[3rem] shadow-sm items-start border border-slate-100">
                <div className="w-full lg:w-48 aspect-square rounded-[2rem] overflow-hidden border-4 border-slate-50 flex-shrink-0">
                  <img src={images.find(img => img.id === item.id)?.data} className="w-full h-full object-cover" />
                </div>
                <div className="flex-grow w-full">
                  <div className="flex items-center justify-between mb-6">
                    <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">视觉细节描述 (全量展示 & 可交互)</label>
                    <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-wider">Ref Angle {idx+1}</span>
                  </div>
                  <textarea 
                    className="w-full p-8 text-xl font-bold bg-slate-50 border-0 rounded-3xl focus:ring-8 focus:ring-indigo-50 outline-none resize-none min-h-[120px] leading-relaxed"
                    value={item.description}
                    onChange={(e) => {
                      const n = [...analysis.individualAnalyses];
                      n[idx].description = e.target.value;
                      setAnalysis({...analysis, individualAnalyses: n});
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <button disabled={state === AppState.ANALYZING_GLOBAL} onClick={startGlobalSynthesis} className="w-full mt-12 py-8 rounded-[2.5rem] bg-indigo-600 text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] transition-all shadow-xl active:scale-[0.98]">
            {state === AppState.ANALYZING_GLOBAL ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Zap className="w-10 h-10" /> 综合生成全局档案</>}
          </button>
        </section>
      )}

      {/* STEP 3: GLOBAL CONFIG - FULL WIDTH */}
      {analysis && (state === AppState.EDITING_GLOBAL || state === AppState.GENERATING_PROMPTS || state === AppState.COMPLETED) && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12 w-full">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-emerald-600 text-white flex items-center justify-center text-2xl font-black">03</span>
            <h2 className="text-4xl font-black">全局分镜策略配置</h2>
          </div>
          <div className="bg-white p-12 rounded-[3rem] shadow-sm mb-12 space-y-12">
            <div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 block">锁定核心资产描述 (物理/结构/材质/人机互动基调)</label>
              <textarea 
                className="w-full p-10 text-2xl font-black bg-slate-50 border-0 rounded-[2.5rem] focus:ring-8 focus:ring-emerald-50 min-h-[160px] leading-snug" 
                value={analysis.globalProfile.details} 
                onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, details: e.target.value}})} 
              />
            </div>
            
            <div className="flex flex-col xl:flex-row gap-12">
              <div className="flex-1 space-y-8">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 block">品牌商业场景定位</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {SCENE_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => setSceneType(opt)} className={`py-6 px-4 rounded-3xl text-sm font-black border-4 transition-all ${sceneType === opt ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-200'}`}>{opt}</button>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 space-y-8">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 block">多维产出设置</label>
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <div className="flex bg-slate-100 p-2.5 rounded-[2rem] w-full">
                    <button onClick={() => setLanguage('zh')} className={`flex-1 py-5 text-sm font-black rounded-2xl transition-all ${language === 'zh' ? 'bg-white shadow-lg text-emerald-600' : 'text-slate-400'}`}>中文策划</button>
                    <button onClick={() => setLanguage('en')} className={`flex-1 py-5 text-sm font-black rounded-2xl transition-all ${language === 'en' ? 'bg-white shadow-lg text-emerald-600' : 'text-slate-400'}`}>ENG Creative</button>
                  </div>
                  <div className="flex items-center gap-6 bg-slate-100 px-10 py-5 rounded-[2rem] whitespace-nowrap">
                    <span className="text-sm font-black text-slate-400 uppercase">生成份数</span>
                    <input type="number" min="1" max="50" value={promptCount} onChange={e => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-16 bg-transparent text-center text-2xl font-black outline-none border-b-4 border-emerald-300 text-emerald-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-8 rounded-[2.5rem] bg-emerald-600 text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] transition-all shadow-2xl active:scale-[0.98]">
            {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Settings2 className="w-10 h-10" /> 立即启动全场景策划</>}
          </button>
        </section>
      )}

      {/* STEP 4: MASSIVE OUTPUT AREA - FULL WIDTH LIST */}
      {generatedPrompts.length > 0 && (
        <section className="space-y-16 animate-in fade-in duration-1000 w-full">
          <div className="bg-black p-12 rounded-[4rem] text-white flex flex-col xl:flex-row items-center justify-between gap-12 shadow-2xl border-4 border-slate-900">
            <div className="space-y-4 text-center xl:text-left">
              <h2 className="text-4xl font-black flex items-center justify-center xl:justify-start gap-6">
                <Package className="w-12 h-12 text-emerald-400" />
                分镜资产看板
              </h2>
              <p className="text-slate-500 font-bold text-lg">系统已为您全自动策划了 {generatedPrompts.length} 套独立商业分镜</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              <button 
                onClick={downloadPromptsAsCSV} 
                className="px-10 py-5 bg-white text-black rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 active:scale-95 transition-all shadow-lg"
              >
                <FileDown className="w-6 h-6" /> 导出策划表格
              </button>
              <button 
                onClick={startGenerateAllImages} 
                disabled={state === AppState.GENERATING_IMAGE}
                className="px-10 py-5 bg-emerald-500 text-black rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 active:scale-95 transition-all shadow-lg disabled:bg-slate-700"
              >
                {batchProgress ? (
                  <><Loader2 className="w-6 h-6 animate-spin" /> 批量生产中 {batchProgress.current}/{batchProgress.total}</>
                ) : (
                  <><Layers className="w-6 h-6" /> 一键渲染所有九宫格</>
                )}
              </button>
              {Object.keys(renderedImages).length > 0 && (
                <button 
                  onClick={downloadAllRenderedImages}
                  className="px-10 py-5 bg-indigo-500 text-white rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 active:scale-95 transition-all shadow-lg"
                >
                  <Download className="w-6 h-6" /> 批量下载九宫格图
                </button>
              )}
            </div>
          </div>

          <div className="space-y-16">
            {generatedPrompts.map((prompt, idx) => {
              const lines = prompt.split('\n').map(l => l.trim()).filter(l => l);
              const mainInstr = lines[0] || '';
              const shots = lines.filter(l => l.match(/^(?:镜头|Lens|Shot)\s*0?\d\s*:/i)).map(l => {
                const p = l.split(':');
                return { label: p[0].trim(), content: p.slice(1).join(':').trim() };
              });

              return (
                <div key={idx} className="bg-white p-12 rounded-[4rem] shadow-2xl border-4 border-slate-50 flex flex-col gap-12 hover:border-emerald-100 transition-all">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                    <div className="flex items-center gap-8">
                      <span className="w-16 h-16 rounded-[2rem] bg-slate-900 text-white flex items-center justify-center text-2xl font-black">#{idx + 1}</span>
                      <h3 className="text-3xl font-black tracking-tight">分镜方案 {idx + 1}</h3>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <button 
                        onClick={() => copyToClipboard(prompt, `all-${idx}`)} 
                        className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all flex items-center gap-3"
                      >
                        {copyStates[`all-${idx}`] ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        复制完整文本
                      </button>
                      <button 
                        onClick={() => renderSingleImage(idx)}
                        className="px-8 py-4 bg-black text-white rounded-2xl font-black text-xs hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                      >
                        <ImageIcon className="w-4 h-4" /> 渲染此套九宫格
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-12">
                    {/* 文字内容 - 彻底展开 */}
                    <div className="space-y-8 bg-slate-50 p-12 rounded-[3rem] border border-slate-100">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">九宫格核心渲染指令</label>
                          <button onClick={() => copyToClipboard(mainInstr, `instr-${idx}`)} className="text-[10px] text-emerald-600 font-bold hover:underline">点击复制</button>
                        </div>
                        <p className="text-xl font-bold text-slate-800 leading-relaxed italic">{mainInstr}</p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {shots.map((s, si) => (
                          <div key={si} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm group hover:border-emerald-200 transition-all">
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</span>
                              <button onClick={() => copyToClipboard(`${s.label}: ${s.content}`, `shot-${idx}-${si}`)} className="opacity-0 group-hover:opacity-100 transition-all">
                                {copyStates[`shot-${idx}-${si}`] ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
                              </button>
                            </div>
                            <p className="text-base font-medium text-slate-700 leading-relaxed">{s.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 媒体产出 - 全宽度显示 */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                      {/* 图片预览 */}
                      {renderedImages[idx] && (
                        <div className="space-y-6">
                           <div className="flex items-center justify-between">
                              <label className="text-xs font-black uppercase text-slate-400 tracking-widest">九宫格成品预览</label>
                              <a href={renderedImages[idx]} download={`grid_${idx+1}.png`} className="text-indigo-600 text-xs font-black flex items-center gap-2 hover:underline"><Download className="w-4 h-4" /> 下载 8K 原图</a>
                           </div>
                           <div className="aspect-video bg-slate-900 rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative group">
                              <img src={renderedImages[idx]} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm">
                                 <button onClick={() => window.open(renderedImages[idx])} className="p-6 bg-white rounded-full shadow-2xl"><Monitor className="w-8 h-8 text-black" /></button>
                              </div>
                           </div>
                        </div>
                      )}

                      {/* 视频产出 */}
                      {renderedImages[idx] && (
                        <div className="space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                             <label className="text-xs font-black uppercase text-slate-400 tracking-widest">商业动态视频产出</label>
                             <div className="flex items-center gap-4 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100">
                                <span className="text-[10px] font-black text-blue-500">份数</span>
                                <input type="number" min="1" max="10" value={videoCount} onChange={e => setVideoCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-8 bg-transparent text-center font-black outline-none border-b-2 border-blue-200 text-blue-600" />
                                <button onClick={() => generateSingleVideo(idx)} disabled={state === AppState.GENERATING_VIDEO} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black hover:bg-blue-700 shadow-md">
                                  {state === AppState.GENERATING_VIDEO ? <Loader2 className="w-3 h-3 animate-spin" /> : '驱动 Veo 生成'}
                                </button>
                             </div>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-6">
                            {(videoResults[idx] || []).map((v, vi) => (
                              <div key={v.id} className="aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-xl border-4 border-slate-50 relative group">
                                <video src={v.url} controls className="w-full h-full object-cover" />
                                <div className="absolute top-4 left-4 px-3 py-1 bg-blue-600 text-white text-[9px] font-black rounded-full shadow-lg">商业短片 {vi+1}</div>
                                <a href={v.url} download={`video_${idx+1}_${vi+1}.mp4`} className="absolute bottom-6 right-6 p-4 bg-white text-blue-600 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-90"><Download className="w-6 h-6" /></a>
                              </div>
                            ))}
                            {(!videoResults[idx] || videoResults[idx].length === 0) && (
                              <div className="aspect-video bg-slate-50 rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 gap-4">
                                 <Video className="w-12 h-12" />
                                 <span className="text-xs font-black uppercase tracking-widest">等待视频生产指令</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* FOOTER STATUS */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-2xl border-t border-slate-200 py-6 px-12 flex items-center justify-between z-50">
        <div className="flex items-center gap-6">
          <div className={`w-3 h-3 rounded-full animate-pulse ${state === AppState.IDLE ? 'bg-slate-300' : 'bg-emerald-500'}`}></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Ready</span>
            <span className="text-xs font-black text-slate-900 tracking-tight">
              {state === AppState.GENERATING_IMAGE ? `正在批量渲染资产... ${batchProgress ? `${batchProgress.current}/${batchProgress.total}` : ''}` : 
               state === AppState.GENERATING_VIDEO ? videoStatus || '正在计算动态帧...' : 
               '生产线待命中 (Structural Lock Enabled)'}
            </span>
          </div>
        </div>
        <button 
          onClick={async () => {
             // @ts-ignore
             await window.aistudio.openSelectKey();
          }}
          className="flex items-center gap-4 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs hover:bg-black transition-all shadow-xl"
        >
          <Key className="w-4 h-4" /> 视频渲染鉴权中心
        </button>
      </footer>

      {/* ERROR MODAL */}
      {error && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
           <div className="bg-white p-12 rounded-[3.5rem] shadow-[0_40px_100px_-10px_rgba(0,0,0,0.5)] max-w-lg w-full text-center space-y-8 animate-in zoom-in-95">
              <div className="w-24 h-24 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-4">
                <Package className="w-12 h-12" />
              </div>
              <h3 className="text-3xl font-black text-slate-900">生产线故障</h3>
              <p className="text-slate-500 text-lg font-medium leading-relaxed">{error}</p>
              <button onClick={() => setError(null)} className="w-full py-6 bg-black text-white rounded-3xl font-black text-xl hover:scale-105 transition-all shadow-2xl">了解并关闭</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
