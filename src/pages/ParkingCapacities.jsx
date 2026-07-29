import React from 'react';
import PageHeader from '@/components/ui/page-header';
import ParkingCapacitiesPanel from '@/components/ParkingCapacitiesPanel';

export default function ParkingCapacities() {
  return (
    <div className="space-y-6">
      <PageHeader kicker="Logística" title="Capacidades por evento" />
      <ParkingCapacitiesPanel />
    </div>
  );
}