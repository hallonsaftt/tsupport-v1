# SupportPWA - TSupport

Aplikacija je uspešno instalirana i konfigurisana.

## Sledeći koraci za pokretanje:

1. **Supabase Konfiguracija**:
   - Napravi novi projekat na [Supabase](https://supabase.com).
   - Idi u **SQL Editor** na Supabase-u i kopiraj sadržaj fajla `supabase/schema.sql`. Izvrši taj SQL kod da kreiraš tabele.
   - Kopiraj URL i ANON KEY iz Supabase podešavanja (Project Settings -> API).

2. **Environment Varijable**:
   - Otvori fajl `.env.local` u ovom folderu.
   - Zameni `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_ANON_KEY` sa tvojim pravim podacima.

3. **Pokretanje Aplikacije**:
   - Pokreni komandu: `npm run dev`
   - Aplikacija će biti dostupna na `http://localhost:3000`.

## Rute:
- **Klijent (Korisnik)**: `http://localhost:3000/a/client`
- **Admin Dashboard**: `http://localhost:3000/a/dashboard`

## Admin Login:
- Admin login koristi Supabase Auth. Moraš kreirati korisnika (Email/Password) u Supabase Authentication delu da bi se ulogovao.

## PWA:
- Aplikacija je konfigurisana kao PWA. Može se instalirati na telefon ili desktop.
- Ikone su definisane u `public/manifest.json`, ali trenutno ne postoje fajlovi slika (treba dodati `icon-192x192.png` i `icon-512x512.png` u `public` folder).

Srećan rad!
