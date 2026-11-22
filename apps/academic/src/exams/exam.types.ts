export interface Exam {
  id: string;
  title: string;
  course_name: string;
  course_abbreviation: string | null;
  topics: string | null;
  section: 'theory' | 'practice';
  exam_date: string | null;
  exam_at: Date | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  weight_percent: number | null;
  weight_basis: 'course' | 'section' | null;
  grade: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}
