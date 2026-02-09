import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { User, Phone, Mail, Camera, Save, X, Edit2, Loader2, LogOut } from 'lucide-react';

interface ProfileProps {
  session: any;
  onLogout: () => void;
  onProfileUpdate?: () => void;
}

const Profile: React.FC<ProfileProps> = ({ session, onLogout, onProfileUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    avatar_url: '',
    email: session.user.email
  });

  useEffect(() => {
    getProfile();
  }, [session]);

  const getProfile = async () => {
    try {
      setLoading(true);
      const { user } = session;

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone_number, avatar_url')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setFormData({
          full_name: data.full_name || '',
          phone_number: data.phone_number || '',
          avatar_url: data.avatar_url || '',
          email: user.email
        });
      }
    } catch (error) {
      console.error('Error loading user data!', error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    try {
      setLoading(true);
      const { user } = session;

      const updates = {
        id: user.id,
        full_name: formData.full_name,
        phone_number: formData.phone_number,
        avatar_url: formData.avatar_url,
        updated_at: new Date(),
      };

      const { error } = await supabase.from('profiles').upsert(updates);

      if (error) throw error;
      if (onProfileUpdate) onProfileUpdate();
      setEditing(false);
    } catch (error) {
      alert('Error updating the data!');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      setFormData(prev => ({ ...prev, avatar_url: data.publicUrl }));
      
      // Auto save after upload
      const { user } = session;
      await supabase.from('profiles').upsert({
        id: user.id,
        avatar_url: data.publicUrl
      });
      
      if (onProfileUpdate) onProfileUpdate();

    } catch (error) {
      alert('Error uploading avatar!');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  if (loading && !formData.full_name) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pt-6 px-4">
      {/* Header Card */}
      <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden mb-6 relative">
        <div className="h-32 bg-gradient-to-r from-emerald-500 to-teal-600"></div>
        <div className="px-8 pb-8">
          <div className="relative -mt-16 mb-4 flex justify-between items-end">
             <div className="relative group">
                <div className="w-32 h-32 rounded-full border-4 border-white bg-gray-100 overflow-hidden shadow-md flex items-center justify-center">
                    {formData.avatar_url ? (
                        <img src={formData.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <User className="w-12 h-12 text-gray-300" />
                    )}
                    {uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                    )}
                </div>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-2 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition transform hover:scale-105"
                >
                    <Camera className="w-4 h-4" />
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={uploadAvatar} 
                    accept="image/*" 
                    className="hidden" 
                />
             </div>
             
             {!editing && (
                 <button 
                    onClick={() => setEditing(true)}
                    className="mb-4 px-4 py-2 bg-gray-50 text-gray-700 font-bold text-sm rounded-xl border border-gray-200 hover:bg-gray-100 transition flex items-center"
                 >
                    <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                 </button>
             )}
          </div>

          <div className="text-left">
             <h1 className="text-3xl font-bold text-gray-900">{formData.full_name || 'Your Name'}</h1>
             <p className="text-gray-500 font-medium">Consumer Account</p>
          </div>
        </div>
      </div>

      {/* Details Form */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-6">
         <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">Personal Information</h2>
            {editing && (
                <div className="flex gap-2">
                    <button 
                        onClick={() => setEditing(false)}
                        className="px-4 py-2 text-gray-500 hover:bg-gray-50 rounded-lg transition"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={updateProfile}
                        disabled={loading}
                        className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition flex items-center"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
                    </button>
                </div>
            )}
         </div>

         <div className="grid grid-cols-1 gap-6">
            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                    Full Name
                </label>
                <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        value={formData.full_name}
                        onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                        disabled={!editing}
                        className={`w-full pl-12 pr-4 py-3.5 rounded-xl border outline-none transition-all font-medium ${
                            editing 
                            ? 'bg-white border-gray-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-gray-800' 
                            : 'bg-gray-50 border-transparent text-gray-600'
                        }`}
                        placeholder="Enter your full name"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                        Email Address
                    </label>
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input 
                            type="email" 
                            value={formData.email}
                            disabled={true}
                            className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-transparent bg-gray-50 text-gray-500 cursor-not-allowed font-medium"
                        />
                    </div>
                    {editing && <p className="text-xs text-amber-600 mt-2 ml-1">Email cannot be changed directly.</p>}
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                        Phone Number
                    </label>
                    <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input 
                            type="tel" 
                            value={formData.phone_number}
                            onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                            disabled={!editing}
                            className={`w-full pl-12 pr-4 py-3.5 rounded-xl border outline-none transition-all font-medium ${
                                editing 
                                ? 'bg-white border-gray-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-gray-800' 
                                : 'bg-gray-50 border-transparent text-gray-600'
                            }`}
                            placeholder="+91 98765 43210"
                        />
                    </div>
                </div>
            </div>
         </div>
      </div>

      <button 
        onClick={onLogout}
        className="w-full py-4 bg-white border border-red-100 text-red-600 font-bold rounded-2xl hover:bg-red-50 transition flex items-center justify-center mb-8"
      >
        <LogOut className="w-5 h-5 mr-2" /> Sign Out
      </button>
    </div>
  );
};

export default Profile;