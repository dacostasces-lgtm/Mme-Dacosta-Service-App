-- Enable PostGIS for GPS calculations (distance)
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Create Enums
CREATE TYPE public.user_role AS ENUM ('admin', 'employer', 'candidate');
CREATE TYPE public.availability_type AS ENUM ('full_time', 'part_time', 'internal', 'external');
CREATE TYPE public.job_status AS ENUM ('active', 'closed', 'archived');
CREATE TYPE public.application_status AS ENUM ('new', 'contact', 'interview', 'pending', 'hired', 'rejected');
CREATE TYPE public.message_type AS ENUM ('text', 'image', 'document');

-- Table: cities
CREATE TABLE public.cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'Côte d''Ivoire',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: neighborhoods
CREATE TABLE public.neighborhoods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.user_role NOT NULL DEFAULT 'candidate',
    full_name TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    avatar_url TEXT,
    neighborhood_id UUID REFERENCES public.neighborhoods(id) ON DELETE SET NULL,
    location geography(Point, 4326),
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    is_validated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: candidate_details
CREATE TABLE public.candidate_details (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    job_title TEXT,
    age INT,
    gender TEXT,
    experience TEXT,
    languages JSONB DEFAULT '[]'::jsonb,
    skills JSONB DEFAULT '[]'::jsonb,
    desired_salary INT,
    availability public.availability_type,
    description TEXT,
    cv_url TEXT
);

-- Table: employer_details
CREATE TABLE public.employer_details (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    company_name TEXT,
    address TEXT,
    description TEXT
);

-- Table: subscriptions
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_name TEXT NOT NULL,
    price INT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'XAF',
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    payment_method TEXT,
    transaction_id TEXT
);

-- Table: jobs
CREATE TABLE public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    salary_range_min INT,
    salary_range_max INT,
    neighborhood_id UUID REFERENCES public.neighborhoods(id) ON DELETE SET NULL,
    status public.job_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: applications
CREATE TABLE public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status public.application_status NOT NULL DEFAULT 'new',
    message TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(job_id, candidate_id)
);

-- Table: messages
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type public.message_type NOT NULL DEFAULT 'text',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: reviews
CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_profiles_location ON public.profiles USING GIST (location);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_validated ON public.profiles(is_validated);
CREATE INDEX idx_jobs_status ON public.jobs(status);

-- RLS SETUP
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING (is_validated = TRUE OR auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

-- Jobs Policies
CREATE POLICY "Active jobs are viewable by everyone."
  ON public.jobs FOR SELECT
  USING (status = 'active' OR employer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "Employers can insert jobs."
  ON public.jobs FOR INSERT
  WITH CHECK (
    employer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() AND role = 'employer')
  );

CREATE POLICY "Employers can update their jobs."
  ON public.jobs FOR UPDATE
  USING (
    employer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR is_admin()
  );

-- Messages Policies
CREATE POLICY "Users can view their own messages."
  ON public.messages FOR SELECT
  USING (
    sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR
    receiver_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can send messages."
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Read-only Public Data
CREATE POLICY "Cities are viewable by everyone." ON public.cities FOR SELECT USING (true);
CREATE POLICY "Neighborhoods are viewable by everyone." ON public.neighborhoods FOR SELECT USING (true);
