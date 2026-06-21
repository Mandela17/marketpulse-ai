'use client';

import Link from 'next/link';
import { DEMO_SECTORS } from '@/lib/mockData';
import SectorCard from '@/components/SectorCard';

export default function SectorsPage() {
  const sorted = [...DEMO_SECTORS].sort((a, b) => b.sentiment - a.sentiment);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          All Sectors
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Sorted by sentiment score (highest first)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sorted.map((sector, i) => (
          <SectorCard key={sector.id} sector={sector} index={i} />
        ))}
      </div>
    </div>
  );
}
