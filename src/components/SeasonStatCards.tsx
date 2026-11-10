import StatCard from '@/app/dashboard/components/StatCard'
import type { summarizeSeasonStats } from '@/utils/playerStats'
import type { seasonPresentation } from '@/utils/seasonPresentation'
import d from '@/app/dashboard/stade.module.css'

export default function SeasonStatCards({ summary: t, known: k, secondaryClass = '' }: {
  summary: ReturnType<typeof summarizeSeasonStats>
  known: ReturnType<typeof seasonPresentation>['known']
  secondaryClass?: string
}) {
  const value = (known: boolean, total: number | string) => known ? total : '—'
  const subtitle = (known: boolean, text: string) => known ? text : 'Non communiqué'
  return <>
    <div className={d.primaryStats}>
      <StatCard title="Minutes jouées" value={value(k.minutes, t.totalMinutes)} subtitle={subtitle(k.minutes, '')} variant="stade" highlight />
      <StatCard title="Matchs joués" value={value(k.participation, t.matchesPlayed)} subtitle={subtitle(k.minutes, `${t.totalMinutes} min cumulées`)} variant="stade" />
      <StatCard title="Buts" value={value(k.goals, t.totalGoals)} subtitle={subtitle(k.goals && k.minutes, t.goalSubtitle)} variant="stade" />
      <StatCard title="Passes décisives" value={value(k.assists, t.totalAssists)} subtitle={subtitle(k.assists, `${t.assistsPerMatch} par match`)} variant="stade" />
    </div>
    <div className={`${d.secondaryStats} ${secondaryClass}`}>
      <StatCard title="Buts + passes décisives" value={value(k.ga, t.totalGA)} subtitle={subtitle(k.ga, `${t.totalGoals} ${t.totalGoals === 1 ? 'but' : 'buts'} | ${t.totalAssists} ${t.totalAssists === 1 ? 'passe décisive' : 'passes décisives'}`)} variant="stade" />
      <StatCard title="Victoires" value={value(k.wins, `${t.winRate}%`)} subtitle={subtitle(k.wins, `${t.totalWins} V en ${t.matchesPlayed} M`)} variant="stade" />
      <StatCard title="Homme du Match" value={value(k.motm, t.totalMotm)} subtitle={subtitle(k.motm, '')} variant="stade" />
      <StatCard title="Poste le plus joué" value={value(k.position, t.favPosition)} subtitle={subtitle(k.position, `${t.maxPosCount} apparitions`)} variant="stade" />
      <StatCard title="Discipline" value={value(k.discipline, t.totalYellows + t.totalReds)} subtitle={subtitle(k.discipline, `${t.totalYellows} 🟨 | ${t.totalReds} 🟥`)} variant="stade" />
    </div>
  </>
}
