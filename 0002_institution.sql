-- Institution management schema. Schedules are never pre-filled with names,
-- meals, books, or timings. Staff directory entries are the named roles
-- requested for this institution and remain fully editable.

create table if not exists settings (
  id int primary key,
  name_en text not null,
  name_ur text not null,
  complaints_enabled boolean not null default false,
  anonymous_complaints boolean not null default false,
  staff_can_view_own_report boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into settings (id, name_en, name_ur)
values (1, 'Institution', 'ادارہ')
on conflict (id) do nothing;

create table if not exists members (
  user_id text primary key references "user" ("id") on delete cascade,
  role text not null check (role in ('super_admin', 'staff')),
  status text not null check (status in ('active', 'pending', 'disabled')),
  language text not null default 'en' check (language in ('en', 'ur')),
  username text,
  staff_id int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists members_username_lower_idx
  on members (lower(username))
  where username is not null and username <> '';

create table if not exists member_permissions (
  user_id text not null references members (user_id) on delete cascade,
  permission text not null,
  primary key (user_id, permission)
);

create table if not exists staff_profiles (
  id serial primary key,
  name_en text not null,
  name_ur text not null,
  designation_en text not null,
  designation_ur text not null,
  department_en text not null default '',
  department_ur text not null default '',
  contact text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  user_id text unique,
  is_attendance_coordinator boolean not null default false,
  is_leave_final_approver boolean not null default false,
  is_class_incharge boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz
);

alter table members
  drop constraint if exists members_staff_id_fkey;
alter table members
  add constraint members_staff_id_fkey
  foreign key (staff_id) references staff_profiles (id) on delete set null;

create table if not exists staff_responsibilities (
  id serial primary key,
  staff_id int not null references staff_profiles (id) on delete cascade,
  sort_order int not null,
  text_en text not null,
  text_ur text not null
);

create table if not exists staff_duties (
  id serial primary key,
  staff_id int not null references staff_profiles (id) on delete cascade,
  sort_order int not null,
  text_en text not null,
  text_ur text not null
);

create table if not exists students (
  id serial primary key,
  name_en text not null,
  name_ur text not null default '',
  class_en text not null default '',
  class_ur text not null default '',
  guardian_name text not null default '',
  guardian_contact text not null default '',
  admission_date date,
  status text not null default 'active' check (status in ('active', 'departed')),
  remarks_en text not null default '',
  remarks_ur text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists student_events (
  id serial primary key,
  student_id int not null references students (id) on delete cascade,
  kind text not null check (kind in ('admission', 'departure')),
  event_date date not null,
  notes_en text not null default '',
  notes_ur text not null default '',
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists student_attendance (
  id serial primary key,
  student_id int not null references students (id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present', 'absent', 'leave', 'late')),
  remarks text not null default '',
  recorded_by text not null,
  updated_at timestamptz not null default now(),
  unique (student_id, attendance_date)
);

create table if not exists staff_attendance (
  id serial primary key,
  staff_id int not null references staff_profiles (id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present', 'absent', 'leave', 'late')),
  arrival_time text not null default '',
  departure_time text not null default '',
  leave_info text not null default '',
  remarks text not null default '',
  recorded_by text not null,
  updated_at timestamptz not null default now(),
  unique (staff_id, attendance_date)
);

create table if not exists leave_requests (
  id serial primary key,
  student_id int not null references students (id) on delete cascade,
  class_incharge_staff_id int references staff_profiles (id) on delete set null,
  start_date date not null,
  end_date date not null,
  reason text not null,
  class_status text not null default 'pending' check (class_status in ('pending', 'approved', 'rejected')),
  class_note text not null default '',
  class_by text,
  class_at timestamptz,
  final_status text not null default 'pending' check (final_status in ('pending', 'approved', 'rejected')),
  final_note text not null default '',
  final_by text,
  final_at timestamptz,
  stage text not null default 'class_review' check (stage in ('class_review', 'awaiting_final', 'approved', 'rejected')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists absence_followups (
  id serial primary key,
  student_id int not null references students (id) on delete cascade,
  consecutive_days int not null,
  guardian_contact text not null default '',
  contact_date date,
  remarks text not null default '',
  follow_up_status text not null default 'open' check (follow_up_status in ('open', 'contacted', 'closed')),
  recorded_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists complaint_categories (
  id serial primary key,
  label_en text not null,
  label_ur text not null,
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists complaint_routes (
  id serial primary key,
  category_id int not null references complaint_categories (id) on delete cascade,
  staff_id int not null references staff_profiles (id) on delete cascade,
  unique (category_id, staff_id)
);

create table if not exists complaints (
  id serial primary key,
  complainant_name text not null default '',
  is_anonymous boolean not null default false,
  category_id int references complaint_categories (id) on delete set null,
  subject text not null,
  body text not null,
  related_staff_id int references staff_profiles (id) on delete set null,
  status text not null default 'submitted'
    check (status in ('submitted', 'pending_review', 'under_investigation', 'resolved', 'rejected')),
  submitted_by text,
  attachment_name text,
  attachment_mime text,
  attachment_data text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists complaint_assignments (
  id serial primary key,
  complaint_id int not null references complaints (id) on delete cascade,
  user_id text,
  staff_id int,
  created_at timestamptz not null default now()
);

create table if not exists complaint_notes (
  id serial primary key,
  complaint_id int not null references complaints (id) on delete cascade,
  author_id text not null,
  kind text not null check (kind in ('investigation', 'response', 'status')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists performance_reports (
  id serial primary key,
  staff_id int not null references staff_profiles (id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  working_days int,
  leaves int,
  unapproved_absences int,
  late_arrivals int,
  fulfilled_en text not null default '',
  fulfilled_ur text not null default '',
  unfulfilled_en text not null default '',
  unfulfilled_ur text not null default '',
  improvement_en text not null default '',
  improvement_ur text not null default '',
  remarks_en text not null default '',
  remarks_ur text not null default '',
  evaluation_en text not null default '',
  evaluation_ur text not null default '',
  evaluator_name text not null default '',
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, month, year)
);

create table if not exists timetables (
  id serial primary key,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, year)
);

create table if not exists timetable_lectures (
  id serial primary key,
  timetable_id int not null references timetables (id) on delete cascade,
  lecture_number int not null check (lecture_number between 1 and 7),
  teacher_name text not null default '',
  start_time text not null default '',
  end_time text not null default '',
  book_name text not null default '',
  class_subject text not null default '',
  notes text not null default '',
  unique (timetable_id, lecture_number)
);

create table if not exists food_menus (
  id serial primary key,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  breakfast_time text not null default '',
  lunch_time text not null default '',
  dinner_time text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, year)
);

create table if not exists food_menu_days (
  id serial primary key,
  menu_id int not null references food_menus (id) on delete cascade,
  day_index int not null check (day_index between 1 and 7),
  breakfast text not null default '',
  lunch text not null default '',
  dinner text not null default '',
  unique (menu_id, day_index)
);

create table if not exists cleaning_schedules (
  id serial primary key,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, year)
);

create table if not exists cleaning_weeks (
  id serial primary key,
  schedule_id int not null references cleaning_schedules (id) on delete cascade,
  week_number int not null,
  start_date date not null,
  end_date date not null,
  instructions text not null default '',
  unique (schedule_id, week_number)
);

create table if not exists cleaning_assignees (
  id serial primary key,
  week_id int not null references cleaning_weeks (id) on delete cascade,
  sort_order int not null,
  student_name text not null default ''
);

create table if not exists meal_schedules (
  id serial primary key,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, year)
);

create table if not exists meal_weeks (
  id serial primary key,
  schedule_id int not null references meal_schedules (id) on delete cascade,
  week_number int not null,
  start_date date not null,
  end_date date not null,
  unique (schedule_id, week_number)
);

create table if not exists meal_assignees (
  id serial primary key,
  week_id int not null references meal_weeks (id) on delete cascade,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  sort_order int not null,
  person_name text not null default ''
);

create table if not exists announcements (
  id serial primary key,
  title_en text not null,
  title_ur text not null default '',
  body_en text not null default '',
  body_ur text not null default '',
  published boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists institutional_records (
  id serial primary key,
  title_en text not null,
  title_ur text not null default '',
  body_en text not null default '',
  body_ur text not null default '',
  category_en text not null default '',
  category_ur text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id serial primary key,
  user_id text not null,
  title_en text not null,
  title_ur text not null,
  body_en text not null default '',
  body_ur text not null default '',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists audit_logs (
  id serial primary key,
  actor_id text not null,
  action text not null,
  summary_en text not null,
  summary_ur text not null,
  created_at timestamptz not null default now()
);

create table if not exists password_requests (
  id serial primary key,
  email text not null,
  user_id text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz
);

-- Named staff directory. Responsibilities are job descriptions, not schedules.
insert into staff_profiles (
  id, name_en, name_ur, designation_en, designation_ur,
  is_attendance_coordinator, is_leave_final_approver, sort_order
) values
  (1, 'Hafiz Mudassir Sahib', 'حافظ مدثر صاحب',
    'Academic Supervisor & General Administration Coordinator',
    'تعلیمی نگران و عمومی انتظامی رابطہ کار', true, false, 1),
  (2, 'Noor-ul-Mustafa Sahib', 'نور المصطفیٰ صاحب',
    'Administrative Coordinator & Student Affairs Officer',
    'انتظامی رابطہ کار و طلبہ امور افسر', false, true, 2),
  (3, 'Muazzam Sahib', 'معظم صاحب',
    'Teacher & Congregational Prayer Coordinator',
    'مدرس و باجماعت نماز کا رابطہ کار', false, false, 3),
  (4, 'Hamid Sahib', 'حامد صاحب',
    'Teacher & Congregational Prayer Coordinator',
    'مدرس و باجماعت نماز کا رابطہ کار', false, false, 4),
  (5, 'Mudassir Shah Sahib', 'مدثر شاہ صاحب',
    'Teacher & Langar/Food Service Supervisor',
    'مدرس و لنگر و خوراک سروس نگران', false, false, 5),
  (6, 'Haider Sahib', 'حیدر صاحب',
    'Teacher, Cleanliness & Student Routine Supervisor',
    'مدرس، صفائی و طلبہ کے معمول کا نگران', false, false, 6),
  (7, 'Muzammil Hussain Sahib', 'مزمل حسین صاحب',
    'Administrative Records & Procurement Officer',
    'انتظامی ریکارڈ و خریداری افسر', false, false, 7),
  (8, 'Kamran Sahib', 'کامران صاحب',
    'Day Security & Guest Hospitality Officer',
    'دن کے وقت سیکیورٹی و مہمان نوازی افسر', false, false, 8),
  (9, 'Bilal Sahib', 'بلال صاحب',
    'Kitchen & Meal Preparation Coordinator',
    'کچن و کھانا تیار کرنے کا رابطہ کار', false, false, 9)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('staff_profiles', 'id'), greatest((select max(id) from staff_profiles), 1));

insert into staff_responsibilities (staff_id, sort_order, text_en, text_ur)
select * from (values
  (1, 1, $$Conduct assigned teaching sessions.$$, $$مقررہ تدریسی نشستیں منعقد کرنا۔$$),
  (1, 2, $$Maintain and supervise the attendance records of all teachers and students.$$, $$تمام اساتذہ اور طلبہ کے حاضری ریکارڈ کی نگرانی اور دیکھ بھال کرنا۔$$),
  (1, 3, $$Ensure that attendance registers are properly maintained.$$, $$اس بات کو یقینی بنانا کہ حاضری رجسٹر درست طور پر رکھے جائیں۔$$),
  (1, 4, $$Monitor the quality of food served to students and staff.$$, $$طلبہ اور عملے کو پیش کی جانے والی غذا کے معیار کی نگرانی کرنا۔$$),
  (1, 5, $$Manage and supervise staff leave records.$$, $$عملے کی چھٹیوں کے ریکارڈ کی نگرانی اور انتظام کرنا۔$$),
  (1, 6, $$Monitor the fulfillment of institutional responsibilities.$$, $$ادارہ جاتی ذمہ داریوں کی ادائیگی کی نگرانی کرنا۔$$),
  (1, 7, $$Coordinate with relevant staff regarding general institutional discipline.$$, $$عمومی ادارہ جاتی نظم و ضبط کے بارے میں متعلقہ عملے سے رابطہ کرنا۔$$),
  (2, 1, $$Conduct assigned teaching sessions.$$, $$مقررہ تدریسی نشستیں منعقد کرنا۔$$),
  (2, 2, $$Manage student admission records.$$, $$طلبہ کے داخلہ ریکارڈ کا انتظام کرنا۔$$),
  (2, 3, $$Manage student departure and exit records.$$, $$طلبہ کی رخصتی اور اخراج کے ریکارڈ کا انتظام کرنا۔$$),
  (2, 4, $$Deal professionally with visitors and guests.$$, $$مہمانوں اور زائرین کے ساتھ پیشہ ورانہ برتاؤ کرنا۔$$),
  (2, 5, $$Review student leave requests after obtaining permission from the relevant class in-charge.$$, $$متعلقہ کلاس انچارج کی اجازت کے بعد طلبہ کی چھٹی کی درخواستوں کا جائزہ لینا۔$$),
  (2, 6, $$Approve student leave requests after the required class in-charge authorization.$$, $$کلاس انچارج کی منظوری کے بعد طلبہ کی چھٹی کی درخواستوں کی حتمی منظوری دینا۔$$),
  (2, 7, $$Forward approved leave information to Hafiz Mudassir Sahib.$$, $$منظور شدہ چھٹی کی معلومات حافظ مدثر صاحب کو ارسال کرنا۔$$),
  (2, 8, $$Contact parents or guardians of students who remain continuously absent.$$, $$مسلسل غیر حاضر طلبہ کے والدین یا سرپرستوں سے رابطہ کرنا۔$$),
  (2, 9, $$Maintain responsibility for the main entrance gate key.$$, $$مرکزی داخلی دروازے کی چابی کی ذمہ داری سنبھالنا۔$$),
  (2, 10, $$Monitor and coordinate student movement in and out of the institution.$$, $$ادارے کے اندر اور باہر طلبہ کی نقل و حرکت کی نگرانی اور ربط کرنا۔$$),
  (3, 1, $$Conduct assigned teaching sessions.$$, $$مقررہ تدریسی نشستیں منعقد کرنا۔$$),
  (3, 2, $$Arrange and conduct congregational prayers.$$, $$باجماعت نماز کا اہتمام اور انعقاد کرنا۔$$),
  (3, 3, $$Organize students for congregational prayers.$$, $$باجماعت نماز کے لیے طلبہ کو منظم کرنا۔$$),
  (3, 4, $$Ensure students attend prayers according to the institutional routine.$$, $$ادارہ جاتی معمول کے مطابق طلبہ کی نماز میں شرکت کو یقینی بنانا۔$$),
  (4, 1, $$Conduct assigned teaching sessions.$$, $$مقررہ تدریسی نشستیں منعقد کرنا۔$$),
  (4, 2, $$Assist in arranging and conducting congregational prayers.$$, $$باجماعت نماز کے اہتمام میں معاونت کرنا۔$$),
  (4, 3, $$Maintain student discipline during prayer arrangements.$$, $$نماز کے انتظامات کے دوران طلبہ کا نظم و ضبط برقرار رکھنا۔$$),
  (4, 4, $$Coordinate prayer-related responsibilities with the relevant staff.$$, $$نماز سے متعلق ذمہ داریوں میں متعلقہ عملے سے رابطہ کرنا۔$$),
  (5, 1, $$Conduct assigned teaching sessions.$$, $$مقررہ تدریسی نشستیں منعقد کرنا۔$$),
  (5, 2, $$Supervise Langar and meal-service arrangements.$$, $$لنگر اور کھانا پیش کرنے کے انتظامات کی نگرانی کرنا۔$$),
  (5, 3, $$Ensure that meals are served at their designated times.$$, $$یہ یقینی بنانا کہ کھانے مقررہ اوقات پر پیش ہوں۔$$),
  (5, 4, $$Coordinate with kitchen and food-serving staff.$$, $$کچن اور کھانا پیش کرنے والے عملے سے رابطہ کرنا۔$$),
  (5, 5, $$Monitor the timely distribution of meals.$$, $$کھانے کی بروقت تقسیم کی نگرانی کرنا۔$$),
  (6, 1, $$Conduct assigned teaching sessions.$$, $$مقررہ تدریسی نشستیں منعقد کرنا۔$$),
  (6, 2, $$Supervise institutional cleanliness.$$, $$ادارے کی صفائی کی نگرانی کرنا۔$$),
  (6, 3, $$Collect and safely manage students' mobile phones according to institutional policy.$$, $$ادارہ جاتی پالیسی کے مطابق طلبہ کے موبائل فون جمع کرنا اور محفوظ رکھنا۔$$),
  (6, 4, $$Wake students up in the morning according to the institutional schedule.$$, $$ادارہ جاتی شیڈول کے مطابق صبح طلبہ کو جگانا۔$$),
  (6, 5, $$Ensure students go to bed at the designated time.$$, $$مقررہ وقت پر طلبہ کے سو جانے کو یقینی بنانا۔$$),
  (6, 6, $$Supervise the daily residential routine.$$, $$روزمرہ رہائشی معمول کی نگرانی کرنا۔$$),
  (7, 1, $$Maintain institutional society records and documentation.$$, $$ادارہ جاتی سوسائٹی کے ریکارڈ اور دستاویزات برقرار رکھنا۔$$),
  (7, 2, $$Purchase and bring required supplies from the market.$$, $$ضروری اشیاء بازار سے خرید کر لانا۔$$),
  (7, 3, $$Provide attendance registers.$$, $$حاضری رجسٹر فراہم کرنا۔$$),
  (7, 4, $$Maintain and manage attendance registers.$$, $$حاضری رجسٹروں کی دیکھ بھال اور انتظام کرنا۔$$),
  (7, 5, $$Manage ration and grocery-related records.$$, $$راشن اور گروسری کے ریکارڈ کا انتظام کرنا۔$$),
  (7, 6, $$Maintain assigned institutional keys.$$, $$مقررہ ادارہ جاتی چابیاں سنبھالنا۔$$),
  (7, 7, $$Ensure necessary supplies are available.$$, $$ضروری اشیاء کی دستیابی کو یقینی بنانا۔$$),
  (8, 1, $$Manage institutional security during daytime hours.$$, $$دن کے اوقات میں ادارے کی سیکیورٹی کا انتظام کرنا۔$$),
  (8, 2, $$Monitor visitors entering the institution.$$, $$ادارے میں داخل ہونے والے مہمانوں کی نگرانی کرنا۔$$),
  (8, 3, $$Receive and guide visitors appropriately.$$, $$مہمانوں کا استقبال اور مناسب رہنمائی کرنا۔$$),
  (8, 4, $$Serve Qahwa to incoming guests.$$, $$آنے والے مہمانوں کو قہوہ پیش کرنا۔$$),
  (8, 5, $$Maintain an organized and welcoming environment.$$, $$منظم اور خوش آئند ماحول برقرار رکھنا۔$$),
  (8, 6, $$Report security-related incidents to the relevant administration.$$, $$سیکیورٹی سے متعلق واقعات متعلقہ انتظامیہ کو رپورٹ کرنا۔$$),
  (9, 1, $$Arrange chickpeas or lentils for breakfast according to the approved menu.$$, $$منظور شدہ مینو کے مطابق ناشتے کے لیے چنا یا دال کا انتظام کرنا۔$$),
  (9, 2, $$Prepare or arrange lunch consisting of curry and bread.$$, $$سالن اور روٹی پر مشتمل دوپہر کے کھانے کا انتظام کرنا۔$$),
  (9, 3, $$Follow the approved weekly and monthly food menu.$$, $$منظور شدہ ہفتہ وار اور ماہانہ خوراک مینو کی پیروی کرنا۔$$),
  (9, 4, $$Ensure meals are served at designated timings.$$, $$کھانے مقررہ اوقات پر پیش ہوں، اس کو یقینی بنانا۔$$),
  (9, 5, $$Coordinate with the food supervisor.$$, $$خوراک نگران کے ساتھ رابطہ کرنا۔$$)
) as v(staff_id, sort_order, text_en, text_ur)
where not exists (select 1 from staff_responsibilities);

insert into complaint_categories (id, label_en, label_ur, sort_order) values
  (1, 'Staff-related complaints', 'عملے سے متعلق شکایات', 1),
  (2, 'Student-related complaints', 'طلبہ سے متعلق شکایات', 2),
  (3, 'Food quality complaints', 'خوراک کے معیار کی شکایات', 3),
  (4, 'Cleanliness complaints', 'صفائی کی شکایات', 4),
  (5, 'Security complaints', 'سیکیورٹی کی شکایات', 5),
  (6, 'Academic complaints', 'تعلیمی شکایات', 6),
  (7, 'Administrative complaints', 'انتظامی شکایات', 7),
  (8, 'Other complaints', 'دیگر شکایات', 8)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('complaint_categories', 'id'), greatest((select max(id) from complaint_categories), 1));

insert into complaint_routes (category_id, staff_id)
select * from (values (3, 5), (4, 6), (5, 8), (6, 1), (7, 2)) as v(category_id, staff_id)
where not exists (select 1 from complaint_routes);
