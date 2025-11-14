"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function RulesPage() {
  const router = useRouter();
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Expandable Header Bar - Opens to the Left */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        {/* Main Header Bar */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            {/* Expand Button */}
            <button
              onClick={() => setHeaderExpanded(!headerExpanded)}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 bg-gray-100 border border-gray-300"
              title={headerExpanded ? "Collapse menu" : "Expand menu"}
            >
              <span className="text-xl text-gray-800">{headerExpanded ? "✕" : "☰"}</span>
              <span className="font-semibold text-gray-800 hidden sm:block">
                {headerExpanded ? "Close Menu" : "Menu"}
              </span>
            </button>

            {/* Logo/Title */}
            <h1 className="text-2xl font-bold text-gray-800">NFL Picks</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {/* User Info */}
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

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Expandable Navigation Panel - Opens to the Left */}
        {headerExpanded && (
          <div className="absolute top-full left-0 w-80 bg-white border-b border-r border-gray-200 shadow-lg z-40">
            <div className="p-6">
              {/* Navigation Header */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Navigation</h2>
                <p className="text-sm text-gray-600">Quick access to all features</p>
              </div>

              {/* Navigation Grid */}
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

              {/* Quick Stats */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-3">Quick Stats</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-600">0</div>
                    <div className="text-xs text-blue-800">Games</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-green-600">0</div>
                    <div className="text-xs text-green-800">Players</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">1</div>
                    <div className="text-xs text-purple-800">Week</div>
                  </div>
                </div>
              </div>

              {/* Admin Badge */}
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
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Rules & Guidelines
          </h1>
          <p className="text-lg text-gray-600">
            Learn how to play and understand the scoring system
          </p>
        </div>

        {/* Under Construction */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-2xl font-bold text-yellow-800 mb-4">
            Under Construction
          </h2>
          <p className="text-yellow-700 mb-4">
            This page is currently being built. Check back soon for:
          </p>
          <ul className="text-yellow-700 text-left max-w-md mx-auto space-y-2">
            <li>• Complete game rules and regulations</li>
            <li>• Scoring system explanation</li>
            <li>• Monday Night Football tie-breaker rules</li>
            <li>• Prize distribution details</li>
            <li>• Entry requirements and deadlines</li>
            <li>• Frequently asked questions</li>
          </ul>
        </div>
      </main>
    </div>
  );
}