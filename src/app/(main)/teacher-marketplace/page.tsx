'use client';

import Link from 'next/link';
import DashboardHeader from '@/components/dashboard-header';
import StudentCurriculumMarketplace from '@/components/student-curriculum-marketplace';
import { Button } from '@/components/ui/button';
import { Flame, ArrowRight } from 'lucide-react';

export default function TeacherMarketplacePage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Find Courses" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mb-6 rounded-2xl border border-red-300/30 bg-gradient-to-r from-slate-950/90 via-red-950/30 to-orange-950/25 p-4 shadow-[0_16px_34px_-24px_rgba(251,113,133,0.65)] md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-red-200">Fast Revision Track</p>
              <p className="mt-1 text-lg font-semibold text-slate-100 md:text-xl">Boost scores with focused crash courses</p>
              <p className="mt-1 text-sm text-slate-300/90">Short, exam-oriented batches for quick revision and final prep.</p>
            </div>
            <Button
              asChild
              className="h-11 rounded-full border border-red-300/45 bg-gradient-to-r from-rose-300 via-orange-300 to-amber-300 px-5 text-slate-950 shadow-[0_10px_24px_-12px_rgba(251,113,133,0.82)] transition-all hover:from-rose-200 hover:via-orange-200 hover:to-amber-200 hover:shadow-[0_14px_26px_-12px_rgba(251,113,133,0.9)]"
            >
              <Link href="/crash-courses">
                <Flame className="mr-2 h-4 w-4" />
                Browse Crash Courses
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <StudentCurriculumMarketplace />
      </main>
    </div>
  );
}
