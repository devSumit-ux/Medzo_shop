
-- 1. Ensure Pharmacies Columns Exist
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS latitude float DEFAULT 0;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS longitude float DEFAULT 0;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS gstin text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS drug_license_no text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS legal_trade_name text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS upi_id text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS invoice_terms text DEFAULT 'Goods once sold will not be taken back.';
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS low_stock_threshold int DEFAULT 10;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS expiry_alert_days int DEFAULT 90;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS drug_license_url text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS gst_certificate_url text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified';
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS rating float DEFAULT 0;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS review_count int DEFAULT 0;

-- 2. Ensure Medicines Columns Exist
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS rack_number text;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS packing text;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS purchase_rate float DEFAULT 0;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS gst_percentage float DEFAULT 12;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS hsn_code text;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS manufacturer text;

-- 3. Ensure Bookings Columns Exist
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_rated boolean DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS qr_code_data text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS prescription_url text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS items_snapshot jsonb;

-- 4. SALES & BILLING TABLES (Fix for "Bill not generating")
CREATE TABLE IF NOT EXISTS public.sales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    pharmacy_id uuid REFERENCES public.pharmacies(id),
    invoice_number text,
    customer_name text,
    customer_phone text,
    doctor_name text,
    payment_method text,
    subtotal float,
    discount float,
    taxable_amount float,
    tax_amount float,
    total float,
    created_at timestamptz DEFAULT now(),
    status text DEFAULT 'Completed'
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
    medicine_id uuid REFERENCES public.medicines(id),
    name text,
    batch_number text,
    expiry_date date,
    quantity int,
    price float,
    total float,
    gst_percentage float,
    created_at timestamptz DEFAULT now()
);

-- Sequence for Invoice Numbers (e.g. INV-241201-1001)
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1001;

-- 5. REVIEWS & RATINGS TABLE
CREATE TABLE IF NOT EXISTS public.reviews (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id text,
    pharmacy_id uuid REFERENCES public.pharmacies(id),
    user_id uuid REFERENCES auth.users(id),
    rating int CHECK (rating >= 1 AND rating <= 5),
    comment text,
    created_at timestamptz DEFAULT now()
);

-- 6. RPC: Process Sale (Required for Billing)
CREATE OR REPLACE FUNCTION process_sale(
    p_pharmacy_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_doctor_name text,
    p_payment_method text,
    p_subtotal float,
    p_discount float,
    p_taxable_amount float,
    p_tax_amount float,
    p_total float,
    p_items jsonb
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_id uuid;
    v_invoice_number text;
    item jsonb;
BEGIN
    -- Generate Invoice Number: INV-YYMMDD-SEQUENCE
    v_invoice_number := 'INV-' || to_char(now(), 'YYMMDD') || '-' || nextval('invoice_seq');

    -- Insert Sale Record
    INSERT INTO sales (
        pharmacy_id, invoice_number, customer_name, customer_phone, doctor_name,
        payment_method, subtotal, discount, taxable_amount, tax_amount, total, status
    ) VALUES (
        p_pharmacy_id, v_invoice_number, p_customer_name, p_customer_phone, p_doctor_name,
        p_payment_method, p_subtotal, p_discount, p_taxable_amount, p_tax_amount, p_total, 'Completed'
    ) RETURNING id INTO v_sale_id;

    -- Process Each Item in Cart
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Insert into Sale Items
        INSERT INTO sale_items (
            sale_id, medicine_id, name, batch_number, expiry_date,
            quantity, price, total, gst_percentage
        ) VALUES (
            v_sale_id,
            (item->>'id')::uuid,
            item->>'name',
            item->>'batchNumber',
            CASE WHEN (item->>'expiryDate') = '' OR (item->>'expiryDate') IS NULL THEN NULL ELSE (item->>'expiryDate')::date END,
            (item->>'quantity')::int,
            (item->>'sellingPrice')::float,
            (item->>'total')::float,
            (item->>'gstPercentage')::float
        );

        -- Decrease Stock in Medicines Table
        UPDATE medicines
        SET stock = stock - (item->>'quantity')::int
        WHERE id = (item->>'id')::uuid;
    END LOOP;

    -- Return the new Sale ID and Invoice Number
    RETURN json_build_object('id', v_sale_id, 'invoice_number', v_invoice_number);
END;
$$;

-- 7. RPC: Submit Review
CREATE OR REPLACE FUNCTION submit_review(
    p_booking_id text,
    p_pharmacy_id uuid,
    p_user_id uuid,
    p_rating int,
    p_comment text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_rating float;
    v_old_count int;
    v_new_rating float;
BEGIN
    -- 1. Insert Review
    INSERT INTO reviews (booking_id, pharmacy_id, user_id, rating, comment)
    VALUES (p_booking_id, p_pharmacy_id, p_user_id, p_rating, p_comment);

    -- 2. Mark Booking as Rated
    UPDATE bookings SET is_rated = true WHERE id = p_booking_id;

    -- 3. Update Pharmacy Stats
    SELECT COALESCE(rating, 0)::float, COALESCE(review_count, 0)::int INTO v_old_rating, v_old_count
    FROM pharmacies WHERE id = p_pharmacy_id;

    -- Calculate new average (Weighted Average)
    IF v_old_count = 0 THEN
        v_new_rating := p_rating::float;
    ELSE
        v_new_rating := ((v_old_rating * v_old_count) + p_rating) / (v_old_count + 1);
    END IF;

    UPDATE pharmacies 
    SET rating = v_new_rating, 
        review_count = v_old_count + 1 
    WHERE id = p_pharmacy_id;
END;
$$;

-- 8. RPC: Get Nearby Pharmacies (Updated)
CREATE OR REPLACE FUNCTION get_nearby_pharmacies(
    user_lat float, 
    user_lng float, 
    radius_km float DEFAULT 50.0
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  latitude float,
  longitude float,
  distance_km float,
  rating float,
  review_count int,
  verified boolean,
  verification_status text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.id,
    sub.name,
    sub.address,
    sub.latitude,
    sub.longitude,
    sub.distance_km,
    sub.rating,
    sub.review_count,
    sub.verified,
    sub.verification_status
  FROM (
    SELECT
      p.id,
      p.name,
      p.address,
      p.latitude,
      p.longitude,
      (
        6371 * acos(
          least(1.0, greatest(-1.0, 
            cos(radians(user_lat)) * cos(radians(p.latitude)) *
            cos(radians(p.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(p.latitude))
          ))
        )
      )::float AS distance_km,
      COALESCE(p.rating, 0)::float as rating,
      COALESCE(p.review_count, 0)::int as review_count,
      COALESCE(p.verified, false) as verified,
      COALESCE(p.verification_status, 'unverified') as verification_status
    FROM
      pharmacies p
    WHERE
      p.latitude IS NOT NULL 
      AND p.latitude <> 0 
      AND p.verified = true
  ) AS sub
  WHERE sub.distance_km <= radius_km
  ORDER BY sub.distance_km ASC;
END;
$$;

-- 9. RPC: Get Medicine Availability
CREATE OR REPLACE FUNCTION get_medicine_availability(
    search_name text,
    user_lat float, 
    user_lng float, 
    radius_km float DEFAULT 50.0
)
RETURNS TABLE (
  pharmacy_id uuid,
  pharmacy_name text,
  pharmacy_address text,
  latitude float,
  longitude float,
  distance_km float,
  rating float,
  review_count int,
  price float,
  stock int,
  verified boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as pharmacy_id,
    p.name as pharmacy_name,
    p.address as pharmacy_address,
    p.latitude,
    p.longitude,
    (
      6371 * acos(
        least(1.0, greatest(-1.0, 
          cos(radians(user_lat)) * cos(radians(p.latitude)) *
          cos(radians(p.longitude) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(p.latitude))
        ))
      )
    )::float AS distance_km,
    COALESCE(p.rating, 0)::float as rating,
    COALESCE(p.review_count, 0)::int as review_count,
    m.selling_price::float as price,
    m.stock::int as stock,
    p.verified
  FROM
    medicines m
  JOIN
    pharmacies p ON m.pharmacy_id = p.id
  WHERE
    m.name ILIKE search_name
    AND m.stock > 0
    AND p.latitude IS NOT NULL 
    AND p.latitude <> 0
    AND p.verified = true
  ORDER BY
    distance_km ASC;
END;
$$;
