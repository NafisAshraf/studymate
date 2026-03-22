"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SidebarLogo } from "./SidebarLogo";
import { SidebarNav } from "./SidebarNav";
import { SidebarSessions } from "./SidebarSessions";

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-40 p-2 rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors md:hidden cursor-pointer"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 h-screen flex flex-col bg-bg-secondary border-r border-border-subtle
          transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="p-5 flex items-center justify-between">
          <SidebarLogo />
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors md:hidden cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 pb-3" onClick={() => setMobileOpen(false)}>
          <SidebarNav />
        </div>
        <div
          className="flex-1 overflow-y-auto px-4 pb-4"
          onClick={() => setMobileOpen(false)}
        >
          <SidebarSessions />
        </div>
      </aside>
    </>
  );
}
