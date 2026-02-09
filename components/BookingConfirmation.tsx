import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Clock, MapPin, ChevronRight, Home } from 'lucide-react';
import { Booking } from '../types';

interface BookingConfirmationProps {
  booking: Booking;
  onViewBookings: () => void;
  onHome: () => void;
}

const BookingConfirmation: React.FC<BookingConfirmationProps> = ({ booking, onViewBookings, onHome }) => {
  return (
    <div className="min-h-full bg-white flex flex-col items-center">
        <div className="w-full max-w-lg flex-1 flex flex-col pt-12 px-6">
            <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 animate-bounce">
                    <Check className="w-10 h-10 text-emerald-600 stroke-[3px]" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
                <p className="text-gray-500 text-center text-sm">
                    Your order for <span className="font-semibold text-gray-800">{booking.medicine.name}</span> has been placed.
                </p>
            </div>

            {/* Order Card */}
            <div className="w-full bg-white border border-gray-100 rounded-2xl shadow-xl p-6 relative overflow-hidden mb-8">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                
                <div className="flex justify-between items-start mb-6 border-b border-gray-50 pb-4">
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Order ID</p>
                        <p className="font-mono text-gray-800 font-bold text-lg">#{booking.id}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Total</p>
                        <p className="text-xl font-bold text-emerald-600">₹{booking.totalAmount}</p>
                    </div>
                </div>

                <div className="flex items-start mb-6">
                    <div className="w-14 h-14 bg-gray-50 rounded-xl mr-4 flex-shrink-0 border border-gray-100">
                         <img src={booking.medicine.imageUrl} alt="" className="w-full h-full object-cover rounded-xl mix-blend-multiply" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">{booking.medicine.name}</h3>
                        <p className="text-xs text-gray-500 font-medium">{booking.medicine.dosage}</p>
                        <p className="text-xs text-emerald-600 font-bold mt-1 uppercase tracking-wide">Ready for pickup</p>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                    <h4 className="text-xs font-bold text-gray-700 uppercase mb-3 flex items-center">
                        <MapPin className="w-3.5 h-3.5 mr-1.5" /> Pickup Location
                    </h4>
                    <p className="font-bold text-gray-900 text-sm">{booking.pharmacy.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{booking.pharmacy.address}</p>
                    <div className="mt-3 flex items-center text-xs text-emerald-600 font-bold bg-emerald-50 w-fit px-2 py-1 rounded">
                        <Clock className="w-3.5 h-3.5 mr-1.5" /> Ready in ~15 mins
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                    <QRCodeSVG value={booking.qrCodeData} size={140} />
                    <p className="text-xs text-gray-500 mt-4 font-bold text-center">Show this QR at the pharmacy counter</p>
                </div>
            </div>
        
            {/* Footer Actions */}
            <div className="w-full space-y-3 pb-8">
                <button 
                    onClick={onViewBookings}
                    className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 flex items-center justify-center active:scale-[0.98] transition-transform hover:bg-emerald-700"
                >
                    View My Bookings <ChevronRight className="w-5 h-5 ml-1" />
                </button>
                <button 
                    onClick={onHome}
                    className="w-full bg-white border border-gray-200 text-gray-600 font-bold py-4 rounded-xl flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                    <Home className="w-5 h-5 mr-2" /> Back to Home
                </button>
            </div>
        </div>
    </div>
  );
};

export default BookingConfirmation;