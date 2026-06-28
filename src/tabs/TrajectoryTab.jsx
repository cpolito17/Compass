// Tab 1 — Trajectory (§5): baseline form on top, life-event timeline, and the
// flagship net-worth chart with retirement controls.

import BaselineForm from './trajectory/BaselineForm.jsx';
import NetWorthChart from './trajectory/NetWorthChart.jsx';
import EventTimeline from './trajectory/EventTimeline.jsx';

export default function TrajectoryTab({ profile, setProfile, constants, setConstants, events, setEvents, controls, setControls, sim }) {
  return (
    <div className="space-y-4">
      <BaselineForm profile={profile} setProfile={setProfile} constants={constants} setConstants={setConstants} />
      <EventTimeline events={events} setEvents={setEvents} sim={sim} profile={profile} constants={constants} controls={controls} />
      <NetWorthChart sim={sim} controls={controls} setControls={setControls} profile={profile} />
    </div>
  );
}
