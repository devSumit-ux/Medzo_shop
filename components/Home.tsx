
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, MapPin, ChevronRight, Loader2, Navigation, Clock, Store, Star, BadgeCheck, Tag, Sparkles, Frown, ImageIcon } from 'lucide-react';
import { Medicine, Pharmacy } from '../types';
import { CATEGORIES } from '../constants';
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from '../supabaseClient';

interface HomeProps {
  onMedicineClick: (medicine: Medicine) => void;
  isSearchFocused?: boolean;
  medicines?: Medicine[];
  locationName: string;
  isLocating: boolean;
  onDetectLocation: () => void;
  avatarUrl?: string | null;
  nearbyStoreCount?: number;
  nearbyPharmacies?: Pharmacy[];
}

const PharmacyCard: React.FC<{ pharmacy: Pharmacy }> = ({ pharmacy }) => (
  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3 h-full hover:border-[#059669] transition cursor-pointer group">
      <div className="flex justify-between items-start">
          <div>
              <h3 className="font-bold text-slate-800 text-lg group-hover:text-[#059669] transition-colors line-clamp-1">{pharmacy.name}</h3>
              <p className="text-xs text-slate-500 mt-1 flex items-center">
                  <MapPin className="w-3 h-3 mr-1" /> 
                  {pharmacy.distance !== null && pharmacy.distance !== undefined 
                    ? `${pharmacy.distance.toFixed(1)} km` 
                    : 'Location Not Set'}
              </p>
          </div>
          <div className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center flex-shrink-0">
              {pharmacy.rating} <Star className="w-3 h-3 ml-1 fill-current" />
          </div>
      </div>
      <p className="text-xs text-slate-500 line-clamp-2">{pharmacy.address || "Address not available"}</p>
      <div className="mt-auto pt-3 border-t border-slate-50 flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md flex items-center">
              <Clock className="w-3 h-3 mr-1" /> Open
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              {pharmacy.reviewCount} Reviews
          </span>
      </div>
  </div>
);

const Home: React.FC<HomeProps> = ({ 
  onMedicineClick, 
  isSearchFocused = false, 
  medicines = [],
  locationName,
  isLocating,
  onDetectLocation,
  avatarUrl,
  nearbyStoreCount = 0,
  nearbyPharmacies = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'medicines' | 'shops'>('medicines');
  
  // State for AI Enhanced List
  const [displayMedicines, setDisplayMedicines] = useState<Medicine[]>([]);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [generatingImages, setGeneratingImages] = useState<Set<string>>(new Set());
  
  // Track processed names to ensure strict one-time generation per session per medicine name
  const processedNames = useRef<Set<string>>(new Set());

  // Filter medicines to only those in nearby pharmacies (no radius limit now)
  // And deduplicate them (show cheapest)
  const localMedicines = useMemo(() => {
      // If we have medicines but no pharmacy data yet, show all medicines (fallback)
      if (medicines.length > 0 && nearbyPharmacies.length === 0) return medicines;

      if (nearbyPharmacies.length === 0 || medicines.length === 0) return [];
      
      const nearbyIds = new Set(nearbyPharmacies.map(p => p.id));
      const filtered = medicines.filter(m => m.pharmacyId && nearbyIds.has(m.pharmacyId));
      
      // Deduplicate: Keep medicine with lowest price if name is same, but COUNT stores
      const unique: Record<string, Medicine> = {};
      
      filtered.forEach(m => {
          if (!unique[m.name]) {
              unique[m.name] = { ...m, availableStores: 1 };
          } else {
              // Increment store count for this medicine
              unique[m.name].availableStores = (unique[m.name].availableStores || 1) + 1;
              
              // Keep cheapest price
              if ((m.sellingPrice || 0) < (unique[m.name].sellingPrice || 0)) {
                  // Preserve current count when swapping
                  const currentCount = unique[m.name].availableStores;
                  unique[m.name] = { ...m, availableStores: currentCount };
              }
          }
      });
      
      return Object.values(unique);
  }, [medicines, nearbyPharmacies]);

  // Initialize display medicines and trigger AI categorization if needed
  useEffect(() => {
    const medsToShow = localMedicines.length > 0 ? localMedicines : [];
    setDisplayMedicines(medsToShow);
    
    // Identify medicines that need categorization (General/Other/Null)
    const uncategorized = medsToShow.filter(m => !m.category || m.category === 'General' || m.category === 'Other');
    
    if (uncategorized.length > 0) {
        categorizeMedicines(uncategorized);
    }
  }, [localMedicines, medicines]);

  // AI Auto-Image Generation Effect
  useEffect(() => {
    const generateImages = async () => {
        // Filter medicines visible to consumer that lack images or have placeholders
        const missingImages = displayMedicines.filter(m => {
            const hasValidImage = m.imageUrl && m.imageUrl.length > 10 && !m.imageUrl.includes('placeholder');
            if (hasValidImage) return false;
            
            // Skip if we already processed this medicine name in this session
            if (processedNames.current.has(m.name)) return false;
            
            return true;
        });

        if (missingImages.length === 0) return;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        // Process a small batch to limit resource usage per render
        const batch = missingImages.slice(0, 2); 

        for (const item of batch) {
            try {
                // Double check processed set
                if (processedNames.current.has(item.name)) continue;
                processedNames.current.add(item.name); // Mark as processed immediately
                
                setGeneratingImages(prev => new Set(prev).add(item.id));
                console.log(`Auto-generating image for: ${item.name}`);

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: {
                        parts: [{
                            text: `A professional, realistic pharmaceutical product photograph of "${item.name}" ${item.brand ? 'by ' + item.brand : ''}. 
                                   The packaging should look medical, clean, and authentic. White studio background. 
                                   If it's a syrup, show a bottle. If tablets, show a blister pack or box. High resolution.`
                        }]
                    }
                });

                let base64Data = '';
                if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
                    base64Data = response.candidates[0].content.parts[0].inlineData.data;
                }

                if (base64Data) {
                    // Convert Base64 to Blob
                    const binaryString = atob(base64Data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let k = 0; k < len; k++) bytes[k] = binaryString.charCodeAt(k);
                    const blob = new Blob([bytes], { type: 'image/png' });

                    // Upload to Supabase
                    const fileName = `ai-gen/auto_${Date.now()}_${item.id.substring(0,8)}.png`;
                    const { error: uploadError } = await supabase.storage.from('medicines').upload(fileName, blob, { contentType: 'image/png' });
                    
                    if (!uploadError) {
                        const { data: urlData } = supabase.storage.from('medicines').getPublicUrl(fileName);
                        
                        // Update Database for ALL medicines with this name to ensure one-time generation
                        const { error: dbError } = await supabase
                            .from('medicines')
                            .update({ image_url: urlData.publicUrl })
                            .eq('name', item.name); // Update all records with same name
                        
                        if (!dbError) {
                            // Update Local State for all matching medicines
                            setDisplayMedicines(prev => prev.map(m => 
                                m.name === item.name ? { ...m, imageUrl: urlData.publicUrl } : m
                            ));
                        }
                    }
                }
            } catch (e) {
                console.error("Auto-image gen failed for", item.name, e);
            } finally {
                setGeneratingImages(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(item.id);
                    return newSet;
                });
            }
        }
    };

    // Debounce to allow UI to settle
    const timer = setTimeout(generateImages, 2000);
    return () => clearTimeout(timer);
  }, [displayMedicines]); // Dependency on list ensures we check when data loads

  const categorizeMedicines = async (uncategorizedMeds: Medicine[]) => {
    // Optimization: Dedup names to save tokens and limit batch size
    const uniqueNames = Array.from(new Set(uncategorizedMeds.map(m => m.name))).slice(0, 40);
    if (uniqueNames.length === 0) return;

    setIsCategorizing(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Classify these medicines into one of these exact categories: ${CATEGORIES.join(', ')}. 
            If it fits none or is unknown, use "General".
            Return a JSON array of objects with 'name' and 'category'.
            Medicines: ${uniqueNames.join(', ')}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            category: { type: Type.STRING }
                        }
                    }
                }
            }
        });

        if (response.text) {
            const updates = JSON.parse(response.text);
            const updateMap = new Map(updates.map((u: any) => [u.name.toLowerCase(), u.category]));

            setDisplayMedicines(prev => prev.map(m => {
                const newCat = updateMap.get(m.name.toLowerCase()) as string;
                // Only update if currently uncategorized to avoid overwriting existing valid data
                if (newCat && (!m.category || m.category === 'General' || m.category === 'Other')) {
                    return { ...m, category: newCat };
                }
                return m;
            }));
        }
    } catch (e) {
        console.error("Auto-categorize failed", e);
    } finally {
        setIsCategorizing(false);
    }
  };

  // Search logic using the dynamic displayMedicines state
  const filteredMedicines = displayMedicines.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || m.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Helper to render a medicine card
  const MedicineCard: React.FC<{ medicine: Medicine }> = ({ medicine }) => (
    <div 
        onClick={() => onMedicineClick(medicine)}
        className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 cursor-pointer hover:border-[#059669] transition shadow-sm h-full group"
    >
        <div className="w-16 h-16 bg-gray-50 rounded-lg flex-shrink-0 relative overflow-hidden flex items-center justify-center">
            {medicine.imageUrl && !medicine.imageUrl.includes('placeholder') ? (
                <img src={medicine.imageUrl} className="w-full h-full object-cover mix-blend-multiply group-hover:scale-105 transition-transform duration-500" alt={medicine.name} />
            ) : generatingImages.has(medicine.id) ? (
                <div className="flex flex-col items-center justify-center">
                    <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                    <span className="text-[8px] text-emerald-600 font-bold mt-1">Generating...</span>
                </div>
            ) : (
                <ImageIcon className="w-6 h-6 text-slate-300" />
            )}
        </div>
        <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 truncate text-sm">{medicine.name}</h3>
            <p className="text-[10px] text-gray-500 truncate">{medicine.brand} • {medicine.dosage}</p>
            <div className="mt-1.5 flex items-center justify-between">
                <div>
                    <span className="text-sm font-bold text-[#059669] mr-2">₹{medicine.minPrice}</span>
                    <span className="text-[10px] text-slate-400 font-medium">
                        {medicine.availableStores ? `${medicine.availableStores} Stores` : 'In Stock'}
                    </span>
                </div>
                {medicine.category && activeCategory === 'All' && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded truncate max-w-[80px] ${medicine.category === 'General' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>
                        {medicine.category}
                    </span>
                )}
            </div>
        </div>
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
     <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center">
         <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
             <Frown className="w-8 h-8 text-slate-300" />
         </div>
         <p className="text-slate-500 font-bold text-lg mb-2">{message}</p>
         <p className="text-slate-400 text-sm max-w-xs mx-auto">Try updating your location or search for a generic medicine name.</p>
         <button onClick={onDetectLocation} className="mt-6 px-6 py-2 bg-[#059669] text-white rounded-xl font-bold shadow-lg shadow-[#059669]/20 hover:bg-[#047857] transition">
             Update Location
         </button>
     </div>
  );

  // ----------------------------------------------------------------------
  // VIEW: SEARCH PAGE
  // ----------------------------------------------------------------------
  if (isSearchFocused) {
      return (
        <div className="bg-[#F8FAFC] min-h-screen pb-24 animate-fade-in">
            <div className="bg-white sticky top-0 z-30 px-4 py-4 shadow-sm border-b border-gray-100">
                <div className="relative max-w-2xl mx-auto">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search medicines, brands..."
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-[#059669]/50 outline-none text-gray-800 font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar mb-4">
                    {['All', ...CATEGORIES].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                            activeCategory === cat
                                ? 'bg-[#059669] text-white'
                                : 'bg-white text-gray-600 border border-gray-200'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredMedicines.map(medicine => (
                        <MedicineCard key={medicine.id} medicine={medicine} />
                    ))}
                    {filteredMedicines.length === 0 && (
                        <EmptyState message="There is no medicine around you" />
                    )}
                </div>
            </div>
        </div>
      );
  }

  // ----------------------------------------------------------------------
  // VIEW: HOME PAGE
  // ----------------------------------------------------------------------
  return (
    <div className="bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-[#059669] pt-8 pb-10 px-6 md:px-12 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center text-white gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/10 overflow-hidden shadow-inner">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <span className="font-bold text-xl">U</span>
                        )}
                    </div>
                    <div>
                        <p className="text-emerald-100 text-xs font-medium uppercase tracking-wider">Welcome Back</p>
                        <h1 className="text-2xl font-bold">Find Pharmacy</h1>
                    </div>
                </div>
            </div>

            {/* Location Pill */}
            <div 
                onClick={onDetectLocation}
                className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-white/20 transition group"
            >
                <div className="flex items-center text-white overflow-hidden">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mr-3 group-hover:scale-110 transition-transform">
                         {isLocating ? <Loader2 className="w-5 h-5 animate-spin"/> : <MapPin className="w-5 h-5"/>}
                    </div>
                    <div>
                        <p className="text-emerald-100 text-[10px] uppercase font-bold tracking-wide">Your Location</p>
                        <p className="font-bold text-lg truncate pr-4">{locationName || "Detecting..."}</p>
                    </div>
                </div>
                <div className="bg-white text-[#059669] px-3 py-1 rounded-lg text-xs font-bold shadow-sm">
                    Change
                </div>
            </div>
        </div>
      </div>

      {/* Body Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 -mt-4 relative z-20 pb-24">
         
         {/* Stats Row & View Toggle */}
         <div className="flex flex-col md:flex-row gap-4 mb-8">
             <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
                 <div className="bg-white p-4 rounded-2xl shadow-lg shadow-[#059669]/5 border border-gray-100 min-w-[140px] flex-1">
                     <p className="text-2xl font-bold text-slate-800">{nearbyStoreCount}</p>
                     <p className="text-xs text-slate-400 font-bold uppercase mt-1">Pharmacies</p>
                 </div>
                 <div className="bg-white p-4 rounded-2xl shadow-lg shadow-[#059669]/5 border border-gray-100 min-w-[140px] flex-1">
                     <p className="text-2xl font-bold text-slate-800">{displayMedicines.length}</p>
                     <p className="text-xs text-slate-400 font-bold uppercase mt-1">Available Medicines</p>
                 </div>
             </div>
             
             {/* View Toggle */}
             <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-100 flex items-center self-start md:self-stretch">
                 <button 
                    onClick={() => setViewMode('medicines')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex-1 transition-all ${viewMode === 'medicines' ? 'bg-[#059669] text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                     Medicines
                 </button>
                 <button 
                    onClick={() => setViewMode('shops')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex-1 transition-all ${viewMode === 'shops' ? 'bg-[#059669] text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                     Shops
                 </button>
             </div>
         </div>

         {/* CONTENT: SHOPS VIEW */}
         {viewMode === 'shops' && (
             <div className="animate-fade-in">
                 <h2 className="text-xl font-bold text-slate-900 flex items-center mb-4">
                    <Store className="w-5 h-5 mr-2 text-[#059669]" /> All Pharmacies
                 </h2>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     {nearbyPharmacies.length > 0 ? (
                         nearbyPharmacies.map(pharmacy => <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} />)
                     ) : (
                         <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                             <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                             <p className="text-slate-400 font-medium">There is no medicine around you.</p>
                             <p className="text-xs text-slate-300 mt-2">Try updating your location</p>
                         </div>
                     )}
                 </div>
             </div>
         )}

         {/* CONTENT: MEDICINES VIEW */}
         {viewMode === 'medicines' && (
             <div className="mt-4 animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center">
                        <Tag className="w-5 h-5 mr-2 text-[#059669]" /> Browse Medicines
                    </h2>
                    {isCategorizing && (
                        <div className="flex items-center bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 animate-pulse">
                            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> 
                            <span className="text-xs text-emerald-700 font-bold">AI Organizing...</span>
                        </div>
                    )}
                </div>
                
                {/* Category Pills */}
                <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar mb-6">
                    {['All', ...CATEGORIES].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-sm ${
                            activeCategory === cat
                                ? 'bg-[#059669] text-white'
                                : 'bg-white text-slate-600 border border-slate-100 hover:bg-slate-50'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Smart Categorized Display */}
                {activeCategory === 'All' ? (
                    <div className="space-y-8">
                        {displayMedicines.length === 0 && (
                             <EmptyState message="There is no medicine around you" />
                        )}

                        {/* Render specific sections for each category */}
                        {CATEGORIES.map(cat => {
                            const catMeds = displayMedicines.filter(m => m.category === cat);
                            if (catMeds.length === 0) return null;
                            
                            return (
                                <div key={cat} className="animate-fade-in">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="font-bold text-slate-800 text-lg">{cat}</h3>
                                        <button onClick={() => setActiveCategory(cat)} className="text-xs font-bold text-[#059669] hover:underline">See All</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {catMeds.slice(0, 4).map(medicine => (
                                            <MedicineCard key={medicine.id} medicine={medicine} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* General / Uncategorized Section */}
                        {displayMedicines.some(m => !CATEGORIES.includes(m.category)) && (
                            <div className="animate-fade-in">
                                <h3 className="font-bold text-slate-800 mb-3 text-lg">Other Medicines</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {displayMedicines.filter(m => !CATEGORIES.includes(m.category)).slice(0, 8).map(medicine => (
                                        <MedicineCard key={medicine.id} medicine={medicine} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    // Single Category Grid
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
                        {filteredMedicines.map(medicine => (
                            <MedicineCard key={medicine.id} medicine={medicine} />
                        ))}
                        {filteredMedicines.length === 0 && (
                            <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                                <p className="text-slate-400 font-medium">No medicines found in {activeCategory}.</p>
                                {/* Suggestion for other categories */}
                                <div className="mt-4 p-4 bg-emerald-50 rounded-xl inline-block text-left">
                                    <p className="text-xs font-bold text-emerald-700 mb-2">Suggestions in other categories:</p>
                                    <div className="flex gap-2 flex-wrap">
                                        {CATEGORIES.filter(c => c !== activeCategory).slice(0, 3).map(c => (
                                            <button key={c} onClick={() => setActiveCategory(c)} className="text-xs bg-white text-emerald-600 px-2 py-1 rounded border border-emerald-100 shadow-sm">
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
             </div>
         )}
      </div>
    </div>
  );
};

export default Home;
