CREATE TABLE academic.assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    title varchar(200) NOT NULL,
    course_name varchar(150) NOT NULL,
    course_abbreviation varchar(20),
    section text NOT NULL,
    mandatory boolean NOT NULL,
    due_date date,
    due_at timestamptz,
    status text NOT NULL DEFAULT 'pending',
    work_mode text NOT NULL DEFAULT 'individual',
    group_members text[] NOT NULL DEFAULT '{}',
    weight_percent numeric,
    weight_basis text,
    grade numeric,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT assignments_title_not_empty
        CHECK (btrim(title) <> ''),

    CONSTRAINT assignments_course_name_not_empty
        CHECK (btrim(course_name) <> ''),

    CONSTRAINT assignments_course_abbreviation_not_empty
        CHECK (
            course_abbreviation IS NULL
            OR btrim(course_abbreviation) <> ''
        ),

    CONSTRAINT assignments_section_valid
        CHECK (section IN ('theory', 'practice', 'seminar')),

    CONSTRAINT assignments_deadline_valid
        CHECK (
            (due_date IS NOT NULL AND due_at IS NULL)
            OR
            (due_date IS NULL AND due_at IS NOT NULL)
        ),

    CONSTRAINT assignments_status_valid
        CHECK (status IN ('pending', 'in_progress', 'submitted')),

    CONSTRAINT assignments_work_mode_valid
        CHECK (work_mode IN ('individual', 'group')),

    CONSTRAINT assignments_group_members_valid
        CHECK (
            (work_mode = 'group' OR cardinality(group_members) = 0)
            AND array_position(group_members, NULL) IS NULL
        ),

    CONSTRAINT assignments_weight_valid
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

    CONSTRAINT assignments_grade_valid
        CHECK (
            grade IS NULL
            OR (
                grade BETWEEN 0 AND 10
                AND grade = round(grade, 2)
            )
        )
);

CREATE INDEX assignments_account_id_idx
    ON academic.assignments (account_id);
