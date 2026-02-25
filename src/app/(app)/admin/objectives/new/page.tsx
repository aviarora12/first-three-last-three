import type { Metadata } from 'next';
import { ObjectiveForm } from '@/components/admin/ObjectiveForm';

export const metadata: Metadata = { title: 'New Objective' };

export default function NewObjectivePage() {
  return (
    <div className="max-w-lg">
      <h2 className="text-base font-semibold text-zinc-200 mb-4">Create Objective</h2>
      <ObjectiveForm />
    </div>
  );
}
