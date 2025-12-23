
import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  RefreshCw, 
  LayoutGrid, 
  ChevronRight, 
  Edit3, 
  Check, 
  Image as ImageIcon, 
  Loader2, 
  Trash2, 
  FileText, 
  Settings2, 
  Copy, 
  Download, 
  Box, 
  ExternalLink,
  Table as TableIcon
} from 'lucide-react';
import { AppState, ProductAnalysis, SceneType } from './types';
import { analyzeProduct, generateStoryboards, generateStoryboardImage } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [images, setImages] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [sceneType, setSceneType] = useState<SceneType>('Studio');
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number>(0);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const startAnalysis = async () => {
    if (images.length === 0) return;
    setState(AppState.ANALYZING);
    setError(null);
    try {
      const result = await analyzeProduct(images);
      setAnalysis(result);
      setState(AppState.EDITING_ANALYSIS);
    } catch (err: any) {
      setError("Failed to analyze product. Please verify image quality.");
      setState(AppState.IDLE);
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    try {
      const results = await generateStoryboards(analysis, promptCount, language, sceneType);
      setGeneratedPrompts(results);
      setSelectedPromptIndex(0);
      setState(AppState.COMPLETED);
    } catch (err) {
      setError("Failed to generate storyboard variations.");
      setState(AppState.EDITING_ANALYSIS);
    }
  };

  const generateImage = async () => {
    const prompt = generatedPrompts[selectedPromptIndex];
    if (!prompt) return;
    setState(AppState.GENERATING_IMAGE);
    setFinalImage(null);
    try {
      const img = await generateStoryboardImage(prompt);
      setFinalImage(img);
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError("Image generation failed. Please try again or check your prompt.");
      setState(AppState.COMPLETED);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadPromptsAsCSV = () => {
    if (generatedPrompts.length === 0) return;

    // CSV Headers
    const headers = ['ID', 'Context', 'Lens 01', 'Lens 02', 'Lens 03', 'Lens 04', 'Lens 05', 'Lens 06', 'Lens 07', 'Lens 08', 'Lens 09'];
    
    const rows = generatedPrompts.map((prompt, index) => {
      // Split by common separators (newlines)
      const lines = prompt.split(/\n+/).map(l => l.trim()).filter(l => l);
      
      const id = (index + 1).toString();
      const context = lines[0] || '';
      
      // Extract individual lens descriptions using regex to find "镜头XX:" or "Lens XX:"
      const lensData = new Array(9).fill('');
      for (let i = 1; i <= 9; i++) {
        const pattern = new RegExp(`(?:镜头|Lens|Shot)\\s*0?${i}\\s*:?\\s*(.*)`, 'i');
        const match = lines.find(l => pattern.test(l));
        if (match) {
          lensData[i - 1] = match.replace(/^(?:镜头|Lens|Shot)\s*0?${i}\s*:?\s*/i, '').trim();
        }
      }

      return [id, context, ...lensData].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // \ufeff is for Excel UTF-8 support
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `storyboards_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-12 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-blue-50 rounded-2xl mb-4">
          <LayoutGrid className="text-blue-600 w-10 h-10" />
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
          AI Product Storyboard Creator
        </h1>
        <p className="mt-4 text-slate-500 max-w-2xl mx-auto text-lg">
          Transform product photos into consistent, cinematic 9-grid storyboards using advanced AI analysis.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Step 1: Upload & Analysis */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm">1</span>
              Upload Reference
            </h2>
            
            <div className="grid grid-cols-3 gap-3 mb-6">
              {images.map((img, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group ring-offset-2 hover:ring-2 hover:ring-blue-400 transition-all">
                  <img src={img} className="w-full h-full object-cover" alt="Upload" />
                  <button 
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 bg-red-500/90 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {images.length < 6 && (
                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                  <Camera className="w-7 h-7 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <span className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">Add image</span>
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
                </label>
              )}
            </div>

            <button 
              disabled={images.length === 0 || state === AppState.ANALYZING}
              onClick={startAnalysis}
              className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${
                images.length === 0 || state === AppState.ANALYZING 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
              }`}
            >
              {state === AppState.ANALYZING ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Box className="w-5 h-5" />
                  Analyze Product Features
                </>
              )}
            </button>
          </section>

          {analysis && (
            <section className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in slide-in-from-bottom-6 duration-500">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm">2</span>
                  Refine Analysis
                </h2>
                <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-full uppercase">Editable</span>
              </div>
              
              <div className="space-y-5">
                {[
                  { label: 'Product Details', value: analysis.details, key: 'details' },
                  { label: 'Target Usage', value: analysis.usage, key: 'usage' },
                  { label: 'Step-by-Step Instructions', value: analysis.howToUse, key: 'howToUse' }
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">{field.label}</label>
                    <textarea 
                      className="w-full p-4 text-sm bg-slate-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none min-h-[100px] transition-all"
                      value={field.value}
                      onChange={(e) => setAnalysis({...analysis, [field.key as keyof ProductAnalysis]: e.target.value})}
                      placeholder={`Enter ${field.label.toLowerCase()}...`}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 space-y-6">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Scene Background</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SCENE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setSceneType(opt)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold border-2 transition-all ${
                          sceneType === opt 
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700' 
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                    <button 
                      onClick={() => setLanguage('zh')}
                      className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${language === 'zh' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                    >
                      CN
                    </button>
                    <button 
                      onClick={() => setLanguage('en')}
                      className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${language === 'en' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                    >
                      EN
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500">Qty (1-50):</span>
                    <input 
                      type="number" 
                      min="1" 
                      max="50"
                      value={promptCount}
                      onChange={(e) => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-16 py-2 px-1 border-2 rounded-xl text-center text-sm font-black border-slate-100 outline-none focus:border-indigo-400 transition-all"
                    />
                  </div>
                </div>
                
                <button 
                  onClick={startPromptGeneration}
                  disabled={state === AppState.GENERATING_PROMPTS}
                  className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    state === AppState.GENERATING_PROMPTS
                      ? 'bg-slate-100 text-slate-400'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-200'
                  }`}
                >
                  {state === AppState.GENERATING_PROMPTS ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Settings2 className="w-5 h-5" />
                      Generate {promptCount} Storyboards
                    </>
                  )}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Step 3: Prompt Selection & Grid Image Result */}
        <div className="lg:col-span-8 space-y-6">
          {generatedPrompts.length > 0 && (
            <div className="space-y-6 animate-in fade-in duration-700">
              <section className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-black flex items-center gap-3 text-slate-800">
                      <span className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg">3</span>
                      Storyboard Variations
                    </h2>
                    <button
                      onClick={downloadPromptsAsCSV}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all active:scale-95 border border-emerald-200"
                    >
                      <TableIcon className="w-4 h-4" />
                      Export Spreadsheet
                    </button>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar max-w-full md:max-w-[300px]">
                    {generatedPrompts.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedPromptIndex(i)}
                        className={`flex-shrink-0 w-10 h-10 rounded-xl font-bold transition-all border-2 ${
                          selectedPromptIndex === i 
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700 scale-110' 
                            : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative group">
                  <div className="bg-slate-50 border-2 border-slate-100 p-8 rounded-3xl font-mono text-sm text-slate-700 leading-relaxed max-h-[500px] overflow-y-auto custom-scrollbar shadow-inner">
                    <div className="whitespace-pre-wrap">
                      {generatedPrompts[selectedPromptIndex]}
                    </div>
                  </div>
                  <button 
                    onClick={() => copyToClipboard(generatedPrompts[selectedPromptIndex])}
                    className="absolute top-4 right-4 p-3 bg-white text-slate-500 rounded-2xl shadow-lg border border-slate-100 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-90"
                    title="Copy Prompt"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-10 flex flex-col items-center">
                  <button
                    onClick={generateImage}
                    disabled={state === AppState.GENERATING_IMAGE}
                    className={`group px-12 py-5 rounded-3xl font-black text-xl flex items-center justify-center gap-4 transition-all shadow-2xl ${
                      state === AppState.GENERATING_IMAGE
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-900 text-white hover:bg-black hover:scale-[1.03] active:scale-95'
                    }`}
                  >
                    {state === AppState.GENERATING_IMAGE ? (
                      <>
                        <Loader2 className="w-7 h-7 animate-spin" />
                        Rendering High-Res Grid...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-7 h-7 group-hover:rotate-12 transition-transform" />
                        Generate 3x3 Grid Image
                      </>
                    )}
                  </button>
                  <p className="mt-4 text-sm text-slate-400 font-medium flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    Strict consistency for characters, objects, and high quality lighting
                  </p>
                </div>
              </section>

              {finalImage && (
                <section className="bg-white p-8 rounded-[2rem] shadow-2xl border-4 border-slate-900 animate-in zoom-in-95 duration-700">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                      <ImageIcon className="w-7 h-7 text-indigo-600" />
                      Production Ready Output
                    </h2>
                    <a 
                      href={finalImage} 
                      download="ai-storyboard-9grid.png"
                      className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2 active:scale-95"
                    >
                      <Download className="w-5 h-5" />
                      Save as PNG
                    </a>
                  </div>
                  <div className="relative rounded-[2rem] overflow-hidden bg-slate-100 shadow-inner group">
                    <img src={finalImage} className="w-full h-auto object-contain cursor-zoom-in" alt="Final Cinematic Storyboard Grid" />
                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                  <div className="mt-8 grid grid-cols-3 gap-6">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Consistency</p>
                      <p className="text-sm font-bold text-slate-700">Product internal/external structure locked</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Cohesion</p>
                      <p className="text-sm font-bold text-slate-700">Lighting & wardrobe strictly matched</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Resolution</p>
                      <p className="text-sm font-bold text-slate-700">8K Cinematic Style at 16:9 Aspect</p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {!generatedPrompts.length && state !== AppState.GENERATING_PROMPTS && (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-100 rounded-[3rem] p-12 text-center bg-slate-50/50">
              <div className="p-8 bg-white rounded-full mb-6 shadow-xl shadow-slate-200/50">
                <LayoutGrid className="w-16 h-16 text-slate-200" />
              </div>
              <h3 className="text-xl font-black text-slate-400">Storyboard Workspace</h3>
              <p className="text-slate-400 mt-2 max-w-xs mx-auto">Upload and analyze your product to begin crafting professional visual boards.</p>
            </div>
          )}

          {state === AppState.GENERATING_PROMPTS && (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center space-y-6 bg-indigo-50/30 rounded-[3rem] border border-indigo-100">
              <div className="relative">
                <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                <Settings2 className="w-6 h-6 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-indigo-600 animate-pulse tracking-tight">Designing {promptCount} Storyboards...</p>
                <p className="text-indigo-400 text-sm mt-2">Balancing continuity and visual flair for {sceneType} scenes.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10">
          <div className="bg-red-600 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 border-4 border-white">
            <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center font-bold">!</div>
            <p className="font-bold">{error}</p>
            <button onClick={() => setError(null)} className="ml-4 p-2 hover:bg-red-500 rounded-xl transition-colors">
              <Check className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <footer className="mt-24 py-12 border-t border-slate-200 text-center space-y-4">
        <div className="flex justify-center gap-6 grayscale opacity-50">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400">Gemini 3 Pro</div>
          <div className="text-xs font-black uppercase tracking-widest text-slate-400">Image Gen 2.5</div>
          <div className="text-xs font-black uppercase tracking-widest text-slate-400">Cinematic Tech</div>
        </div>
        <p className="text-slate-400 font-medium">&copy; 2024 AI Product Storyboarder. Professional Visual Marketing Tool.</p>
      </footer>
    </div>
  );
};

export default App;
