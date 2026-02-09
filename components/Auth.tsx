import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Pill, Mail, Lock, User, Loader2, AlertCircle, Phone, Eye, EyeOff, Store, FileText, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import { verifyGSTIN, verifyDrugLicense } from '../services/verification';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isShopOwner, setIsShopOwner] = useState(false);
  
  // Registration Fields
  const [gstin, setGstin] = useState('');
  const [drugLicense, setDrugLicense] = useState('');
  const [legalName, setLegalName] = useState('');

  // Verification States
  const [verifying, setVerifying] = useState<'gst' | 'dl' | null>(null);
  const [gstStatus, setGstStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [dlStatus, setDlStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerifyGST = async () => {
      if (!gstin) return;
      setVerifying('gst');
      const result = await verifyGSTIN(gstin);
      setVerifying(null);
      
      if (result.isValid) {
          setGstStatus('valid');
          setLegalName(result.data.legalName);
      } else {
          setGstStatus('invalid');
          setLegalName('');
          setError(result.message);
      }
  };

  const handleVerifyDL = async () => {
      if (!drugLicense) return;
      setVerifying('dl');
      const result = await verifyDrugLicense(drugLicense);
      setVerifying(null);

      if (result.isValid) {
          setDlStatus('valid');
      } else {
          setDlStatus('invalid');
          setError(result.message);
      }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic Validation for Shop Owners
    if (!isLogin && isShopOwner) {
        if (gstStatus !== 'valid') {
            setError("Please verify a valid GSTIN before registering.");
            setLoading(false);
            return;
        }
    }

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone_number: phoneNumber,
              role: isShopOwner ? 'shop_owner' : 'consumer',
              // Pass registration details to metadata so the SQL Trigger can create the pharmacy
              gstin: isShopOwner ? gstin : null,
              drug_license_no: isShopOwner ? drugLicense : null,
              legal_trade_name: isShopOwner ? (legalName || 'My New Pharmacy') : null
            },
          },
        });
        if (error) throw error;
        alert('Registration successful! Please log in to your new shop dashboard.');
        setIsLogin(true);
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md border border-white/50 backdrop-blur-sm animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-emerald-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4 transform rotate-3 hover:rotate-6 transition-transform">
            <Pill className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Welcome to Medzo Shop</h1>
          <p className="text-gray-500 mt-2 text-sm">Your trusted pharmacy partner</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-6 flex items-center text-xs font-bold border border-red-100">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 placeholder-gray-400"
                  required
                />
              </div>

              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 placeholder-gray-400"
                  required
                />
              </div>
            </>
          )}
          
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 placeholder-gray-400"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 placeholder-gray-400"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>

          {!isLogin && (
            <div 
              onClick={() => setIsShopOwner(!isShopOwner)}
              className={`flex items-center p-4 rounded-xl cursor-pointer transition-all border-2 ${
                  isShopOwner 
                  ? 'bg-emerald-50 border-emerald-500 shadow-sm' 
                  : 'bg-white border-slate-100 hover:border-emerald-200'
              }`}
            >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 transition-colors ${isShopOwner ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <Store className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <p className={`font-bold text-sm ${isShopOwner ? 'text-emerald-800' : 'text-slate-600'}`}>Register as Pharmacy Owner</p>
                    <p className="text-xs text-slate-400">Manage inventory & orders</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isShopOwner ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                    {isShopOwner && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
            </div>
          )}

          {/* Shop Owner Verification Fields */}
          {!isLogin && isShopOwner && (
            <div className="space-y-4 pt-2 animate-fade-in">
                {/* Drug License */}
                <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Drug License Number"
                        value={drugLicense}
                        onChange={(e) => setDrugLicense(e.target.value)}
                        onBlur={handleVerifyDL}
                        className={`w-full pl-12 pr-10 py-3.5 bg-white border rounded-xl outline-none transition-all text-gray-800 placeholder-gray-400 font-mono text-sm uppercase ${
                            dlStatus === 'valid' ? 'border-emerald-500 ring-1 ring-emerald-500' : 
                            dlStatus === 'invalid' ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200 focus:border-emerald-500'
                        }`}
                        required
                    />
                     <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {verifying === 'dl' ? <Loader2 className="w-4 h-4 text-emerald-600 animate-spin"/> :
                         dlStatus === 'valid' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                         dlStatus === 'invalid' ? <XCircle className="w-5 h-5 text-red-500" /> : null
                        }
                    </div>
                </div>

                {/* GSTIN */}
                <div className="relative">
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="GSTIN (e.g. 29ABCDE1234F1Z5)"
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value)}
                        onBlur={handleVerifyGST}
                        className={`w-full pl-12 pr-10 py-3.5 bg-white border rounded-xl outline-none transition-all text-gray-800 placeholder-gray-400 font-mono text-sm uppercase ${
                            gstStatus === 'valid' ? 'border-emerald-500 ring-1 ring-emerald-500' : 
                            gstStatus === 'invalid' ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200 focus:border-emerald-500'
                        }`}
                        required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {verifying === 'gst' ? <Loader2 className="w-4 h-4 text-emerald-600 animate-spin"/> :
                         gstStatus === 'valid' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                         gstStatus === 'invalid' ? <XCircle className="w-5 h-5 text-red-500" /> : null
                        }
                    </div>
                </div>

                {legalName && (
                    <div className="text-xs bg-emerald-50 text-emerald-700 p-2 rounded-lg border border-emerald-100 flex items-center animate-fade-in">
                        <Store className="w-3 h-3 mr-2" />
                        Registered: <strong>{legalName}</strong>
                    </div>
                )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (isShopOwner && !isLogin && gstStatus !== 'valid')}
            className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-emerald-600 font-bold hover:underline"
            >
              {isLogin ? 'Sign Up' : 'Log In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}