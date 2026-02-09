
import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, Plus, Minus, Search, MapPin, ChevronRight, AlertTriangle, FileText, Eye, EyeOff, Tag } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { PrescriptionItem, PrescriptionShopResult, Pharmacy } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

interface PrescriptionUploadProps {
  onCancel: () => void;
  onBook: (pharmacy: Pharmacy, items: PrescriptionItem[], url: string, total: number) => void;
  userCoordinates: { lat: number; lng: number } | null;
}

const PrescriptionUpload: React.FC<PrescriptionUploadProps> = ({ onCancel, onBook, userCoordinates }) => {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'adjust' | 'compare'>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [detectedItems, setDetectedItems] = useState<PrescriptionItem[]>([]);
  const [shops, setShops] = useState<PrescriptionShopResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real AI Analysis using Gemini
  const analyzePrescription = async (file: File) => {
    setStep('analyzing');
    
    try {
        // 1. Convert File to Base64
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // Remove data url prefix (e.g. "data:image/jpeg;base64,")
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });

        // 2. Initialize Gemini
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // 3. Construct Prompt
        const prompt = `
            You are an expert pharmacist assistant. Analyze this prescription image (handwritten or printed). 
            
            Identify the list of medicines written by the doctor. Extract as much detail as possible.
            
            For each medicine, extract:
            - Name: The FULL name including strength and form (e.g., "Dolo 650mg Tab", "Augmentin Duo 625", "Ascoril LS Syrup"). Do NOT abbreviate.
            - Category: Identify the therapeutic category based on the name (e.g., "Antibiotic", "Pain Relief", "Cardiac", "Diabetic", "Vitamin", "Gastric", "Skin Care", "Other").
            - DosagePattern: The frequency (e.g., '1-0-1', '1-0-0', '0-0-1', 'SOS', 'BD', 'TDS'). Convert text frequencies to standard '1-0-1' format where possible.
            - Days: Duration in days. If not specified, estimate based on quantity or default to 5.
            - Quantity: Total pills/units needed. (e.g. if 1-0-1 for 5 days, quantity is 10).

            Ignore patient details, doctor name, or hospital info. Focus ONLY on the medicines.
            If the image is blurry or contains no medicines, return an empty list.
        `;

        // 4. Call API
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: file.type, data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            category: { type: Type.STRING },
                            dosagePattern: { type: Type.STRING },
                            days: { type: Type.NUMBER },
                            quantity: { type: Type.NUMBER }
                        },
                        required: ["name", "category", "dosagePattern", "days", "quantity"]
                    }
                }
            }
        });

        // 5. Parse Response
        if (response.text) {
             const items = JSON.parse(response.text);
             if (items.length === 0) {
                 alert("No medicines detected. Please ensure the prescription text is visible.");
                 setStep('upload');
             } else {
                 setDetectedItems(items);
                 setStep('adjust');
                 // Default to showing full image for verification
                 setShowFullImage(true);
             }
        } else {
            throw new Error("No response text from AI");
        }

    } catch (error: any) {
        console.error("AI Analysis failed", error);
        alert("Failed to analyze prescription. Please ensure the image is clear.");
        setStep('upload');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImageUrl(URL.createObjectURL(file));
      analyzePrescription(file);
    }
  };

  const updateItem = (index: number, field: keyof PrescriptionItem, value: any) => {
    const updated = [...detectedItems];
    const item = { ...updated[index], [field]: value };
    
    // Recalculate quantity based on dosage logic if inputs change
    if (field === 'days' || field === 'dosagePattern') {
       const pattern = field === 'dosagePattern' ? value : item.dosagePattern;
       const days = field === 'days' ? value : item.days;
       
       // Simple parser for "1-0-1" or "1" or "2"
       let dailyQty = 0;
       if (pattern.includes('-')) {
           dailyQty = pattern.split('-').reduce((sum: number, n: string) => sum + parseInt(n || '0'), 0);
       } else {
           dailyQty = parseInt(pattern) || 0;
       }
       // If daily qty is 0 (e.g. SOS), default to 1 per day logic or keep manual
       if (dailyQty === 0) dailyQty = 1;
       
       item.quantity = dailyQty * days;
    }
    
    updated[index] = item;
    setDetectedItems(updated);
  };

  const removeItem = (index: number) => {
    setDetectedItems(prev => prev.filter((_, i) => i !== index));
  };

  const addNewItem = () => {
    setDetectedItems([...detectedItems, { name: '', category: 'General', dosagePattern: '1-0-1', days: 3, quantity: 6 }]);
  };

  const findShops = async () => {
    if (!userCoordinates) {
        alert("Please enable location to find nearby shops.");
        return;
    }
    
    // Filter out empty items
    const validItems = detectedItems.filter(i => i.name.trim() !== '');
    if (validItems.length === 0) {
        alert("Please add at least one medicine name.");
        return;
    }
    
    setUploading(true);
    
    // 1. Upload the image first to get a permanent URL
    let finalUrl = imageUrl;
    if (imageFile) {
        const fileName = `prescriptions/${Date.now()}_${imageFile.name}`;
        const { error } = await supabase.storage.from('medicines').upload(fileName, imageFile);
        if (!error) {
            const { data } = supabase.storage.from('medicines').getPublicUrl(fileName);
            finalUrl = data.publicUrl;
            setImageUrl(finalUrl);
        } else {
            console.error("Upload failed", error);
        }
    }

    // 2. Call the RPC function
    const searchPayload = validItems.map(i => ({ name: i.name, qty: i.quantity }));
    
    const { data, error } = await supabase.rpc('find_pharmacies_for_prescription', {
        items: searchPayload,
        user_lat: userCoordinates.lat,
        user_lng: userCoordinates.lng
    });

    if (error) {
        console.error(error);
        alert("Error finding shops: " + error.message);
    } else {
        setShops(data.map((s: any) => ({
            pharmacyId: s.pharmacy_id,
            name: s.pharmacy_name,
            address: s.pharmacy_address,
            totalCost: s.total_cost,
            distance: s.distance_km
        })));
        setStep('compare');
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="bg-white w-full md:max-w-4xl h-[95vh] md:h-auto md:max-h-[90vh] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white z-10">
            <div>
                <h3 className="font-bold text-lg text-slate-800 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-[#059669]"/> 
                    {step === 'compare' ? 'Select Pharmacy' : 'Upload Prescription'}
                </h3>
            </div>
            <button onClick={onCancel} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"><X className="w-5 h-5"/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
            
            {/* STEP 1: SCAN */}
            {step === 'upload' && (
                <div className="h-full flex flex-col items-center justify-center p-6 min-h-[400px]">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full max-w-sm aspect-[3/4] md:aspect-[4/3] bg-white border-2 border-dashed border-[#059669]/30 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-[#059669]/5 hover:border-[#059669] transition-all group relative overflow-hidden shadow-sm"
                    >
                        <div className="w-24 h-24 bg-[#059669]/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <Camera className="w-10 h-10 text-[#059669]" />
                        </div>
                        <p className="font-bold text-lg text-slate-700">Tap to Scan Prescription</p>
                        <p className="text-sm text-slate-400 mt-2">Upload clear photo of the doctor's note</p>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                    </div>
                    
                    <div className="mt-8 flex items-start bg-blue-50 p-4 rounded-xl border border-blue-100 max-w-sm">
                        <AlertTriangle className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0" />
                        <p className="text-xs text-blue-700 leading-relaxed font-medium">
                            AI will auto-detect medicine names and categories. You can verify and edit the list before searching.
                        </p>
                    </div>
                </div>
            )}

            {/* STEP 2: ANALYZING */}
            {step === 'analyzing' && (
                <div className="h-full flex flex-col items-center justify-center py-20 text-center min-h-[400px]">
                    <div className="relative w-64 h-64 mb-8">
                        <div className="absolute inset-0 bg-[#059669]/20 rounded-full animate-ping opacity-20"></div>
                        <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-[#059669]/10">
                             <img src={imageUrl} alt="Scanning" className="w-48 h-48 object-cover rounded-full opacity-80" />
                        </div>
                        <div className="absolute inset-0 border-t-4 border-[#059669] rounded-full animate-spin"></div>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800">Analyzing...</h3>
                    <p className="text-slate-500 mt-2 font-medium">Detecting medicines & therapeutic categories</p>
                </div>
            )}

            {/* STEP 3: ADJUST */}
            {step === 'adjust' && (
                <div className="flex flex-col md:flex-row h-full">
                    
                    {/* Image Panel */}
                    <div className={`md:w-1/2 bg-slate-900 flex flex-col transition-all duration-300 ${showFullImage ? 'h-[40vh] md:h-auto p-4' : 'h-0 md:h-auto md:w-0 overflow-hidden opacity-0 md:opacity-100'}`}>
                        <div className="flex-1 flex items-center justify-center bg-black/40 rounded-xl overflow-hidden relative border border-slate-700">
                             <img src={imageUrl} className="w-full h-full object-contain" alt="Original Rx" />
                        </div>
                    </div>

                    {/* Form Panel */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 sticky top-0 bg-slate-50 z-10 pb-2 border-b border-slate-200/50">
                            <div>
                                <h4 className="font-bold text-slate-800">Detected Medicines</h4>
                                <p className="text-xs text-slate-500">{detectedItems.length} items found</p>
                            </div>
                            <button 
                                onClick={() => setShowFullImage(!showFullImage)}
                                className="text-xs font-bold text-[#059669] bg-[#059669]/10 px-3 py-1.5 rounded-lg flex items-center hover:bg-[#059669]/20 transition"
                            >
                                {showFullImage ? <><EyeOff className="w-3 h-3 mr-1"/> Hide Image</> : <><Eye className="w-3 h-3 mr-1"/> View Image</>}
                            </button>
                        </div>

                        <div className="space-y-4">
                            {detectedItems.map((item, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 group hover:border-[#059669]/50 transition-colors">
                                    <div className="flex justify-between items-start mb-3 gap-3">
                                        <div className="flex-1">
                                            <div className="flex justify-between">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Medicine Name & Strength</label>
                                                {item.category && (
                                                    <span className="flex items-center text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                        <Tag className="w-3 h-3 mr-1" /> {item.category}
                                                    </span>
                                                )}
                                            </div>
                                            <input 
                                                value={item.name} 
                                                onChange={(e) => updateItem(idx, 'name', e.target.value)}
                                                className="font-bold text-slate-800 text-sm border-b border-slate-200 outline-none w-full py-1 focus:border-[#059669] bg-transparent transition-colors"
                                                placeholder="e.g. Dolo 650mg"
                                            />
                                        </div>
                                        <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500 p-1"><X className="w-4 h-4"/></button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Frequency</label>
                                            <input 
                                                value={item.dosagePattern} 
                                                onChange={(e) => updateItem(idx, 'dosagePattern', e.target.value)}
                                                className="w-full p-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-blue-500 text-center transition-all placeholder-blue-300"
                                                placeholder="1-0-1" 
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Days</label>
                                            <div className="flex items-center">
                                                <button onClick={() => updateItem(idx, 'days', Math.max(1, item.days - 1))} className="p-1.5 bg-amber-100 rounded-l-lg hover:bg-amber-200 text-amber-700 border-y border-l border-amber-100"><Minus className="w-3 h-3"/></button>
                                                <input 
                                                    type="number"
                                                    value={item.days}
                                                    onChange={(e) => updateItem(idx, 'days', parseInt(e.target.value) || 1)}
                                                    className="w-full text-center bg-amber-50 text-amber-700 py-1.5 text-xs font-bold outline-none border-y border-amber-100 focus:border-amber-300 transition-all"
                                                />
                                                <button onClick={() => updateItem(idx, 'days', item.days + 1)} className="p-1.5 bg-amber-100 rounded-r-lg hover:bg-amber-200 text-amber-700 border-y border-r border-amber-100"><Plus className="w-3 h-3"/></button>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Total Units</label>
                                            <div className="p-1.5 bg-[#059669]/10 rounded-lg">
                                                <p className="text-sm font-bold text-[#059669]">{item.quantity}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button onClick={addNewItem} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 font-bold text-sm hover:bg-white hover:border-[#059669] hover:text-[#059669] transition flex items-center justify-center">
                                <Plus className="w-4 h-4 mr-2" /> Add Another Medicine
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 4: COMPARE SHOPS */}
            {step === 'compare' && (
                <div className="p-6">
                    <div className="flex justify-between items-end mb-6">
                         <div>
                            <h4 className="font-bold text-slate-900 text-xl">Matching Pharmacies</h4>
                            <p className="text-sm text-slate-500 mt-1">Showing stores that have <strong>all</strong> items in stock.</p>
                         </div>
                         <div className="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1 rounded-lg">
                             {shops.length} Found
                         </div>
                    </div>
                    
                    <div className="space-y-4">
                        {shops.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Search className="w-8 h-8 text-slate-300" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-700">No Match Found</h3>
                                <p className="text-slate-400 text-sm mb-4 max-w-xs mx-auto">None of the nearby shops have ALL the prescribed medicines in stock right now.</p>
                                <button onClick={() => setStep('adjust')} className="text-[#059669] font-bold text-sm hover:underline">Modify Medicine List</button>
                            </div>
                        ) : (
                            shops.map(shop => (
                                <div key={shop.pharmacyId} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-[#059669]/50 hover:shadow-md transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-[#059669] text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm">
                                        BEST MATCH
                                    </div>
                                    <div className="flex justify-between items-start mb-3 mt-1">
                                        <div>
                                            <h5 className="font-bold text-slate-800 text-lg group-hover:text-[#059669] transition-colors">{shop.name}</h5>
                                            <div className="flex items-center text-xs text-slate-500 mt-1">
                                                <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400" /> {shop.distance.toFixed(1)} km • {shop.address}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-end justify-between mt-4 pt-4 border-t border-slate-50">
                                        <div>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Estimated Total</p>
                                            <p className="text-2xl font-bold text-slate-900">₹{shop.totalCost}</p>
                                        </div>
                                        <button 
                                            onClick={() => onBook({
                                                id: shop.pharmacyId,
                                                name: shop.name,
                                                address: shop.address,
                                                price: shop.totalCost,
                                                latitude: 0, longitude: 0 // Mock, handled by RPC
                                            } as Pharmacy, detectedItems, imageUrl, shop.totalCost)}
                                            className="bg-[#059669] text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-[#059669]/30 hover:bg-[#047857] active:scale-95 transition flex items-center"
                                        >
                                            Book Order <ChevronRight className="w-4 h-4 ml-1" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-100 bg-white z-20">
            {step === 'adjust' && (
                <button 
                    onClick={findShops} 
                    disabled={uploading || detectedItems.length === 0}
                    className="w-full py-4 bg-[#059669] text-white rounded-xl font-bold text-lg shadow-lg shadow-[#059669]/30 hover:bg-[#047857] transition flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {uploading ? <Loader2 className="animate-spin w-6 h-6" /> : <><Search className="w-5 h-5 mr-2" /> Find Pharmacies</>}
                </button>
            )}
            {step === 'compare' && (
                <button onClick={() => setStep('adjust')} className="w-full py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition">
                    Modify Medicine List
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default PrescriptionUpload;
