import Link from "next/link";
import PageHeader from "@/components/PageHeader";

// How the pool works. Plain content, no data loading.
const sections: { icon: string; title: string; body: React.ReactNode }[] = [
  {
    icon: "🏈",
    title: "Making picks",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Pick the winner of every game each week on the Make Picks page.</li>
        <li>You can change a pick as many times as you like until that game locks.</li>
        <li>
          For the <strong>Monday Night</strong> game you also guess the total points scored by both teams. You need to
          enter that total before you can pick the Monday game.
        </li>
      </ul>
    ),
  },
  {
    icon: "🔒",
    title: "When picks lock",
    body: (
      <>
        <p className="mb-2">All times are Mountain Time.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Thursday, Friday and Saturday games lock at their own kickoff.</li>
          <li>Sunday games that start before 2:00 PM lock at their own kickoff.</li>
          <li>
            Sunday games at or after 2:00 PM, <strong>and the Monday Night game</strong>, all lock together when the first
            of those Sunday afternoon games kicks off.
          </li>
        </ul>
        <p className="mt-2">Everyone's picks for a game become visible on All Picks once that game locks.</p>
      </>
    ),
  },
  {
    icon: "🏆",
    title: "Winning the week",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          Only <strong>paid</strong> players can win the week.
        </li>
        <li>The paid player with the most correct picks wins.</li>
        <li>
          Ties are broken by the <strong>Monday Night total</strong>: whoever's guess is closest to the actual total
          points wins.
        </li>
        <li>If the tied players have no Monday total to compare, they share the win.</li>
        <li>A game that ends in a tie counts as a miss for everyone.</li>
        <li>A week is decided once every game, including Monday Night, is final.</li>
      </ul>
    ),
  },
  {
    icon: "🥈",
    title: "“Would have won”",
    body: (
      <p>
        If an unpaid player gets strictly <em>more</em> correct picks than the paid winner, they're shown as “would have
        won” on All Picks and Standings, but the paid player still takes the week.
      </p>
    ),
  },
  {
    icon: "💵",
    title: "Payouts",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>It's $5 to play each week.</li>
        <li>
          <strong>Winner takes all:</strong> the week's pot is $5 × the number of paid players. With 11 paid players, the
          winner gets $55.
        </li>
        <li>If paid players tie for the win, they split the pot evenly.</li>
        <li>Your running total is on the Standings page.</li>
      </ul>
    ),
  },
  {
    icon: "👥",
    title: "Pick'em groups",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Start a group to see how just your friends, family or office are picking.</li>
        <li>Group owners can invite players by name. Invites show up on the invited player's Home page.</li>
        <li>You can also join with a group's code. The owner approves your request.</li>
      </ul>
    ),
  },
];

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-page">
      <PageHeader title="Rules" subtitle="How the pool works" icon="📋" />

      <main className="mx-auto -mt-10 max-w-3xl space-y-3 px-4 pb-6">
        {sections.map((s) => (
          <section key={s.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-900">
              <span className="text-2xl">{s.icon}</span>
              {s.title}
            </h2>
            <div className="text-[15px] leading-relaxed text-slate-800">{s.body}</div>
          </section>
        ))}

        <Link
          href="/make-picks"
          className="block rounded-2xl bg-emerald-600 py-4 text-center text-lg font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          Make your picks →
        </Link>
      </main>
    </div>
  );
}
