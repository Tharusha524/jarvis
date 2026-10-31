import { useClock } from "../hooks/useClock";

export function ClockPanel() {
  const now = useClock();
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <section className="clock" aria-label="Date and time">
      <div className="clock-time">
        {time}
        <span className="clock-seconds">{seconds}</span>
      </div>
      <div className="clock-date">{date}</div>
    </section>
  );
}
