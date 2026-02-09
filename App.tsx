
import React, { useState, useEffect, useRef } from 'react';
import { Home as HomeIcon, Search, ShoppingBag, User, Pill, Loader2, Store, Plus, LogOut, Camera } from 'lucide-react';
import Home from './components/Home';
import MedicineDetail from './components/MedicineDetail';
import BookingConfirmation from './components/BookingConfirmation';
import MyBookings from './components/MyBookings';
import AdminDashboard from './components/AdminDashboard'; 
import SuperAdminDashboard from './components/SuperAdminDashboard';
import Auth from './components/Auth';
import Profile from './components/Profile';
import PrescriptionUpload from './components/PrescriptionUpload';
import { Medicine, Pharmacy, Booking, UserRole, PrescriptionItem } from './types';
import { supabase } from './supabaseClient';

type ConsumerView = 'home' | 'search' | 'detail' | 'confirmation' | 'bookings' | 'profile';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [pharmacyId, setPharmacyId] = useState<string | null>(null); 
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState<string>('');

  // App State
  const [currentView, setCurrentView] = useState<ConsumerView>('home');
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [lastBooking, setLastBooking] = useState<Booking | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [nearbyPharmacies, setNearbyPharmacies] = useState<Pharmacy[]>([]);
  const [nearbyStoreCount, setNearbyStoreCount] = useState(0);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);

  // Location & User State
  const [locationName, setLocationName] = useState('Detecting Location...');
  const [userCoordinates, setUserCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  // Real-time location ref to clear watcher
  const watchIdRef = useRef<number | null>(null);
  // Ref to track last coordinates to prevent jitter updates
  const prevCoordsRef = useRef<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      else setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      else {
        setUserRole(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Depend on session.user.id instead of session object to prevent loops
    if (session?.user?.id && userRole === 'consumer') {
      fetchMedicines();
      fetchConsumerBookings();
      startLocationWatch(); // Start real-time tracking
    }
    return () => {
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [session?.user?.id, userRole]);

  // Fetch shops whenever coordinates change
  useEffect(() => {
    if (userRole === 'consumer') {
        fetchNearbyStores();
    }
  }, [userCoordinates, userRole]);

  const fetchNearbyStores = async () => {
    // Default to 0,0 if location not found yet
    const lat = userCoordinates?.lat || 0;
    const lng = userCoordinates?.lng || 0;
    const radius = 50.0; // Fixed radius

    const { data, error } = await supabase.rpc('get_nearby_pharmacies', {
        user_lat: lat,
        user_lng: lng,
        radius_km: radius
    });
    
    if (error || !data || data.length === 0) {
        // Only update state if it actually changes (basic check to reduce renders)
        if (nearbyPharmacies.length > 0) {
            setNearbyPharmacies([]);
            setNearbyStoreCount(0);
        }
        return;
    }

    if (data) {
        const uniqueStores = new Set(data.map((p: any) => p.id)).size;
        setNearbyStoreCount(uniqueStores);
        
        const mappedPharmacies: Pharmacy[] = data.map((p: any) => ({
            id: p.id,
            name: p.name,
            address: p.address,
            latitude: p.latitude,
            longitude: p.longitude,
            distance: p.distance_km,
            rating: p.rating,
            reviewCount: p.review_count,
            verified: p.verified,
            verification_status: p.verification_status
        }));
        
        // Simple length check to avoid unnecessary re-renders, 
        // in a real app use deep comparison if needed
        if (JSON.stringify(mappedPharmacies) !== JSON.stringify(nearbyPharmacies)) {
            setNearbyPharmacies(mappedPharmacies);
        }
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, latitude, longitude, address, avatar_url, full_name')
        .eq('id', userId)
        .single();
      
      if (data) {
          setUserRole(data.role as UserRole);
          if (data.avatar_url) setAvatarUrl(data.avatar_url);
          if (data.full_name) setUserName(data.full_name);
          
          if (data.role === 'shop_owner') {
             const { data: shopData } = await supabase.from('pharmacies').select('id').eq('owner_id', userId).maybeSingle();
             if (shopData) setPharmacyId(shopData.id);
          }

          if (data.latitude && data.longitude) {
              // Update ref to prevent immediate override by watcher
              prevCoordsRef.current = { lat: data.latitude, lng: data.longitude };
              setUserCoordinates({ lat: data.latitude, lng: data.longitude });
          }
          if (data.address) {
              setLocationName(data.address);
          }
      } else {
        setUserRole('consumer');
      }
    } catch (e) {
      console.error("Error fetching profile:", e);
      setUserRole('consumer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileUpdate = () => {
    if (session?.user?.id) {
        fetchUserProfile(session.user.id);
    }
  };

  const getIpLocation = async () => {
    try {
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) throw new Error('ipapi failed');
        const data = await response.json();
        
        if (data.latitude && data.longitude) {
            updateLocationState(data.latitude, data.longitude, `${data.city}, ${data.region_code}`);
            return;
        }
    } catch (error) {
        try {
            const fallbackResponse = await fetch('https://ipwho.is/');
            if (!fallbackResponse.ok) throw new Error('ipwho failed');
            const fallbackData = await fallbackResponse.json();

            if (fallbackData.success && fallbackData.latitude && fallbackData.longitude) {
                updateLocationState(fallbackData.latitude, fallbackData.longitude, `${fallbackData.city}, ${fallbackData.region_code}`);
                return;
            }
        } catch (e2) {
            console.log("Using default location");
            setLocationName("Location not detected");
        }
    } finally {
        setIsLocating(false);
    }
  };

  const updateLocationState = (lat: number, lng: number, address: string) => {
      // Logic to prevent update loops
      const prev = prevCoordsRef.current;
      const isSignificant = !prev || Math.abs(prev.lat - lat) > 0.0001 || Math.abs(prev.lng - lng) > 0.0001;

      if (isSignificant) {
          prevCoordsRef.current = { lat, lng };
          setUserCoordinates({ lat, lng });
          setLocationName(address);
          
          // Persist to DB occasionally
          if (session?.user?.id) {
              supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
                latitude: lat,
                longitude: lng,
                address: address,
                updated_at: new Date().toISOString()
              }).then(({ error }) => {
                  if (error) console.error("Failed to save location:", error);
              });
          }
      }
  };

  const startLocationWatch = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      getIpLocation();
      return;
    }

    if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
    }

    // Use valid standard options for watchPosition
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Anti-jitter: Only update if moved > ~10-20 meters (approx 0.0001 degrees)
        const prev = prevCoordsRef.current;
        const isSignificant = !prev || 
            Math.abs(prev.lat - latitude) > 0.0002 || 
            Math.abs(prev.lng - longitude) > 0.0002;

        if (isSignificant) {
            prevCoordsRef.current = { lat: latitude, lng: longitude };
            setUserCoordinates({ lat: latitude, lng: longitude });
        }
        setIsLocating(false);
      },
      (error) => {
        console.warn("Watch Position Error:", error);
        // Only fallback to IP if we don't have ANY coordinates yet
        if (!userCoordinates) {
            getIpLocation();
        } else {
            setIsLocating(false);
        }
      },
      { 
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 10000 // Accept positions up to 10s old
      }
    );
  };

  const manualDetectLocation = () => {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          let addressName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            if (data && data.address) {
                 const parts = [
                    data.address.neighbourhood,
                    data.address.suburb, 
                    data.address.city || data.address.town || data.address.village
                 ].filter(Boolean);
                 if (parts.length > 0) addressName = parts.slice(0, 2).join(', ');
            }
          } catch(e) {}
          updateLocationState(latitude, longitude, addressName);
          setIsLocating(false);
      }, () => getIpLocation());
  };

  const fetchMedicines = async () => {
    const { data } = await supabase.from('medicines').select('*, pharmacies(name)').gt('stock', 0);
    if (data) {
        const mapped: Medicine[] = data.map((m: any) => ({
            id: m.id,
            name: m.name,
            brand: m.brand,
            category: m.category,
            imageUrl: m.image_url,
            dosage: m.dosage,
            minPrice: m.min_price || m.selling_price,
            maxPrice: m.max_price || m.selling_price,
            availableStores: 0, 
            stock: m.stock,
            sellingPrice: m.selling_price,
            storeName: m.pharmacies?.name,
            pharmacyId: m.pharmacy_id
        }));
        setMedicines(mapped);
    }
  };

  const fetchConsumerBookings = async () => {
    if (!session?.user) return;

    // Fetch by user_id OR email (for backward compatibility)
    const { data, error } = await supabase
        .from('bookings')
        .select(`*, medicines (*), pharmacies (name, address)`)
        .or(`user_id.eq.${session.user.id},customer_name.eq.${session.user.email}`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching bookings:", error);
        return;
    }

    if (data) {
        const mapped: Booking[] = data.map((b: any) => ({
            id: b.id.substring(0, 8).toUpperCase(),
            medicine: b.medicines ? {
                id: b.medicines.id,
                name: b.medicines.name,
                brand: b.medicines.brand,
                imageUrl: b.medicines.image_url,
                category: b.medicines.category,
                dosage: b.medicines.dosage
            } : {
                id: 'PRESC',
                name: 'Prescription Order',
                brand: 'Multi-Item',
                imageUrl: b.prescription_url || 'https://via.placeholder.com/150?text=Rx',
                category: 'Prescription',
                dosage: `${(b.items_snapshot as any[])?.length || 0} Items`
            },
            pharmacy: { 
                id: b.pharmacy_id,
                name: b.pharmacies?.name || 'Pharmacy', 
                address: b.pharmacies?.address || 'Unknown', 
                latitude: 0, longitude: 0 
            }, 
            date: new Date(b.created_at).toLocaleDateString(),
            time: new Date(b.created_at).toLocaleTimeString(),
            status: b.status,
            totalAmount: b.total_amount,
            qrCodeData: b.qr_code_data,
            prescriptionUrl: b.prescription_url,
            itemsSnapshot: b.items_snapshot,
            isRated: b.is_rated
        }));
        setBookings(mapped);
    }
  };

  const handleMedicineClick = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setCurrentView('detail');
  };

  const handleBooking = async (medicine: Medicine, pharmacy: Pharmacy) => {
    if (!session?.user) return;
    
    const qrCode = `PH-${Date.now()}`;
    const userEmail = session.user.email;
    const finalName = userName || session.user.user_metadata?.full_name || userEmail.split('@')[0];

    const { data, error } = await supabase.from('bookings').insert([{
        medicine_id: medicine.id, 
        pharmacy_id: pharmacy.id,
        user_id: session.user.id, // Store User ID
        customer_name: finalName, // Store Real Name
        customer_email: userEmail, // Store Email
        pharmacy_name: pharmacy.name, 
        total_amount: pharmacy.price,
        qr_code_data: qrCode,
        status: 'Pending'
    }]).select().single();

    if (data) {
        const newBooking: Booking = {
            id: data.id.substring(0, 8).toUpperCase(),
            medicine,
            pharmacy,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            status: 'Pending',
            totalAmount: pharmacy.price || 0,
            qrCodeData: qrCode,
            isRated: false
        };
        setLastBooking(newBooking);
        setBookings(prev => [newBooking, ...prev]);
        setCurrentView('confirmation');
    } else {
        console.error(error);
        alert("Failed to book. Please try again.");
    }
  };

  const handlePrescriptionBooking = async (pharmacy: Pharmacy, items: PrescriptionItem[], url: string, total: number) => {
      if (!session?.user) return;

      const qrCode = `RX-${Date.now()}`;
      const userEmail = session.user.email;
      const finalName = userName || session.user.user_metadata?.full_name || userEmail.split('@')[0];
      
      const { data, error } = await supabase.from('bookings').insert([{
          pharmacy_id: pharmacy.id,
          user_id: session.user.id, // Store User ID
          customer_name: finalName, // Store Real Name
          customer_email: userEmail, // Store Email
          pharmacy_name: pharmacy.name,
          total_amount: total,
          qr_code_data: qrCode,
          status: 'Pending',
          prescription_url: url,
          items_snapshot: items,
          medicine_id: null 
      }]).select().single();

      if (data) {
          const newBooking: Booking = {
              id: data.id.substring(0, 8).toUpperCase(),
              medicine: {
                  id: 'RX',
                  name: 'Prescription Order',
                  brand: `${items.length} Medicines`,
                  imageUrl: url,
                  category: 'Prescription',
                  dosage: 'See Details'
              },
              pharmacy,
              date: new Date().toLocaleDateString(),
              time: new Date().toLocaleTimeString(),
              status: 'Pending',
              totalAmount: total,
              qrCodeData: qrCode,
              prescriptionUrl: url,
              itemsSnapshot: items,
              isRated: false
          };
          setLastBooking(newBooking);
          setBookings(prev => [newBooking, ...prev]);
          setShowPrescriptionModal(false);
          setCurrentView('confirmation');
      } else {
          alert("Failed to place prescription order: " + error?.message);
      }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-[#059669] animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  if (userRole === 'super_admin') {
      return <SuperAdminDashboard onExit={() => supabase.auth.signOut()} />;
  }

  if (userRole === 'shop_owner') {
      if (!pharmacyId) {
          return (
            <div className="min-h-screen flex items-center justify-center flex-col">
                <p className="text-xl font-bold text-gray-800 mb-2">Shop Setup Incomplete</p>
                <p className="text-gray-500 mb-4">We couldn't find a pharmacy linked to your account.</p>
                <button 
                    onClick={() => supabase.auth.signOut()}
                    className="px-6 py-2 bg-[#059669] text-white rounded-lg font-bold"
                >
                    Logout
                </button>
            </div>
          );
      }
      return <AdminDashboard pharmacyId={pharmacyId} onExit={() => supabase.auth.signOut()} />;
  }

  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return (
          <Home 
            onMedicineClick={handleMedicineClick} 
            isSearchFocused={false} // Explicitly false for Home
            medicines={medicines} 
            locationName={locationName}
            isLocating={isLocating}
            onDetectLocation={manualDetectLocation}
            avatarUrl={avatarUrl}
            nearbyStoreCount={nearbyStoreCount}
            nearbyPharmacies={nearbyPharmacies}
          />
        );
      case 'search':
        return (
          <Home 
            onMedicineClick={handleMedicineClick} 
            isSearchFocused={true} // Explicitly true for Search View
            medicines={medicines}
            locationName={locationName}
            isLocating={isLocating}
            onDetectLocation={manualDetectLocation}
            avatarUrl={avatarUrl}
            nearbyStoreCount={nearbyStoreCount}
            nearbyPharmacies={nearbyPharmacies}
          />
        );
      case 'detail':
        return selectedMedicine ? (
          <MedicineDetail 
            medicine={selectedMedicine} 
            onBack={() => setCurrentView('home')}
            onBook={handleBooking}
            userCoordinates={userCoordinates}
          />
        ) : null;
      case 'confirmation':
        return lastBooking ? (
          <BookingConfirmation 
            booking={lastBooking} 
            onViewBookings={() => setCurrentView('bookings')}
            onHome={() => setCurrentView('home')}
          />
        ) : null;
      case 'bookings':
        return <MyBookings bookings={bookings} />;
      case 'profile':
        return (
          <Profile 
            session={session} 
            onLogout={() => supabase.auth.signOut()} 
            onProfileUpdate={handleProfileUpdate}
          />
        );
      default:
        return (
          <Home 
            onMedicineClick={handleMedicineClick} 
            medicines={medicines} 
            locationName={locationName}
            isLocating={isLocating}
            onDetectLocation={manualDetectLocation}
            avatarUrl={avatarUrl}
            nearbyStoreCount={nearbyStoreCount}
            nearbyPharmacies={nearbyPharmacies}
          />
        );
    }
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen w-full relative flex flex-col">
      <nav className="hidden md:flex bg-white border-b border-gray-200 px-6 py-4 justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('home')}>
          <div className="w-8 h-8 bg-[#059669] rounded-lg flex items-center justify-center">
             <Pill className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-gray-800">Medzo Shop</span>
        </div>
        <div className="flex gap-8">
           <button onClick={() => setCurrentView('home')} className={`font-medium hover:text-[#059669] transition ${currentView === 'home' ? 'text-[#059669]' : 'text-gray-500'}`}>Home</button>
           <button onClick={() => setCurrentView('search')} className={`font-medium hover:text-[#059669] transition ${currentView === 'search' ? 'text-[#059669]' : 'text-gray-500'}`}>Search</button>
           <button onClick={() => setCurrentView('bookings')} className={`font-medium hover:text-[#059669] transition ${currentView === 'bookings' ? 'text-[#059669]' : 'text-gray-500'}`}>Bookings</button>
           <button onClick={() => setCurrentView('profile')} className={`font-medium hover:text-[#059669] transition ${currentView === 'profile' ? 'text-[#059669]' : 'text-gray-500'}`}>Profile</button>
        </div>
        <button 
            onClick={() => setShowPrescriptionModal(true)}
            className="bg-[#059669] text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-[#059669]/20 hover:bg-[#047857] transition flex items-center"
        >
            <Camera className="w-4 h-4 mr-2" /> Upload Rx
        </button>
      </nav>

      <main className={`flex-1 w-full mx-auto ${currentView === 'home' ? '' : 'max-w-7xl'} pb-24 md:pb-8`}>
        {renderContent()}
      </main>

      <button 
        onClick={() => setShowPrescriptionModal(true)}
        className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-95 transition-transform"
      >
          <Camera className="w-6 h-6" />
      </button>

      {showPrescriptionModal && (
          <PrescriptionUpload 
            onCancel={() => setShowPrescriptionModal(false)}
            onBook={handlePrescriptionBooking}
            userCoordinates={userCoordinates}
          />
      )}

      {['home', 'search', 'bookings', 'profile'].includes(currentView) && (
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 flex justify-around py-3 px-2 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <NavButton icon={HomeIcon} label="Home" isActive={currentView === 'home'} onClick={() => setCurrentView('home')} />
          <NavButton icon={Search} label="Search" isActive={currentView === 'search'} onClick={() => setCurrentView('search')} />
          <NavButton icon={ShoppingBag} label="Bookings" isActive={currentView === 'bookings'} onClick={() => setCurrentView('bookings')} />
          <NavButton icon={User} label="Profile" isActive={currentView === 'profile'} onClick={() => setCurrentView('profile')} />
        </nav>
      )}
    </div>
  );
};

const NavButton = ({ icon: Icon, label, isActive, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-16 transition-colors ${isActive ? 'text-[#059669]' : 'text-gray-400 hover:text-gray-600'}`}>
    <Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-current opacity-20' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

export default App;
