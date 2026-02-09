import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Store, Users, LogOut, Plus, MapPin, Loader2, Trash2, ShieldCheck, Search, UserPlus, Navigation, BadgeCheck, XCircle, Clock, Eye, CheckCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Pharmacy, UserProfile, VerificationStatus } from '../types';
import ConfirmationModal from './ConfirmationModal';
import Toast, { ToastType } from './Toast';

declare const L: any; // Leaflet global

interface SuperAdminDashboardProps {
  onExit: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onExit }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'pharmacies' | 'users'>('overview');
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showAddShop, setShowAddShop] = useState(false);
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [reviewShop, setReviewShop] = useState<Pharmacy | null>(null);
  
  // Forms
  const [newShop, setNewShop] = useState({ name: '', address: '', lat: '', lng: '', owner_email: '' });
  const [ownerForm, setOwnerForm] = useState({ email: '', pharmacyId: '' });

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // UI State
  const [toast, setToast] = useState<{ msg: string, type: ToastType, visible: boolean }>({ msg: '', type: 'success', visible: false });
  const [deleteId, setDeleteId] = useState<{ type: 'shop' | 'user', id: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Initialize Map when Map Picker is opened
  useEffect(() => {
    if (showMapPicker && mapContainerRef.current && !mapInstanceRef.current && typeof L !== 'undefined') {
        const defaultLat = 20.5937; // India Center
        const defaultLng = 78.9629;
        
        const map = L.map(mapContainerRef.current).setView([defaultLat, defaultLng], 5);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        map.on('click', (e: any) => {
            const { lat, lng } = e.latlng;
            setNewShop(prev => ({
                ...prev,
                lat: lat.toFixed(6),
                lng: lng.toFixed(6)
            }));
            
            if (markerRef.current) {
                markerRef.current.setLatLng([lat, lng]);
            } else {
                markerRef.current = L.marker([lat, lng]).addTo(map);
            }
        });

        // Try to locate user for better starting position
        map.locate({ setView: true, maxZoom: 16 });

        mapInstanceRef.current = map;
    }

    return () => {
        // Cleanup map instance if picker closes (Optional, usually keeping it is fine or full cleanup)
        if (!showMapPicker && mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
            markerRef.current = null;
        }
    };
  }, [showMapPicker]);

  const showToast = (msg: string, type: ToastType) => {
    setToast({ msg, type, visible: true });
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported", "error");
        return;
    }
    
    showToast("Detecting location...", "success");
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            
            // Update inputs
            setNewShop(prev => ({
                ...prev,
                lat: latitude.toFixed(6),
                lng: longitude.toFixed(6)
            }));
            
            // Update Map View
            if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([latitude, longitude], 16);
                
                if (markerRef.current) {
                    markerRef.current.setLatLng([latitude, longitude]);
                } else if (typeof L !== 'undefined') {
                    markerRef.current = L.marker([latitude, longitude]).addTo(mapInstanceRef.current);
                }
            }
            showToast("Location detected!", "success");
        },
        (error) => {
            showToast("Could not detect location. Please enable GPS.", "error");
        },
        { enableHighAccuracy: true }
    );
  };

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch Pharmacies
    const { data: pharmData } = await supabase.from('pharmacies').select('*').order('created_at', { ascending: false });
    if (pharmData) {
        // Map data to ensure types match
        setPharmacies(pharmData.map((p:any) => ({
            ...p,
            verification_status: p.verification_status || (p.verified ? 'verified' : 'unverified')
        })));
    }

    // Fetch Users with Role Info
    const { data: userData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (userData) {
        setUsers(userData.map((u: any) => ({
            id: u.id,
            email: 'user@example.com', // Placeholder as email is in auth.users
            fullName: u.full_name || 'Unnamed',
            role: u.role
        })));
    }
    
    setLoading(false);
  };

  const handleAddShop = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from('pharmacies').insert([{
        name: newShop.name,
        address: newShop.address,
        latitude: parseFloat(newShop.lat),
        longitude: parseFloat(newShop.lng),
        verification_status: 'unverified'
    }]).select().single();

    if (data) {
        if (newShop.owner_email) {
            const { error: rpcError } = await supabase.rpc('assign_shop_owner', {
                target_email: newShop.owner_email,
                target_shop_id: data.id
            });
            if (rpcError) {
                showToast('Shop created but owner assignment failed (User not found?)', 'error');
            } else {
                showToast('Shop created and owner assigned!', 'success');
            }
        } else {
            showToast('Pharmacy added successfully!', 'success');
        }
        setShowAddShop(false);
        setNewShop({ name: '', address: '', lat: '', lng: '', owner_email: '' });
        fetchData();
    } else {
        showToast('Error creating shop: ' + error?.message, 'error');
    }
  };

  const handleAssignOwner = async (e: React.FormEvent) => {
      e.preventDefault();
      const { error } = await supabase.rpc('assign_shop_owner', {
          target_email: ownerForm.email,
          target_shop_id: ownerForm.pharmacyId
      });

      if (error) {
          showToast(error.message, 'error');
      } else {
          showToast('User promoted to Shop Owner successfully', 'success');
          setShowAddOwner(false);
          setOwnerForm({ email: '', pharmacyId: '' });
          fetchData();
      }
  };

  const handleVerificationDecision = async (status: VerificationStatus) => {
      if (!reviewShop) return;

      // Note: We don't manually set `verified`. The DB trigger `auto_verify_shop` handles it.
      const { error } = await supabase
        .from('pharmacies')
        .update({ 
            verification_status: status 
        })
        .eq('id', reviewShop.id);

      if (error) {
          showToast('Failed to update status', 'error');
      } else {
          showToast(`Shop marked as ${status}`, 'success');
          setPharmacies(prev => prev.map(p => p.id === reviewShop.id ? { 
              ...p, 
              verification_status: status, 
              verified: status === 'verified' // Optimistic update
          } : p));
          setReviewShop(null);
      }
  };

  const confirmDelete = async () => {
      if (!deleteId) return;
      
      if (deleteId.type === 'shop') {
          const { error } = await supabase.from('pharmacies').delete().eq('id', deleteId.id);
          if (error) showToast('Failed to delete pharmacy', 'error');
          else showToast('Pharmacy deleted successfully', 'success');
      } else {
          // Deleting a user profile - effectively removing them from the system data-wise
          const { error } = await supabase.from('profiles').delete().eq('id', deleteId.id);
          if (error) showToast('Failed to delete user profile', 'error');
          else showToast('User profile deleted successfully', 'success');
      }
      
      setDeleteId(null);
      fetchData();
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 animate-fade-in relative">
      <Toast 
        message={toast.msg} 
        type={toast.type} 
        isVisible={toast.visible} 
        onClose={() => setToast(prev => ({...prev, visible: false}))} 
      />

      <ConfirmationModal 
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title={deleteId?.type === 'shop' ? "Delete Pharmacy?" : "Delete User?"}
        message={deleteId?.type === 'shop' 
            ? "This will permanently remove the pharmacy and all its inventory/sales data." 
            : "This will remove the user's profile and revoke their access roles. They may need to sign up again."}
        confirmText="Yes, Delete"
        isDestructive={true}
      />

      {/* Review Documents Modal */}
      {reviewShop && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                      <div>
                        <h3 className="font-bold text-lg text-slate-900">Review Documents</h3>
                        <p className="text-xs text-slate-500">{reviewShop.name}</p>
                      </div>
                      <button onClick={() => setReviewShop(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><XCircle className="w-5 h-5 text-slate-500"/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-white p-4 rounded-xl shadow-sm">
                              <h4 className="font-bold text-slate-700 mb-3 border-b pb-2">Drug License</h4>
                              {reviewShop.drug_license_url ? (
                                  <a href={reviewShop.drug_license_url} target="_blank" rel="noreferrer">
                                      <img src={reviewShop.drug_license_url} className="w-full h-64 object-contain bg-slate-50 border rounded-lg hover:opacity-90 transition" alt="DL" />
                                  </a>
                              ) : (
                                  <div className="h-64 flex items-center justify-center bg-slate-50 text-slate-400 border rounded-lg">No Document</div>
                              )}
                              <p className="mt-2 text-xs font-mono bg-slate-50 p-2 rounded truncate">{reviewShop.drug_license_no || 'No DL Number'}</p>
                          </div>
                          <div className="bg-white p-4 rounded-xl shadow-sm">
                              <h4 className="font-bold text-slate-700 mb-3 border-b pb-2">GST Certificate</h4>
                              {reviewShop.gst_certificate_url ? (
                                  <a href={reviewShop.gst_certificate_url} target="_blank" rel="noreferrer">
                                      <img src={reviewShop.gst_certificate_url} className="w-full h-64 object-contain bg-slate-50 border rounded-lg hover:opacity-90 transition" alt="GST" />
                                  </a>
                              ) : (
                                  <div className="h-64 flex items-center justify-center bg-slate-50 text-slate-400 border rounded-lg">No Document</div>
                              )}
                              <p className="mt-2 text-xs font-mono bg-slate-50 p-2 rounded truncate">{reviewShop.gstin || 'No GSTIN'}</p>
                          </div>
                      </div>
                  </div>
                  <div className="p-4 bg-white border-t flex justify-end gap-3">
                      <button 
                        onClick={() => handleVerificationDecision('rejected')}
                        className="px-6 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition border border-red-100"
                      >
                          Reject
                      </button>
                      <button 
                        onClick={() => handleVerificationDecision('verified')}
                        className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition"
                      >
                          Verify Shop
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Map Picker Modal */}
      {showMapPicker && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-lg flex items-center"><MapPin className="w-5 h-5 mr-2 text-emerald-600"/> Pick Location</h3>
                      <button onClick={() => setShowMapPicker(false)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold">Done</button>
                  </div>
                  <div className="flex-1 relative bg-slate-100">
                      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full"></div>
                  </div>
                  <div className="p-3 bg-white border-t flex justify-between items-center">
                      <p className="text-sm text-slate-500 pl-2">Click map to set location manually.</p>
                      <button 
                        onClick={handleUseCurrentLocation}
                        className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-bold hover:bg-emerald-100 transition border border-emerald-100"
                      >
                        <Navigation className="w-4 h-4 mr-2" /> Use Current Location
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white flex flex-col shadow-2xl z-20">
        <div className="p-8 border-b border-slate-800">
            <h1 className="text-2xl font-bold tracking-tight">Pharmelo<span className="text-emerald-400">Admin</span></h1>
            <p className="text-xs text-slate-400 mt-2 font-medium tracking-wide uppercase">Super Admin Console</p>
        </div>
        <nav className="flex-1 p-6 space-y-3">
            <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all font-medium ${activeTab === 'overview' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <LayoutDashboard className="w-5 h-5 mr-3" /> Overview
            </button>
            <button onClick={() => setActiveTab('pharmacies')} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all font-medium ${activeTab === 'pharmacies' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Store className="w-5 h-5 mr-3" /> Pharmacies
            </button>
            <button onClick={() => setActiveTab('users')} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all font-medium ${activeTab === 'users' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Users className="w-5 h-5 mr-3" /> Users & Roles
            </button>
        </nav>
        <div className="p-6 border-t border-slate-800">
            <button onClick={onExit} className="flex items-center w-full px-4 py-3 text-red-400 hover:bg-slate-800 rounded-xl transition font-medium">
                <LogOut className="w-5 h-5 mr-3" /> Sign Out
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto h-screen bg-[#F8FAFC]">
        {loading ? (
            <div className="flex justify-center items-center h-full"><Loader2 className="w-10 h-10 animate-spin text-emerald-600" /></div>
        ) : (
            <div className="max-w-6xl mx-auto">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="space-y-8 animate-slide-up">
                        <h2 className="text-3xl font-bold text-slate-900">System Overview</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-bold text-slate-400 uppercase tracking-wide">Total Pharmacies</p>
                                        <h3 className="text-4xl font-extrabold text-slate-900 mt-2">{pharmacies.length}</h3>
                                    </div>
                                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><Store className="w-8 h-8" /></div>
                                </div>
                            </div>
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-bold text-slate-400 uppercase tracking-wide">Pending Verifications</p>
                                        <h3 className="text-4xl font-extrabold text-slate-900 mt-2">{pharmacies.filter(p => p.verification_status === 'pending_review').length}</h3>
                                    </div>
                                    <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><Clock className="w-8 h-8" /></div>
                                </div>
                            </div>
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-bold text-slate-400 uppercase tracking-wide">Registered Users</p>
                                        <h3 className="text-4xl font-extrabold text-slate-900 mt-2">{users.length}</h3>
                                    </div>
                                    <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Users className="w-8 h-8" /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Pharmacies Tab */}
                {activeTab === 'pharmacies' && (
                    <div className="space-y-6 animate-slide-up">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-slate-900">Manage Pharmacies</h2>
                            <button 
                                onClick={() => setShowAddShop(true)} 
                                className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-200 flex items-center hover:bg-emerald-700 transition active:scale-95"
                            >
                                <Plus className="w-5 h-5 mr-2" /> Add Shop
                            </button>
                        </div>

                        {showAddShop && (
                            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-fade-in relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-xl text-slate-800">New Pharmacy Registration</h3>
                                    <button onClick={() => setShowAddShop(false)} className="bg-slate-50 p-2 rounded-full hover:bg-slate-100"><XCircle className="w-5 h-5 text-slate-500" /></button>
                                </div>
                                <form onSubmit={handleAddShop} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <input 
                                          type="text" 
                                          placeholder="Pharmacy Name" 
                                          required
                                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                          value={newShop.name}
                                          onChange={e => setNewShop({...newShop, name: e.target.value})}
                                        />
                                        <input 
                                          type="text" 
                                          placeholder="Full Address" 
                                          required
                                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                          value={newShop.address}
                                          onChange={e => setNewShop({...newShop, address: e.target.value})}
                                        />
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Lat" 
                                                readOnly
                                                className="w-1/3 p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono text-xs"
                                                value={newShop.lat}
                                            />
                                            <input 
                                                type="text" 
                                                placeholder="Lng" 
                                                readOnly
                                                className="w-1/3 p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono text-xs"
                                                value={newShop.lng}
                                            />
                                            <button 
                                                type="button" 
                                                onClick={() => setShowMapPicker(true)}
                                                className="flex-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-bold text-xs hover:bg-emerald-100 flex items-center justify-center"
                                            >
                                                <MapPin className="w-4 h-4 mr-1" /> Pick on Map
                                            </button>
                                        </div>
                                        <input 
                                          type="email" 
                                          placeholder="Owner Email (Existing User)" 
                                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                          value={newShop.owner_email}
                                          onChange={e => setNewShop({...newShop, owner_email: e.target.value})}
                                        />
                                    </div>
                                    <button className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition">Create Pharmacy</button>
                                </form>
                            </div>
                        )}

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Pharmacy Name</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Location</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Verification</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wide text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {pharmacies.map(shop => (
                                        <tr key={shop.id} className="hover:bg-slate-50/50 transition">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-slate-900">{shop.name}</p>
                                                <p className="text-xs text-slate-400 font-mono">ID: {shop.id.substring(0,8)}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-medium text-slate-600 truncate max-w-[200px]">{shop.address}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center w-fit ${
                                                    shop.verification_status === 'verified' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    shop.verification_status === 'pending_review' ? 'bg-amber-50 text-amber-600 border-amber-100 animate-pulse' :
                                                    shop.verification_status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                                                    'bg-slate-50 text-slate-500 border-slate-200'
                                                }`}>
                                                     {shop.verification_status === 'verified' && <CheckCircle className="w-3 h-3 mr-1" />}
                                                     {shop.verification_status === 'pending_review' && <Clock className="w-3 h-3 mr-1" />}
                                                     {shop.verification_status || 'Unverified'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                {shop.verification_status === 'pending_review' && (
                                                    <button 
                                                        onClick={() => setReviewShop(shop)}
                                                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
                                                        title="Review Documents"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => setDeleteId({ type: 'shop', id: shop.id })}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                    <div className="space-y-6 animate-slide-up">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-slate-900">Manage Users</h2>
                            <button 
                                onClick={() => setShowAddOwner(true)}
                                className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center hover:bg-blue-700 transition active:scale-95"
                            >
                                <UserPlus className="w-5 h-5 mr-2" /> Assign Owner
                            </button>
                        </div>

                        {showAddOwner && (
                             <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-fade-in relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                                <h3 className="font-bold text-xl text-slate-800 mb-4">Promote User to Shop Owner</h3>
                                <form onSubmit={handleAssignOwner} className="flex gap-4 items-end">
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">User Email</label>
                                        <input 
                                            type="email" 
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                                            value={ownerForm.email}
                                            onChange={e => setOwnerForm({...ownerForm, email: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Pharmacy ID (UUID)</label>
                                        <input 
                                            type="text" 
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                                            value={ownerForm.pharmacyId}
                                            onChange={e => setOwnerForm({...ownerForm, pharmacyId: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <button className="py-3 px-6 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition">Promote</button>
                                    <button type="button" onClick={() => setShowAddOwner(false)} className="py-3 px-4 text-slate-500 hover:bg-slate-100 rounded-xl">Cancel</button>
                                </form>
                             </div>
                        )}

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                             <table className="w-full text-left">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Name / Email</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Role</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wide text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {users.map(user => (
                                        <tr key={user.id} className="hover:bg-slate-50/50 transition">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-slate-900">{user.fullName}</p>
                                                <p className="text-xs text-slate-400 font-mono">ID: {user.id.substring(0,8)}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wide ${
                                                    user.role === 'super_admin' ? 'bg-purple-50 text-purple-600' :
                                                    user.role === 'shop_owner' ? 'bg-blue-50 text-blue-600' :
                                                    'bg-slate-50 text-slate-600'
                                                }`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => setDeleteId({ type: 'user', id: user.id })}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                             </table>
                        </div>
                    </div>
                )}
            </div>
        )}
      </main>
    </div>
  );
};

export default SuperAdminDashboard;