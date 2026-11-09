export interface AcademicAssignmentSource {
  id: string;
  title: string;
  course_name: string;
  course_abbreviation: string | null;
  section: 'theory' | 'practice' | 'seminar';
  mandatory: boolean;
  due_date: string | null;
  due_at: string | null;
  status: 'pending' | 'in_progress' | 'submitted';
  work_mode: 'individual' | 'group';
  group_members: string[];
  weight_percent: number | null;
  weight_basis: 'course' | 'section' | null;
  grade: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
