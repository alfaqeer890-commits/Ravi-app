import { useEffect, useState } from "react";
import { can, type Me } from "@/lib/access";
import { useI18n, type MessageKey } from "@/lib/i18n";
import {
  createCleaning, createMeals, createMenu, createTimetable,
  loadCleaning, loadMeals, loadMenu, loadTimetable,
  saveCleaning, saveMeals, saveMenu, saveTimetable,
  setCleaningStatus, setMealsStatus, setMenuStatus, setTimetableStatus,
} from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { Banner, Button, Card, Empty, Field, MonthYear, Pill } from "@/components/ui";
import { currentMonthYear } from "@/lib/weeks";

function usePeriod() {
  const now = currentMonthYear();
  const [month, setMonth] = useState(now.month);
  const [year, setYear] = useState(now.year);
  return { month, year, setMonth, setYear };
}

function StatusActions({
  status, onStatus,
}: { status: string; onStatus: (status: string) => void }) {
  const { t } = useI18n();
  const tone = status === "published" ? "teal" : status === "archived" ? "slate" : "lavender";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone={tone}>{t(`schedule.${status}` as MessageKey)}</Pill>
      {status !== "published" ? <Button onClick={() => onStatus("published")}>{t("action.publish")}</Button> : null}
      {status !== "archived" ? <Button tone="quiet" onClick={() => onStatus("archived")}>{t("action.archive")}</Button> : null}
      {status !== "draft" ? <Button tone="quiet" onClick={() => onStatus("draft")}>{t("action.draft")}</Button> : null}
    </div>
  );
}

export function TimetableModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const manage = can(me, "schedules.manage");
  const { month, year, setMonth, setYear } = usePeriod();
  const query = useRemote(["timetable", month, year], () => loadTimetable({ data: { month, year } }));
  const data = query.data;
  const [lectures, setLectures] = useState<{ lectureNumber: number; teacherName: string; startTime: string; endTime: string; bookName: string; classSubject: string; notes: string }[]>([]);
  useEffect(() => {
    if (!data || !("lectures" in data) || !data.lectures) return;
    setLectures(data.lectures.map((lecture) => ({
      lectureNumber: lecture.lecture_number,
      teacherName: lecture.teacher_name,
      startTime: lecture.start_time,
      endTime: lecture.end_time,
      bookName: lecture.book_name,
      classSubject: lecture.class_subject,
      notes: lecture.notes,
    })));
  }, [data]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">{t("timetable.lead")}</p>
      <MonthYear month={month} year={year} onChange={(nextMonth, nextYear) => { setMonth(nextMonth); setYear(nextYear); }} />
      {data && !data.exists && manage ? <Button onClick={() => void save(() => createTimetable({ data: { month, year } }), [["timetable", month, year]])}>{t("schedule.create")}</Button> : null}
      {data && !data.exists ? <Empty text={t("schedule.empty")} /> : null}
      {data && data.exists && data.hidden ? <Banner text={t("state.hidden")} /> : null}
      {data && data.exists && !data.hidden ? (
        <>
          {manage && "id" in data ? <StatusActions status={data.status} onStatus={(status) => void save(() => setTimetableStatus({ data: { id: data.id, status } }), [["timetable", month, year]])} /> : <Pill>{t(`schedule.${data.status}` as MessageKey)}</Pill>}
          {lectures.map((lecture, index) => (
            <Card key={lecture.lectureNumber} className="space-y-3">
              <h3 className="font-semibold">{t("timetable.lecture")} <span className="num">{lecture.lectureNumber}</span></h3>
              <Field label={t("timetable.teacher")} value={lecture.teacherName} onChange={(value) => update(index, { teacherName: value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("timetable.start")} type="time" value={lecture.startTime} onChange={(value) => update(index, { startTime: value })} />
                <Field label={t("timetable.end")} type="time" value={lecture.endTime} onChange={(value) => update(index, { endTime: value })} />
              </div>
              <Field label={t("timetable.book")} value={lecture.bookName} onChange={(value) => update(index, { bookName: value })} />
              <Field label={t("timetable.subject")} value={lecture.classSubject} onChange={(value) => update(index, { classSubject: value })} />
              <Field label={t("timetable.notes")} value={lecture.notes} onChange={(value) => update(index, { notes: value })} />
            </Card>
          ))}
          {manage && "id" in data ? <Button onClick={() => void save(() => saveTimetable({ data: { id: data.id, lectures } }), [["timetable", month, year]])}>{t("action.save")}</Button> : null}
        </>
      ) : null}
    </div>
  );

  function update(index: number, patch: Partial<(typeof lectures)[number]>) {
    if (!manage) return;
    setLectures(lectures.map((lecture, lectureIndex) => lectureIndex === index ? { ...lecture, ...patch } : lecture));
  }
}

export function MenuModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const manage = can(me, "schedules.manage");
  const { month, year, setMonth, setYear } = usePeriod();
  const query = useRemote(["menu", month, year], () => loadMenu({ data: { month, year } }));
  const data = query.data;
  const [times, setTimes] = useState({ breakfast: "", lunch: "", dinner: "" });
  const [days, setDays] = useState<{ dayIndex: number; breakfast: string; lunch: string; dinner: string }[]>([]);
  useEffect(() => {
    if (!data || !("days" in data) || !data.days) return;
    setTimes({ breakfast: data.breakfast_time, lunch: data.lunch_time, dinner: data.dinner_time });
    setDays(data.days.map((day) => ({ dayIndex: day.day_index, breakfast: day.breakfast, lunch: day.lunch, dinner: day.dinner })));
  }, [data]);
  return (
    <div className="space-y-4">
      <MonthYear month={month} year={year} onChange={(nextMonth, nextYear) => { setMonth(nextMonth); setYear(nextYear); }} />
      {data && !data.exists && manage ? <Button onClick={() => void save(() => createMenu({ data: { month, year } }), [["menu", month, year]])}>{t("schedule.create")}</Button> : null}
      {data && !data.exists ? <Empty text={t("schedule.empty")} /> : null}
      {data && data.exists && data.hidden ? <Banner text={t("state.hidden")} /> : null}
      {data && data.exists && !data.hidden && "id" in data ? (
        <>
          {manage ? <StatusActions status={data.status} onStatus={(status) => void save(() => setMenuStatus({ data: { id: data.id, status } }), [["menu", month, year]])} /> : null}
          <Card className="grid gap-3 sm:grid-cols-3">
            <Field label={t("menu.breakfast")} type="time" value={times.breakfast} onChange={(breakfast) => manage && setTimes({ ...times, breakfast })} />
            <Field label={t("menu.lunch")} type="time" value={times.lunch} onChange={(lunch) => manage && setTimes({ ...times, lunch })} />
            <Field label={t("menu.dinner")} type="time" value={times.dinner} onChange={(dinner) => manage && setTimes({ ...times, dinner })} />
          </Card>
          {days.map((day, index) => (
            <Card key={day.dayIndex} className="space-y-3">
              <h3 className="font-semibold">{t(`day.${day.dayIndex}` as MessageKey)}</h3>
              <Field label={t("menu.breakfast")} value={day.breakfast} onChange={(breakfast) => manage && patch(index, { breakfast })} />
              <Field label={t("menu.lunch")} value={day.lunch} onChange={(lunch) => manage && patch(index, { lunch })} />
              <Field label={t("menu.dinner")} value={day.dinner} onChange={(dinner) => manage && patch(index, { dinner })} />
            </Card>
          ))}
          {manage ? <Button onClick={() => void save(() => saveMenu({ data: { id: data.id, breakfastTime: times.breakfast, lunchTime: times.lunch, dinnerTime: times.dinner, days } }), [["menu", month, year]])}>{t("action.save")}</Button> : null}
        </>
      ) : null}
    </div>
  );
  function patch(index: number, change: Partial<(typeof days)[number]>) {
    setDays(days.map((day, dayIndex) => dayIndex === index ? { ...day, ...change } : day));
  }
}

export function CleaningModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const manage = can(me, "schedules.manage");
  const { month, year, setMonth, setYear } = usePeriod();
  const query = useRemote(["cleaning", month, year], () => loadCleaning({ data: { month, year } }));
  const data = query.data;
  const [weeks, setWeeks] = useState<{ id: number; week_number: number; start_date: string; end_date: string; instructions: string; students: string[] }[]>([]);
  useEffect(() => {
    if (!data || !("weeks" in data) || !data.weeks) return;
    setWeeks(data.weeks.map((week) => ({
      id: week.id,
      week_number: week.week_number,
      start_date: week.start_date,
      end_date: week.end_date,
      instructions: week.instructions,
      students: week.students.map((student) => student.student_name),
    })));
  }, [data]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">{t("cleaning.lead")}</p>
      <MonthYear month={month} year={year} onChange={(nextMonth, nextYear) => { setMonth(nextMonth); setYear(nextYear); }} />
      {data && !data.exists && manage ? <Button onClick={() => void save(() => createCleaning({ data: { month, year } }), [["cleaning", month, year]])}>{t("schedule.create")}</Button> : null}
      {data && !data.exists ? <Empty text={t("schedule.empty")} /> : null}
      {data && data.exists && data.hidden ? <Banner text={t("state.hidden")} /> : null}
      {data && data.exists && !data.hidden && "id" in data ? (
        <>
          {manage ? <StatusActions status={data.status} onStatus={(status) => void save(() => setCleaningStatus({ data: { id: data.id, status } }), [["cleaning", month, year]])} /> : null}
          {weeks.map((week, weekIndex) => (
            <Card key={week.id} className="space-y-3">
              <h3 className="font-semibold">{t("cleaning.week")} <span className="num">{week.week_number}</span></h3>
              <p className="num text-sm text-slate">{week.start_date} → {week.end_date}</p>
              {week.students.map((student, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex-1">
                    <Field label={`${t("cleaning.students")} ${index + 1}`} value={student} onChange={(value) => manage && setStudent(weekIndex, index, value)} />
                  </div>
                  {manage && week.students.length > 1 ? <Button tone="ghost" onClick={() => setWeeks(weeks.map((item, itemIndex) => itemIndex === weekIndex ? { ...item, students: item.students.filter((_, nameIndex) => nameIndex !== index) } : item))}>{t("action.remove")}</Button> : null}
                </div>
              ))}
              <Field label={t("cleaning.instructions")} value={week.instructions} onChange={(instructions) => manage && setWeeks(weeks.map((item, itemIndex) => itemIndex === weekIndex ? { ...item, instructions } : item))} />
              {manage ? <Button tone="quiet" onClick={() => setWeeks(weeks.map((item, itemIndex) => itemIndex === weekIndex ? { ...item, students: [...item.students, ""] } : item))}>{t("cleaning.add")}</Button> : null}
            </Card>
          ))}
          {manage ? <Button onClick={() => void save(() => saveCleaning({ data: { id: data.id, weeks: weeks.map((week) => ({ id: week.id, instructions: week.instructions, students: week.students })) } }), [["cleaning", month, year]])}>{t("action.save")}</Button> : null}
        </>
      ) : null}
    </div>
  );
  function setStudent(weekIndex: number, index: number, value: string) {
    setWeeks(weeks.map((week, itemIndex) => itemIndex === weekIndex ? { ...week, students: week.students.map((name, nameIndex) => nameIndex === index ? value : name) } : week));
  }
}

export function MealsModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const manage = can(me, "schedules.manage");
  const { month, year, setMonth, setYear } = usePeriod();
  const query = useRemote(["meals", month, year], () => loadMeals({ data: { month, year } }));
  const data = query.data;
  const [weeks, setWeeks] = useState<{ id: number; week_number: number; start_date: string; end_date: string; breakfast: string[]; lunch: string[]; dinner: string[] }[]>([]);
  useEffect(() => {
    if (!data || !("weeks" in data) || !data.weeks) return;
    setWeeks(data.weeks.map((week) => ({
      id: week.id,
      week_number: week.week_number,
      start_date: week.start_date,
      end_date: week.end_date,
      breakfast: week.breakfast.map((item) => item.person_name),
      lunch: week.lunch.map((item) => item.person_name),
      dinner: week.dinner.map((item) => item.person_name),
    })));
  }, [data]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">{t("meals.lead")}</p>
      <MonthYear month={month} year={year} onChange={(nextMonth, nextYear) => { setMonth(nextMonth); setYear(nextYear); }} />
      {data && !data.exists && manage ? <Button onClick={() => void save(() => createMeals({ data: { month, year } }), [["meals", month, year]])}>{t("schedule.create")}</Button> : null}
      {data && !data.exists ? <Empty text={t("schedule.empty")} /> : null}
      {data && data.exists && data.hidden ? <Banner text={t("state.hidden")} /> : null}
      {data && data.exists && !data.hidden && "id" in data ? (
        <>
          {manage ? <StatusActions status={data.status} onStatus={(status) => void save(() => setMealsStatus({ data: { id: data.id, status } }), [["meals", month, year]])} /> : null}
          {weeks.map((week, weekIndex) => (
            <Card key={week.id} className="space-y-3">
              <h3 className="font-semibold">{t("cleaning.week")} <span className="num">{week.week_number}</span></h3>
              <p className="num text-sm text-slate">{week.start_date} → {week.end_date}</p>
              {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
                <div key={meal} className="space-y-2">
                  <p className="font-medium">{t(`menu.${meal}` as MessageKey)}</p>
                  {week[meal].map((person, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="flex-1">
                        <Field label={`${index + 1}`} value={person} onChange={(value) => manage && setPerson(weekIndex, meal, index, value)} />
                      </div>
                      {manage && week[meal].length > 1 ? <Button tone="ghost" onClick={() => setWeeks(weeks.map((item, itemIndex) => itemIndex === weekIndex ? { ...item, [meal]: item[meal].filter((_, nameIndex) => nameIndex !== index) } : item))}>{t("action.remove")}</Button> : null}
                    </div>
                  ))}
                  {manage ? <Button tone="quiet" onClick={() => setWeeks(weeks.map((item, itemIndex) => itemIndex === weekIndex ? { ...item, [meal]: [...item[meal], ""] } : item))}>{t("meals.add")}</Button> : null}
                </div>
              ))}
            </Card>
          ))}
          {manage ? <Button onClick={() => void save(() => saveMeals({ data: { id: data.id, weeks } }), [["meals", month, year]])}>{t("action.save")}</Button> : null}
        </>
      ) : null}
    </div>
  );
  function setPerson(weekIndex: number, meal: "breakfast" | "lunch" | "dinner", index: number, value: string) {
    setWeeks(weeks.map((week, itemIndex) => itemIndex === weekIndex ? { ...week, [meal]: week[meal].map((name, nameIndex) => nameIndex === index ? value : name) } : week));
  }
}
