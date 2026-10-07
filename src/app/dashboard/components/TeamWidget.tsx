import Image from 'next/image'
import Link from 'next/link'
import { getUpcomingMatch, getTeamRankings } from '@/services/rbfa'

interface TeamWidgetProps {
  teamId?: string | null
  isDashboard?: boolean
}

export default async function TeamWidget({ teamId, isDashboard = false }: TeamWidgetProps) {
  if (!teamId && !isDashboard) return null

  if (!teamId && isDashboard) {
    return (
      <div className="bg-white border border-indigo-100 rounded-3xl p-8 mb-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -translate-y-1/2 translate-x-1/3"></div>
        <div className="relative z-10 flex-1 text-center md:text-left">
          <h3 className="text-xl font-extrabold text-slate-900 mb-2">Connecte ton équipe RBFA</h3>
          <p className="text-slate-500 text-sm max-w-lg">
            Affiche ton classement officiel et ton prochain match en temps réel sur ton Dashboard et ton profil public.
          </p>
        </div>
        <div className="relative z-10 shrink-0">
          <Link href="/dashboard/settings" className="inline-flex items-center px-6 py-3 rounded-full shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95">
            Lier mon équipe maintenant
          </Link>
        </div>
      </div>
    )
  }

  const [nextMatchData, rankingData] = await Promise.all([
    getUpcomingMatch(teamId!),
    getTeamRankings(teamId!)
  ])

  if (!nextMatchData && !rankingData) {
    return isDashboard ? <div className="text-slate-400 text-sm text-center mb-8 bg-slate-50 p-4 rounded-xl border border-slate-100">Service RBFA temporairement indisponible.</div> : null
  }

  let matchDate = "Date à déterminer"
  let matchTime = "--:--"
  if (nextMatchData?.startTime) {
    const d = new Date(nextMatchData.startTime)
    matchDate = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    matchTime = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* PROCHAIN MATCH */}
      <div className="lg:col-span-1 bg-linear-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-6 shadow-md text-white flex flex-col justify-between relative overflow-hidden border border-indigo-950">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/3"></div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-6">
            <span className="bg-indigo-500/30 border border-indigo-400/30 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest text-indigo-100">Matchday</span>
            <span className="text-xs font-semibold text-indigo-200 line-clamp-1 max-w-37.5 text-right">
              {nextMatchData?.series?.name || "Compétition"}
            </span>
          </div>

          {nextMatchData ? (
            <div className="flex items-center justify-between mt-4">
              <div className="flex flex-col items-center gap-3 w-24">
                <div className="w-16 h-16 bg-white rounded-full p-1 shadow-lg relative flex items-center justify-center">
                  <Image src={nextMatchData.homeTeam.logo || '/default-logo.png'} alt={nextMatchData.homeTeam.name} fill className="object-contain p-1.5" sizes="64px" />
                </div>
                <span className="text-xs font-bold text-center leading-tight line-clamp-2">{nextMatchData.homeTeam.name}</span>
              </div>

              <div className="flex flex-col items-center">
                <span className="text-2xl font-black text-indigo-300 italic pr-1">VS</span>
              </div>

              <div className="flex flex-col items-center gap-3 w-24">
                <div className="w-16 h-16 bg-white rounded-full p-1 shadow-lg relative flex items-center justify-center">
                  <Image src={nextMatchData.awayTeam.logo || '/default-logo.png'} alt={nextMatchData.awayTeam.name} fill className="object-contain p-1.5" sizes="64px" />
                </div>
                <span className="text-xs font-bold text-center leading-tight line-clamp-2">{nextMatchData.awayTeam.name}</span>
              </div>
            </div>
          ) : (
             <div className="text-center text-indigo-200 py-8">Aucun match planifié.</div>
          )}
        </div>

        {nextMatchData && (
          <div className="mt-8 relative z-10 bg-black/20 rounded-2xl p-4 backdrop-blur-sm border border-white/5 flex items-center justify-center flex-col">
            <span className="text-sm font-bold text-indigo-100 capitalize">{matchDate}</span>
            <span className="text-2xl font-black tracking-tight">{matchTime}</span>
          </div>
        )}
      </div>

      {/* CLASSEMENT */}
      <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col">
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-lg font-bold text-slate-900 tracking-tight">Classement Général</h3>
        </div>

        {!rankingData || !rankingData.teams ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 font-medium">
            Classement non disponible actuellement.
          </div>
        ) : (
          /* NOUVEAU : Conteneur avec scroll vertical et hauteur fixe */
          <div className="flex-1 overflow-y-auto max-h-75 pr-2">
            <table className="w-full text-left text-sm whitespace-nowrap relative">
              {/* NOUVEAU : En-tête collante (sticky) avec un fond blanc */}
              <thead className="sticky top-0 bg-white z-10 outline-1 outline-slate-100 shadow-sm">
                <tr className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3 w-8 text-center bg-white">#</th>
                  <th className="py-3 px-2 bg-white">Équipe</th>
                  <th className="py-3 text-center w-12 bg-white">Pts</th>
                  <th className="py-3 text-center w-12 hidden sm:table-cell bg-white">J</th>
                  <th className="py-3 text-center w-12 hidden sm:table-cell bg-white">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {/* NOUVEAU : Remplacement de .slice(0, 5) par l'affichage complet */}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {rankingData.teams.map((team: any) => {
                  const isMyTeam = team.teamId === teamId
                  return (
                    <tr key={team.teamId} className={`${isMyTeam ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="py-2.5">
                        <div className={`w-6 h-6 mx-auto rounded flex items-center justify-center text-xs font-bold ${isMyTeam ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>
                          {team.position}
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-3">
                          <div className="relative w-6 h-6 bg-white rounded-full border border-slate-100 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                            <Image src={team.logo || '/default-logo.png'} alt={team.name} fill className="object-contain p-0.5" sizes="24px" />
                          </div>
                          <span className={`font-bold truncate max-w-35 sm:max-w-50 ${isMyTeam ? 'text-indigo-900' : 'text-slate-700'}`}>
                            {team.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-center font-black text-slate-900">{team.points}</td>
                      <td className="py-2.5 text-center font-semibold text-slate-500 hidden sm:table-cell">{team.matchesPlayed}</td>
                      <td className="py-2.5 text-center font-semibold text-slate-500 hidden sm:table-cell">
                        {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="mt-3 pt-3 border-t border-slate-50 text-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Source : RBFA Datalake</span>
        </div>
      </div>
      
    </div>
  )
}