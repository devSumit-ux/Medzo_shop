
import os
from supabase import create_client, Client

# Supabase Setup - Replace with your project details or env vars
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://egcmmspwptftbcjrfock.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "your-anon-key")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def load_knowledge_base():
    """
    Fetches medicines and pharmacies from Supabase and formats them into a text block
    for the AI's system prompt.
    """
    try:
        # Fetch Pharmacies
        pharmacies_response = supabase.table('pharmacies').select('name, address, phone').execute()
        pharmacies = pharmacies_response.data
        
        # Fetch Medicines
        medicines_response = supabase.table('medicines').select('name, brand, category, selling_price, stock').gt('stock', 0).execute()
        medicines = medicines_response.data
        
        # Format Data
        kb_text = "AVAILABLE PHARMACIES:\n"
        for p in pharmacies:
            kb_text += f"- {p['name']} at {p['address']} (Phone: {p['phone']})\n"
            
        kb_text += "\nAVAILABLE MEDICINES:\n"
        for m in medicines:
            kb_text += f"- {m['name']} ({m['brand']}) - {m['category']}: ₹{m['selling_price']} (Stock: {m['stock']})\n"
            
        return kb_text

    except Exception as e:
        return f"Error loading data: {str(e)}"

if __name__ == "__main__":
    # Test run
    print(load_knowledge_base())
