"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function RulesPage() {
  const router = useRouter();
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>("entry");

  // Navigation items
  const navItems = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/make-picks", label: "Make Picks", icon: "🏈" },
    { href: "/all-picks", label: "View All Picks", icon: "📊" },
    { href: "/pick-summary", label: "Pick Percentages", icon: "📈" },
    { href: "/standings", label: "Standings", icon: "🏆" },
    { href: "/rules", label: "Rules", icon: "📋" },
    { href: "/profile", label: "Profile", icon: "👤" },
  ];

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("user_id", user.id)
          .single();
        
        setIsAdmin(profile?.is_admin || false);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const rulesSections = [
    { id: "entry", title: "💰 Entry & Payment", icon: "💵" },
    { id: "scoring", title: "🏈 Scoring System", icon: "📊" },
    { id: "tiebreaker", title: "🔗 Tie-Breaker Rules", icon: "⚖️" },
    { id: "prizes", title: "🏆 Prize Distribution", icon: "🎯" },
    { id: "deadlines", title: "⏰ Deadlines", icon: "🚨" },
    { id: "faq", title: "❓ FAQ", icon: "💡" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Expandable Header Bar */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setHeaderExpanded(!headerExpanded)}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 bg-gray-100 border border-gray-300"
            >
              <span className="text-xl text-gray-800">{headerExpanded ? "✕" : "☰"}</span>
              <span className="font-semibold text-gray-800 hidden sm:block">
                {headerExpanded ? "Close Menu" : "Menu"}
              </span>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">NFL Picks</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {userEmail?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-700">
                  {userEmail || "User"}
                </p>
                <p className="text-xs text-gray-500">
                  {isAdmin ? 'Admin' : 'User'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {headerExpanded && (
          <div className="absolute top-full left-0 w-80 bg-white border-b border-r border-gray-200 shadow-lg z-40">
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Navigation</h2>
                <p className="text-sm text-gray-600">Quick access to all features</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 group border border-gray-200 hover:border-blue-200"
                    onClick={() => setHeaderExpanded(false)}
                  >
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      {item.icon}
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 group-hover:text-blue-800">
                        {item.label}
                      </div>
                      <div className="text-xs text-gray-500 group-hover:text-blue-600 mt-1">
                        Click to navigate
                      </div>
                    </div>
                    <span className="text-gray-400 group-hover:text-blue-500 transition-colors">
                      →
                    </span>
                  </a>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-3">Quick Stats</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-600">16</div>
                    <div className="text-xs text-blue-800">Weeks</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-green-600">$5</div>
                    <div className="text-xs text-green-800">Entry</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">1</div>
                    <div className="text-xs text-purple-800">Winner</div>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-600">🔧</span>
                    <span className="text-sm font-semibold text-yellow-800">Admin Mode Active</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            🏈 NFL Picks Rules & Regulations
          </h1>
          <p className="text-lg text-gray-600">
            Everything you need to know to compete and win!
          </p>
        </div>

        {/* Rules Navigation */}
        <div className="flex overflow-x-auto gap-2 mb-8 pb-2">
          {rulesSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
                activeSection === section.id
                  ? "bg-blue-600 text-white shadow-lg transform scale-105"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className="text-xl">{section.icon}</span>
              {section.title}
            </button>
          ))}
        </div>

        {/* Rules Content */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          {/* Entry & Payment Section */}
          {activeSection === "entry" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">💵</div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Entry & Payment</h2>
                <p className="text-gray-600">Get in the game with our simple entry process</p>
              </div>

              <div className="grid gap-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-green-800 mb-3 flex items-center gap-2">
                    <span>💰</span> Entry Fee: $5 Per Week
                  </h3>
                  <p className="text-green-700 mb-4">
                    A small investment for a chance to win big! Each week requires a $5 entry fee to be eligible for that week's prize pool.
                  </p>
                  <div className="bg-green-100 border border-green-300 rounded-lg p-4">
                    <h4 className="font-bold text-green-800 mb-2">Payment Methods:</h4>
                    <ul className="text-green-700 space-y-1">
                      <li>• Venmo: @[YourVenmoHandle]</li>
                      <li>• Cash App: $[YourCashAppHandle]</li>
                      <li>• PayPal: [YourPayPalEmail]</li>
                      <li>• Cash (in person)</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-blue-800 mb-3 flex items-center gap-2">
                    <span>⏰</span> Payment Deadline
                  </h3>
                  <p className="text-blue-700 mb-2">
                    <strong>Money must be in before the start of the first game each week.</strong>
                  </p>
                  <p className="text-blue-700">
                    This ensures fairness for all players and prevents late entries after games have started.
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-yellow-800 mb-3 flex items-center gap-2">
                    <span>🚨</span> Late Payment Policy
                  </h3>
                  <p className="text-yellow-700 mb-2">
                    <strong>Exceptions can be made after the first game starts, but you will need approval.</strong>
                  </p>
                  <p className="text-yellow-700">
                    Contact the admin immediately if you miss the deadline. Late entries may be accepted on a case-by-case basis, but you'll be locked out of games that have already started.
                  </p>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-purple-800 mb-3 flex items-center gap-2">
                    <span>✅</span> Payment Confirmation
                  </h3>
                  <p className="text-purple-700">
                    Once you've submitted payment, your status will be updated to "Paid" in the system. You can verify this on the "All Picks" page where paid players are marked with a green checkmark (✓).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Scoring System Section */}
          {activeSection === "scoring" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">📊</div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Scoring System</h2>
                <p className="text-gray-600">How points are earned and winners are determined</p>
              </div>

              <div className="grid gap-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-blue-800 mb-4 flex items-center gap-2">
                    <span>🎯</span> Basic Scoring
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
                      <span className="font-semibold">Correct Pick</span>
                      <span className="bg-green-500 text-white px-3 py-1 rounded-full font-bold">+1 Point</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
                      <span className="font-semibold">Incorrect Pick</span>
                      <span className="bg-red-500 text-white px-3 py-1 rounded-full font-bold">0 Points</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
                      <span className="font-semibold">No Pick Made</span>
                      <span className="bg-gray-500 text-white px-3 py-1 rounded-full font-bold">0 Points</span>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-green-800 mb-3 flex items-center gap-2">
                    <span>🏈</span> Game Picks
                  </h3>
                  <ul className="text-green-700 space-y-2">
                    <li>• Pick the winner of each NFL game for the week</li>
                    <li>• All games are included in the pick'em format</li>
                    <li>• Picks lock at game time - no changes after kickoff</li>
                    <li>• You must pick a winner for every game to be eligible for the weekly prize</li>
                  </ul>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-purple-800 mb-3 flex items-center gap-2">
                    <span>⭐</span> Perfect Week Bonus
                  </h3>
                  <p className="text-purple-700 mb-3">
                    While not required for the weekly prize, going perfect (getting every game correct) earns you legendary status and bragging rights for the season!
                  </p>
                  <div className="bg-purple-100 border border-purple-300 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-800">Perfect Week = Eternal Glory! 🌟</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tie-Breaker Rules Section */}
          {activeSection === "tiebreaker" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">⚖️</div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Tie-Breaker Rules</h2>
                <p className="text-gray-600">How we determine the winner when players are tied</p>
              </div>

              <div className="grid gap-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-red-800 mb-4 flex items-center gap-2">
                    <span>🔗</span> Monday Night Football Tie-Breaker
                  </h3>
                  <p className="text-red-700 mb-4">
                    The Monday Night Football game serves as our official tie-breaker. When multiple players have the same number of correct picks, we look to the MNF game to determine the winner.
                  </p>
                  
                  <div className="bg-white border border-red-300 rounded-lg p-4 mb-4">
                    <h4 className="font-bold text-red-800 mb-2">Tie-Breaker Process:</h4>
                    <ol className="text-red-700 space-y-2">
                      <li><strong>1.</strong> All tied players must predict the total points scored in the Monday Night Football game</li>
                      <li><strong>2.</strong> After the game, we calculate the difference between each player's prediction and the actual total</li>
                      <li><strong>3.</strong> The player closest to the actual total wins</li>
                      <li><strong>4.</strong> If still tied, the prize is split among the remaining players</li>
                    </ol>
                  </div>

                  <div className="bg-red-100 border border-red-300 rounded-lg p-4">
                    <h4 className="font-bold text-red-800 mb-2">Example:</h4>
                    <p className="text-red-700">
                      Actual MNF Score: 48 points<br/>
                      Player A guessed: 45 (difference: 3)<br/>
                      Player B guessed: 50 (difference: 2)<br/>
                      <strong>Winner: Player B</strong>
                    </p>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-yellow-800 mb-3 flex items-center gap-2">
                    <span>🚨</span> Important Tie-Breaker Notes
                  </h3>
                  <ul className="text-yellow-700 space-y-2">
                    <li>• <strong>You MUST submit a MNF total points prediction to be eligible for the weekly prize</strong></li>
                    <li>• MNF predictions lock at kickoff of the Monday Night game</li>
                    <li>• If no MNF prediction is submitted, you cannot win the weekly prize</li>
                    <li>• In the rare event of multiple perfect ties after MNF, the prize is split equally</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Prize Distribution Section */}
          {activeSection === "prizes" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">🏆</div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Prize Distribution</h2>
                <p className="text-gray-600">Where the money goes and how winners are paid</p>
              </div>

              <div className="grid gap-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-green-800 mb-4 flex items-center gap-2">
                    <span>💰</span> Winner Takes All!
                  </h3>
                  <div className="text-center mb-4">
                    <div className="text-4xl font-bold text-green-600 mb-2">100%</div>
                    <div className="text-lg text-green-700">of the weekly prize pool goes to the winner</div>
                  </div>
                  <p className="text-green-700 text-center">
                    No splits, no shares (unless there's an unresolvable tie). The player with the most correct picks takes home the entire pot!
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-blue-800 mb-3 flex items-center gap-2">
                    <span>🎯</span> Prize Pool Calculation
                  </h3>
                  <div className="bg-white border border-blue-300 rounded-lg p-4">
                    <div className="text-center text-2xl font-bold text-blue-600 mb-2">
                      Weekly Prize = ($5 × Number of Paid Players)
                    </div>
                    <p className="text-blue-700 text-center">
                      The more players, the bigger the prize! Invite your friends to grow the pot.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="text-center p-3 bg-blue-100 rounded-lg">
                      <div className="text-xl font-bold text-blue-800">10 Players</div>
                      <div className="text-lg text-blue-600">$50 Prize</div>
                    </div>
                    <div className="text-center p-3 bg-blue-100 rounded-lg">
                      <div className="text-xl font-bold text-blue-800">20 Players</div>
                      <div className="text-lg text-blue-600">$100 Prize</div>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-purple-800 mb-3 flex items-center gap-2">
                    <span>💸</span> Payout Process
                  </h3>
                  <ul className="text-purple-700 space-y-2">
                    <li>• Winners are announced Tuesday morning after MNF concludes</li>
                    <li>• Payouts are processed within 24 hours of announcement</li>
                    <li>• You'll receive your winnings via the same method you paid</li>
                    <li>• Weekly winners are automatically entered into our Season Hall of Fame</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Deadlines Section */}
          {activeSection === "deadlines" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">⏰</div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Deadlines & Important Dates</h2>
                <p className="text-gray-600">Don't miss your chance to compete and win!</p>
              </div>

              <div className="grid gap-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-red-800 mb-4 flex items-center gap-2">
                    <span>🚨</span> Critical Deadlines
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-white rounded-lg border border-red-300">
                      <div>
                        <div className="font-bold text-red-800">Payment Deadline</div>
                        <div className="text-red-600">Before first game kickoff each week</div>
                      </div>
                      <span className="bg-red-500 text-white px-3 py-1 rounded-full font-bold">HARD</span>
                    </div>
                    
                    <div className="flex justify-between items-center p-4 bg-white rounded-lg border border-yellow-300">
                      <div>
                        <div className="font-bold text-yellow-800">Picks Deadline</div>
                        <div className="text-yellow-600">Individual game lock times</div>
                      </div>
                      <span className="bg-yellow-500 text-white px-3 py-1 rounded-full font-bold">AUTO</span>
                    </div>
                    
                    <div className="flex justify-between items-center p-4 bg-white rounded-lg border border-green-300">
                      <div>
                        <div className="font-bold text-green-800">MNF Tie-Breaker</div>
                        <div className="text-green-600">Monday Night Football kickoff</div>
                      </div>
                      <span className="bg-green-500 text-white px-3 py-1 rounded-full font-bold">FINAL</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-blue-800 mb-3 flex items-center gap-2">
                    <span>📅</span> Weekly Schedule
                  </h3>
                  <ul className="text-blue-700 space-y-2">
                    <li>• <strong>Tuesday-Wednesday:</strong> Review previous week's results, payouts processed</li>
                    <li>• <strong>Thursday:</strong> New week opens for picks, payments accepted</li>
                    <li>• <strong>Sunday:</strong> Morning/afternoon games lock at scheduled kickoff times</li>
                    <li>• <strong>Sunday Night:</strong> SNF game locks at kickoff</li>
                    <li>• <strong>Monday Night:</strong> MNF game and tie-breaker lock at kickoff</li>
                    <li>• <strong>Tuesday:</strong> Weekly winner announced, new cycle begins</li>
                  </ul>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-yellow-800 mb-3 flex items-center gap-2">
                    <span>💡</span> Pro Tips
                  </h3>
                  <ul className="text-yellow-700 space-y-2">
                    <li>• <strong>Set your picks early</strong> - Don't wait until Sunday morning!</li>
                    <li>• <strong>Pay when you pick</strong> - Avoid the last-minute rush</li>
                    <li>• <strong>Set reminders</strong> for Thursday night games</li>
                    <li>• <strong>Double-check your MNF total</strong> - This could be the difference between winning and losing!</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* FAQ Section */}
          {activeSection === "faq" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">💡</div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Frequently Asked Questions</h2>
                <p className="text-gray-600">Quick answers to common questions</p>
              </div>

              <div className="grid gap-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <span>❓</span> What happens if I forget to make picks for some games?
                  </h3>
                  <p className="text-gray-700">
                    You'll receive 0 points for any game you don't pick. You can still win the week if you have enough correct picks from the games you did pick, but it becomes much harder. Always try to pick every game!
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <span>❓</span> Can I change my picks after I've submitted them?
                  </h3>
                  <p className="text-gray-700">
                    Yes, but only until each individual game locks at its scheduled kickoff time. Once a game starts, that pick is locked and cannot be changed.
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <span>❓</span> What if the Monday Night Football game is canceled or postponed?
                  </h3>
                  <p className="text-gray-700">
                    If MNF is canceled or doesn't provide a valid result, we'll use the Sunday Night Football game as the tie-breaker. If no suitable tie-breaker exists, the prize will be split among tied players.
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <span>❓</span> How do I know if my payment was received?
                  </h3>
                  <p className="text-gray-700">
                    Your status will be updated to "Paid" on the All Picks page (green checkmark ✓). If you don't see this update within a few hours of paying, contact the admin.
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <span>❓</span> What's the best strategy for picking the MNF total?
                  </h3>
                  <p className="text-gray-700">
                    Look at the teams' recent scoring trends, weather conditions, and defensive rankings. Some players pick their favorite number, others do detailed analysis. Most importantly - <strong>always submit a number!</strong> Forgetting your MNF pick means you can't win even if you get all other games correct.
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <span>❓</span> Can I play multiple entries?
                  </h3>
                  <p className="text-gray-700">
                    No, only one entry per person per week. This keeps the competition fair for everyone.
                  </p>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <h3 className="text-xl font-bold text-green-800 mb-2">Still have questions?</h3>
                  <p className="text-green-700">
                    Contact the admin directly! We're here to help and want everyone to have fun competing.
                  </p>
                  <div className="mt-3 text-sm text-green-600">
                    📧 Email: [Admin Email]<br/>
                    📱 Phone: [Admin Phone]
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fun Footer */}
        <div className="mt-8 text-center">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-6">
            <h3 className="text-2xl font-bold mb-2">Ready to Play? 🏈</h3>
            <p className="text-blue-100 mb-4">
              Join the competition, test your NFL knowledge, and compete for cash prizes every week!
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="/make-picks"
                className="bg-white text-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-gray-100 transition-colors"
              >
                Make Your Picks Now
              </a>
              <a
                href="/standings"
                className="bg-yellow-400 text-gray-800 px-6 py-3 rounded-lg font-bold hover:bg-yellow-300 transition-colors"
              >
                View Standings
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}