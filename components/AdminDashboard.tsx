
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Smartphone, 
  Receipt, 
  Package, 
  Pill, 
  Upload, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu,
  X,
  Store,
  BadgeCheck,
  AlertCircle,
  Truck,
  Clock,
  XCircle
} from 'lucide-react';
import Overview from './Overview';
import SalesBilling from './SalesBilling';
import PurchaseBills from './PurchaseBills';
import Inventory from './Inventory';
import ImportData from './ImportData';
import AppBookings from './AppBookings';
import Settings from './Settings';
import Suppliers from './Suppliers';
import { Medicine, AdminBooking, Sale, BookingStatus, VerificationStatus } from '../types';
import { supabase } from '../supabaseClient';

type View = 'overview' | 'bookings' | 'billing' | 'purchases' | 'inventory' | 'suppliers' | 'import' | 'settings';

interface AdminDashboardProps {
  pharmacyId: string;
  onExit?: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ pharmacyId, onExit }) => {
  const [currentView, setCurrentView] = useState<View>('overview');
  const [inventory, setInventory] = useState<Medicine[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Shop Details for Receipt & Sidebar
  const [shopDetails, setShopDetails] = useState<{
      name: string; 
      verified: boolean;
      verification_status: VerificationStatus;
      address: string;
      phone: string;
      gstin: string;
      drug_license_no: string;
  }>({ 
      name: 'My Pharmacy', 
      verified: false,
      verification_status: 'unverified',
      address: '',
      phone: '',
      gstin: '',
      drug_license_no: ''
  });

  useEffect(() => {
    fetchData();
    fetchShopDetails();
  }, [pharmacyId]);

  // Helper to ensure consistent YYYY-MM-DD format for logic
  const getStandardDate = (dateStr?: string | Date) => {
      const d = dateStr ? new Date(dateStr) : new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  };

  const fetchShopDetails = async () => {
      const { data } = await supabase
        .from('pharmacies')
        .select('name, verified, verification_status, address, phone, gstin, drug_license_no')
        .eq('id', pharmacyId)
        .single();
        
      if (data) {
          setShopDetails({
              name: data.name,
              verified: data.verified || false,
              verification_status: (data.verification_status as VerificationStatus) || 'unverified',
              address: data.address || '',
              phone: data.phone || '',
              gstin: data.gstin || '',
              drug_license_no: data.drug_license_no || ''
          });
      }
  };

  const fetchData = async () => {
    // Fetch Inventory with professional fields
    const { data: medicines } = await supabase
        .from('medicines')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .order('created_at', { ascending: false });
    
    if (medicines) {
        const mappedInventory: Medicine[] = medicines.map((m: any) => ({
            id: m.id,
            name: m.name,
            brand: m.brand,
            category: m.category,
            stock: m.stock,
            mrp: m.mrp,
            sellingPrice: m.selling_price,
            dosage: m.dosage,
            imageUrl: m.image_url,
            pharmacyId: m.pharmacy_id,
            // Professional fields
            batchNumber: m.batch_number,
            expiryDate: m.expiry_date,
            rackNumber: m.rack_number,
            packing: m.packing,
            purchaseRate: m.purchase_rate,
            gstPercentage: m.gst_percentage,
            hsnCode: m.hsn_code,
            manufacturer: m.manufacturer
        }));
        setInventory(mappedInventory);
    }

    // Fetch Bookings
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select(`
        id, 
        customer_name, 
        customer_email,
        status, 
        total_amount, 
        created_at,
        qr_code_data,
        prescription_url,
        items_snapshot,
        medicines (name)
      `)
      .eq('pharmacy_id', pharmacyId)
      .order('created_at', { ascending: false });
    
    if (bookingsData) {
      const mappedBookings: AdminBooking[] = bookingsData.map((b: any) => {
        // Determine medicine display name with full quantity details
        let displayMedName = 'Unknown Item';
        
        if (b.medicines?.name) {
            displayMedName = b.medicines.name;
        } else if (b.items_snapshot && Array.isArray(b.items_snapshot) && b.items_snapshot.length > 0) {
            // Map all items with quantity
            const items = b.items_snapshot.map((i: any) => `• ${i.name} (Qty: ${i.quantity})`);
            displayMedName = items.join('\n');
        } else if (b.prescription_url) {
            displayMedName = 'Prescription Image Uploaded (No items detected)';
        }

        // Logic to fix "Email as Name" issue
        let displayName = b.customer_name || 'Guest';
        let displayEmail = b.customer_email;

        // If the name looks like an email (contains @), extract the name part
        if (displayName.includes('@')) {
            // Use this as the email if email field was empty
            if (!displayEmail) displayEmail = displayName;
            
            const parts = displayName.split('@');
            if (parts[0]) {
                // Capitalize first letter (e.g. punamg316 -> Punamg316)
                displayName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            }
        }

        return {
            id: b.id,
            customerName: displayName,
            customerEmail: displayEmail,
            medicineName: displayMedName,
            orderTime: new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: b.status,
            amount: b.total_amount,
            qrCodeData: b.qr_code_data,
            prescriptionUrl: b.prescription_url
        };
      });
      setBookings(mappedBookings);
    }

    // Fetch Sales with Items for Reprinting
    const { data: salesData } = await supabase
        .from('sales')
        .select('*, sale_items(*)')
        .eq('pharmacy_id', pharmacyId)
        .order('created_at', { ascending: false });
        
    if (salesData) {
        const mappedSales: Sale[] = salesData.map((s: any) => ({
            id: s.id,
            pharmacyId: s.pharmacy_id,
            customerName: s.customer_name,
            customerPhone: s.customer_phone,
            items: s.sale_items ? s.sale_items.map((si: any) => ({
                id: si.medicine_id || 'unknown',
                name: si.name,
                batchNumber: si.batch_number,
                expiryDate: si.expiry_date,
                quantity: si.quantity,
                sellingPrice: si.price,
                total: si.total,
                gstPercentage: si.gst_percentage || 12,
                // Reconstruct calculated fields
                taxableAmount: (si.total / (1 + ((si.gst_percentage || 12) / 100))),
                gstAmount: si.total - (si.total / (1 + ((si.gst_percentage || 12) / 100))),
            })) : [], 
            subtotal: s.subtotal,
            discount: s.discount,
            total: s.total,
            paymentMethod: s.payment_method,
            invoiceNumber: s.invoice_number,
            // Ensure date format is strict YYYY-MM-DD for logic
            date: getStandardDate(s.created_at)
        }));
        setSales(mappedSales);
    }
  };

  const handleLogout = async () => {
    if (onExit) {
      onExit();
    } else {
      await supabase.auth.signOut();
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleUpdateBookingStatus = async (id: string, status: BookingStatus) => {
      // Optimistic update
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
      await supabase.from('bookings').update({ status }).eq('id', id);
  };

  const handleUpdateInventory = async (updatedItem: Medicine) => {
    const { error } = await supabase
      .from('medicines')
      .update({
        name: updatedItem.name,
        brand: updatedItem.brand,
        category: updatedItem.category,
        stock: updatedItem.stock,
        selling_price: updatedItem.sellingPrice,
        mrp: updatedItem.mrp,
        dosage: updatedItem.dosage,
        image_url: updatedItem.imageUrl,
        // Professional fields update
        batch_number: updatedItem.batchNumber,
        expiry_date: updatedItem.expiryDate,
        rack_number: updatedItem.rackNumber,
        packing: updatedItem.packing,
        purchase_rate: updatedItem.purchaseRate,
        gst_percentage: updatedItem.gstPercentage,
        hsn_code: updatedItem.hsnCode,
        manufacturer: updatedItem.manufacturer
      })
      .eq('id', updatedItem.id)
      .eq('pharmacy_id', pharmacyId);

    if (!error) {
        setInventory(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
        return true;
    }
    console.error("Error updating medicine:", error);
    return false;
  };

  const handleAddInventory = async (newItem: Medicine) => {
    const payload = {
        pharmacy_id: pharmacyId,
        name: newItem.name,
        brand: newItem.brand || '',
        stock: newItem.stock || 0,
        selling_price: newItem.sellingPrice || 0,
        mrp: newItem.mrp || newItem.sellingPrice || 0,
        category: newItem.category || 'General', 
        image_url: newItem.imageUrl || '',
        dosage: newItem.dosage || '',
        // Professional fields insert
        batch_number: newItem.batchNumber,
        expiry_date: newItem.expiryDate,
        rack_number: newItem.rackNumber,
        packing: newItem.packing,
        purchase_rate: newItem.purchaseRate,
        gst_percentage: newItem.gstPercentage,
        hsn_code: newItem.hsnCode,
        manufacturer: newItem.manufacturer
    };

    const { data, error } = await supabase
      .from('medicines')
      .insert([payload])
      .select();

    if (error) {
        console.error("Error adding medicine:", error);
        return false;
    }

    if (data && data.length > 0) {
        const addedItem: Medicine = {
            id: data[0].id,
            name: data[0].name,
            brand: data[0].brand,
            category: data[0].category,
            stock: data[0].stock,
            mrp: data[0].mrp,
            sellingPrice: data[0].selling_price,
            dosage: data[0].dosage,
            imageUrl: data[0].image_url,
            pharmacyId: data[0].pharmacy_id,
            // Map back pro fields
            batchNumber: data[0].batch_number,
            expiryDate: data[0].expiry_date,
            rackNumber: data[0].rack_number,
            packing: data[0].packing,
            purchaseRate: data[0].purchase_rate,
            gstPercentage: data[0].gst_percentage,
            hsnCode: data[0].hsn_code,
            manufacturer: data[0].manufacturer
        };
        setInventory(prev => [addedItem, ...prev]);
        return true;
    }
    return false;
  };

  const handleDeleteInventory = async (id: string) => {
    const { error } = await supabase.from('medicines').delete().eq('id', id).eq('pharmacy_id', pharmacyId);
    if (!error) {
        setInventory(prev => prev.filter(item => item.id !== id));
        return true;
    }
    return false;
  };

  // UPDATED: Use RPC for Atomic Transaction
  const handleAddSale = async (newSale: Sale) => {
    try {
        const { data, error } = await supabase.rpc('process_sale', {
            p_pharmacy_id: pharmacyId,
            p_customer_name: newSale.customerName,
            p_customer_phone: newSale.customerPhone,
            p_doctor_name: newSale.doctorName,
            p_payment_method: newSale.paymentMethod,
            p_subtotal: newSale.subtotal,
            p_discount: newSale.discount,
            p_taxable_amount: newSale.taxableAmount || 0,
            p_tax_amount: newSale.taxAmount || 0,
            p_total: newSale.total,
            p_items: newSale.items
        });

        if (error) throw error;

        // If successful, data contains { id, invoice_number }
        // Update local state with the returned invoice number
        // CRITICAL: Use getStandardDate() so it matches the Overview filter exactly (YYYY-MM-DD)
        const confirmedSale = { 
            ...newSale, 
            invoiceNumber: data.invoice_number, 
            id: data.id,
            date: getStandardDate() 
        };
        setSales(prev => [confirmedSale, ...prev]);
        
        // Update local inventory state immediately
        newSale.items.forEach(soldItem => {
            setInventory(prev => prev.map(invItem => {
                if(invItem.id === soldItem.id) {
                    return { ...invItem, stock: Math.max(0, (invItem.stock || 0) - soldItem.quantity) };
                }
                return invItem;
            }));
        });

        return confirmedSale; // Return to caller to show success
    } catch (e) {
        console.error("Sale Process Error:", e);
        return null;
    }
  };

  const NavItem = ({ view, icon: Icon, label }: { view: View; icon: React.ElementType; label: string }) => {
    const isActive = currentView === view;
    return (
      <button
        onClick={() => {
          setCurrentView(view);
          setIsSidebarOpen(false);
        }}
        className={`flex items-center w-full px-4 py-3 mx-2 mb-1 rounded-xl transition-all duration-300 font-medium ${
          isActive
            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
        }`}
        style={{ width: 'calc(100% - 16px)' }}
      >
        <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans text-slate-900 selection:bg-emerald-100 selection:text-emerald-700">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden" onClick={toggleSidebar}></div>
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-slate-100 transform transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Brand */}
          <div className="h-24 flex flex-col justify-center px-6 mb-2 border-b border-slate-50">
            <div className="flex items-center mb-1">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mr-3 shadow-emerald-200 shadow-md flex-shrink-0">
                  <Store className="text-white w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">Medzo Shop</h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dashboard</p>
                </div>
                <button className="ml-auto lg:hidden p-1 rounded-md hover:bg-slate-50" onClick={toggleSidebar}>
                  <X className="w-5 h-5 text-slate-500" />
                </button>
            </div>
            
            {/* Shop Status Badge */}
            <div className={`mt-2 py-1 px-3 rounded-lg flex items-center justify-center text-xs font-bold border ${
                shopDetails.verified 
                ? 'bg-blue-50 text-blue-700 border-blue-100' 
                : shopDetails.verification_status === 'pending_review'
                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                    : shopDetails.verification_status === 'rejected'
                        ? 'bg-red-50 text-red-700 border-red-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
                {shopDetails.verified ? (
                    <><BadgeCheck className="w-3.5 h-3.5 mr-1.5 fill-current" /> Verified Account</>
                ) : shopDetails.verification_status === 'pending_review' ? (
                     <><Clock className="w-3.5 h-3.5 mr-1.5" /> Verification Pending</>
                ) : shopDetails.verification_status === 'rejected' ? (
                     <><XCircle className="w-3.5 h-3.5 mr-1.5" /> Verification Rejected</>
                ) : (
                     <><AlertCircle className="w-3.5 h-3.5 mr-1.5" /> Unverified Shop</>
                )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-2">
            <NavItem view="overview" icon={LayoutDashboard} label="Dashboard" />
            <NavItem view="billing" icon={Receipt} label="POS & Billing" />
            <NavItem view="inventory" icon={Pill} label="Inventory" />
            <NavItem view="bookings" icon={Smartphone} label="App Orders" />
            
            <div className="my-4 px-6">
                <div className="h-px bg-slate-100 w-full"></div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-4 mb-2">Management</p>
            </div>

            <NavItem view="purchases" icon={Package} label="Purchases" />
            <NavItem view="suppliers" icon={Truck} label="Suppliers" />
            <NavItem view="import" icon={Upload} label="Import Data" />
            <NavItem view="settings" icon={SettingsIcon} label="Settings" />
          </nav>

          {/* User Profile / Logout */}
          <div className="p-4 border-t border-slate-50 m-2">
            <button 
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 bg-[#F8FAFC]">
        {/* Mobile Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center px-4 lg:hidden justify-between shrink-0 z-30 sticky top-0">
          <div className="flex items-center">
            <button onClick={toggleSidebar} className="mr-3 p-2 rounded-lg hover:bg-slate-50 text-slate-600">
                <Menu className="w-6 h-6" />
            </button>
            <span className="font-bold text-slate-800 capitalize">{currentView}</span>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto p-4 md:p-8 relative scroll-smooth">
          <div className="max-w-[1400px] mx-auto pb-10">
            {currentView === 'overview' && (
                <Overview 
                inventory={inventory} 
                sales={sales} 
                bookings={bookings} 
                onNavigate={setCurrentView} 
                />
            )}
            {currentView === 'billing' && (
                <SalesBilling 
                    inventory={inventory} 
                    onCompleteSale={handleAddSale} 
                    pharmacyId={pharmacyId} 
                    shopDetails={shopDetails}
                    bookings={bookings} // Passed down
                    onBookingAction={handleUpdateBookingStatus} // Passed down
                    recentSales={sales} // Pass sales history
                />
            )}
            {currentView === 'inventory' && (
                <Inventory 
                data={inventory} 
                onUpdate={handleUpdateInventory}
                onAdd={handleAddInventory}
                onDelete={handleDeleteInventory}
                />
            )}
            {currentView === 'bookings' && <AppBookings bookings={bookings} setBookings={setBookings} />}
            {currentView === 'purchases' && <PurchaseBills inventory={inventory} />}
            {currentView === 'suppliers' && <Suppliers pharmacyId={pharmacyId} />}
            {currentView === 'import' && (
              <ImportData 
                onImport={async (items) => {
                    for (const item of items) {
                        await handleAddInventory(item);
                    }
                }} 
              />
            )}
            {currentView === 'settings' && (
                <Settings pharmacyId={pharmacyId} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
