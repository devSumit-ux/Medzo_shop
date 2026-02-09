
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Star, MapPin, Clock, Loader2, AlertCircle, Filter, Navigation, Map as MapIcon, ChevronUp, ChevronLeft, ChevronRight, ShoppingCart, Zap } from 'lucide-react';
import { Medicine, Pharmacy } from '../types';
import { supabase } from '../supabaseClient';

interface MedicineDetailProps {
  medicine: Medicine;
  onBack: () => void;
  onBook: (medicine: Medicine, pharmacy: Pharmacy) => void;
  userCoordinates: { lat: number; lng: number } | null;
}

const MedicineDetail: React.FC<MedicineDetailProps> = ({ medicine, onBack, onBook, userCoordinates }) => {
  const [sortBy, setSortBy] = useState<'nearest' | 'cheapest' | 'rating'>('nearest');
  const [stockFilter, setStockFilter] = useState<'all' | 'In Stock' | 'Low Stock'>('all');
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMapId, setExpandedMapId] = useState<string | null>(null);

  // Carousel State
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const images = medicine.images && medicine.images.length > 0 ? medicine.images : [medicine.imageUrl];

  useEffect(() => {
    const fetchPharmacies = async () => {
      setLoading(true);
      
      const lat = userCoordinates?.lat || 0;
      const lng = userCoordinates?.lng || 0;

      // USE NEW RPC: Get stores specifically with this medicine in stock
      const { data, error } = await supabase.rpc('get_medicine_availability', {
        search_name: medicine.name,
        user_lat: lat,
        user_lng: lng,
        radius_km: 50.0 
      });

      if (error) {
          console.error("Error fetching availability:", error);
          setLoading(false);
          return;
      }

      const rawData = data || [];

      // Process and map data
      let mapped = rawData.map((p: any) => ({
        id: p.pharmacy_id,
        name: p.pharmacy_name,
        address: p.pharmacy_address,
        latitude: p.latitude || 0,
        longitude: p.longitude || 0,
        distance: p.distance_km,
        rating: p.rating || 0,
        reviewCount: p.review_count || 0,
        price: p.price, // Real Price
        stock: p.stock, // Real Stock
        stockStatus: (p.stock > 10 ? 'In Stock' : (p.stock > 0 ? 'Low Stock' : 'Out of Stock'))
      }));

      // Filter by Stock Status
      if (stockFilter !== 'all') {
          mapped = mapped.filter((p: any) => p.stockStatus === stockFilter);
      }

      // Sort
      if (sortBy === 'nearest') mapped.sort((a: any, b: any) => (a.distance || 99999) - (b.distance || 99999));
      if (sortBy === 'cheapest') mapped.sort((a: any, b: any) => a.price - b.price);
      if (sortBy === 'rating') mapped.sort((a: any, b: any) => b.rating - a.rating);

      setPharmacies(mapped);
      setLoading(false);
    };

    fetchPharmacies();
  }, [userCoordinates, sortBy, stockFilter, medicine]);

  const toggleMap = (id: string) => {
    setExpandedMapId(prev => prev === id ? null : id);
  };

  const handleGetDirections = (lat: number, lng: number) => {
    if (lat && lng) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    }
  };

  // Carousel Logic
  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // Swipe Handlers
  const minSwipeDistance = 50;
  
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null); 
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) nextImage();
    if (isRightSwipe) prevImage();
  };

  const handleAddToCart = (pharmacy: Pharmacy) => {
      alert(`Added ${medicine.name} from ${pharmacy.name} to cart!`);
  };

  return (
    <div className="bg-slate-50 min-h-full pb-6 md:p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        <button onClick={onBack} className="mb-6 flex items-center text-slate-600 hover:text-slate-900 font-medium transition">
             <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm mr-2 border border-slate-200">
                <ArrowLeft className="w-4 h-4" />
             </div>
             Back to Search
        </button>

        <div className="flex flex-col lg:flex-row gap-8">
            <div className="w-full lg:w-1/3 space-y-6">
                <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative group">
                    <div 
                        className="h-72 w-full bg-emerald-50/50 flex items-center justify-center p-8 relative"
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                    >
                        <img 
                            src={images[currentImageIndex]} 
                            alt={`${medicine.name} view ${currentImageIndex + 1}`} 
                            className="h-full object-contain mix-blend-multiply transition-all duration-500 animate-fade-in" 
                        />
                        {images.length > 1 && (
                            <>
                                <button 
                                    onClick={prevImage} 
                                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:bg-white text-slate-600 hover:text-[#059669] transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={nextImage} 
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:bg-white text-slate-600 hover:text-[#059669] transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                                <div className="absolute bottom-4 flex gap-2">
                                    {images.map((_, idx) => (
                                        <button 
                                            key={idx} 
                                            onClick={() => setCurrentImageIndex(idx)}
                                            className={`h-2 rounded-full transition-all duration-300 ${idx === currentImageIndex ? 'bg-[#059669] w-6' : 'bg-emerald-200/50 hover:bg-emerald-300 w-2'}`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="p-6 md:p-8">
                        <div className="flex justify-between items-start mb-2">
                            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{medicine.name}</h1>
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-bold uppercase tracking-wide">Rx</span>
                        </div>
                        <p className="text-slate-500 font-medium mb-6 text-lg">{medicine.brand} • {medicine.dosage}</p>
                        
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                            <div>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mb-1">Price Range</p>
                                <p className="font-bold text-slate-900 text-xl">₹{medicine.minPrice} - ₹{medicine.maxPrice}</p>
                            </div>
                            <div className="h-10 w-[1px] bg-slate-200"></div>
                            <div className="text-right">
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mb-1">Availability</p>
                                <p className="font-bold text-emerald-600 text-xl">{pharmacies.length} Stores</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1">
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Available Pharmacies</h2>
                        {!userCoordinates && (
                            <p className="text-xs text-amber-600 mt-1 flex items-center">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Sorted by name (Location not detected)
                            </p>
                        )}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                        <div className="flex items-center bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-100 min-w-[160px]">
                            <Filter className="w-4 h-4 text-slate-400 mr-2" />
                            <select 
                                value={stockFilter}
                                onChange={(e) => setStockFilter(e.target.value as any)}
                                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer w-full"
                            >
                                <option value="all">All Stores</option>
                                <option value="In Stock">In Stock Only</option>
                                <option value="Low Stock">Low Stock Only</option>
                            </select>
                        </div>

                        <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-100 overflow-x-auto">
                            {['Nearest', 'Cheapest', 'Rating'].map((type) => (
                                <button 
                                    key={type}
                                    onClick={() => setSortBy(type.toLowerCase() as any)} 
                                    className={`px-4 py-2 text-sm rounded-lg font-bold transition-all whitespace-nowrap ${sortBy === type.toLowerCase() ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                    </div>
                ) : pharmacies.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <MapPin className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">No pharmacies found</h3>
                        <p className="text-slate-500 text-sm max-w-xs mx-auto">
                          We couldn't find any stores with "{medicine.name}" in stock within 50km.
                        </p>
                        {stockFilter !== 'all' && (
                            <button onClick={() => setStockFilter('all')} className="mt-4 text-emerald-600 font-bold hover:underline">
                                View all availability
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pharmacies.map(pharmacy => (
                            <div key={pharmacy.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-lg group-hover:text-emerald-600 transition-colors">{pharmacy.name}</h3>
                                        <p className="text-sm text-slate-500 flex items-center mt-1 font-medium">
                                            <MapPin className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> {pharmacy.address}
                                        </p>
                                    </div>
                                    <div className="flex items-center bg-yellow-50 px-2 py-1 rounded-lg text-xs font-bold text-yellow-700 border border-yellow-100">
                                        {pharmacy.rating} <Star className="w-3 h-3 ml-1 fill-current" />
                                    </div>
                                </div>

                                <div className="flex items-center text-xs font-medium text-slate-500 mb-4 space-x-4 bg-slate-50 p-2 rounded-lg w-fit">
                                    {pharmacy.distance !== null && pharmacy.distance !== undefined ? (
                                        <>
                                        <span className={`flex items-center ${pharmacy.distance > 10 ? 'text-amber-500' : 'text-emerald-600'}`}>
                                            <MapPin className="w-3.5 h-3.5 mr-1.5" /> {pharmacy.distance.toFixed(1)} km
                                        </span>
                                        <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                                        <span className="flex items-center">
                                            <Clock className="w-3.5 h-3.5 mr-1.5" /> ~{(pharmacy.distance * 3 + 5).toFixed(0)} mins
                                        </span>
                                        </>
                                    ) : (
                                        <span className="flex items-center text-slate-400">
                                            <MapPin className="w-3.5 h-3.5 mr-1.5" /> Distance Unknown
                                        </span>
                                    )}
                                </div>

                                <div className="mt-auto space-y-4">
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => toggleMap(pharmacy.id)}
                                            className="flex-1 py-2.5 bg-slate-50 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 hover:text-slate-900 transition flex items-center justify-center"
                                        >
                                            {expandedMapId === pharmacy.id ? (
                                                <><ChevronUp className="w-3.5 h-3.5 mr-1.5" /> Hide Map</>
                                            ) : (
                                                <><MapIcon className="w-3.5 h-3.5 mr-1.5" /> Map View</>
                                            )}
                                        </button>
                                        <button 
                                            onClick={() => handleGetDirections(pharmacy.latitude, pharmacy.longitude)}
                                            className="flex-1 py-2.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-100 transition flex items-center justify-center"
                                        >
                                            <Navigation className="w-3.5 h-3.5 mr-1.5" /> Directions
                                        </button>
                                    </div>

                                    {expandedMapId === pharmacy.id && (
                                        <div className="rounded-xl overflow-hidden shadow-inner border border-slate-200 animate-fade-in h-40 relative bg-slate-100">
                                             <iframe
                                                width="100%"
                                                height="100%"
                                                style={{ border: 0 }}
                                                loading="lazy"
                                                allowFullScreen
                                                src={`https://maps.google.com/maps?q=${pharmacy.latitude},${pharmacy.longitude}&z=15&output=embed`}
                                            ></iframe>
                                        </div>
                                    )}

                                    <div className="flex flex-col items-stretch border-t border-slate-100 pt-4 gap-3">
                                        <div className="flex justify-between items-center mb-1">
                                            <div>
                                                <p className="text-2xl font-bold text-slate-900">₹{pharmacy.price}</p>
                                                <span className={`text-xs font-bold uppercase tracking-wide ${
                                                    pharmacy.stockStatus === 'In Stock' ? 'text-emerald-600' : 
                                                    pharmacy.stockStatus === 'Low Stock' ? 'text-amber-600' : 'text-red-600'
                                                }`}>
                                                    {pharmacy.stockStatus === 'In Stock' ? 'Available Now' : pharmacy.stockStatus}
                                                </span>
                                            </div>
                                            {pharmacy.stock && (
                                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">
                                                    Stock: {pharmacy.stock} units
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <button 
                                                onClick={() => handleAddToCart(pharmacy)}
                                                disabled={pharmacy.stockStatus === 'Out of Stock'}
                                                className={`px-4 py-3 rounded-xl font-bold text-sm shadow-sm transition transform active:scale-95 flex items-center justify-center ${
                                                    pharmacy.stockStatus === 'Out of Stock' 
                                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                                }`}
                                            >
                                                <ShoppingCart className="w-4 h-4 mr-2" /> Add to Cart
                                            </button>
                                            <button 
                                                onClick={() => onBook(medicine, pharmacy)}
                                                disabled={pharmacy.stockStatus === 'Out of Stock'}
                                                className={`px-4 py-3 rounded-xl font-bold text-sm shadow-lg transition transform active:scale-95 flex items-center justify-center ${
                                                    pharmacy.stockStatus === 'Out of Stock' 
                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                                                }`}
                                            >
                                                <Zap className="w-4 h-4 mr-2 fill-current" /> Buy Now
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default MedicineDetail;
