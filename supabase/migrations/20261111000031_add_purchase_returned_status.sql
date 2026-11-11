-- Add an explicit terminal state for a purchase whose full quantity was returned.
ALTER TYPE public.purchase_status ADD VALUE IF NOT EXISTS 'returned';
