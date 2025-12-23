
import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Trash2, 
  Search, 
  Loader2, 
  Box, 
  Zap, 
  RefreshCw, 
  Settings2, 
  Table as TableIcon, 
  CheckCircle2, 
  Copy, 
  ImageIcon, 
  Download, 
  Check, 
  Sparkles,
  ChevronRight,
  Info,
  Edit3,
  LayoutGrid,
  Layers,
  FileText,
  Video,
  Play,
  Key,
  ClipboardCopy,
  ClipboardCheck
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
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number>(0);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [videoResults, setVideoResults] = useState<VideoResult[]>([]);
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  // Feedback states for copy buttons
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
      setError("逐图分析失败，请稍后重试。");
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
      setError("综合推导失败，请重试。");
      setState(AppState.EDITING_INDIVIDUAL);
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    try {
      const results = await generateStoryboards(analysis.globalProfile, promptCount, language, sceneType);
      setGeneratedPrompts(results);
      setSelectedPromptIndex(0);
      setState(AppState.COMPLETED);
    } catch (err) {
      setError("分镜生成失败。");
      setState(AppState.EDITING_GLOBAL);
    }
  };

  const startGenerateImage = async () => {
    const prompt = generatedPrompts[selectedPromptIndex];
    if (!prompt) return;
    setState(AppState.GENERATING_IMAGE);
    setFinalImage(null);
    try {
      const img = await generateStoryboardImage(prompt);
      setFinalImage(img);
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError("图片渲染失败。");
      setState(AppState.COMPLETED);
    }
  };

  const checkAndOpenKeySelector = async () => {
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
  };

  const startGenerateVideo = async () => {
    const prompt = generatedPrompts[selectedPromptIndex];
    if (!prompt || !finalImage) return;

    await checkAndOpenKeySelector();

    setState(AppState.GENERATING_VIDEO);
    setVideoResults([]);
    
    try {
      const urls: VideoResult[] = [];
      for (let i = 0; i < videoCount; i++) {
        setVideoStatus(`正在生成第 ${i + 1} / ${videoCount} 个视频...`);
        const videoUrl = await generateVideo(prompt, finalImage, (status) => setVideoStatus(`[视频 ${i + 1}/${videoCount}] ${status}`));
        urls.push({ id: Math.random().toString(36).substr(2, 9), url: videoUrl });
        setVideoResults([...urls]); 
      }
      setState(AppState.COMPLETED);
    } catch (err: any) {
      if (err.message === "API_KEY_EXPIRED") {
        setError("API Key 失效或未找到，请重新选择有余额的付费项目 Key。");
        // @ts-ignore
        await window.aistudio.openSelectKey();
      } else {
        setError("视频渲染失败，请确保您已选择付费 API Key 且网络正常。");
      }
      setState(AppState.COMPLETED);
    } finally {
      setVideoStatus('');
    }
  };

  const downloadPromptsAsCSV = () => {
    if (generatedPrompts.length === 0) return;
    const headers = ['ID', 'Context', 'Lens 01', 'Lens 02', 'Lens 03', 'Lens 04', 'Lens 05', 'Lens 06', 'Lens 07', 'Lens 08', 'Lens 09'];
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
    link.setAttribute('href', url);
    link.setAttribute('download', `storyboards_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getGridInstruction = (fullPrompt: string) => {
    return fullPrompt.split('\n')[0] || '';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 bg-slate-50 min-h-screen text-slate-800 font-sans pb-24">
      <header className="mb-12 text-center animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="inline-flex items-center justify-center p-4 bg-blue-600 rounded-3xl mb-6 shadow-xl shadow-blue-200">
          <Sparkles className="text-white w-10 h-10" />
        </div>
        <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-4">
          Storyboard Master AI
        </h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-xl font-medium">
          深度分析产品参考图，为您策划极具一致性与电影感的 9 宫格商业分镜及 15S 商业视频。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* 左侧工作流 */}
        <div className="lg:col-span-5 space-y-8">
          
          <section className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100">
            <h2 className="text-2xl font-black mb-8 flex items-center gap-4 text-slate-900">
              <span className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold">1</span>
              上传参考图 (最大10张)
            </h2>
            
            <div className="grid grid-cols-5 gap-4 mb-8">
              {images.map((img, i) => (
                <div key={img.id} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-slate-100 group transition-all hover:scale-105 shadow-sm">
                  <img src={img.data} className="w-full h-full object-cover" alt={`Ref ${i+1}`} />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded-lg backdrop-blur-sm">
                     <span className="text-[10px] font-black text-white">图{i+1}</span>
                  </div>
                  <button onClick={() => removeImage(img.id)} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {images.length < 10 && (
                <label className="aspect-square flex flex-col items-center justify-center border-3 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                  <Camera className="w-8 h-8 text-slate-300 group-hover:text-blue-500" />
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
                </label>
              )}
            </div>

            <button 
              disabled={images.length === 0 || state === AppState.ANALYZING_INDIVIDUAL}
              onClick={startIndividualAnalysis}
              className={`w-full py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-95 ${
                images.length === 0 || state === AppState.ANALYZING_INDIVIDUAL 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-200'
              }`}
            >
              {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Search className="w-6 h-6" /> 开始逐图分析</>}
            </button>
          </section>

          {analysis && analysis.individualAnalyses.length > 0 && (
            <section className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 animate-in fade-in slide-in-from-bottom-8">
              <h2 className="text-2xl font-black mb-8 flex items-center gap-4 text-slate-900">
                <span className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">2</span>
                参考图详情
              </h2>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-3 custom-scrollbar">
                {analysis.individualAnalyses.map((item, idx) => (
                  <div key={item.id} className="flex gap-4 p-4 bg-slate-50 rounded-[1.5rem] border border-slate-100">
                    <img src={images.find(img => img.id === item.id)?.data} className="w-20 h-20 rounded-xl object-cover border-2 border-white shadow-sm" />
                    <textarea 
                      className="flex-grow p-3 text-sm bg-white border-0 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      value={item.description}
                      rows={2}
                      onChange={(e) => {
                        const n = [...analysis.individualAnalyses];
                        n[idx].description = e.target.value;
                        setAnalysis({...analysis, individualAnalyses: n});
                      }}
                    />
                  </div>
                ))}
              </div>
              <button disabled={state === AppState.ANALYZING_GLOBAL} onClick={startGlobalSynthesis} className="w-full mt-6 py-4 rounded-2xl bg-indigo-600 text-white font-black flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg">
                {state === AppState.ANALYZING_GLOBAL ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-5 h-5" /> 推导全局档案</>}
              </button>
            </section>
          )}

          {analysis && (state === AppState.EDITING_GLOBAL || state === AppState.GENERATING_PROMPTS || state === AppState.COMPLETED) && (
            <section className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 animate-in fade-in slide-in-from-bottom-8">
              <h2 className="text-2xl font-black mb-8 flex items-center gap-4 text-slate-900">
                <span className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-lg font-bold">3</span>
                商业档案与生成
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">产品结构细节</label>
                  <textarea className="w-full p-4 text-sm bg-slate-50 border-0 rounded-2xl focus:ring-2 focus:ring-emerald-500 min-h-[80px]" value={analysis.globalProfile.details} onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, details: e.target.value}})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">场景风格选择</label>
                  <div className="grid grid-cols-3 gap-2">
                    {SCENE_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => setSceneType(opt)} className={`py-3 px-2 rounded-xl text-[10px] font-black border-2 transition-all ${sceneType === opt ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-100 text-slate-500'}`}>{opt}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                    <button onClick={() => setLanguage('zh')} className={`px-5 py-2.5 text-xs font-black rounded-xl ${language === 'zh' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>中</button>
                    <button onClick={() => setLanguage('en')} className={`px-5 py-2.5 text-xs font-black rounded-xl ${language === 'en' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>EN</button>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl">
                    <span className="text-xs font-black text-slate-500">份数:</span>
                    <input type="number" min="1" max="50" value={promptCount} onChange={e => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-10 bg-transparent text-center font-black outline-none border-b-2 border-emerald-200" />
                  </div>
                </div>
                <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-5 rounded-[1.5rem] bg-emerald-600 text-white font-black text-lg flex items-center justify-center gap-3 hover:bg-emerald-700 shadow-xl">
                  {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Settings2 className="w-6 h-6" /> 生成策划方案</>}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* 右侧展示区 */}
        <div className="lg:col-span-7 space-y-8">
          {generatedPrompts.length > 0 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
              <section className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                   <h2 className="text-2xl font-black">分镜方案列表</h2>
                   <div className="flex items-center gap-4">
                      <button 
                        onClick={() => copyToClipboard(generatedPrompts.join('\n\n---\n\n'), 'copy-all')} 
                        className="text-xs font-black text-slate-400 hover:text-emerald-600 flex items-center gap-1.5 transition-colors"
                      >
                        {copyStates['copy-all'] ? <ClipboardCheck className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                        {copyStates['copy-all'] ? '已复制全部' : '复制所有方案'}
                      </button>
                      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar max-w-[200px]">
                        {generatedPrompts.map((_, i) => (
                          <button key={i} onClick={() => setSelectedPromptIndex(i)} className={`flex-shrink-0 w-8 h-8 rounded-lg font-black border-2 transition-all ${selectedPromptIndex === i ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-100 text-slate-400'}`}>{i+1}</button>
                        ))}
                      </div>
                   </div>
                </div>

                <div className="relative mb-6">
                  <div className="bg-slate-900 text-emerald-400 p-6 rounded-[1.5rem] font-mono text-[13px] leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar shadow-inner">
                    <div className="whitespace-pre-wrap">{generatedPrompts[selectedPromptIndex]}</div>
                  </div>
                  <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <button 
                      onClick={() => copyToClipboard(generatedPrompts[selectedPromptIndex], 'copy-full')} 
                      className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-all flex items-center gap-2 group"
                      title="复制完整提示词"
                    >
                      {copyStates['copy-full'] ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                      <span className="text-[10px] font-black hidden group-hover:inline">{copyStates['copy-full'] ? '已复制' : '复制完整'}</span>
                    </button>
                    <button 
                      onClick={() => copyToClipboard(getGridInstruction(generatedPrompts[selectedPromptIndex]), 'copy-grid')} 
                      className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-all flex items-center gap-2 group"
                      title="仅复制网格生成指令"
                    >
                      {copyStates['copy-grid'] ? <Check className="w-5 h-5 text-emerald-400" /> : <LayoutGrid className="w-5 h-5" />}
                      <span className="text-[10px] font-black hidden group-hover:inline">{copyStates['copy-grid'] ? '已复制' : '复制指令'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-8 px-2">
                   <button onClick={downloadPromptsAsCSV} className="text-xs font-black text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5">
                      <TableIcon className="w-3.5 h-3.5" /> 下载表格数据 (.csv)
                   </button>
                </div>

                <div className="flex gap-4">
                  <button onClick={startGenerateImage} disabled={state === AppState.GENERATING_IMAGE} className="flex-1 py-5 rounded-3xl bg-slate-900 text-white font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl">
                    {state === AppState.GENERATING_IMAGE ? <><Loader2 className="w-6 h-6 animate-spin" /> 渲染九宫格...</> : <><ImageIcon className="w-6 h-6" /> 渲染 3x3 图片</>}
                  </button>
                  
                  {finalImage && (
                    <div className="flex items-center gap-4 bg-slate-50 px-6 rounded-3xl border border-slate-100">
                      <span className="text-xs font-black text-slate-500">视频数:</span>
                      <input type="number" min="1" max="50" value={videoCount} onChange={e => setVideoCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-10 bg-transparent text-center font-black outline-none border-b-2 border-slate-200" />
                      <button onClick={startGenerateVideo} disabled={state === AppState.GENERATING_VIDEO} className="ml-2 bg-blue-600 text-white px-8 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 shadow-lg">
                        {state === AppState.GENERATING_VIDEO ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Video className="w-4 h-4" /> 生成 15S 视频</>}
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {finalImage && (
                <section className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-slate-900 relative">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-black">图片成品展示</h2>
                    <a href={finalImage} download="storyboard.png" className="flex items-center gap-2 text-indigo-600 font-black"><Download className="w-5 h-5" /> 下载图片</a>
                  </div>
                  <div className="rounded-[1.5rem] overflow-hidden bg-slate-900">
                    <img src={finalImage} className="w-full h-auto object-contain" alt="Grid" />
                  </div>
                </section>
              )}

              {videoResults.length > 0 && (
                <section className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-blue-600 space-y-8 animate-in slide-in-from-bottom-10">
                  <h2 className="text-2xl font-black flex items-center gap-3"><Play className="w-8 h-8 text-blue-600" /> 商业视频成品 ({videoResults.length})</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {videoResults.map((v, i) => (
                      <div key={v.id} className="relative rounded-[2rem] overflow-hidden bg-black aspect-video group shadow-xl">
                        <video src={v.url} controls className="w-full h-full object-cover" />
                        <div className="absolute top-4 left-4 bg-blue-600/80 backdrop-blur-md text-white text-[10px] font-black px-3 py-1 rounded-full">视频 {i+1}</div>
                        <a href={v.url} download={`video_${i+1}.mp4`} className="absolute bottom-4 right-4 p-3 bg-white text-blue-600 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all"><Download className="w-6 h-6" /></a>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {!generatedPrompts.length && state !== AppState.GENERATING_PROMPTS && (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-slate-200 border-4 border-dashed border-slate-100 rounded-[3rem] p-16 bg-white/50">
               <div className="p-10 bg-white rounded-full mb-8 shadow-xl"><LayoutGrid className="w-20 h-20 text-slate-100" /></div>
               <h3 className="text-2xl font-black text-slate-300">创作中心</h3>
               <p className="text-slate-400 mt-4 max-w-sm text-center font-medium">请按顺序完成左侧工作流，系统将为您生成专业的商业影像资产。</p>
            </div>
          )}
          
          {state === AppState.GENERATING_VIDEO && (
             <div className="h-full min-h-[500px] flex flex-col items-center justify-center space-y-10 bg-blue-50/20 rounded-[4rem] border-4 border-blue-100 border-dashed animate-pulse p-12 text-center">
                <div className="relative">
                  <Loader2 className="w-24 h-24 text-blue-400 animate-spin" />
                  <Video className="w-10 h-10 text-blue-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div>
                   <p className="text-3xl font-black text-blue-600 mb-4">{videoStatus || "正在驱动 Veo 引擎生成短片..."}</p>
                   <p className="text-blue-400 text-lg font-bold">这可能需要几分钟。您可以点击侧边菜单的其他功能或稍作休息。</p>
                   <div className="mt-8 flex justify-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce delay-0"></div>
                      <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce delay-150"></div>
                      <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce delay-300"></div>
                   </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm max-w-sm">
                   <p className="text-[10px] font-black uppercase text-blue-400 mb-2">温馨提示</p>
                   <p className="text-xs text-slate-500 leading-relaxed font-medium">Veo 引擎需要付费 API Key，请确保您的 Google AI Studio 账号已开启结算且额度充足。</p>
                </div>
             </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-12">
          <div className="bg-red-600 text-white px-10 py-5 rounded-[2rem] shadow-2xl flex items-center gap-5 border-4 border-white">
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center font-black">!</div>
            <p className="font-black text-lg">{error}</p>
            <button onClick={() => setError(null)} className="ml-6 p-2.5 hover:bg-red-500 rounded-2xl transition-all"><Check className="w-6 h-6" /></button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 py-4 px-8 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Ready • AI Engines Online</span>
        </div>
        <button 
          onClick={async () => {
             // @ts-ignore
             await window.aistudio.openSelectKey();
          }}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-600 transition-colors"
        >
          <Key className="w-3.5 h-3.5" /> 切换 API KEY (Veo 专用)
        </button>
      </div>
    </div>
  );
};

export default App;
