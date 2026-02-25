'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createObjective } from '@/lib/actions/objectives';
import { Button } from '@/components/ui/Button';
import type { ObjectivePeriod } from '@/types/focusline';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i);

export function ObjectiveForm() {
  const router = useRouter();
  const [periodType, setPeriodType] = useState<ObjectivePeriod>('monthly');
  const [year, setYear]     = useState(currentYear);
  const [month, setMonth]   = useState(new Date().getMonth() + 1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [department, setDept]     = useState('');
  const [weight, setWeight]       = useState(5);
  const [targetValue, setTarget]  = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const base = { title, description: description || null, department, weight, target_value: Number(targetValue), current_value: 0, owner_id: null };

      let input: Parameters<typeof createObjective>[0];
      if (periodType === 'monthly') {
        input = { ...base, period_type: 'monthly', period_year: year, period_month: month };
      } else if (periodType === 'annual') {
        input = { ...base, period_type: 'annual', period_year: year, period_month: null };
      } else {
        input = { ...base, period_type: 'custom', period_year: null, period_month: null, start_date: startDate, end_date: endDate };
      }

      const result = await createObjective(input);
      if (result.error) { setError(result.error); return; }
      router.push('/objectives');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      {error && (
        <div className="rounded bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Period type */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">Period Type</label>
        <div className="flex gap-2">
          {(['monthly', 'annual', 'custom'] as ObjectivePeriod[]).map(pt => (
            <button
              key={pt}
              type="button"
              onClick={() => setPeriodType(pt)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                periodType === pt
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {pt.charAt(0).toUpperCase() + pt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Period fields */}
      <div className="grid grid-cols-2 gap-3">
        {periodType !== 'custom' && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400">Year</label>
            <select className="input-base" value={year} onChange={e => setYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {periodType === 'monthly' && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400">Month</label>
            <select className="input-base" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}
        {periodType === 'custom' && (
          <>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400">Start Date</label>
              <input type="date" className="input-base" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400">End Date</label>
              <input type="date" className="input-base" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
          </>
        )}
      </div>

      {/* Core fields */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">Title *</label>
        <input type="text" className="input-base" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Increase New ARR to $2M" />
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">Description</label>
        <textarea className="input-base resize-none" rows={2} value={description} onChange={e => setDesc(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">Department *</label>
          <input type="text" className="input-base" value={department} onChange={e => setDept(e.target.value)} required placeholder="Sales" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">Target Value *</label>
          <input type="number" className="input-base" value={targetValue} onChange={e => setTarget(e.target.value)} required min="0.01" step="any" placeholder="2000000" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Weight: {weight}/10
        </label>
        <input type="range" min={1} max={10} value={weight} onChange={e => setWeight(Number(e.target.value))} className="w-full accent-indigo-500" />
        <div className="flex justify-between text-xs text-zinc-600">
          <span>Low priority</span><span>Critical</span>
        </div>
      </div>

      <Button type="submit" isLoading={pending} className="w-full">
        Create Objective
      </Button>
    </form>
  );
}
