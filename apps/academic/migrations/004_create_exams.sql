CREATE TABLE academic.exams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    title varchar(200) NOT NULL,
    course_name varchar(150) NOT NULL,
    course_abbreviation varchar(20),
    topics varchar(1000),
    section text NOT NULL,
    exam_date date,
    exam_at timestamptz,
    status text NOT NULL DEFAULT 'scheduled',
    weight_percent numeric,
    weight_basis text,
    grade numeric,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT exams_account_fk FOREIGN KEY (account_id) REFERENCES academic.accounts(id),
    CONSTRAINT exams_topics_valid CHECK (topics IS NULL OR btrim(topics) <> ''),

    CONSTRAINT exams_title_not_empty
        CHECK (btrim(title) <> ''),

    CONSTRAINT exams_course_name_not_empty
        CHECK (btrim(course_name) <> ''),

    CONSTRAINT exams_course_abbreviation_not_empty
        CHECK (
            course_abbreviation IS NULL
            OR btrim(course_abbreviation) <> ''
        ),

    CONSTRAINT exams_section_valid
        CHECK (section IN ('theory', 'practice')),

    CONSTRAINT exams_deadline_valid
        CHECK (
            (exam_date IS NOT NULL AND exam_at IS NULL)
            OR
            (exam_date IS NULL AND exam_at IS NOT NULL)
        ),

    CONSTRAINT exams_status_valid
        CHECK (status IN ('scheduled', 'completed', 'cancelled')),

    CONSTRAINT exams_weight_valid
        CHECK (
            (weight_percent IS NULL AND weight_basis IS NULL)
            OR
            (
                weight_percent IS NOT NULL
                AND weight_percent BETWEEN 0 AND 100
                AND weight_basis IS NOT NULL
                AND weight_basis IN ('course', 'section')
            )
        ),

    CONSTRAINT exams_grade_valid
        CHECK (
            grade IS NULL
            OR (
                grade BETWEEN 0 AND 10
                AND grade = round(grade, 2)
            )
        )
);

CREATE INDEX exams_account_id_idx
    ON academic.exams (account_id);
