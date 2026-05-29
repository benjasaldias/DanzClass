-- 036_class_packages.sql
-- Paquetes de clases: un profesor puede agrupar 2+ clases y venderlas con precio especial.
-- Si el alumno paga el paquete → inscripción confirmada en todas. Si no paga → no entra a ninguna.

CREATE TABLE class_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL CHECK (price > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE class_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES class_packages(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE(package_id, class_id)
);

CREATE TABLE package_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES class_packages(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'payment_submitted', 'confirmed', 'cancelled')),
  receipt_url TEXT,
  amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(package_id, student_id)
);

-- Trigger updated_at
CREATE TRIGGER class_packages_updated_at
  BEFORE UPDATE ON class_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER package_enrollments_updated_at
  BEFORE UPDATE ON package_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE class_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_enrollments ENABLE ROW LEVEL SECURITY;

-- class_packages: visible para todos; solo el teacher puede crear/editar
CREATE POLICY "packages_select_public" ON class_packages FOR SELECT USING (true);
CREATE POLICY "packages_insert_teacher" ON class_packages FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "packages_update_teacher" ON class_packages FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "packages_delete_teacher" ON class_packages FOR DELETE USING (auth.uid() = teacher_id);

-- class_package_items: visible para todos
CREATE POLICY "package_items_select_public" ON class_package_items FOR SELECT USING (true);
CREATE POLICY "package_items_manage_teacher" ON class_package_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM class_packages cp WHERE cp.id = package_id AND cp.teacher_id = auth.uid())
  );

-- package_enrollments: el student ve los suyos; el teacher ve los de sus paquetes
CREATE POLICY "pkg_enrollments_select_student" ON package_enrollments
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "pkg_enrollments_select_teacher" ON package_enrollments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM class_packages cp WHERE cp.id = package_id AND cp.teacher_id = auth.uid())
  );

CREATE POLICY "pkg_enrollments_insert_student" ON package_enrollments
  FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "pkg_enrollments_update_student" ON package_enrollments
  FOR UPDATE USING (auth.uid() = student_id);
