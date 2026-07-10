
CREATE TABLE public.driver_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_notes TO authenticated;
GRANT ALL ON public.driver_notes TO service_role;

ALTER TABLE public.driver_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage driver notes"
  ON public.driver_notes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_driver_notes_updated_at
  BEFORE UPDATE ON public.driver_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX driver_notes_driver_id_idx ON public.driver_notes(driver_id, created_at DESC);

-- Storage policies for driver-files bucket (private)
CREATE POLICY "Authenticated read driver files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'driver-files');

CREATE POLICY "Authenticated upload driver files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'driver-files');

CREATE POLICY "Authenticated update driver files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'driver-files');

CREATE POLICY "Authenticated delete driver files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'driver-files');
