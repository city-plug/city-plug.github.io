// Connects your pages to Supabase.
// Replace both values with the ones from Supabase > Project Settings > API.
const SUPABASE_URL = "https://ctqsufsamvayeccndmtm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0cXN1ZnNhbXZheWVjY25kbXRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NTk3NTAsImV4cCI6MjEwNzEzNTc1MH0.8HtiVk-3kYBbP4b30LnMLpdw3s4xm-YYDeiyZd2XHSI";

// Cities and categories live here, so you change them in one place.
// Every category exists inside every city.
const CITIES = ["Auchi", "Lagos", "Port Harcourt", "Abuja"];
const CATEGORIES = ["Food", "Fashion", "Shoes", "Gadgets", "Perfumes", "Hygiene"];

// "db" is the connection every other file uses.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
function verifiedBadge(b) {
  return b && b.verified ? '<span class="vbadge">&#10003; Verified</span>' : "";
}
